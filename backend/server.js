const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/paw-moods";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "pawmoods123";
const CODE_PATTERN = /^PM26-[A-Z0-9]{4}-[WT]\d{4}$/;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const FRONTEND_DIR = path.join(__dirname, "../frontend");
const ADMIN_TOKEN_TTL_MS = 8 * 60 * 60 * 1000;
const ADMIN_RESET_KEY = process.env.ADMIN_RESET_KEY || "pawmoods-reset";

const adminTokens = new Map();

app.use(cors());
app.use(express.json());
app.use(express.static(FRONTEND_DIR));

const codeSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    type: { type: String, enum: ["W", "T"], required: true },
    purchaseDate: { type: Date, required: true },
    isUsed: { type: Boolean, default: false },
    customerName: { type: String, required: true, trim: true },
    customerPhone: { type: String, required: true, trim: true },
    orderId: { type: String, required: true, unique: true, trim: true },
    productType: { type: String, default: "Sticker", trim: true },
    orderValue: { type: Number, default: 0 },
    isExpired: { type: Boolean, default: false },
  },
  { timestamps: true },
);

const RewardCode = mongoose.model("RewardCode", codeSchema);
const adminSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true },
);
const AdminCredential = mongoose.model("AdminCredential", adminSchema);

// Setting Schema
const settingsSchema = new mongoose.Schema({
  general: {
    businessName: { type: String, default: "Paw & Moods" },
    contactPhone: { type: String, default: "" },
    whatsappNumber: { type: String, default: "" },
    currency: { type: String, default: "Rs" },
    timezone: { type: String, default: "Asia/Colombo" }
  },
  rewards: {
    defaultWinnerReward: { type: Number, default: 5 },
    defaultDiscount: { type: Number, default: 10 },
    expiryDays: { type: Number, default: 30 },
    minOrderValue: { type: Number, default: 2000 },
    winnerEnabled: { type: Boolean, default: true },
    tryEnabled: { type: Boolean, default: true }
  },
  whatsapp: {
    winnerTemplate: { type: String, default: "Hi Paw & Moods 💜 I want to claim my reward. Code: {code}" },
    tryTemplate: { type: String, default: "Hi Paw & Moods 💜 Better luck next time. Code: {code}" }
  },
  preferences: {
    darkMode: { type: Boolean, default: false },
    enableAnimations: { type: Boolean, default: true },
    defaultTab: { type: String, default: "dashboard" }
  }
}, { timestamps: true });
const AppSettings = mongoose.model("AppSettings", settingsSchema);

