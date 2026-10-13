const pool = require('../config/db');

const INVOICE_STATUSES = new Set([
  'draft', 'pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded',
]);
const PAYMENT_METHODS = new Set(['cash', 'bank_transfer', 'card', 'e_wallet', 'cod', 'other']);
const RELEASED_INVOICE_STATUSES = new Set(['cancelled', 'refunded']);
const PRE_SHIPMENT_STATUSES = new Set(['draft', 'pending', 'confirmed', 'processing']);

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function handleError(res, error) {
  if (error.status) return res.status(error.status).json({ message: error.message });
  if (error.code === '23505') {
    if (error.constraint === 'idx_categories_slug' || error.constraint === 'categories_name_key') {
      return res.status(409).json({ message: 'Tên hoặc đường dẫn danh mục này đã tồn tại.' });
    }
    if (error.constraint === 'brands_name_key') return res.status(409).json({ message: 'Tên thương hiệu này đã tồn tại.' });
    if (error.constraint === 'suppliers_name_key') return res.status(409).json({ message: 'Tên nhà cung cấp này đã tồn tại.' });
    return res.status(409).json({ message: 'Mã SKU, email hoặc mã hóa đơn đã tồn tại.' });
  }
  if (error.code === '23503') return res.status(400).json({ message: 'Danh mục, thương hiệu, nhà cung cấp hoặc sản phẩm không hợp lệ.' });
  if (error.code === '23514' || error.code === '22P02' || error.code === '22003') {
    return res.status(400).json({ message: 'Dữ liệu gửi lên không hợp lệ hoặc vượt quá giới hạn cho phép.' });
  }
  console.error('Lỗi API quản trị:', error);
  return res.status(500).json({ message: 'Không thể xử lý yêu cầu quản trị.' });
}

async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function requiredText(value, label, maxLength) {
  const text = String(value ?? '').trim();
  if (!text) throw httpError(400, `Vui lòng nhập ${label}.`);
  if (maxLength && text.length > maxLength) throw httpError(400, `${label} không được dài quá ${maxLength} ký tự.`);
  return text;
}

function optionalText(value, maxLength) {
  const text = String(value ?? '').trim();
  if (maxLength && text.length > maxLength) throw httpError(400, `Nội dung không được dài quá ${maxLength} ký tự.`);
  return text || null;
}

function positiveId(value, label) {
  if (value === null || value === undefined || value === '') return null;
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw httpError(400, `${label} không hợp lệ.`);
  return id;
}

function money(value, label, { allowZero = true, nullable = false } = {}) {
  if ((value === null || value === undefined || value === '') && nullable) return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || (!allowZero && amount === 0) || amount > 999999999999.99) {
    throw httpError(400, `${label} không hợp lệ.`);
  }
  return amount.toFixed(2);
}

function quantity(value, label = 'số lượng') {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > 2147483647) {
    throw httpError(400, `${label} phải là số nguyên không âm và không vượt quá giới hạn kho.`);
  }
  return amount;
}

function parseProduct(body) {
  const status = body.status || 'active';
  if (!['draft', 'active', 'discontinued'].includes(status)) throw httpError(400, 'Trạng thái sản phẩm không hợp lệ.');
  return {
    name: requiredText(body.name, 'tên sản phẩm', 200),
    sku: requiredText(body.sku, 'SKU', 80),
    categoryId: positiveId(body.category_id, 'Danh mục'),
    brandId: positiveId(body.brand_id, 'Thương hiệu'),
    supplierId: positiveId(body.supplier_id, 'Nhà cung cấp'),
    price: money(body.price, 'Giá bán'),
    costPrice: money(body.cost_price, 'Giá nhập', { nullable: true }),
    stock: quantity(body.stock_quantity),
    status,
    isActive: body.is_active !== false && body.is_active !== 'false',
    imageUrl: optionalText(body.image_url, 2000),
    description: optionalText(body.description, 10000),
  };
}

