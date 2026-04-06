import { Router } from "express";
import { body, param } from "express-validator";
import {
  completeUpiPaymentSession,
  createUpiPaymentSession,
  getUpiPaymentSessionStatus,
  handleUpiWebhook,
} from "../controllers/paymentController.js";
import { authenticate, requireRoles } from "../middlewares/authMiddleware.js";
import { validateRequest } from "../middlewares/validateRequest.js";

const router = Router();

router.post("/upi/webhook", handleUpiWebhook);

router.use(authenticate, requireRoles("admin", "cashier"));

router.post(
  "/upi/session",
  [
    body("items").isArray({ min: 1 }).withMessage("items must be a non-empty array"),
    body("items.*.quantity").isFloat({ gt: 0 }).withMessage("item quantity must be greater than zero"),
    body("items.*.productId").optional().isMongoId().withMessage("Invalid productId"),
    body("items.*.barcode")
      .optional()
      .trim()
      .isLength({ min: 3, max: 64 })
      .withMessage("barcode must be 3-64 characters"),
    body("tax").optional().isFloat({ min: 0 }).withMessage("tax must be non-negative"),
    body("discount").optional().isFloat({ min: 0 }).withMessage("discount must be non-negative"),
    body("cashier").optional().trim().isLength({ max: 100 }),
    validateRequest,
  ],
  createUpiPaymentSession
);

router.get(
  "/upi/session/:sessionId/status",
  [param("sessionId").trim().isLength({ min: 8, max: 80 }), validateRequest],
  getUpiPaymentSessionStatus
);

router.post(
  "/upi/session/:sessionId/complete",
  [
    param("sessionId").trim().isLength({ min: 8, max: 80 }),
    body("completionSource").optional().isIn(["auto_poll", "manual_confirm", "webhook"]),
    validateRequest,
  ],
  completeUpiPaymentSession
);

export default router;
