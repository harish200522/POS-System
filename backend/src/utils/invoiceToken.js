import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

const INVOICE_TOKEN_ISSUER = "countercraft-pos";
const INVOICE_TOKEN_AUDIENCE = "countercraft-pos-invoice";
const INVOICE_TOKEN_TYPE = "invoice_share";

export function signInvoiceShareToken({ invoiceId, billNumber = "" } = {}) {
  const normalizedInvoiceId = String(invoiceId || "").trim();
  if (!normalizedInvoiceId) {
    throw new Error("invoiceId is required to sign invoice token");
  }

  const token = jwt.sign(
    {
      tokenType: INVOICE_TOKEN_TYPE,
      billNumber: String(billNumber || "").trim(),
    },
    env.invoiceTokenSecret,
    {
      expiresIn: env.invoiceTokenExpiresIn,
      issuer: INVOICE_TOKEN_ISSUER,
      audience: INVOICE_TOKEN_AUDIENCE,
      subject: normalizedInvoiceId,
    }
  );

  const decodedToken = jwt.decode(token);
  const expiresAt = decodedToken?.exp ? new Date(decodedToken.exp * 1000).toISOString() : "";

  return {
    token,
    expiresAt,
  };
}

export function verifyInvoiceShareToken(token) {
  const payload = jwt.verify(String(token || ""), env.invoiceTokenSecret, {
    issuer: INVOICE_TOKEN_ISSUER,
    audience: INVOICE_TOKEN_AUDIENCE,
  });

  if (String(payload?.tokenType || "") !== INVOICE_TOKEN_TYPE) {
    throw new Error("Invalid invoice token type");
  }

  const invoiceId = String(payload?.sub || "").trim();
  if (!invoiceId) {
    throw new Error("Invoice token subject is missing");
  }

  return {
    invoiceId,
    billNumber: String(payload?.billNumber || "").trim(),
    expiresAt: payload?.exp ? new Date(payload.exp * 1000).toISOString() : "",
  };
}
