const pool = require('../config/db');

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function parseText(value, label, maxLength, required = false) {
  const text = String(value ?? '').trim();
  if (required && !text) throw badRequest(`Vui lòng nhập ${label}.`);
  if (text.length > maxLength) throw badRequest(`${label} không được dài quá ${maxLength} ký tự.`);
  return text || null;
}

function parseCheckout(body) {
  const customerName = parseText(body.customer_name, 'họ và tên', 200, true);
  const customerPhone = parseText(body.customer_phone, 'số điện thoại', 30, true);
  const customerEmail = parseText(body.customer_email, 'email', 255);
  const shippingAddress = parseText(body.shipping_address, 'địa chỉ giao hàng', 2000, true);
  const notes = parseText(body.notes, 'ghi chú', 1000);

  if (!/^[+\d().\s-]{7,30}$/.test(customerPhone) || customerPhone.replace(/\D/g, '').length < 7) {
    throw badRequest('Số điện thoại không hợp lệ.');
  }
  if (customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
    throw badRequest('Email không hợp lệ.');
  }
  if (body.payment_method && body.payment_method !== 'cod') {
    throw badRequest('Phương thức thanh toán hiện chưa được hỗ trợ.');
  }
  if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 50) {
    throw badRequest('Giỏ hàng cần có từ 1 đến 50 sản phẩm.');
  }

  const quantities = new Map();
  for (const item of body.items) {
    const productId = Number(item.product_id);
    const quantity = Number(item.quantity);
    if (!Number.isSafeInteger(productId) || productId <= 0) throw badRequest('Sản phẩm trong giỏ hàng không hợp lệ.');
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 999) {
      throw badRequest('Số lượng sản phẩm phải từ 1 đến 999.');
    }
    const totalQuantity = (quantities.get(productId) || 0) + quantity;
    if (totalQuantity > 999) throw badRequest('Số lượng sản phẩm vượt quá giới hạn cho phép.');
    quantities.set(productId, totalQuantity);
  }

  return { customerName, customerPhone, customerEmail, shippingAddress, notes, items: quantities };
}

async function createCheckout(req, res) {
  let client;
  let inTransaction = false;
  try {
    const checkout = parseCheckout(req.body || {});
    const ids = [...checkout.items.keys()].sort((a, b) => a - b);
    client = await pool.connect();
    await client.query('BEGIN');
    inTransaction = true;

    const productResult = await client.query(`
      SELECT id, name, sku, price::text AS price, stock_quantity
      FROM products
      WHERE id = ANY($1::bigint[]) AND is_active = TRUE AND status = 'active'
      ORDER BY id
      FOR UPDATE
    `, [ids]);
    const products = new Map(productResult.rows.map((product) => [Number(product.id), product]));
    if (products.size !== ids.length) {
      const error = new Error('Một sản phẩm đã ngừng bán. Hãy tải lại trang và kiểm tra giỏ hàng.');
      error.status = 409;
      throw error;
    }

    for (const [productId, quantity] of checkout.items) {
      const product = products.get(productId);
      if (Number(product.stock_quantity) < quantity) {
        const error = new Error(`Sản phẩm “${product.name}” không còn đủ số lượng trong kho.`);
        error.status = 409;
        throw error;
      }
    }

    const invoiceResult = await client.query(`
      INSERT INTO invoices (
        customer_name, customer_email, customer_phone, shipping_address, notes,
        status, payment_status, subtotal, discount_amount, tax_amount, shipping_fee, total_amount, issued_at
      ) VALUES ($1, $2, $3, $4, $5, 'pending', 'pending', 0, 0, 0, 0, 0, NOW())
      RETURNING id, invoice_code
    `, [checkout.customerName, checkout.customerEmail, checkout.customerPhone, checkout.shippingAddress, checkout.notes]);
    const invoice = invoiceResult.rows[0];

    for (const [productId, quantity] of checkout.items) {
      const product = products.get(productId);
      await client.query(`
        INSERT INTO invoice_items (
          invoice_id, product_id, product_name, sku, quantity, unit_price, discount_amount, line_total
        ) VALUES ($1, $2, $3, $4, $5, $6, 0, $6::numeric * $5::integer)
      `, [invoice.id, product.id, product.name, product.sku, quantity, product.price]);

      const stockResult = await client.query(`
        UPDATE products
        SET stock_quantity = stock_quantity - $2, updated_at = NOW()
        WHERE id = $1 AND stock_quantity >= $2
        RETURNING stock_quantity
      `, [product.id, quantity]);
      if (!stockResult.rowCount) {
        const error = new Error(`Sản phẩm “${product.name}” vừa hết số lượng yêu cầu.`);
        error.status = 409;
        throw error;
      }
      await client.query(`
        INSERT INTO inventory_transactions (
          product_id, product_name, sku, movement_type, quantity_before,
          quantity_change, quantity_after, reference_type, reference_id, note
        ) VALUES ($1, $2, $3, 'sale', $4, $5, $6, 'invoice', $7, $8)
      `, [
        product.id, product.name, product.sku, Number(product.stock_quantity), -quantity,
        Number(stockResult.rows[0].stock_quantity), invoice.id, `Đặt hàng trực tuyến ${invoice.invoice_code}`,
      ]);
    }

    const totalResult = await client.query(`
      SELECT COALESCE(SUM(line_total), 0)::numeric(14, 2) AS total
      FROM invoice_items WHERE invoice_id = $1
    `, [invoice.id]);
    const total = totalResult.rows[0].total;
    await client.query(`
      UPDATE invoices SET subtotal = $2, total_amount = $2, updated_at = NOW() WHERE id = $1
    `, [invoice.id, total]);
    if (Number(total) > 0) {
      await client.query(`
        INSERT INTO payments (invoice_id, amount, method, status, note)
        VALUES ($1, $2, 'cod', 'pending', 'Thanh toán khi nhận hàng')
      `, [invoice.id, total]);
    }
    await client.query(`
      INSERT INTO invoice_status_history (invoice_id, old_status, new_status, note)
      VALUES ($1, NULL, 'pending', 'Khách đặt hàng trên website')
    `, [invoice.id]);

    await client.query('COMMIT');
    inTransaction = false;
    res.status(201).json({
      data: { invoice_code: invoice.invoice_code, total_amount: total, status: 'pending' },
      message: 'Đặt hàng thành công.',
    });
  } catch (error) {
    if (client && inTransaction) await client.query('ROLLBACK');
    if (error.status) return res.status(error.status).json({ message: error.message });
    if (error.code === '23503' || error.code === '23514' || error.code === '22P02' || error.code === '22003') {
      return res.status(400).json({ message: 'Thông tin đơn hàng không hợp lệ. Hãy tải lại trang và thử lại.' });
    }
    console.error('Không thể tạo đơn hàng:', error);
    return res.status(500).json({ message: 'Chưa thể tạo đơn hàng. Vui lòng thử lại sau.' });
  } finally {
    if (client) client.release();
  }
}

module.exports = { createCheckout };
