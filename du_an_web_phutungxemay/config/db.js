require('dotenv').config();

const { Pool } = require('pg');

const poolConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: process.env.PGHOST || 'localhost',
      port: Number(process.env.PGPORT) || 5432,
      database: process.env.PGDATABASE || 'motorcycle_parts',
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || '',
    };

if (process.env.DB_SSL === 'true') {
  poolConfig.ssl = { rejectUnauthorized: false };
}

const pool = new Pool(poolConfig);

pool.on('error', (error) => {
  console.error('Lỗi kết nối PostgreSQL ngoài truy vấn:', error);
});

module.exports = pool;
