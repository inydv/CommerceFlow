import { AppError } from "../errors/app-error.js";

// This middleware runs when no registered route matches the request
export const notFoundMiddleware = (req, res, next) => {
  // Pass a 404 error to the centralized error handler
  // instead of sending an error response directly here
  next(
    new AppError(
      `Route not found: ${req.method} ${req.originalUrl}`,
      404,
      "ROUTE_NOT_FOUND",
    ),
  );
};
