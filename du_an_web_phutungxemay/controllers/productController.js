const pool = require('../config/db');

async function getAllProducts(req, res) {
  try {
    const { rows } = await pool.query(`
      SELECT
        p.id,
        p.category_id,
        c.name AS category_name,
        p.name,
        p.sku,
        p.price,
        p.stock_quantity,
        p.image_url,
        p.description
      FROM products AS p
      LEFT JOIN categories AS c ON c.id = p.category_id
      WHERE p.is_active = TRUE AND p.status = 'active'
      ORDER BY p.id DESC
    `);

    res.json({ data: rows });
  } catch (error) {
    console.error('Không thể lấy danh sách sản phẩm:', error);
    res.status(500).json({ message: 'Không thể tải danh sách sản phẩm.' });
  }
}

module.exports = { getAllProducts };