function parseInvoice(body) {
  const status = body.status || 'pending';
  if (!INVOICE_STATUSES.has(status)) throw httpError(400, 'Trạng thái hóa đơn không hợp lệ.');
  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw httpError(400, 'Hóa đơn cần có ít nhất một sản phẩm.');
  }

  const itemMap = new Map();
  for (const item of body.items) {
    const productId = positiveId(item.product_id, 'Sản phẩm');
    const amount = quantity(item.quantity, 'Số lượng sản phẩm');
    if (!productId || amount < 1) throw httpError(400, 'Mỗi dòng hóa đơn cần sản phẩm và số lượng lớn hơn 0.');
    itemMap.set(productId, (itemMap.get(productId) || 0) + amount);
  }

  return {
    customerName: requiredText(body.customer_name, 'tên khách hàng', 200),
    customerEmail: optionalText(body.customer_email, 255),
    customerPhone: optionalText(body.customer_phone, 30),
    billingAddress: optionalText(body.billing_address, 2000),
    shippingAddress: optionalText(body.shipping_address, 2000) || '',
    notes: optionalText(body.notes, 10000),
    status,
    discount: money(body.discount_amount ?? 0, 'Chiết khấu'),
    tax: money(body.tax_amount ?? 0, 'Thuế'),
    shippingFee: money(body.shipping_fee ?? 0, 'Phí vận chuyển'),
    items: [...itemMap.entries()].map(([productId, amount]) => ({ productId, quantity: amount })),
  };
}

function validIdParam(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw httpError(400, 'Mã bản ghi không hợp lệ.');
  return id;
}

async function writeActivity(client, action, entityType, entityId, details = {}) {
  await client.query(`
    INSERT INTO admin_activity_logs (admin_id, action, entity_type, entity_id, details)
    VALUES (NULL, $1, $2, $3, $4::jsonb)
  `, [action, entityType, entityId, JSON.stringify(details)]);
}

async function adjustStock(client, product, delta, movementType, note, invoiceId = null) {
  if (!delta) return;
  const result = await client.query(`
    UPDATE products
    SET stock_quantity = stock_quantity + $2, updated_at = NOW()
    WHERE id = $1 AND stock_quantity + $2 >= 0
    RETURNING stock_quantity
  `, [product.id, delta]);
  if (!result.rowCount) throw httpError(409, `Không đủ tồn kho cho sản phẩm “${product.name}”.`);
  const after = Number(result.rows[0].stock_quantity);
  await client.query(`
    INSERT INTO inventory_transactions (
      product_id, product_name, sku, movement_type, quantity_before,
      quantity_change, quantity_after, reference_type, reference_id, note
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  `, [
    product.id, product.name, product.sku, movementType, after - delta,
    delta, after, invoiceId ? 'invoice' : 'product', invoiceId, note,
  ]);
}

async function syncPrimaryImage(client, productId, imageUrl, productName) {
  const current = await client.query(
    'SELECT id, image_url FROM product_images WHERE product_id = $1 AND is_primary = TRUE ORDER BY id LIMIT 1',
    [productId],
  );
  if (current.rows[0]?.image_url === imageUrl) return;
  await client.query('UPDATE product_images SET is_primary = FALSE WHERE product_id = $1', [productId]);
  if (imageUrl) {
    await client.query(`
      INSERT INTO product_images (product_id, image_url, alt_text, is_primary, sort_order)
      VALUES ($1, $2, $3, TRUE, 0)
    `, [productId, imageUrl, productName]);
  }
}

async function lockProducts(client, ids, { activeOnly = false } = {}) {
  if (!ids.length) return new Map();
  const uniqueIds = [...new Set(ids)].sort((a, b) => a - b);
  const result = await client.query(`
    SELECT id, name, sku, price, stock_quantity, is_active, status
    FROM products
    WHERE id = ANY($1::bigint[]) ${activeOnly ? "AND is_active = TRUE AND status = 'active'" : ''}
    ORDER BY id
    FOR UPDATE
  `, [uniqueIds]);
  const products = new Map(result.rows.map((product) => [Number(product.id), product]));
  if (products.size !== uniqueIds.length) {
    throw httpError(400, 'Một sản phẩm đã bị xóa, ẩn hoặc không còn khả dụng. Hãy tải lại biểu mẫu.');
  }
  return products;
}

