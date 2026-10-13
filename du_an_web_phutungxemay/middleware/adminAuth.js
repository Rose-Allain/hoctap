const { timingSafeEqual } = require('crypto');

function requireAdminKey(req, res, next) {
  const configuredKey = process.env.ADMIN_API_KEY;
  if (!configuredKey) {
    return res.status(503).json({ message: 'Chưa cấu hình ADMIN_API_KEY trên máy chủ.' });
  }

  const suppliedKey = req.get('x-admin-key') || '';
  const suppliedBuffer = Buffer.from(suppliedKey);
  const configuredBuffer = Buffer.from(configuredKey);
  const matches = suppliedBuffer.length === configuredBuffer.length
    && timingSafeEqual(suppliedBuffer, configuredBuffer);

  if (!matches) {
    return res.status(401).json({ message: 'Mã truy cập quản trị không hợp lệ.' });
  }

  next();
}

module.exports = requireAdminKey;
