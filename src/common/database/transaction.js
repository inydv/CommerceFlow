import { pool } from "../../config/database.js";

// Shared transactional boundary for complex business operations.
// Checkout and cancellation must use ONE connection end to end.
export async function withTransaction(callback) {
  const client = await pool.connect();

  // If rollback itself fails, discard this connection.
  let discardClient = false;

  try {
    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");

    // Don't wait indefinitely for inventory/cart locks.
    await client.query(`SET LOCAL lock_timeout = '5s'`);

    // All queries inside callback run through this client.
    const value = await callback(client);

    // COMMIT success means changes become durable.
    await client.query("COMMIT");

    return value;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Broken/unknown transaction connection isn't safe to reuse.
      discardClient = true;
    }

    throw error;
  } finally {
    // Exactly one release, even after errors.
    if (discardClient) {
      client.release(new Error("Transaction cleanup failed"));
    } else {
      client.release();
    }
  }
}
