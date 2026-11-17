import { pool } from "../../config/database.js";

// Never select password_hash in public profile responses.
export async function findPublicUserById(id) {
  const result = await pool.query(
    `SELECT id, full_name, email, role, is_active, created_at
     FROM users WHERE id = $1`,
    [id],
  );

  return result.rows[0] ?? null;
}

// Login mein password hash chahiye, isliye separate query.
// WHY: Sensitive fields unnecessarily other code tak na jaayen.
export async function findUserForLogin(email) {
  const result = await pool.query(
    `SELECT id, full_name, email, role, password_hash, is_active
     FROM users WHERE email = $1`,
    [email],
  );

  return result.rows[0] ?? null;
}

// User creation.
// Role explicitly customer hai; request se role accept nahi karte.
export async function insertUser(data) {
  const result = await pool.query(
    `INSERT INTO users (full_name, email, password_hash, role)
     VALUES ($1, $2, $3, 'customer')
     RETURNING id, full_name, email, role, is_active, created_at`,
    [data.fullName, data.email, data.passwordHash],
  );

  return result.rows[0];
}

// Initial login refresh session create karta hai.
export async function insertRefreshSession(data) {
  await pool.query(
    `INSERT INTO refresh_sessions (
       id, family_id, user_id, token_hash, expires_at
     )
     VALUES ($1, $2, $3, $4, $5)`,
    [data.id, data.familyId, data.userId, data.tokenHash, data.expiresAt],
  );
}

// Transaction callback ko same checked-out client milega.
// WHY: Refresh token rotation atomic honi chahiye.
export async function withTransaction(callback) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await callback(client);

    await client.query("COMMIT");

    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Original failure preserve karenge.
    }

    throw error;
  } finally {
    // Pool exhaustion avoid karna important hai.
    client.release();
  }
}
