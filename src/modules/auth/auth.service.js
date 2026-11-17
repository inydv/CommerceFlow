import argon2 from "argon2";
import { randomUUID, timingSafeEqual } from "node:crypto";

import { AppError } from "../../common/errors/app-error.js";
import { pool } from "../../config/database.js";

import {
  createAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  extractSessionId,
} from "./auth.tokens.js";

import * as repo from "./auth.repository.js";

// Refresh session valid for 7 days.
// Access token 15 minutes mein expire hota hai.
const REFRESH_DAYS = 7;

function expiresAt() {
  return new Date(Date.now() + REFRESH_DAYS * 24 * 60 * 60 * 1000);
}

function unauthorized() {
  return new AppError("Invalid or expired credentials", 401, "UNAUTHORIZED");
}

// Hash comparison fixed-size Buffers ke saath.
// WHY: Plain string equality timing differences expose kar sakti hai.
function tokenHashMatches(storedHash, suppliedHash) {
  if (typeof storedHash !== "string" || !/^[a-f0-9]{64}$/.test(storedHash))
    return false;

  return timingSafeEqual(
    Buffer.from(storedHash, "hex"),
    Buffer.from(suppliedHash, "hex"),
  );
}

// Register a new customer.
// Public input se role kabhi accept nahi karte.
export async function register(data) {
  // Argon2id password hashing, not encryption.
  // WHY: Database leak hone par original password directly
  // available nahi hona chahiye.
  const passwordHash = await argon2.hash(data.password, {
    type: argon2.argon2id,
  });

  try {
    return await repo.insertUser({
      fullName: data.fullName,
      email: data.email,
      passwordHash,
    });
  } catch (error) {
    // PostgreSQL unique violation; concurrent registrations
    // mein DB constraint final protection provide karti hai.
    if (error.code === "23505") {
      throw new AppError(
        "Email already registered",
        409,
        "EMAIL_ALREADY_EXISTS",
      );
    }

    throw error;
  }
}

// Login successful hone par access + refresh tokens create.
export async function login(data) {
  const user = await repo.findUserForLogin(data.email);

  // Generic error prevents revealing which emails exist.
  if (!user || !user.is_active) throw unauthorized();

  const passwordValid = await argon2.verify(user.password_hash, data.password);

  if (!passwordValid) throw unauthorized();

  const { sessionId, token } = generateRefreshToken();

  const accessToken = await createAccessToken(user);

  await repo.insertRefreshSession({
    id: sessionId,
    familyId: randomUUID(),
    userId: user.id,
    tokenHash: hashRefreshToken(token),
    expiresAt: expiresAt(),
  });

  return {
    accessToken,
    refreshToken: token,
    tokenType: "Bearer",
    expiresIn: 900,
  };
}

// Refresh-token rotation.
// One existing refresh token -> one new refresh token.
// WHY: Stolen old token reuse detect karne ka opportunity milta hai.
export async function refresh(rawToken) {
  const sessionId = extractSessionId(rawToken);

  if (!sessionId) throw unauthorized();

  const suppliedHash = hashRefreshToken(rawToken);

  // Refresh operation transaction mein hoga.
  // SELECT FOR UPDATE same session ke simultaneous rotations
  // serialize karta hai.
  const outcome = await repo.withTransaction(async (client) => {
    const result = await client.query(
      `SELECT
         s.id, s.family_id, s.user_id, s.token_hash,
         s.expires_at, s.rotated_at, s.revoked_at,
         u.is_active
       FROM refresh_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = $1
       FOR UPDATE OF s`,
      [sessionId],
    );

    const session = result.rows[0];

    // Invalid token guess se real session revoke nahi karna.
    if (!session || !tokenHashMatches(session.token_hash, suppliedHash)) {
      return { kind: "invalid" };
    }

    // Old rotated token dobara use hua.
    // Possible replay: family ke active refresh sessions revoke.
    if (session.rotated_at) {
      await client.query(
        `UPDATE refresh_sessions
         SET revoked_at = NOW()
         WHERE family_id = $1 AND revoked_at IS NULL`,
        [session.family_id],
      );

      // IMPORTANT: Return normally so transaction COMMIT ho.
      // Yahan throw kiya toh revocation ROLLBACK ho jaayegi.
      return { kind: "replay" };
    }

    if (
      session.revoked_at ||
      !session.is_active ||
      new Date(session.expires_at).getTime() <= Date.now()
    ) {
      return { kind: "invalid" };
    }

    const next = generateRefreshToken();

    // Old token mark rotated.
    await client.query(
      `UPDATE refresh_sessions
       SET rotated_at = NOW()
       WHERE id = $1`,
      [session.id],
    );

    // Same family mein fresh session insert.
    await client.query(
      `INSERT INTO refresh_sessions (
         id, family_id, user_id, token_hash, expires_at
       )
       VALUES ($1, $2, $3, $4, $5)`,
      [
        next.sessionId,
        session.family_id,
        session.user_id,
        hashRefreshToken(next.token),
        expiresAt(),
      ],
    );

    return {
      kind: "success",
      userId: session.user_id,
      refreshToken: next.token,
    };
  });

  if (outcome.kind !== "success") throw unauthorized();

  const user = await repo.findPublicUserById(outcome.userId);
  if (!user || !user.is_active) throw unauthorized();

  return {
    accessToken: await createAccessToken(user),
    refreshToken: outcome.refreshToken,
    tokenType: "Bearer",
    expiresIn: 900,
  };
}

// Logout: provided valid refresh token ki session family revoke.
// WHY: Is login chain se future refresh requests reject hongi.
export async function logout(rawToken) {
  const sessionId = extractSessionId(rawToken);

  // Same response even if token invalid; client ko
  // session existence information nahi deni.
  if (!sessionId) return;

  const suppliedHash = hashRefreshToken(rawToken);

  await repo.withTransaction(async (client) => {
    const result = await client.query(
      `SELECT id, family_id, token_hash
       FROM refresh_sessions
       WHERE id = $1
       FOR UPDATE`,
      [sessionId],
    );

    const session = result.rows[0];

    if (!session || !tokenHashMatches(session.token_hash, suppliedHash)) return;

    await client.query(
      `UPDATE refresh_sessions
       SET revoked_at = NOW()
       WHERE family_id = $1
         AND revoked_at IS NULL`,
      [session.family_id],
    );
  });
}

// Protected user profile.
export async function getProfile(userId) {
  const user = await repo.findPublicUserById(userId);

  if (!user || !user.is_active) throw unauthorized();

  return user;
}

// Admin-only user listing; bounded response.
export async function listUsers() {
  const result = await pool.query(
    `SELECT id, full_name, email, role, is_active, created_at
     FROM users
     ORDER BY created_at DESC, id DESC
     LIMIT 100`,
  );

  return result.rows;
}
