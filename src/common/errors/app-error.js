// Expected application errors ke liye reusable class.
//
// Example:
// Product unavailable -> 404
// Duplicate order -> 409
// Unauthorized request -> 401
//
// WHY: Har module apni custom error response shape
// invent nahi karega.
export class AppError extends Error {
  constructor(message, statusCode = 500, code = "APP_ERROR") {
    // Built-in Error ka message aur stack initialize karo.
    super(message);

    this.name = "AppError";

    // Response mein appropriate HTTP status return karenge.
    this.statusCode = statusCode;

    // Frontend machine-readable error code use kar sakega.
    this.code = code;
  }
}
