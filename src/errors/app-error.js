export class AppError extends Error {
  constructor(message, statusCode = 500, code = "INTERNAL_ERROR") {
    // Pass the error message to JavaScript's built-in Error class
    super(message);

    // HTTP status code that should be returned to the client
    this.statusCode = statusCode;

    // Unique error code that helps identify the type of error
    this.code = code;

    // Helps us distinguish expected application errors
    // from unexpected programming or system errors
    this.isOperational = true;

    // Keeps the stack trace focused on where this error was created
    Error.captureStackTrace(this, this.constructor);
  }
}
