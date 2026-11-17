import { createHash, randomBytes, randomUUID } from "node:crypto";

import { SignJWT, jwtVerify } from "jose";

import { env } from "../../config/env.js";

// Config secret 64 hex characters = 32 random bytes.
const jwtKey = Buffer.from(env.JWT_ACCESS_SECRET, "hex");

// Stable issuer/audience expected by our application.
// WHY: Token kisi unrelated application ka ho toh reject ho.
const issuer = "commerceflow";
const audience = "commerceflow-api";

export async function createAccessToken(user) {
  // Access token 15 minutes valid hoga.
  // Role DB se request par check karenge, JWT role claim
  // par blindly rely nahi karenge.
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(jwtKey);
}

export async function verifyAccessToken(token) {
  // Signature, expiry, issuer aur audience validate honge.
  const { payload } = await jwtVerify(token, jwtKey, {
    algorithms: ["HS256"],
    issuer,
    audience,
  });

  return payload;
}

// Opaque refresh token: session UUID + secret random bytes.
// WHY: UUID se database row efficiently locate kar sakte hain;
// random part token guess karna computationally infeasible banata hai.
export function generateRefreshToken(sessionId = randomUUID()) {
  const randomPart = randomBytes(32).toString("base64url");

  return {
    sessionId,
    token: `${sessionId}.${randomPart}`,
  };
}

// Database mein only SHA-256 hash store hoga.
// Opaque random token already high entropy rakhta hai;
// password ki tarah slow Argon2 hashing required nahi.
export function hashRefreshToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

// Extract UUID without trusting any part of token as authority.
export function extractSessionId(token) {
  const match = /^([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})$/.exec(token);

  if (!match) {
    return null;
  }

  return match[1];
}
