import bcrypt from 'bcrypt';
import { pool } from '../db/pg.js';

export type AdminRow = { id: string; username: string; password_hash: string };

export async function getAdmin(): Promise<AdminRow | null> {
  const r = await pool.query<AdminRow>(
    'SELECT id, username, password_hash FROM admin LIMIT 1',
  );
  return r.rows[0] ?? null;
}

export async function isInitialized(): Promise<boolean> {
  const r = await pool.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM admin');
  return Number(r.rows[0].count) > 0;
}

export async function createAdmin(username: string, password: string): Promise<AdminRow> {
  const hash = await bcrypt.hash(password, 12);
  const r = await pool.query<AdminRow>(
    'INSERT INTO admin (username, password_hash) VALUES ($1, $2) RETURNING id, username, password_hash',
    [username, hash],
  );
  return r.rows[0];
}

export async function verifyCredentials(username: string, password: string): Promise<AdminRow | null> {
  const admin = await getAdmin();
  // Always run bcrypt.compare to keep timing consistent even when no admin/wrong username.
  const dummyHash = '$2b$12$abcdefghijklmnopqrstuv.0123456789ABCDEFGHIJKLMNOPQRSTU';
  const hashToCheck = admin?.password_hash ?? dummyHash;
  const passwordOk = await bcrypt.compare(password, hashToCheck);
  if (!admin) return null;
  if (admin.username !== username) return null;
  if (!passwordOk) return null;
  return admin;
}

export async function resetAdmin(): Promise<void> {
  await pool.query('DELETE FROM admin');
}
