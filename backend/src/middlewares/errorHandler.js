import { env } from "../config/env.js";

export function notFoundHandler(req, res) {
  return res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
}

export function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;
  let message = err.message || "Internal server error";

  if (err.code === 11000) {
    const duplicateField = Object.keys(err.keyPattern || {})[0] || "value";
    message = `${duplicateField} already exists`;
  }

  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors || {}).map((entry) => entry.message);
    message = messages[0] || message;
  }

  if (env.isProduction && statusCode >= 500) {
    message = "Internal server error";
  }

  const responseBody = {
    success: false,
    message,
  };

  if (err.details) {
    responseBody.details = err.details;
  }

  if (!env.isProduction) {
    responseBody.stack = err.stack;
  }

  return res.status(statusCode).json(responseBody);
}
