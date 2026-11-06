import { query } from '../db/pool.js';
import type { Customer } from '@nexora/shared/types';
import { NotFoundError } from '../lib/errors.js';

function rowToCustomer(row: {
  id: string;
  email: string | null;
  is_banned: boolean;
  created_at: Date;
}): Customer {
  return {
    id: row.id,
    email: row.email,
    isBanned: row.is_banned,
    createdAt: row.created_at,
  };
}

export async function listCustomers(params: {
  q?: string;
  limit: number;
  offset: number;
}): Promise<{ customers: Customer[]; total: number }> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (params.q) {
    conditions.push(`email ILIKE $${idx++}`);
    values.push(`%${params.q}%`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM customers ${where}`,
    values,
  );
  const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

  values.push(params.limit, params.offset);
  const { rows } = await query<{
    id: string;
    email: string | null;
    is_banned: boolean;
    created_at: Date;
  }>(
    `SELECT id, email, is_banned, created_at FROM customers ${where}
     ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
    values,
  );

  return { customers: rows.map(rowToCustomer), total };
}

export async function getCustomerById(id: string): Promise<Customer> {
  const { rows } = await query<{
    id: string;
    email: string | null;
    is_banned: boolean;
    created_at: Date;
  }>(
    'SELECT id, email, is_banned, created_at FROM customers WHERE id = $1',
    [id],
  );
  if (!rows[0]) throw new NotFoundError('Customer not found');
  return rowToCustomer(rows[0]);
}

export async function banCustomer(id: string): Promise<Customer> {
  const { rows } = await query<{
    id: string;
    email: string | null;
    is_banned: boolean;
    created_at: Date;
  }>(
    'UPDATE customers SET is_banned = TRUE WHERE id = $1 RETURNING id, email, is_banned, created_at',
    [id],
  );
  if (!rows[0]) throw new NotFoundError('Customer not found');
  return rowToCustomer(rows[0]);
}

export async function unbanCustomer(id: string): Promise<Customer> {
  const { rows } = await query<{
    id: string;
    email: string | null;
    is_banned: boolean;
    created_at: Date;
  }>(
    'UPDATE customers SET is_banned = FALSE WHERE id = $1 RETURNING id, email, is_banned, created_at',
    [id],
  );
  if (!rows[0]) throw new NotFoundError('Customer not found');
  return rowToCustomer(rows[0]);
}
