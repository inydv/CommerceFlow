import { Router } from "express";

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

export default router;
