import { AppError } from "../errors/app-error.js";

// Choose which part of the request should be checked:
// body, query parameters or URL parameters.
export const validateRequest = (schema, source = "body") => {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);

    // Stop the request if the data does not match the schema
    if (!result.success) {
      const message = result.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join(", ");

      return next(new AppError(message, 400, "VALIDATION_ERROR"));
    }

    // Keep validated body, query and params in separate properties
    req.validated ??= {};
    req.validated[source] = result.data;

    next();
  };
};