async function insertInvoiceItems(client, invoiceId, items, products, deductStock) {
  for (const item of items) {
    const product = products.get(item.productId);
    if (deductStock && Number(product.stock_quantity) < item.quantity) {
      throw httpError(409, `Không đủ tồn kho cho sản phẩm “${product.name}”.`);
    }
    await client.query(`
      INSERT INTO invoice_items (
        invoice_id, product_id, product_name, sku, quantity, unit_price, discount_amount, line_total
      ) VALUES ($1, $2, $3, $4, $5, $6, 0, $6::numeric * $5::integer)
    `, [invoiceId, product.id, product.name, product.sku, item.quantity, product.price]);
    if (deductStock) {
      await adjustStock(client, product, -item.quantity, 'sale', `Xuất kho cho hóa đơn #${invoiceId}`, invoiceId);
      product.stock_quantity = Number(product.stock_quantity) - item.quantity;
    }
  }
}

async function updateInvoiceTotals(client, invoiceId, fields) {
  const subtotalResult = await client.query(
    'SELECT COALESCE(SUM(line_total), 0)::numeric(14, 2) AS subtotal FROM invoice_items WHERE invoice_id = $1',
    [invoiceId],
  );
  const subtotal = subtotalResult.rows[0].subtotal;
  const totalResult = await client.query(`
    SELECT $1::numeric - $2::numeric + $3::numeric + $4::numeric AS total
  `, [subtotal, fields.discount, fields.tax, fields.shippingFee]);
  if (Number(totalResult.rows[0].total) < 0) throw httpError(400, 'Chiết khấu không thể lớn hơn tổng tiền hàng và phụ phí.');

  await client.query(`
    UPDATE invoices
    SET subtotal = $2, discount_amount = $3, tax_amount = $4, shipping_fee = $5,
        total_amount = $2::numeric - $3::numeric + $4::numeric + $5::numeric,
        updated_at = NOW()
    WHERE id = $1
  `, [invoiceId, subtotal, fields.discount, fields.tax, fields.shippingFee]);
}

async function refreshPaymentStatus(client, invoiceId) {
  await client.query(`
    UPDATE invoices AS i
    SET payment_status = CASE
      WHEN COALESCE(p.paid_total, 0) = 0 THEN 'pending'
      WHEN p.paid_total >= i.total_amount THEN 'paid'
      ELSE 'partial'
    END
    FROM (
      SELECT invoice_id, SUM(amount) FILTER (WHERE status = 'completed') AS paid_total
      FROM payments WHERE invoice_id = $1 GROUP BY invoice_id
    ) AS p
    WHERE i.id = $1
  `, [invoiceId]);
  await client.query(`
    UPDATE invoices SET payment_status = 'pending'
    WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM payments WHERE invoice_id = $1 AND status = 'completed')
  `, [invoiceId]);
}

async function recordStatusChange(client, invoiceId, oldStatus, newStatus, note) {
  if (oldStatus === newStatus) return;
  await client.query(`
    INSERT INTO invoice_status_history (invoice_id, old_status, new_status, note)
    VALUES ($1, $2, $3, $4)
  `, [invoiceId, oldStatus, newStatus, note]);
}

function isStockHeld(status) {
  return !RELEASED_INVOICE_STATUSES.has(status);
}

async function getSummary(_req, res) {
  try {
    const [products, invoices, revenue, lowStock] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE is_active)::int AS active FROM products'),
      pool.query(`SELECT COUNT(*)::int AS total FROM invoices WHERE deleted_at IS NULL`),
      pool.query(`SELECT COALESCE(SUM(total_amount), 0)::numeric(14, 2) AS total FROM invoices WHERE deleted_at IS NULL AND status NOT IN ('cancelled', 'refunded')`),
      pool.query(`SELECT COUNT(*)::int AS total FROM products WHERE is_active = TRUE AND status = 'active' AND stock_quantity <= 5`),
    ]);
    res.json({
      products: products.rows[0],
      invoices: invoices.rows[0].total,
      revenue: revenue.rows[0].total,
      lowStock: lowStock.rows[0].total,
    });
  } catch (error) {
    handleError(res, error);
  }
}

async function getLookups(_req, res) {
  try {
    const [categories, brands, suppliers] = await Promise.all([
      pool.query('SELECT id, name, is_active FROM categories ORDER BY name'),
      pool.query('SELECT id, name, is_active FROM brands ORDER BY name'),
      pool.query('SELECT id, name, is_active FROM suppliers ORDER BY name'),
    ]);
    res.json({ categories: categories.rows, brands: brands.rows, suppliers: suppliers.rows });
  } catch (error) {
    handleError(res, error);
  }
}

