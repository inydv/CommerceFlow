import "dotenv/config";
import { z } from "zod";

// dotenv/config local .env ko process.env mein load karta hai.
// WHY: Credentials ko source code se separate rakhna hai.
// WITHOUT IT: Local .env file automatically read nahi hogi,
// unless Node.js ya deployment environment separately loads it.

const envSchema = z.object({
  // Sirf known environments allow kar rahe hain.
  // WHY: "prodution" jaisi spelling mistake silently accept na ho.
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  // Environment variables initially strings hoti hain.
  // Pehle digits validate, phir number mein convert karenge.
  // WHY: Number("abc") || 5000 galat value silently hide kar sakta hai.
  PORT: z
    .string()
    .regex(/^[0-9]+$/, "PORT must contain only digits")
    .default("5000")
    .transform(Number)
    .pipe(z.number().int().min(1).max(65535)),

  // PostgreSQL connection string mandatory hai.
  // WHY: Missing DB config ko startup par catch karna hai.
  // WITHOUT THIS: Connection ke waqt confusing errors mil sakti hain.
  DATABASE_URL: z.string().min(1),

  // JWT signing secret.
  // WHY: JWT ka signature verify karke token tampering detect hoti hai.
  // WITHOUT STRONG SECRET: Attacker forged tokens create kar sakta hai.
  //
  // Is project mein 32 random bytes ko 64 hexadecimal characters
  // ke form mein environment variable mein store kar rahe hain.
  JWT_ACCESS_SECRET: z
    .string()
    .regex(
      /^[0-9a-fA-F]{64}$/,
      "JWT_ACCESS_SECRET must be 64 hexadecimal characters",
    ),
});

// safeParse exception throw karne ke bajaye result return karta hai.
// WHY: Invalid configuration par controlled error show karenge.
const result = envSchema.safeParse(process.env);

if (!result.success) {
  // Secrets print nahi kar rahe, sirf invalid field names/messages.
  const issues = result.error.issues.map((issue) => ({
    field: issue.path.join("."),
    message: issue.message,
  }));

  process.stderr.write(
    `Invalid configuration:\n${JSON.stringify(issues, null, 2)}\n`,
  );

  // Fail fast: broken configuration ke saath server start nahi karna.
  process.exit(1);
}

// Application mein raw process.env ki jagah validated env use hogi.
export const env = result.data;
