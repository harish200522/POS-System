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

  return res.status(statusCode).json({
    success: false,
    message,
    details: err.details || null,
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });
}
