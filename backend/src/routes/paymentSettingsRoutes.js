import { Router } from "express";
import { body } from "express-validator";
import { getPaymentSettings, upsertPaymentSettings } from "../controllers/paymentController.js";
import { authenticate, requireRoles } from "../middlewares/authMiddleware.js";
import { validateRequest } from "../middlewares/validateRequest.js";

const router = Router();

router.use(authenticate, requireRoles("admin", "cashier"));

router.get("/settings", getPaymentSettings);

router.post(
  "/settings",
  requireRoles("admin"),
  [
    body("upiId").isString().trim().isLength({ min: 3, max: 120 }).withMessage("upiId is required"),
    body("qrImage").optional({ nullable: true }).isString().isLength({ max: 750000 }),
    validateRequest,
  ],
  upsertPaymentSettings
);

export default router;
