import { AppError } from "../errors/app-error.js";

// Express error middleware ke FOUR parameters required hain.
// WHY: Express is signature ko error handler ke roop mein
// recognize karta hai.
export function errorHandler(err, req, res, next) {
  // Response already start ho chuka ho toh doosra
  // response send nahi kar sakte.
  if (res.headersSent) {
    return next(err);
  }

  // Known application errors safe response generate kar sakti hain.
  const isAppError = err instanceof AppError;

  // Invalid JSON ke liye 400.
  // WHY: Client ka malformed input server bug nahi hai.
  const isInvalidJson =
    err?.type === "entity.parse.failed" && err?.status === 400;

  // JSON payload allowed size se bada hai.
  const isTooLarge = err?.type === "entity.too.large" && err?.status === 413;

  const statusCode = isInvalidJson
    ? 400
    : isTooLarge
      ? 413
      : isAppError
        ? err.statusCode
        : 500;

  const code = isInvalidJson
    ? "INVALID_JSON"
    : isTooLarge
      ? "PAYLOAD_TOO_LARGE"
      : isAppError
        ? err.code
        : "INTERNAL_SERVER_ERROR";

  // Unexpected internal error ka stack/message client ko
  // expose nahi karenge. Real error logs mein available rahega.
  const message = isInvalidJson
    ? "Invalid JSON request body"
    : isTooLarge
      ? "Request body is too large"
      : isAppError
        ? err.message
        : "Internal server error";

  // req.log pino-http middleware se aata hai.
  // WHY: Same Request ID ke saath error investigate kar sakenge.
  req.log.error({ err, statusCode }, "Request failed");

  return res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      requestId: req.id,
    },
  });
}
