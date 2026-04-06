import { Router } from "express";
import { query } from "express-validator";
import {
  getInventoryLogs,
  getInventoryOverview,
  getLowStockProducts,
} from "../controllers/inventoryController.js";
import { authenticate, requireRoles } from "../middlewares/authMiddleware.js";
import { validateRequest } from "../middlewares/validateRequest.js";

const router = Router();

router.use(authenticate);

router.get(
  "/logs",
  requireRoles("admin"),
  [
    query("productId").optional().isMongoId(),
    query("type").optional().isIn(["add", "deduct", "set", "sale"]),
    query("page").optional().isInt({ min: 1 }),
    query("limit").optional().isInt({ min: 1, max: 300 }),
    validateRequest,
  ],
  getInventoryLogs
);

router.get(
  "/low-stock",
  requireRoles("admin", "cashier"),
  [query("threshold").optional().isInt({ min: 0 }), validateRequest],
  getLowStockProducts
);

router.get(
  "/overview",
  requireRoles("admin"),
  [query("threshold").optional().isInt({ min: 0 }), validateRequest],
  getInventoryOverview
);

export default router;
