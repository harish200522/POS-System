import { Router } from "express";
import { body, param } from "express-validator";
import {
  bootstrapAdmin,
  changePassword,
  createUser,
  getCurrentUser,
  listUsers,
  login,
  logout,
  register,
  resetUserPassword,
  updateUserStatus,
} from "../controllers/authController.js";
import { authenticate, requireRoles } from "../middlewares/authMiddleware.js";
import { validateRequest } from "../middlewares/validateRequest.js";

const router = Router();

const usernameValidator = body("username")
  .trim()
  .isLength({ min: 3, max: 50 })
  .withMessage("username must be 3-50 characters")
  .matches(/^[a-zA-Z0-9._-]+$/)
  .withMessage("username can include letters, numbers, dot, underscore, and hyphen");

const passwordValidator = body("password")
  .isLength({ min: 8, max: 128 })
  .withMessage("password must be 8-128 characters");

const tenantRegistrationValidators = [
  usernameValidator,
  passwordValidator,
  body("displayName").optional().trim().isLength({ max: 120 }),
  body("name").trim().isLength({ min: 2, max: 160 }).withMessage("name must be 2-160 characters"),
  body("ownerName")
    .trim()
    .isLength({ min: 2, max: 160 })
    .withMessage("ownerName must be 2-160 characters"),
  body("phone")
    .trim()
    .customSanitizer(val => val.replace(/\s/g, ''))
    .matches(/^\+?[1-9]\d{7,14}$/)
    .withMessage("phone must be a valid international phone number"),
  body("email").trim().isEmail().withMessage("email must be valid").normalizeEmail(),
  validateRequest,
];

router.post(
  "/bootstrap-admin",
  tenantRegistrationValidators,
  bootstrapAdmin
);

router.post("/register", tenantRegistrationValidators, register);

router.post("/login", [usernameValidator, passwordValidator, validateRequest], login);
router.post("/logout", logout);
router.get("/me", authenticate, getCurrentUser);
router.patch(
  "/change-password",
  authenticate,
  [
    body("currentPassword")
      .isLength({ min: 8, max: 128 })
      .withMessage("currentPassword must be 8-128 characters"),
    body("newPassword")
      .isLength({ min: 8, max: 128 })
      .withMessage("newPassword must be 8-128 characters"),
    validateRequest,
  ],
  changePassword
);

router.get("/users", authenticate, requireRoles("admin"), listUsers);
router.post(
  "/users",
  authenticate,
  requireRoles("admin"),
  [
    usernameValidator,
    passwordValidator,
    body("displayName").optional().trim().isLength({ max: 120 }),
    body("role").optional().isIn(["admin", "cashier"]).withMessage("role must be admin or cashier"),
    validateRequest,
  ],
  createUser
);

router.patch(
  "/users/:id/password",
  authenticate,
  requireRoles("admin"),
  [
    param("id").isMongoId().withMessage("Invalid user id"),
    body("newPassword")
      .isLength({ min: 8, max: 128 })
      .withMessage("newPassword must be 8-128 characters"),
    validateRequest,
  ],
  resetUserPassword
);

router.patch(
  "/users/:id/status",
  authenticate,
  requireRoles("admin"),
  [
    param("id").isMongoId().withMessage("Invalid user id"),
    body("isActive").isBoolean().withMessage("isActive must be true or false").toBoolean(),
    validateRequest,
  ],
  updateUserStatus
);

export default router;