async function getSettings() {
  let settings = await AppSettings.findOne();
  if (!settings) {
    settings = await AppSettings.create({});
  } else {
    // Migration: fix corrupted template strings if saved manually before encoding fixes
    let dirty = false;
    if (settings.whatsapp.winnerTemplate && settings.whatsapp.winnerTemplate.includes("\uFFFD")) {
      settings.whatsapp.winnerTemplate = "";
      dirty = true;
    }
    if (settings.whatsapp.tryTemplate && settings.whatsapp.tryTemplate.includes("\uFFFD")) {
      settings.whatsapp.tryTemplate = "";
      dirty = true;
    }
    // Also clear the basic single-line defaults so the new multi-line frontend templates take over
    if (settings.whatsapp.winnerTemplate === "Hi Paw & Moods 💜 I want to claim my reward. Code: {code}") {
      settings.whatsapp.winnerTemplate = "";
      dirty = true;
    }
    if (settings.whatsapp.tryTemplate === "Hi Paw & Moods 💜 Better luck next time. Code: {code}") {
      settings.whatsapp.tryTemplate = "";
      dirty = true;
    }
    
    if (dirty) {
      await settings.save();
    }
  }
  return settings;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const digest = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${digest}`;
}

function verifyPassword(password, storedHash) {
  const [salt, digest] = String(storedHash || "").split(":");
  if (!salt || !digest) return false;
  const attempt = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(
    Buffer.from(digest, "hex"),
    Buffer.from(attempt, "hex"),
  );
}

function matchesStoredPassword(password, storedValue) {
  const normalized = String(password || "").trim();
  const stored = String(storedValue || "");
  if (!stored) return false;

  // New format: scrypt salt:digest
  if (stored.includes(":")) {
    return verifyPassword(normalized, stored);
  }

  // Legacy fallback: plain text value in DB (migration-safe guard)
  return stored === normalized;
}

function cleanCode(raw = "") {
  return raw.trim().toUpperCase();
}

function getCodeType(code) {
  return code.includes("-W") ? "W" : code.includes("-T") ? "T" : null;
}

function isExpired(purchaseDate, expiryDays = 30) {
  const durationMs = expiryDays * 24 * 60 * 60 * 1000;
  return Date.now() - new Date(purchaseDate).getTime() > durationMs;
}

function formatOrderDateParts(dateInput) {
  const date = new Date(dateInput);
  const year = String(date.getFullYear()).slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return { year, month, day };
}

function getDayRange(dateInput) {
  const date = new Date(dateInput);
  const start = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    0,
    0,
    0,
    0,
  );
  const end = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    23,
    59,
    59,
    999,
  );
  return { start, end };
}

async function generateSequentialOrderId(purchaseDate) {
  const { year, month, day } = formatOrderDateParts(purchaseDate);
  const { start, end } = getDayRange(purchaseDate);
  const prefix = `PM${year}${month}${day}`;
  const todayCount = await RewardCode.countDocuments({
    purchaseDate: { $gte: start, $lte: end },
  });
  const sequence = String(todayCount + 1).padStart(2, "0");
  return `${prefix}${sequence}`;
}

function withDerivedFlags(entry, expiryDays = 30) {
  const plain = entry.toObject ? entry.toObject() : entry;
  return {
    ...plain,
    isExpired: isExpired(plain.purchaseDate, expiryDays),
  };
}

function verifyAdmin(req, res, next) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return res
      .status(403)
      .json({ message: "Unauthorized: Please login first" });
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    return res.status(403).json({ message: "Unauthorized: Invalid token" });
  }

  const expiresAt = adminTokens.get(token);
  if (!expiresAt) {
    return res.status(403).json({ message: "Unauthorized: Invalid token" });
  }

  if (Date.now() > expiresAt) {
    adminTokens.delete(token);
    return res.status(403).json({ message: "Unauthorized: Expired session" });
  }

  return next();
}

app.post("/admin/login", async (req, res) => {
  const { password } = req.body || {};
  if (!password) {
    return res.status(400).json({ message: "Password is required" });
  }

  const admin = await AdminCredential.findOne({ username: "admin" });
  if (!admin || !matchesStoredPassword(password, admin.passwordHash)) {
    return res.status(401).json({ message: "Invalid password" });
  }

  const token = crypto.randomBytes(24).toString("hex");
  adminTokens.set(token, Date.now() + ADMIN_TOKEN_TTL_MS);
  return res.json({ token });
});

app.post("/admin/change-password", verifyAdmin, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current and new passwords are required" });
    }
    const admin = await AdminCredential.findOne({ username: "admin" });
    if (!admin || !matchesStoredPassword(currentPassword, admin.passwordHash)) {
      return res.status(401).json({ message: "Incorrect current password" });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }
    admin.passwordHash = hashPassword(newPassword);
    await admin.save();
    return res.json({ message: "Password updated successfully" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to change password" });
  }
});

app.post("/admin/forgot-password", async (req, res) => {
  try {
    const { resetKey, newPassword } = req.body || {};
    const normalizedNewPassword = String(newPassword || "").trim();
    if (!resetKey || !normalizedNewPassword) {
      return res
        .status(400)
        .json({ message: "Reset key and new password are required" });
    }
    if (resetKey !== ADMIN_RESET_KEY) {
      return res.status(403).json({ message: "Invalid reset key" });
    }
    if (normalizedNewPassword.length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters" });
    }

    const existingAdmin = await AdminCredential.findOne({ username: "admin" });
    if (
      existingAdmin &&
      matchesStoredPassword(normalizedNewPassword, existingAdmin.passwordHash)
    ) {
      return res.status(409).json({
        message:
          "This is your current password. Please choose a different one.",
      });
    }

    await AdminCredential.findOneAndUpdate(
      { username: "admin" },
      { passwordHash: hashPassword(normalizedNewPassword) },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    adminTokens.clear();
    return res.json({
      message: "Password reset successful. Please login again.",
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to reset password" });
  }
});

app.post("/admin/verify-reset-key", (req, res) => {
  const { resetKey } = req.body || {};
  if (!resetKey) {
    return res.status(400).json({ message: "Reset key is required" });
  }
  if (resetKey !== ADMIN_RESET_KEY) {
    return res.status(403).json({ message: "Invalid reset key" });
  }
  return res.json({ message: "Reset key verified" });
});

app.post("/add-code", verifyAdmin, async (req, res) => {
  try {
    const code = cleanCode(req.body?.code);
    const purchaseDate = req.body?.purchaseDate;
    const isUsed = Boolean(req.body?.isUsed);
    const customerName = (req.body?.customerName || "").trim();
    const customerPhone = (req.body?.customerPhone || "").trim();
    const productType = (req.body?.productType || "Sticker").trim();
    const orderValue = Number(req.body?.orderValue || 0);

    if (!CODE_PATTERN.test(code)) {
      return res.status(400).json({ message: "Invalid code format" });
    }

    const type = getCodeType(code);
    if (!type) {
      return res.status(400).json({ message: "Code must include -W or -T" });
    }

    const parsedDate = new Date(purchaseDate);
    if (Number.isNaN(parsedDate.getTime())) {
      return res.status(400).json({ message: "Invalid purchase date" });
    }

    if (!customerName || !customerPhone) {
      return res
        .status(400)
        .json({ message: "Customer name and phone are required" });
    }

    const settings = await getSettings();
    const expiryDays = settings.rewards.expiryDays || 30;

    let createdRecord = null;
    let attempts = 0;
    while (!createdRecord && attempts < 5) {
      attempts += 1;
      const orderId = await generateSequentialOrderId(parsedDate);
      try {
        createdRecord = await RewardCode.create({
          code,
          type,
          purchaseDate: parsedDate,
          isUsed,
          customerName,
          customerPhone,
          orderId,
          productType,
          orderValue: Number.isNaN(orderValue) ? 0 : orderValue,
          isExpired: isExpired(parsedDate, expiryDays),
        });
      } catch (createError) {
        if (
          createError.code === 11000 &&
          createError.message.includes("orderId")
        ) {
          continue;
        }
        throw createError;
      }
    }

    if (!createdRecord) {
      return res
        .status(500)
        .json({ message: "Failed to generate unique order ID" });
    }

    return res.status(201).json({
      message: "Code added successfully",
      orderId: createdRecord.orderId,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Code already exists" });
    }
    return res.status(500).json({ message: "Failed to add code" });
  }
});

app.get("/codes", verifyAdmin, async (req, res) => {
  try {
    const settings = await getSettings();
    const expiryDays = settings.rewards.expiryDays || 30;
    const codes = await RewardCode.find().sort({ createdAt: -1 });
    const hydrated = codes.map(c => withDerivedFlags(c, expiryDays));
    return res.json({ codes: hydrated });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch codes" });
  }
});

app.delete("/codes/:code", verifyAdmin, async (req, res) => {
  try {
    const code = cleanCode(req.params.code);
    await RewardCode.deleteOne({ code });
    return res.json({ message: "Code deleted" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete code" });
  }
});

app.put("/codes/:code", verifyAdmin, async (req, res) => {
  try {
    const code = cleanCode(req.params.code);
    const customerName = (req.body?.customerName || "").trim();
    const customerPhone = (req.body?.customerPhone || "").trim();
    const orderId = (req.body?.orderId || "").trim();
    const productType = (req.body?.productType || "Sticker").trim();
    const orderValue = Number(req.body?.orderValue || 0);
    const purchaseDate = req.body?.purchaseDate;
    const isUsed =
      req.body?.isUsed !== undefined ? Boolean(req.body.isUsed) : false;

    if (!customerName || !customerPhone || !orderId) {
      return res
        .status(400)
        .json({ message: "Customer name, phone and order ID are required" });
    }

    const parsedDate = new Date(purchaseDate);
    if (Number.isNaN(parsedDate.getTime())) {
      return res.status(400).json({ message: "Invalid purchase date" });
    }

    const settings = await getSettings();
    const expiryDays = settings.rewards.expiryDays || 30;
    const updated = await RewardCode.findOneAndUpdate(
      { code },
      {
        customerName,
        customerPhone,
        orderId,
        productType,
        orderValue: Number.isNaN(orderValue) ? 0 : orderValue,
        purchaseDate: parsedDate,
        isUsed,
        isExpired: isExpired(parsedDate, expiryDays),
      },
      { new: true },
    );

    if (!updated) {
      return res.status(404).json({ message: "Code not found" });
    }

    return res.json({
      message: "Code updated successfully",
      code: withDerivedFlags(updated, expiryDays),
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update code" });
  }
});

app.get("/validate-code/:code", async (req, res) => {
  try {
    const code = cleanCode(req.params.code);
    if (
      !code.startsWith("PM") ||
      !code.includes("26") ||
      !CODE_PATTERN.test(code)
    ) {
      return res.status(400).json({
        status: "invalid",
        valid: false,
        reason: "INVALID_FORMAT",
      });
    }

    const entry = await RewardCode.findOne({ code });
    if (!entry) {
      return res.status(404).json({
        status: "invalid",
        valid: false,
        reason: "NOT_FOUND",
      });
    }

    if (entry.isUsed) {
      return res.status(409).json({
        status: "used",
        valid: false,
        reason: "USED",
      });
    }

    const settings = await getSettings();
    const expiryDays = settings.rewards.expiryDays || 30;

    if (entry.type === "W" && settings.rewards.winnerEnabled === false) {
      return res.status(403).json({
        status: "invalid",
        valid: false,
        reason: "REWARD_DISABLED",
      });
    }

    if (entry.type === "T" && settings.rewards.tryEnabled === false) {
      return res.status(403).json({
        status: "invalid",
        valid: false,
        reason: "REWARD_DISABLED",
      });
    }

    if (isExpired(entry.purchaseDate, expiryDays)) {
      return res.status(410).json({
        status: "expired",
        valid: false,
        reason: "EXPIRED",
      });
    }

    return res.json({
      status: "valid",
      valid: true,
      type: entry.type,
    });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      valid: false,
      reason: "SERVER_ERROR",
    });
  }
});

app.post("/mark-used", verifyAdmin, async (req, res) => {
  try {
    const code = cleanCode(req.body?.code);
    const isUsed =
      req.body?.isUsed !== undefined ? Boolean(req.body.isUsed) : true;

    const updated = await RewardCode.findOneAndUpdate(
      { code },
      { isUsed },
      { new: true },
    );

    if (!updated) {
      return res.status(404).json({ message: "Code not found" });
    }

    return res.json({
      message: "Code status updated",
      code: updated.code,
      isUsed,
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update status" });
  }
});

app.post("/claim-code", async (req, res) => {
  try {
    const code = cleanCode(req.body?.code);
    if (!code || !CODE_PATTERN.test(code)) {
      return res
        .status(400)
        .json({ status: "invalid", message: "Invalid code format" });
    }

    const entry = await RewardCode.findOne({ code });
    if (!entry) {
      return res
        .status(404)
        .json({ status: "invalid", message: "Code not found" });
    }

    if (entry.isUsed) {
      return res
        .status(409)
        .json({ status: "used", message: "Code already claimed" });
    }

    const settings = await getSettings();
    const expiryDays = settings.rewards.expiryDays || 30;

    if (isExpired(entry.purchaseDate, expiryDays)) {
      return res
        .status(410)
        .json({ status: "expired", message: "Code expired" });
    }

    entry.isUsed = true;
    await entry.save();
    return res.json({
      status: "claimed",
      message: "Reward claimed successfully",
      type: entry.type,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ status: "error", message: "Failed to claim code" });
  }
});

// Settings API GET
app.get("/settings", verifyAdmin, async (req, res) => {
  try {
    const settings = await getSettings();
    return res.json(settings);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch settings" });
  }
});

app.get("/api/public-settings", async (req, res) => {
  try {
    const settings = await getSettings();
    return res.json({
      whatsappNumber: settings.whatsapp.whatsappNumber || settings.general.whatsappNumber || settings.general.contactPhone,
      winnerTemplate: settings.whatsapp.winnerTemplate,
      tryTemplate: settings.whatsapp.tryTemplate,
      defaultDiscount: settings.rewards.defaultDiscount,
      defaultWinnerReward: settings.rewards.defaultWinnerReward,
      minOrderValue: settings.rewards.minOrderValue,
      currency: settings.general.currency,
      winnerEnabled: settings.rewards.winnerEnabled,
      tryEnabled: settings.rewards.tryEnabled,
      expiryDays: settings.rewards.expiryDays
    });
  } catch(error) {
    return res.status(500).json({ message: "Failed to fetch public settings" });
  }
});

// Settings API PUT
app.put("/settings", verifyAdmin, async (req, res) => {
  try {
    const payload = req.body || {};
    const settings = await getSettings();
    
    if (payload.general) settings.general = { ...settings.general, ...payload.general };
    if (payload.rewards) settings.rewards = { ...settings.rewards, ...payload.rewards };
    if (payload.whatsapp) settings.whatsapp = { ...settings.whatsapp, ...payload.whatsapp };
    if (payload.preferences) settings.preferences = { ...settings.preferences, ...payload.preferences };
    
    await settings.save();
    return res.json({ message: "Settings updated successfully", settings });
  } catch (error) {
    return res.status(500).json({ message: "Failed to save settings" });
  }
});

// Explicit frontend routes so users do not get 404 on direct navigation.
app.get("/", (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

app.get("/winner", (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "winner.html"));
});

app.get("/try", (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "try.html"));
});

app.get("/admin", (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "admin.html"));
});

app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "dashboard.html"));
});

// Fallback for any non-API route to keep SPA-like navigation working.
app.get(
  /^\/(?!api|validate-code|add-code|mark-used|codes|settings|admin).*/,
  (req, res) => {
    res.sendFile(path.join(FRONTEND_DIR, "index.html"));
  },
);

mongoose
  .connect(MONGODB_URI)
  .then(async () => {
    const existingAdmin = await AdminCredential.findOne({ username: "admin" });
    if (!existingAdmin) {
      await AdminCredential.create({
        username: "admin",
        passwordHash: hashPassword(ADMIN_PASSWORD),
      });
    }
    app.listen(PORT, () => {
      console.log(`Paw & Moods server running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  });
