import { Router } from "express";
import { body } from "express-validator";
import { processBilling } from "../controllers/billingController.js";
import { authenticate, requireRoles } from "../middlewares/authMiddleware.js";
import { validateRequest } from "../middlewares/validateRequest.js";

const router = Router();

router.use(authenticate, requireRoles("admin", "cashier"));

router.post(
	"/process",
	[
		body("items").isArray({ min: 1 }).withMessage("items must be a non-empty array"),
		body("items.*.quantity").isFloat({ gt: 0 }).withMessage("item quantity must be greater than zero"),
		body("items.*.productId").optional().isMongoId().withMessage("Invalid productId"),
		body("items.*.barcode")
			.optional()
			.trim()
			.isLength({ min: 3, max: 64 })
			.withMessage("barcode must be 3-64 characters"),
		body("paymentMethod")
			.optional()
			.isIn(["cash", "upi"])
			.withMessage("paymentMethod must be cash or upi"),
		body("tax").optional().isFloat({ min: 0 }).withMessage("tax must be non-negative"),
		body("discount").optional().isFloat({ min: 0 }).withMessage("discount must be non-negative"),
		body("paidAmount").optional().isFloat({ min: 0 }).withMessage("paidAmount must be non-negative"),
		body("cashier").optional().trim().isLength({ max: 100 }),
		body("source").optional().isIn(["online", "offline_sync"]).withMessage("Invalid source"),
		validateRequest,
	],
	processBilling
);

export default router;