function catalogDefinition(type) {
  const definitions = {
    categories: {
      table: 'categories',
      entity: 'category',
      nameLimit: 150,
      columns: ['name', 'slug', 'description', 'is_active'],
      select: 'id, name, slug, description, is_active, created_at, updated_at',
    },
    brands: {
      table: 'brands',
      entity: 'brand',
      nameLimit: 150,
      columns: ['name', 'description', 'is_active'],
      select: 'id, name, description, is_active, created_at, updated_at',
    },
    suppliers: {
      table: 'suppliers',
      entity: 'supplier',
      nameLimit: 200,
      columns: ['name', 'contact_name', 'email', 'phone', 'address', 'notes', 'is_active'],
      select: 'id, name, contact_name, email, phone, address, notes, is_active, created_at, updated_at',
    },
  };
  const definition = definitions[type];
  if (!definition) throw httpError(404, 'Loại danh mục không hợp lệ.');
  return definition;
}

function parseCatalogRecord(type, body) {
  const definition = catalogDefinition(type);
  const record = {
    name: requiredText(body.name, type === 'categories' ? 'tên danh mục' : type === 'brands' ? 'tên thương hiệu' : 'tên nhà cung cấp', definition.nameLimit),
    is_active: body.is_active !== false && body.is_active !== 'false',
  };
  if (type === 'categories') {
    record.slug = optionalText(body.slug, 180);
    record.description = optionalText(body.description, 10000);
  } else if (type === 'brands') {
    record.description = optionalText(body.description, 10000);
  } else {
    record.contact_name = optionalText(body.contact_name, 200);
    record.email = optionalText(body.email, 255);
    record.phone = optionalText(body.phone, 30);
    record.address = optionalText(body.address, 2000);
    record.notes = optionalText(body.notes, 10000);
  }
  return record;
}

async function getCatalog(req, res) {
  try {
    const definition = catalogDefinition(req.params.type);
    const { rows } = await pool.query(
      'SELECT ' + definition.select + ' FROM ' + definition.table + ' ORDER BY is_active DESC, name',
    );
    res.json({ data: rows });
  } catch (error) {
    handleError(res, error);
  }
}

async function createCatalog(req, res) {
  try {
    const definition = catalogDefinition(req.params.type);
    const record = parseCatalogRecord(req.params.type, req.body);
    const values = definition.columns.map((column) => record[column]);
    const placeholders = values.map((_value, index) => '$' + (index + 1)).join(', ');
    const created = await withTransaction(async (client) => {
      const { rows } = await client.query(
        'INSERT INTO ' + definition.table + ' (' + definition.columns.join(', ') + ') VALUES (' + placeholders + ') RETURNING ' + definition.select,
        values,
      );
      await writeActivity(client, 'create', definition.entity, rows[0].id, { name: rows[0].name });
      return rows[0];
    });
    res.status(201).json({ data: created });
  } catch (error) {
    handleError(res, error);
  }
}

async function updateCatalog(req, res) {
  try {
    const definition = catalogDefinition(req.params.type);
    const id = validIdParam(req.params.id);
    const record = parseCatalogRecord(req.params.type, req.body);
    const assignments = definition.columns.map((column, index) => column + ' = $' + (index + 2));
    assignments.push('updated_at = NOW()');
    const updated = await withTransaction(async (client) => {
      const { rows } = await client.query(
        'UPDATE ' + definition.table + ' SET ' + assignments.join(', ') + ' WHERE id = $1 RETURNING ' + definition.select,
        [id, ...definition.columns.map((column) => record[column])],
      );
      if (!rows.length) throw httpError(404, 'Không tìm thấy mục cần cập nhật.');
      await writeActivity(client, 'update', definition.entity, id, { name: rows[0].name });
      return rows[0];
    });
    res.json({ data: updated });
  } catch (error) {
    handleError(res, error);
  }
}

