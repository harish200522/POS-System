import { Router } from "express";
import { param } from "express-validator";
import { getPublicInvoiceByShareId } from "../controllers/billingController.js";
import { validateRequest } from "../middlewares/validateRequest.js";

const router = Router();

router.get(
  "/:shareId",
  [
    param("shareId")
      .trim()
      .matches(/^[A-Za-z0-9_-]{24,128}$/)
      .withMessage("Invalid shareId"),
    validateRequest,
  ],
  getPublicInvoiceByShareId
);

export default router;