import { AppError } from "../errors/app-error.js";

// PostgreSQL transaction failures that may succeed on retry.
//
// 55P03 = lock not available / lock_timeout
// 40P01 = deadlock detected
// 40001 = serialization failure
//
// WHY: A transaction conflict is not necessarily a bug
// or a permanent business rejection.
//
// IMPORTANT: For writes, clients should reuse their
// original Idempotency-Key when retrying checkout.
const retryableDatabaseCodes = new Set(["55P03", "40P01", "40001"]);

export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  const isAppError = err instanceof AppError;

  const invalidJson =
    err?.type === "entity.parse.failed" && err?.status === 400;

  const largeBody = err?.type === "entity.too.large" && err?.status === 413;

  const retryableDatabaseError = retryableDatabaseCodes.has(err?.code);

  let statusCode = 500;
  let code = "INTERNAL_SERVER_ERROR";
  let message = "Internal server error";

  if (isAppError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
  } else if (invalidJson) {
    statusCode = 400;
    code = "INVALID_JSON";
    message = "Invalid JSON request body";
  } else if (largeBody) {
    statusCode = 413;
    code = "PAYLOAD_TOO_LARGE";
    message = "Request body is too large";
  } else if (retryableDatabaseError) {
    // 503 signals temporary inability to complete request.
    // It doesn't promise that retrying will always succeed.
    statusCode = 503;
    code = "DATABASE_BUSY";
    message = "Database is temporarily busy; retry later";

    res.setHeader("Retry-After", "1");
  }

  // Log full internal error on server.
  // Never return SQL statements or stack traces to client.
  req.log.error({ err, statusCode, requestId: req.id }, "Request failed");

  return res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      requestId: req.id,
    },
  });
}