async function archiveCatalog(req, res) {
  try {
    const definition = catalogDefinition(req.params.type);
    const id = validIdParam(req.params.id);
    const archived = await withTransaction(async (client) => {
      const { rows } = await client.query(
        'UPDATE ' + definition.table + ' SET is_active = FALSE, updated_at = NOW() WHERE id = $1 AND is_active = TRUE RETURNING id, name',
        [id],
      );
      if (!rows.length) throw httpError(404, 'Không tìm thấy mục đang hoạt động.');
      await writeActivity(client, 'archive', definition.entity, id, { name: rows[0].name });
      return rows[0];
    });
    res.json({ data: archived, message: 'Đã ngừng sử dụng mục này; dữ liệu sản phẩm liên quan vẫn được giữ.' });
  } catch (error) {
    handleError(res, error);
  }
}

async function getProducts(_req, res) {
  try {
    const { rows } = await pool.query(`
      SELECT p.id, p.category_id, c.name AS category_name, p.brand_id, b.name AS brand_name,
        p.supplier_id, s.name AS supplier_name, p.name, p.sku, p.price, p.cost_price,
        p.stock_quantity, p.status, p.is_active, p.image_url, p.description, p.created_at, p.updated_at
      FROM products AS p
      LEFT JOIN categories AS c ON c.id = p.category_id
      LEFT JOIN brands AS b ON b.id = p.brand_id
      LEFT JOIN suppliers AS s ON s.id = p.supplier_id
      ORDER BY p.updated_at DESC, p.id DESC
    `);
    res.json({ data: rows });
  } catch (error) {
    handleError(res, error);
  }
}

async function createProduct(req, res) {
  try {
    const product = parseProduct(req.body);
    const created = await withTransaction(async (client) => {
      const { rows } = await client.query(`
        INSERT INTO products (
          category_id, brand_id, supplier_id, name, sku, price, cost_price,
          stock_quantity, status, is_active, image_url, description
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, $9, $10, $11)
        RETURNING id, name, sku, price, stock_quantity, is_active, status
      `, [
        product.categoryId, product.brandId, product.supplierId, product.name, product.sku,
        product.price, product.costPrice, product.status, product.isActive, product.imageUrl, product.description,
      ]);
      const saved = rows[0];
      if (product.stock > 0) await adjustStock(client, saved, product.stock, 'opening', 'Tồn kho ban đầu');
      await syncPrimaryImage(client, saved.id, product.imageUrl, product.name);
      await writeActivity(client, 'create', 'product', saved.id, { name: product.name, sku: product.sku });
      return saved;
    });
    res.status(201).json({ data: created });
  } catch (error) {
    handleError(res, error);
  }
}

async function updateProduct(req, res) {
  try {
    const id = validIdParam(req.params.id);
    const product = parseProduct(req.body);
    const saved = await withTransaction(async (client) => {
      const currentResult = await client.query('SELECT * FROM products WHERE id = $1 FOR UPDATE', [id]);
      if (!currentResult.rowCount) throw httpError(404, 'Không tìm thấy sản phẩm.');
      const current = currentResult.rows[0];
      const { rows } = await client.query(`
        UPDATE products SET category_id = $2, brand_id = $3, supplier_id = $4, name = $5,
          sku = $6, price = $7, cost_price = $8, status = $9, is_active = $10,
          image_url = $11, description = $12, updated_at = NOW()
        WHERE id = $1
        RETURNING id, name, sku, price, stock_quantity, is_active, status
      `, [
        id, product.categoryId, product.brandId, product.supplierId, product.name, product.sku,
        product.price, product.costPrice, product.status, product.isActive, product.imageUrl, product.description,
      ]);
      const delta = product.stock - Number(current.stock_quantity);
      if (delta) await adjustStock(client, rows[0], delta, 'adjustment', 'Điều chỉnh tồn kho từ trang quản trị');
      await syncPrimaryImage(client, id, product.imageUrl, product.name);
      await writeActivity(client, 'update', 'product', id, { name: product.name, sku: product.sku });
      return rows[0];
    });
    res.json({ data: saved });
  } catch (error) {
    handleError(res, error);
  }
}

