import { randomUUID } from "node:crypto";

// Generate a unique ID for every incoming request
export const requestIdMiddleware = (req, res, next) => {
  const requestId = randomUUID();

  // Attach the ID to the request so other middleware,
  // controllers and services can access it
  req.id = requestId;

  // Send the same ID back to the client
  // This helps us identify a failed request from its response
  res.setHeader("X-Request-ID", requestId);

  // Move to the next middleware or route handler
  next();
};
