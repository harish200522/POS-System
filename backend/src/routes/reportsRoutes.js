import { Router } from "express";
import { query } from "express-validator";
import { getSalesReport, getTransactionsReport } from "../controllers/reportsController.js";
import { exportReportsCsv, exportReportsPdf } from "../controllers/exportController.js";
import { authenticate, requireRoles } from "../middlewares/authMiddleware.js";
import { validateRequest } from "../middlewares/validateRequest.js";

const router = Router();

router.use(authenticate, requireRoles("admin"));

const reportValidation = [
  query("startDate").optional().isISO8601(),
  query("endDate").optional().isISO8601(),
  query("paymentMethod").optional().isIn(["cash", "upi"]),
  query("limit").optional().isInt({ min: 1, max: 1000 }),
  validateRequest,
];

router.get("/sales", reportValidation, getSalesReport);
router.get("/transactions", reportValidation, getTransactionsReport);

// ── Export routes ────────────────────────────────────────
router.get("/export/csv", exportReportsCsv);
router.get("/export/pdf", exportReportsPdf);

export default router;