async function archiveProduct(req, res) {
  try {
    const id = validIdParam(req.params.id);
    const archived = await withTransaction(async (client) => {
      const result = await client.query(`
        UPDATE products SET is_active = FALSE, status = 'discontinued', updated_at = NOW()
        WHERE id = $1 AND is_active = TRUE RETURNING id, name, sku
      `, [id]);
      if (!result.rowCount) throw httpError(404, 'Không tìm thấy sản phẩm đang hoạt động.');
      await writeActivity(client, 'archive', 'product', id, { name: result.rows[0].name, sku: result.rows[0].sku });
      return result.rows[0];
    });
    res.json({ data: archived, message: 'Đã ẩn sản phẩm khỏi cửa hàng.' });
  } catch (error) {
    handleError(res, error);
  }
}

async function getInvoices(_req, res) {
  try {
    const { rows } = await pool.query(`
      SELECT i.id, i.invoice_code, i.customer_name, i.customer_email, i.customer_phone,
        i.subtotal, i.discount_amount, i.tax_amount, i.shipping_fee, i.total_amount,
        i.status, i.payment_status, i.shipping_address, i.created_at, i.updated_at,
        COALESCE(items.item_count, 0)::int AS item_count,
        COALESCE(paid.paid_amount, 0)::numeric(14, 2) AS paid_amount
      FROM invoices AS i
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS item_count FROM invoice_items WHERE invoice_id = i.id
      ) AS items ON TRUE
      LEFT JOIN LATERAL (
        SELECT SUM(amount) AS paid_amount FROM payments
        WHERE invoice_id = i.id AND status = 'completed'
      ) AS paid ON TRUE
      WHERE i.deleted_at IS NULL
      ORDER BY i.created_at DESC, i.id DESC
    `);
    res.json({ data: rows });
  } catch (error) {
    handleError(res, error);
  }
}

async function getInvoice(req, res) {
  try {
    const id = validIdParam(req.params.id);
    const invoiceResult = await pool.query(
      'SELECT * FROM invoices WHERE id = $1 AND deleted_at IS NULL',
      [id],
    );
    if (!invoiceResult.rowCount) throw httpError(404, 'Không tìm thấy hóa đơn.');
    const [items, payments, history] = await Promise.all([
      pool.query(`
        SELECT id, product_id, product_name, sku, quantity, unit_price, discount_amount, line_total
        FROM invoice_items WHERE invoice_id = $1 ORDER BY id
      `, [id]),
      pool.query(`
        SELECT id, amount, method, status, transaction_code, note, paid_at, created_at
        FROM payments WHERE invoice_id = $1 ORDER BY created_at DESC, id DESC
      `, [id]),
      pool.query(`
        SELECT old_status, new_status, note, created_at
        FROM invoice_status_history WHERE invoice_id = $1 ORDER BY created_at DESC, id DESC
      `, [id]),
    ]);
    res.json({ data: { ...invoiceResult.rows[0], items: items.rows, payments: payments.rows, status_history: history.rows } });
  } catch (error) {
    handleError(res, error);
  }
}

async function createInvoice(req, res) {
  try {
    const invoice = parseInvoice(req.body);
    if (invoice.status === 'refunded') throw httpError(400, 'Hãy tạo hóa đơn trước khi ghi nhận hoàn tiền.');
    const created = await withTransaction(async (client) => {
      const products = await lockProducts(client, invoice.items.map((item) => item.productId), { activeOnly: true });
      const { rows } = await client.query(`
        INSERT INTO invoices (
          customer_name, customer_email, customer_phone, billing_address, shipping_address,
          notes, status, subtotal, discount_amount, tax_amount, shipping_fee, total_amount,
          issued_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, $9, $10, 0, NOW())
        RETURNING id, invoice_code, customer_name, status
      `, [
        invoice.customerName, invoice.customerEmail, invoice.customerPhone, invoice.billingAddress,
        invoice.shippingAddress, invoice.notes, invoice.status, invoice.discount, invoice.tax, invoice.shippingFee,
      ]);
      const saved = rows[0];
      await insertInvoiceItems(client, saved.id, invoice.items, products, isStockHeld(invoice.status));
      await updateInvoiceTotals(client, saved.id, invoice);
      await recordStatusChange(client, saved.id, null, invoice.status, 'Tạo hóa đơn');
      await writeActivity(client, 'create', 'invoice', saved.id, { invoice_code: saved.invoice_code });
      const detail = await client.query('SELECT * FROM invoices WHERE id = $1', [saved.id]);
      return detail.rows[0];
    });
    res.status(201).json({ data: created });
  } catch (error) {
    handleError(res, error);
  }
}

