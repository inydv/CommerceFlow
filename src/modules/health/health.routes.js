import { Router } from "express";

import { env } from "../../config/env.js";
import { pool } from "../../config/database.js";

const router = Router();

// Check whether the Node.js application is running
router.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "CommerceFlow API is running",

    data: {
      // Current application status
      status: "UP",

      // Current server time
      timestamp: new Date().toISOString(),

      // Time in seconds since the Node.js process started
      uptime: process.uptime(),
    },
  });
});

// Development-only endpoint for inspecting pool usage.
// Do not expose internal database metrics publicly.
if (env.NODE_ENV === "development") {
  router.get("/db-pool", (req, res) => {
    res.status(200).json({
      success: true,
      data: {
        maxConnections: pool.options.max,

        // Total connections created in this Node.js pool.
        totalConnections: pool.totalCount,

        // Connections currently available for reuse.
        idleConnections: pool.idleCount,

        // Connections currently borrowed by application code.
        borrowedConnections: pool.totalCount - pool.idleCount,

        // Requests waiting to borrow a connection.
        waitingRequests: pool.waitingCount,
      },
    });
  });
}

export default router;
