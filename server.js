require("dotenv").config();
const path = require("path");
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

const adminTokens = new Map();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const codeSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    type: { type: String, enum: ["W", "T"], required: true },
    purchaseDate: { type: Date, required: true },
    isUsed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const RewardCode = mongoose.model("RewardCode", codeSchema);

function cleanCode(raw = "") {
  return raw.trim().toUpperCase();
}

function getCodeType(code) {
  return code.includes("-W") ? "W" : code.includes("-T") ? "T" : null;
}

function isExpired(purchaseDate) {
  return Date.now() - new Date(purchaseDate).getTime() > THIRTY_DAYS_MS;
}

function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "");
  const expiresAt = adminTokens.get(token);
  if (!expiresAt || Date.now() > expiresAt) {
    return res.status(401).json({ message: "Unauthorized admin access" });
  }
  return next();
}

app.post("/admin/login", (req, res) => {
  const { password } = req.body || {};
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ message: "Invalid password" });
  }

  const token = crypto.randomBytes(24).toString("hex");
  adminTokens.set(token, Date.now() + 8 * 60 * 60 * 1000);
  return res.json({ token });
});

app.post("/add-code", requireAdmin, async (req, res) => {
  try {
    const code = cleanCode(req.body?.code);
    const purchaseDate = req.body?.purchaseDate;
    const isUsed = Boolean(req.body?.isUsed);

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

    await RewardCode.create({
      code,
      type,
      purchaseDate: parsedDate,
      isUsed,
    });

    return res.status(201).json({ message: "Code added successfully" });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Code already exists" });
    }
    return res.status(500).json({ message: "Failed to add code" });
  }
});

app.get("/codes", requireAdmin, async (req, res) => {
  try {
    const codes = await RewardCode.find().sort({ createdAt: -1 });
    return res.json({ codes });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch codes" });
  }
});

app.delete("/codes/:code", requireAdmin, async (req, res) => {
  try {
    const code = cleanCode(req.params.code);
    await RewardCode.deleteOne({ code });
    return res.json({ message: "Code deleted" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete code" });
  }
});

app.get("/validate-code/:code", async (req, res) => {
  try {
    const code = cleanCode(req.params.code);
    if (!code.startsWith("PM") || !code.includes("26") || !CODE_PATTERN.test(code)) {
      return res.status(400).json({ valid: false, reason: "INVALID_FORMAT" });
    }

    const entry = await RewardCode.findOne({ code });
    if (!entry) {
      return res.status(404).json({ valid: false, reason: "NOT_FOUND" });
    }

    if (entry.isUsed) {
      return res.status(409).json({ valid: false, reason: "USED" });
    }

    if (isExpired(entry.purchaseDate)) {
      return res.status(410).json({ valid: false, reason: "EXPIRED" });
    }

    return res.json({ valid: true, type: entry.type });
  } catch (error) {
    return res.status(500).json({ valid: false, reason: "SERVER_ERROR" });
  }
});

app.post("/mark-used", requireAdmin, async (req, res) => {
  try {
    const code = cleanCode(req.body?.code);
    const isUsed = req.body?.isUsed !== undefined ? Boolean(req.body.isUsed) : true;

    const updated = await RewardCode.findOneAndUpdate(
      { code },
      { isUsed },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Code not found" });
    }

    return res.json({ message: "Code status updated", code: updated.code, isUsed });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update status" });
  }
});

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Paw & Moods server running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  });