async function updateInvoice(req, res) {
  try {
    const id = validIdParam(req.params.id);
    const invoice = parseInvoice(req.body);
    const saved = await withTransaction(async (client) => {
      const currentResult = await client.query(
        'SELECT * FROM invoices WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [id],
      );
      if (!currentResult.rowCount) throw httpError(404, 'Không tìm thấy hóa đơn.');
      const current = currentResult.rows[0];
      if (current.status === 'refunded' && invoice.status !== 'refunded') {
        throw httpError(409, 'Hóa đơn đã hoàn tiền không thể chuyển lại sang trạng thái bán hàng.');
      }
      if (invoice.status === 'cancelled' && current.status !== 'cancelled' && current.payment_status !== 'pending') {
        throw httpError(409, 'Hóa đơn đã nhận tiền. Hãy chọn trạng thái hoàn tiền để cập nhật khoản thanh toán.');
      }
      const oldItemsResult = await client.query('SELECT product_id, quantity FROM invoice_items WHERE invoice_id = $1', [id]);
      const oldItems = oldItemsResult.rows;
      const oldProductIds = new Set(oldItems.map((item) => Number(item.product_id)).filter(Boolean));
      const allIds = [
        ...oldItems.map((item) => Number(item.product_id)).filter(Boolean),
        ...invoice.items.map((item) => item.productId),
      ];
      const lockedProducts = await lockProducts(client, allIds);
      for (const item of invoice.items) {
        const product = lockedProducts.get(item.productId);
        if ((!product.is_active || product.status !== 'active') && !oldProductIds.has(item.productId)) {
          throw httpError(400, `Sản phẩm “${product.name}” hiện đã bị ẩn hoặc ngừng bán.`);
        }
      }

      if (isStockHeld(current.status)) {
        for (const item of oldItems) {
          if (!item.product_id) continue;
          const product = lockedProducts.get(Number(item.product_id));
          await adjustStock(client, product, Number(item.quantity), 'return', `Hoàn kho khi sửa hóa đơn #${id}`, id);
          product.stock_quantity = Number(product.stock_quantity) + Number(item.quantity);
        }
      }

      await client.query('DELETE FROM invoice_items WHERE invoice_id = $1', [id]);
      await insertInvoiceItems(client, id, invoice.items, lockedProducts, isStockHeld(invoice.status));
      await client.query(`
        UPDATE invoices SET customer_name = $2, customer_email = $3, customer_phone = $4,
          billing_address = $5, shipping_address = $6, notes = $7, status = $8, updated_at = NOW()
        WHERE id = $1
      `, [
        id, invoice.customerName, invoice.customerEmail, invoice.customerPhone, invoice.billingAddress,
        invoice.shippingAddress, invoice.notes, invoice.status,
      ]);
      await updateInvoiceTotals(client, id, invoice);
      if (invoice.status === 'refunded') {
        if (current.status !== 'refunded') {
          const paid = await client.query(`
            SELECT COALESCE(SUM(amount), 0)::numeric(14, 2) AS total
            FROM payments WHERE invoice_id = $1 AND status = 'completed'
          `, [id]);
          if (Number(paid.rows[0].total) <= 0) throw httpError(400, 'Hóa đơn chưa có khoản thanh toán để hoàn tiền.');
          await client.query("UPDATE payments SET status = 'refunded' WHERE invoice_id = $1 AND status = 'completed'", [id]);
          await client.query("UPDATE invoices SET payment_status = 'refunded' WHERE id = $1", [id]);
        }
      } else {
        await refreshPaymentStatus(client, id);
      }
      await recordStatusChange(client, id, current.status, invoice.status, 'Cập nhật từ trang quản trị');
      await writeActivity(client, 'update', 'invoice', id, { invoice_code: current.invoice_code });
      const detail = await client.query('SELECT * FROM invoices WHERE id = $1', [id]);
      return detail.rows[0];
    });
    res.json({ data: saved });
  } catch (error) {
    handleError(res, error);
  }
}

