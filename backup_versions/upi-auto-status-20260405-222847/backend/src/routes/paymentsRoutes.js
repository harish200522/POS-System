import { Router } from "express";
import {
  completeUpiPaymentSession,
  createUpiPaymentSession,
  getUpiPaymentSessionStatus,
  handleUpiWebhook,
} from "../controllers/paymentController.js";

const router = Router();

router.post("/upi/session", createUpiPaymentSession);
router.get("/upi/session/:sessionId/status", getUpiPaymentSessionStatus);
router.post("/upi/session/:sessionId/complete", completeUpiPaymentSession);
router.post("/upi/webhook", handleUpiWebhook);

export default router;
