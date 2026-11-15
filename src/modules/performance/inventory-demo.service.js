import { randomUUID } from "node:crypto";
import { pool } from "../../config/database.js";

// A reservation is valid for 5 minutes.
const RESERVATION_MINUTES = 5;

// Set initial demo stock for a product.
// Run once for a product; repeated calls don't overwrite stock.
export const setupInventory = async (productId, quantity) => {
  const result = await pool.query(
    `INSERT INTO inventory_demo (product_id, on_hand)
     VALUES ($1, $2)
     ON CONFLICT (product_id) DO NOTHING
     RETURNING *`,
    [productId, quantity],
  );

  return result.rows[0] ?? null;
};

// Read current available inventory.
export const getInventory = async (productId) => {
  const result = await pool.query(
    `SELECT
       product_id,
       on_hand,
       reserved,
       on_hand - reserved AS available
     FROM inventory_demo
     WHERE product_id = $1`,
    [productId],
  );

  return result.rows[0] ?? null;
};

// Temporarily reserve stock for checkout.
export const reserveStock = async (productId, quantity) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Atomically reserve only if enough stock is available.
    const stockResult = await client.query(
      `UPDATE inventory_demo
       SET reserved = reserved + $1
       WHERE product_id = $2
         AND on_hand - reserved >= $1
       RETURNING *`,
      [quantity, productId],
    );

    if (stockResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return null;
    }

    const reservationId = randomUUID();

    // Save which checkout owns the reserved units.
    const reservationResult = await client.query(
      `INSERT INTO inventory_reservations_demo
         (id, product_id, quantity, expires_at)
       VALUES
         ($1, $2, $3, NOW() + ($4 * INTERVAL '1 minute'))
       RETURNING *`,
      [reservationId, productId, quantity, RESERVATION_MINUTES],
    );

    // Inventory update and reservation record succeed together.
    await client.query("COMMIT");

    return reservationResult.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    // Always return the DB connection to the pool.
    client.release();
  }
};

// Confirm payment or release a failed checkout reservation.
export const finishReservation = async (reservationId, action) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Lock the reservation so it cannot be processed twice.
    const reservationResult = await client.query(
      `SELECT *
       FROM inventory_reservations_demo
       WHERE id = $1
       FOR UPDATE`,
      [reservationId],
    );

    const reservation = reservationResult.rows[0];

    if (!reservation) {
      await client.query("ROLLBACK");
      return { outcome: "NOT_FOUND" };
    }

    // A reservation can be finalized only once.
    if (reservation.status !== "RESERVED") {
      await client.query("ROLLBACK");
      return {
        outcome: "ALREADY_FINALIZED",
        status: reservation.status,
      };
    }

    if (action === "CONFIRMED") {
      // Don't confirm expired reservations.
      const validReservation = await client.query(
        `SELECT expires_at > NOW() AS valid
         FROM inventory_reservations_demo
         WHERE id = $1`,
        [reservationId],
      );

      if (!validReservation.rows[0].valid) {
        await client.query("ROLLBACK");
        return { outcome: "EXPIRED" };
      }

      // Payment succeeded: physically deduct the reserved stock.
      await client.query(
        `UPDATE inventory_demo
         SET
           on_hand = on_hand - $1,
           reserved = reserved - $1
         WHERE product_id = $2`,
        [reservation.quantity, reservation.product_id],
      );
    } else {
      // Payment failed: release without reducing physical stock.
      await client.query(
        `UPDATE inventory_demo
         SET reserved = reserved - $1
         WHERE product_id = $2`,
        [reservation.quantity, reservation.product_id],
      );
    }

    // Record the final state.
    await client.query(
      `UPDATE inventory_reservations_demo
       SET status = $1
       WHERE id = $2`,
      [action, reservationId],
    );

    await client.query("COMMIT");

    return {
      outcome: "SUCCESS",
      status: action,
      productId: reservation.product_id,
      quantity: reservation.quantity,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