async function archiveInvoice(req, res) {
  try {
    const id = validIdParam(req.params.id);
    await withTransaction(async (client) => {
      const invoiceResult = await client.query(
        'SELECT id, invoice_code, status, payment_status FROM invoices WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [id],
      );
      if (!invoiceResult.rowCount) throw httpError(404, 'Không tìm thấy hóa đơn đang hoạt động.');
      const invoice = invoiceResult.rows[0];
      if (PRE_SHIPMENT_STATUSES.has(invoice.status)) {
        if (invoice.payment_status !== 'pending') {
          throw httpError(409, 'Hóa đơn đã nhận tiền. Hãy cập nhật trạng thái hoàn tiền trước khi lưu trữ.');
        }
        const items = await client.query('SELECT product_id, quantity FROM invoice_items WHERE invoice_id = $1', [id]);
        const products = await lockProducts(client, items.rows.map((item) => Number(item.product_id)).filter(Boolean));
        for (const item of items.rows) {
          if (!item.product_id) continue;
          const product = products.get(Number(item.product_id));
          await adjustStock(client, product, Number(item.quantity), 'return', `Hoàn kho khi lưu trữ hóa đơn #${id}`, id);
        }
        await client.query("UPDATE invoices SET status = 'cancelled' WHERE id = $1", [id]);
        await recordStatusChange(client, id, invoice.status, 'cancelled', 'Lưu trữ hóa đơn trước khi giao hàng');
      }
      await client.query('UPDATE invoices SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1', [id]);
      await writeActivity(client, 'archive', 'invoice', id, { invoice_code: invoice.invoice_code });
    });
    res.json({ message: 'Đã lưu trữ hóa đơn và giữ lại lịch sử thanh toán.' });
  } catch (error) {
    handleError(res, error);
  }
}

async function createPayment(req, res) {
  try {
    const id = validIdParam(req.params.id);
    const amount = money(req.body.amount, 'Số tiền thanh toán', { allowZero: false });
    const method = String(req.body.method || 'cash');
    if (!PAYMENT_METHODS.has(method)) throw httpError(400, 'Phương thức thanh toán không hợp lệ.');
    const transactionCode = optionalText(req.body.transaction_code, 120);
    const note = optionalText(req.body.note, 2000);

    const payment = await withTransaction(async (client) => {
      const invoiceResult = await client.query(
        'SELECT id, invoice_code, status, total_amount, deleted_at FROM invoices WHERE id = $1 FOR UPDATE', [id],
      );
      if (!invoiceResult.rowCount || invoiceResult.rows[0].deleted_at) throw httpError(404, 'Không tìm thấy hóa đơn.');
      const invoice = invoiceResult.rows[0];
      if (RELEASED_INVOICE_STATUSES.has(invoice.status)) throw httpError(409, 'Không thể ghi nhận thanh toán cho hóa đơn đã hủy hoặc hoàn tiền.');
      const paidResult = await client.query(`
        SELECT COALESCE(SUM(amount), 0)::numeric(14, 2) AS paid_total
        FROM payments WHERE invoice_id = $1 AND status = 'completed'
      `, [id]);
      if (Number(paidResult.rows[0].paid_total) + Number(amount) > Number(invoice.total_amount)) {
        throw httpError(400, 'Số tiền thanh toán vượt quá số tiền còn phải thu.');
      }
      const { rows } = await client.query(`
        INSERT INTO payments (invoice_id, amount, method, status, transaction_code, note, paid_at)
        VALUES ($1, $2, $3, 'completed', $4, $5, NOW())
        RETURNING id, amount, method, status, transaction_code, note, paid_at
      `, [id, amount, method, transactionCode, note]);
      await refreshPaymentStatus(client, id);
      await writeActivity(client, 'payment', 'invoice', id, { invoice_code: invoice.invoice_code, amount, method });
      return rows[0];
    });
    res.status(201).json({ data: payment });
  } catch (error) {
    handleError(res, error);
  }
}

module.exports = {
  getSummary,
  getLookups,
  getCatalog,
  createCatalog,
  updateCatalog,
  archiveCatalog,
  getProducts,
  createProduct,
  updateProduct,
  archiveProduct,
  getInvoices,
  getInvoice,
  createInvoice,
  updateInvoice,
  archiveInvoice,
  createPayment,
};
