import { orderService } from "./order.service.js";

export const orderController = {
  // POST /api/v1/orders
  async createOrder(req, res) {
    const order = await orderService.createOrder(req.validated.body);

    res.status(201).json({
      success: true,
      message: "Order placed successfully",
      data: order,
    });
  },
};
