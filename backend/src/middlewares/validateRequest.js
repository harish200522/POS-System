import { validationResult } from "express-validator";

export function validateRequest(req, res, next) {
  const result = validationResult(req);

  if (result.isEmpty()) {
    return next();
  }

  const errors = result.array({ onlyFirstError: true }).map((entry) => ({
    field: entry.param,
    message: entry.msg,
  }));

  return res.status(400).json({
    success: false,
    message: "Validation failed",
    details: errors,
  });
}
