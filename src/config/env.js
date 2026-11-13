// Load environment variables from the .env file
import "dotenv/config";

import { z } from "zod";

// Define which environment variables our application needs
// Zod also checks whether their values are valid
const envSchema = z.object({
  // Application environment
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  // Port on which our Express server will run
  PORT: z.coerce.number().int().positive().default(5000),

  // Allow requests only from the configured frontend origin
  CORS_ORIGIN: z.string().default("http://localhost:3000"),

  // Controls which log messages Pino should print
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("debug"),
});

// Validate all environment variables before starting the application
const result = envSchema.safeParse(process.env);

// Stop the application if required configuration is invalid
// This helps us find configuration problems during startup
if (!result.success) {
  console.error("Invalid environment configuration:");
  console.error(result.error.format());

  process.exit(1);
}

// Export validated environment variables for other files
export const env = result.data;
