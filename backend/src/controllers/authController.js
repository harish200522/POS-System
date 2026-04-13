import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import Shop from "../models/Shop.js";
import User from "../models/User.js";
import { clearAccessTokenCookie, setAccessTokenCookie } from "../utils/authCookie.js";
import { ApiError, asyncHandler } from "../utils/errors.js";
import { signAccessToken } from "../utils/jwt.js";

const PASSWORD_MIN_LENGTH = 8;

function validatePasswordStrength(password) {
  const value = String(password || "");

  if (value.length < PASSWORD_MIN_LENGTH || value.length > 128) {
    throw new ApiError(400, `password must be ${PASSWORD_MIN_LENGTH}-128 characters`);
  }

  if (!/[a-zA-Z]/.test(value) || !/\d/.test(value)) {
    throw new ApiError(400, "password must include at least one letter and one number");
  }
}

function toSafeShop(shopDoc) {
  return {
    id: String(shopDoc._id),
    name: shopDoc.name,
    ownerName: shopDoc.ownerName,
    phone: shopDoc.phone,
    email: shopDoc.email,
    createdAt: shopDoc.createdAt,
    updatedAt: shopDoc.updatedAt,
  };
}

function toSafeUser(userDoc) {
  return {
    id: String(userDoc._id),
    username: userDoc.username,
    displayName: userDoc.displayName,
    shopId: String(userDoc.shopId || ""),
    role: userDoc.role,
    isActive: userDoc.isActive,
    lastLoginAt: userDoc.lastLoginAt,
    createdAt: userDoc.createdAt,
    updatedAt: userDoc.updatedAt,
  };
}

function normalizeUsername(username) {
  return String(username || "").trim().toLowerCase();
}

function normalizePhone(value) {
  return String(value ?? "")
    .trim()
    .replace(/[^\d+]/g, "");
}

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

function resolveAuthenticatedShopId(req) {
  const shopId = String(req?.shopId || req?.auth?.shopId || "").trim();
  if (!shopId) {
    throw new ApiError(401, "Authenticated user is not linked to a shop");
  }

  return shopId;
}

async function createShopInternal({ name, ownerName, phone, email }) {
  const normalizedName = String(name || "").trim();
  const normalizedOwnerName = String(ownerName || "").trim();
  const normalizedPhone = normalizePhone(phone);
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedName || !normalizedOwnerName || !normalizedPhone || !normalizedEmail) {
    throw new ApiError(400, "name, ownerName, phone, and email are required");
  }

  const existingShop = await Shop.findOne({
    $or: [{ phone: normalizedPhone }, { email: normalizedEmail }],
  }).select("phone email");

  if (existingShop) {
    if (existingShop.phone === normalizedPhone) {
      throw new ApiError(409, "phone already exists");
    }

    throw new ApiError(409, "email already exists");
  }

  return Shop.create({
    name: normalizedName,
    ownerName: normalizedOwnerName,
    phone: normalizedPhone,
    email: normalizedEmail,
  });
}

async function createUserInternal({
  username,
  password,
  role = "cashier",
  displayName = "",
  shopId,
}) {
  const normalizedUsername = normalizeUsername(username);

  if (!normalizedUsername) {
    throw new ApiError(400, "username is required");
  }

  if (!shopId || !mongoose.Types.ObjectId.isValid(String(shopId))) {
    throw new ApiError(400, "A valid shopId is required");
  }

  validatePasswordStrength(password);

  const exists = await User.findOne({ username: normalizedUsername }).select("_id");
  if (exists) {
    throw new ApiError(409, "username already exists");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await User.create({
    username: normalizedUsername,
    displayName: String(displayName || "").trim(),
    shopId,
    passwordHash,
    role,
    isActive: true,
  });

  return user;
}

async function registerTenantAdmin({ username, password, displayName = "", name, ownerName, phone, email }) {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) {
    throw new ApiError(400, "username is required");
  }

  const existingUser = await User.findOne({ username: normalizedUsername }).select("_id");
  if (existingUser) {
    throw new ApiError(409, "username already exists");
  }

  const shop = await createShopInternal({
    name,
    ownerName,
    phone,
    email,
  });

  try {
    const user = await createUserInternal({
      username: normalizedUsername,
      password,
      displayName: String(displayName || normalizedUsername).trim(),
      role: "admin",
      shopId: shop._id,
    });

    return { user, shop };
  } catch (error) {
    if (error?.statusCode === 409 && /username/i.test(String(error.message || ""))) {
      await Shop.findByIdAndDelete(shop._id).catch(() => {});
    }

    throw error;
  }
}

export const register = asyncHandler(async (req, res) => {
  const { username, password, displayName = "", name, ownerName, phone, email } = req.body;

  const { user, shop } = await registerTenantAdmin({
    username,
    password,
    displayName,
    name,
    ownerName,
    phone,
    email,
  });

  const token = signAccessToken(user);
  setAccessTokenCookie(res, token);

  return res.status(201).json({
    success: true,
    message: "Registration successful",
    data: {
      user: toSafeUser(user),
      shop: toSafeShop(shop),
    },
  });
});

