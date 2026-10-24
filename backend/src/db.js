import 'dotenv/config';
import pg from 'pg';

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000,
  keepAlive: true,
});

// Attach error listener directly to every client created by the pool
pool.on('connect', (client) => {
  client.on('error', (err) => {
    console.warn('PostgreSQL client socket disconnected or dropped (handled):', err.message);
  });
});

// Handle idle connection errors on the pool itself (e.g. Neon serverless idle sleep / PgBouncer reset)
pool.on('error', (err) => {
  console.warn('PostgreSQL pool idle connection terminated (handled):', err.message);
});
