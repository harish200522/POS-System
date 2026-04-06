import bcrypt from "bcryptjs";
import User from "../models/User.js";
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

function toSafeUser(userDoc) {
  return {
    id: String(userDoc._id),
    username: userDoc.username,
    displayName: userDoc.displayName,
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

async function createUserInternal({ username, password, role = "cashier", displayName = "" }) {
  const normalizedUsername = normalizeUsername(username);

  if (!normalizedUsername) {
    throw new ApiError(400, "username is required");
  }

  validatePasswordStrength(password);

  const exists = await User.findOne({ username: normalizedUsername });
  if (exists) {
    throw new ApiError(409, "username already exists");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await User.create({
    username: normalizedUsername,
    displayName: String(displayName || "").trim(),
    passwordHash,
    role,
    isActive: true,
  });

  return user;
}

export const bootstrapAdmin = asyncHandler(async (req, res) => {
  const existingCount = await User.countDocuments();
  if (existingCount > 0) {
    throw new ApiError(403, "Bootstrap is disabled after first user creation");
  }

  const { username, password, displayName = "Admin" } = req.body;
  const user = await createUserInternal({
    username,
    password,
    displayName,
    role: "admin",
  });

  const token = signAccessToken(user);

  return res.status(201).json({
    success: true,
    message: "Admin user created successfully",
    data: {
      token,
      user: toSafeUser(user),
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

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    throw new ApiError(401, "Invalid username or password");
  }

  user.lastLoginAt = new Date();
  await user.save();

  const token = signAccessToken(user);

  return res.status(200).json({
    success: true,
    message: "Login successful",
    data: {
      token,
      user: toSafeUser(user),
    },
  });
});

export const getCurrentUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.auth.userId).select(
    "_id username displayName role isActive lastLoginAt createdAt updatedAt"
  );

  if (!user || !user.isActive) {
    throw new ApiError(401, "User is not authorized");
  }

  return res.status(200).json({
    success: true,
    data: toSafeUser(user),
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

  const user = await User.findById(userId);
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

  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  if (!isActive && String(user._id) === String(req.auth.userId)) {
    throw new ApiError(400, "You cannot deactivate your own account");
  }

  if (!isActive && user.role === "admin") {
    const activeAdminCount = await User.countDocuments({
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
  const users = await User.find({}).sort({ createdAt: -1 }).select(
    "_id username displayName role isActive lastLoginAt createdAt updatedAt"
  );

  return res.status(200).json({
    success: true,
    data: users.map(toSafeUser),
  });
});