export const bootstrapAdmin = asyncHandler(async (req, res) => {
  const { username, password, displayName = "Admin", name, ownerName, phone, email } = req.body;

  const { user, shop } = await registerTenantAdmin({
    username,
    password,
    displayName,
    name,
    ownerName,
    phone,
    email,
  });

  const token = signAccessToken(user);
  setAccessTokenCookie(res, token);

  return res.status(201).json({
    success: true,
    message: "Admin user created successfully",
    data: {
      user: toSafeUser(user),
      shop: toSafeShop(shop),
    },
  });
});

export const login = asyncHandler(async (req, res) => {
  const username = normalizeUsername(req.body.username);
  const password = String(req.body.password || "");

  const user = await User.findOne({ username });
  if (!user || !user.isActive) {
    throw new ApiError(401, "Invalid username or password");
  }

  if (!user.shopId) {
    throw new ApiError(401, "User is not linked to a shop");
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    throw new ApiError(401, "Invalid username or password");
  }

  user.lastLoginAt = new Date();
  await user.save();

  const shop = await Shop.findById(user.shopId);

  const token = signAccessToken(user);
  setAccessTokenCookie(res, token);

  return res.status(200).json({
    success: true,
    message: "Login successful",
    data: {
      user: toSafeUser(user),
      shop: shop ? toSafeShop(shop) : null,
    },
  });
});

export const logout = asyncHandler(async (_req, res) => {
  clearAccessTokenCookie(res);

  return res.status(200).json({
    success: true,
    message: "Logged out successfully",
  });
});

export const getCurrentUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.auth.userId).select(
    "_id username displayName shopId role isActive lastLoginAt createdAt updatedAt"
  );

  if (!user || !user.isActive) {
    throw new ApiError(401, "User is not authorized");
  }

  const shop = await Shop.findById(user.shopId);

  return res.status(200).json({
    success: true,
    data: {
      user: toSafeUser(user),
      shop: shop ? toSafeShop(shop) : null,
    },
  });
});

export const createUser = asyncHandler(async (req, res) => {
  const { username, password, role = "cashier", displayName = "" } = req.body;

  const normalizedRole = String(role || "").toLowerCase();
  if (!["admin", "cashier"].includes(normalizedRole)) {
    throw new ApiError(400, "role must be admin or cashier");
  }

  const user = await createUserInternal({
    username,
    password,
    role: normalizedRole,
    displayName,
    shopId: resolveAuthenticatedShopId(req),
  });

  return res.status(201).json({
    success: true,
    message: "User created successfully",
    data: toSafeUser(user),
  });
});

export const changePassword = asyncHandler(async (req, res) => {
  const user = await User.findById(req.auth.userId);
  if (!user || !user.isActive) {
    throw new ApiError(401, "User is not authorized");
  }

  const currentPassword = String(req.body.currentPassword || "");
  const newPassword = String(req.body.newPassword || "");

  validatePasswordStrength(newPassword);

  const isCurrentValid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isCurrentValid) {
    throw new ApiError(401, "Current password is incorrect");
  }

  const isSameAsOld = await bcrypt.compare(newPassword, user.passwordHash);
  if (isSameAsOld) {
    throw new ApiError(400, "New password must be different from current password");
  }

  user.passwordHash = await bcrypt.hash(newPassword, 12);
  await user.save();

  return res.status(200).json({
    success: true,
    message: "Password changed successfully",
  });
});

export const resetUserPassword = asyncHandler(async (req, res) => {
  const userId = String(req.params.id || "").trim();
  const newPassword = String(req.body.newPassword || "");

  validatePasswordStrength(newPassword);

  const user = await User.findOne({
    _id: userId,
    shopId: resolveAuthenticatedShopId(req),
  });
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  const isSameAsOld = await bcrypt.compare(newPassword, user.passwordHash);
  if (isSameAsOld) {
    throw new ApiError(400, "New password must be different from current password");
  }

  user.passwordHash = await bcrypt.hash(newPassword, 12);
  await user.save();

  return res.status(200).json({
    success: true,
    message: "User password updated successfully",
    data: toSafeUser(user),
  });
});

export const updateUserStatus = asyncHandler(async (req, res) => {
  const userId = String(req.params.id || "").trim();
  const isActive = req.body.isActive;

  const shopId = resolveAuthenticatedShopId(req);
  const user = await User.findOne({ _id: userId, shopId });
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  if (!isActive && String(user._id) === String(req.auth.userId)) {
    throw new ApiError(400, "You cannot deactivate your own account");
  }

  if (!isActive && user.role === "admin") {
    const activeAdminCount = await User.countDocuments({
      shopId,
      role: "admin",
      isActive: true,
      _id: { $ne: user._id },
    });

    if (activeAdminCount < 1) {
      throw new ApiError(400, "At least one active admin account is required");
    }
  }

  user.isActive = isActive;
  await user.save();

  return res.status(200).json({
    success: true,
    message: isActive ? "User activated successfully" : "User deactivated successfully",
    data: toSafeUser(user),
  });
});

export const listUsers = asyncHandler(async (req, res) => {
  const users = await User.find({ shopId: resolveAuthenticatedShopId(req) })
    .sort({ createdAt: -1 })
    .select("_id username displayName shopId role isActive lastLoginAt createdAt updatedAt");

  return res.status(200).json({
    success: true,
    data: users.map(toSafeUser),
  });
});
