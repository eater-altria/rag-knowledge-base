import { resetAdmin } from '../services/auth.js';
import { pool } from '../db/pg.js';
import { logger } from '../logger.js';

async function main() {
  await resetAdmin();
  logger.info('admin table cleared; next visit will prompt setup');
  await pool.end();
}

main().catch((e) => {
  logger.error({ err: e }, 'admin reset failed');
  process.exit(1);
});
