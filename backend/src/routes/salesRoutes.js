import { Router } from "express";
import { query } from "express-validator";
import { getSalesHistory, getSalesSummary } from "../controllers/billingController.js";
import { exportSalesCsv, exportSalesPdf } from "../controllers/exportController.js";
import { authenticate, requireRoles } from "../middlewares/authMiddleware.js";
import { validateRequest } from "../middlewares/validateRequest.js";

const router = Router();

router.use(authenticate);

router.get(
	"/summary",
	requireRoles("admin"),
	[
		query("range").optional().isIn(["daily", "weekly", "monthly", "custom"]),
		query("startDate").optional().isISO8601(),
		query("endDate").optional().isISO8601(),
		query("lowStockThreshold").optional().isInt({ min: 0 }),
		validateRequest,
	],
	getSalesSummary
);

// ── Export routes (must be BEFORE the catch-all "/" route) ──
router.get("/export/csv", requireRoles("admin", "cashier"), exportSalesCsv);
router.get("/export/pdf", requireRoles("admin", "cashier"), exportSalesPdf);

router.get(
	"/",
	requireRoles("admin", "cashier"),
	[
		query("from").optional().isISO8601(),
		query("to").optional().isISO8601(),
		query("paymentMethod").optional().isIn(["cash", "upi"]),
		query("page").optional().isInt({ min: 1 }),
		query("limit").optional().isInt({ min: 1, max: 200 }),
		validateRequest,
	],
	getSalesHistory
);

export default router;
