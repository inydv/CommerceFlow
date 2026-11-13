export const errorHandler = (err, req, res, next) => {
  // If response headers have already been sent,
  // let Express handle the error instead of sending another response
  if (res.headersSent) {
    return next(err);
  }

  // Use the error's status code or default to 500
  const statusCode = err.statusCode || 500;

  // Log error details on the server for debugging
  // The client should not receive internal stack traces or database details
  req.log.error(
    {
      err,
      requestId: req.id,
      method: req.method,
      url: req.originalUrl,
    },
    "Request failed",
  );

  // Send a consistent error response to the client
  res.status(statusCode).json({
    success: false,

    // Do not expose internal error messages for server errors
    message: statusCode >= 500 ? "Internal server error" : err.message,

    // Give the client a stable error code
    code: statusCode >= 500 ? "INTERNAL_ERROR" : err.code || "REQUEST_ERROR",

    // Client can share this ID when reporting an issue
    requestId: req.id,
  });
};
