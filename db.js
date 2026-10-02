/**
 * db.js
 * MS SQL Server コネクションプール管理 (Synology NAS / SSMS 連携 & JSON Fallback)
 */
import sql from 'mssql';

let pool = null;

export async function getPool() {
  if (pool) return pool;

  const server = process.env.DB_SERVER || process.env.MSSQL_HOST;
  const user = process.env.DB_USER || process.env.MSSQL_USER;
  const password = process.env.DB_PASSWORD || process.env.MSSQL_PASSWORD;
  const database = process.env.DB_DATABASE || process.env.MSSQL_DATABASE || 'teranago_sns';

  if (!server || !user || !password) {
    return null;
  }

  try {
    const config = {
      user,
      password,
      server,
      database,
      options: {
        encrypt: process.env.DB_ENCRYPT === 'true',
        trustServerCertificate: true,
        enableArithAbort: true
      },
      pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
      }
    };
    pool = await sql.connect(config);
    return pool;
  } catch (err) {
    console.warn('[db.js] MS SQL Server connect error (falling back to JSON storage):', err.message);
    return null;
  }
}

export default { getPool };
