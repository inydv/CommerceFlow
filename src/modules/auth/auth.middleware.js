import { AppError } from "../../common/errors/app-error.js";

import { verifyAccessToken } from "./auth.tokens.js";
import { findPublicUserById } from "./auth.repository.js";

// Protected routes par valid JWT mandatory.
export async function requireAuth(req, res, next) {
  const authorization = req.headers.authorization;

  // Exactly "Bearer TOKEN" format expect karte hain.
  if (!authorization || !authorization.startsWith("Bearer ")) {
    throw new AppError("Authentication required", 401, "UNAUTHORIZED");
  }

  const token = authorization.slice(7);

  let payload;

  try {
    // Signature, expiry, issuer and audience verify.
    payload = await verifyAccessToken(token);
  } catch {
    throw new AppError("Invalid access token", 401, "UNAUTHORIZED");
  }

  // Token ka subject valid UUID hona chahiye.
  if (typeof payload.sub !== "string" || !/^[0-9a-f-]{36}$/.test(payload.sub)) {
    throw new AppError("Invalid access token", 401, "UNAUTHORIZED");
  }

  // Current user state database se read karte hain.
  // WHY: Disabled account ko token expiry tak access na mile.
  const user = await findPublicUserById(payload.sub);

  if (!user || !user.is_active) {
    throw new AppError("Authentication required", 401, "UNAUTHORIZED");
  }

  // Trusted DB user object request par attach.
  req.user = user;

  return next();
}

// Authorization authentication ke AFTER apply hoti hai.
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return next(new AppError("Access denied", 403, "FORBIDDEN"));
    }

    return next();
  };
}
