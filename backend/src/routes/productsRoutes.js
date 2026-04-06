import { Router } from "express";
import { body, param, query } from "express-validator";
import {
  addProduct,
  deleteProduct,
  getProductByBarcode,
  getProducts,
  updateProduct,
  updateStock,
} from "../controllers/productController.js";
import { authenticate, requireRoles } from "../middlewares/authMiddleware.js";
import { validateRequest } from "../middlewares/validateRequest.js";

const router = Router();

const productPayloadValidators = [
  body("name").optional().trim().isLength({ min: 1, max: 120 }).withMessage("name is required"),
  body("barcode")
    .optional()
    .isString()
    .withMessage("barcode must be a string")
    .trim()
    .isLength({ min: 3, max: 64 })
    .withMessage("barcode must be 3-64 characters"),
  body("category").optional().trim().isLength({ max: 100 }),
  body("price").optional().isFloat({ min: 0 }).withMessage("price must be non-negative"),
  body("stock").optional().isFloat({ min: 0 }).withMessage("stock must be non-negative"),
];

router.use(authenticate);

router.get(
  "/",
  [
    query("page").optional().isInt({ min: 1 }),
    query("limit").optional().isInt({ min: 1, max: 500 }),
    query("threshold").optional().isInt({ min: 0 }),
    query("search").optional().isString().isLength({ max: 120 }),
    validateRequest,
  ],
  getProducts
);

router.get(
  "/barcode/:barcode",
  [param("barcode").trim().isLength({ min: 3, max: 64 }), validateRequest],
  getProductByBarcode
);

router.post("/", requireRoles("admin"), [...productPayloadValidators, validateRequest], addProduct);

router.put(
  "/:id",
  requireRoles("admin"),
  [param("id").isMongoId().withMessage("Invalid product id"), ...productPayloadValidators, validateRequest],
  updateProduct
);

router.patch(
  "/:id/stock",
  requireRoles("admin"),
  [
    param("id").isMongoId().withMessage("Invalid product id"),
    body("mode").optional().isIn(["add", "deduct", "set"]).withMessage("Invalid stock mode"),
    body("quantity").exists().isFloat({ min: 0 }).withMessage("quantity must be non-negative"),
    body("referenceType")
      .optional()
      .isIn(["manual", "restock", "adjustment", "sale"])
      .withMessage("Invalid reference type"),
    body("note").optional().isString().isLength({ max: 240 }),
    validateRequest,
  ],
  updateStock
);

router.delete(
  "/:id",
  requireRoles("admin"),
  [param("id").isMongoId().withMessage("Invalid product id"), validateRequest],
  deleteProduct
);

export default router;
