import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import { v4 as uuidv4 } from "uuid";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dataDir = join(__dirname, "..", "data");
const usersFile = join(dataDir, "users.json");
const resetTokensFile = join(dataDir, "reset_tokens.json");
const verifyTokensFile = join(dataDir, "verify_tokens.json");
const cartsFile = join(dataDir, "carts.json");

if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
if (!existsSync(usersFile)) writeFileSync(usersFile, "[]", "utf8");
if (!existsSync(resetTokensFile)) writeFileSync(resetTokensFile, "[]", "utf8");
if (!existsSync(verifyTokensFile)) writeFileSync(verifyTokensFile, "[]", "utf8");
if (!existsSync(cartsFile)) writeFileSync(cartsFile, "{}", "utf8");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || "change_this_secret";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

app.use(cors({ origin: FRONTEND_URL }));
app.use(express.json());

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return [];
  }
}

function writeJson(file, data) {
  writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function normalizeEmail(email = "") {
  return String(email).trim().toLowerCase();
}

function getMailer() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: Number(SMTP_PORT || 587) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

async function sendVerificationEmail(user) {
  const verifyTokens = readJson(verifyTokensFile);
  const verifyToken = uuidv4();
  const verifyExpiresAt = Date.now() + 1000 * 60 * 60 * 24;
  verifyTokens.push({
    token: verifyToken,
    userId: user.id,
    email: user.email,
    expiresAt: verifyExpiresAt,
    used: false,
  });
  writeJson(verifyTokensFile, verifyTokens);

  const apiPublicUrl = process.env.API_PUBLIC_URL || `http://localhost:${PORT}`;
  const verifyLink = `${apiPublicUrl}/api/auth/verify-email?token=${encodeURIComponent(verifyToken)}`;

  const transporter = getMailer();
  if (transporter) {
    const from = process.env.SMTP_FROM || "PharmaDerm <no-reply@pharmaderm.com>";
    await transporter.sendMail({
      from,
      to: user.email,
      subject: "PharmaDerm - Verify your email",
      text: `Please verify your account using this link: ${verifyLink}`,
    });
  } else {
    console.log(`[verify-email] Verification link for ${user.email}: ${verifyLink}`);
  }
}

function getBearerToken(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim();
}

function requireAuth(req, res, next) {
  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.auth = { userId: payload.sub, email: payload.email };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "pharmaderm-backend" });
});

app.post("/api/auth/register", async (req, res) => {
  const { Nombre, Apellido, Email, Telefono, Contrasena } = req.body || {};
  const email = normalizeEmail(Email);

  if (!Nombre || !Apellido || !email || !Contrasena) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const users = readJson(usersFile);
  const existing = users.find((u) => u.email === email);
  if (existing) {
    if (!existing.emailVerified) {
      await sendVerificationEmail(existing);
      return res.status(200).json({ ok: true, needsEmailConfirmation: true, resent: true });
    }
    return res.status(409).json({ error: "Email already exists" });
  }

  const passwordHash = await bcrypt.hash(String(Contrasena), 10);
  const user = {
    id: uuidv4(),
    nombre: String(Nombre).trim(),
    apellido: String(Apellido).trim(),
    email,
    telefono: Telefono ? String(Telefono).trim() : null,
    passwordHash,
    emailVerified: false,
    createdAt: new Date().toISOString(),
  };

  users.push(user);
  writeJson(usersFile, users);

  await sendVerificationEmail(user);

  return res.status(201).json({ ok: true, needsEmailConfirmation: true });
});

app.post("/api/auth/login", async (req, res) => {
  const { Email, Contrasena } = req.body || {};
  const email = normalizeEmail(Email);
  const password = String(Contrasena || "");

  const users = readJson(usersFile);
  const found = users.find((u) => u.email === email);
  if (!found) return res.status(401).json({ error: "Invalid credentials" });

  const valid = await bcrypt.compare(password, found.passwordHash);
  if (!valid) return res.status(401).json({ error: "Invalid credentials" });
  if (!found.emailVerified) return res.status(403).json({ error: "Email not confirmed" });

  const token = jwt.sign({ sub: found.id, email: found.email }, JWT_SECRET, {
    expiresIn: "7d",
  });

  return res.json({
    token,
    usuario: {
      id: found.id,
      nombre: found.nombre,
      apellido: found.apellido,
      email: found.email,
      telefono: found.telefono,
    },
  });
});

app.get("/api/auth/verify-email", (req, res) => {
  const token = String(req.query.token || "");
  if (!token) return res.status(400).send("Invalid verification token");

  const verifyTokens = readJson(verifyTokensFile);
  const record = verifyTokens.find((t) => t.token === token && !t.used);
  if (!record || Number(record.expiresAt) < Date.now()) {
    return res.status(400).send("Verification token expired or invalid");
  }

  const users = readJson(usersFile);
  const idx = users.findIndex((u) => u.id === record.userId);
  if (idx === -1) return res.status(400).send("User not found");

  users[idx].emailVerified = true;
  users[idx].updatedAt = new Date().toISOString();
  writeJson(usersFile, users);

  record.used = true;
  writeJson(verifyTokensFile, verifyTokens);

  return res.redirect(`${FRONTEND_URL}/login?verified=1`);
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  const users = readJson(usersFile);
  const found = users.find((u) => u.id === req.auth.userId);
  if (!found) return res.status(404).json({ error: "User not found" });
  return res.json({
    usuario: {
      id: found.id,
      nombre: found.nombre,
      apellido: found.apellido,
      email: found.email,
      telefono: found.telefono,
    },
  });
});

app.post("/api/auth/forgot-password", async (req, res) => {
  const { Email } = req.body || {};
  const email = normalizeEmail(Email);
  const users = readJson(usersFile);
  const found = users.find((u) => u.email === email);

  if (found) {
    const tokens = readJson(resetTokensFile);
    const token = uuidv4();
    const expiresAt = Date.now() + 1000 * 60 * 30;
    tokens.push({ token, userId: found.id, email: found.email, expiresAt, used: false });
    writeJson(resetTokensFile, tokens);

    const resetLink = `${FRONTEND_URL}/reset-password?token=${encodeURIComponent(token)}`;
    const transporter = getMailer();

    if (transporter) {
      const from = process.env.SMTP_FROM || "PharmaDerm <no-reply@pharmaderm.com>";
      await transporter.sendMail({
        from,
        to: found.email,
        subject: "PharmaDerm - Restablecer contrasena",
        text: `Usa este enlace para restablecer tu contrasena: ${resetLink}`,
      });
    } else {
      console.log(`[forgot-password] Reset link for ${found.email}: ${resetLink}`);
    }
  }

  return res.json({ ok: true });
});

app.post("/api/auth/reset-password", async (req, res) => {
  const { token, Contrasena } = req.body || {};
  const newPassword = String(Contrasena || "");
  const safeToken = String(token || "");

  if (!safeToken || newPassword.length < 6) {
    return res.status(400).json({ error: "Invalid token or password" });
  }

  const tokens = readJson(resetTokensFile);
  const record = tokens.find((t) => t.token === safeToken && !t.used);
  if (!record || Number(record.expiresAt) < Date.now()) {
    return res.status(400).json({ error: "Token expired or invalid" });
  }

  const users = readJson(usersFile);
  const idx = users.findIndex((u) => u.id === record.userId);
  if (idx === -1) {
    return res.status(400).json({ error: "User not found" });
  }

  users[idx].passwordHash = await bcrypt.hash(newPassword, 10);
  users[idx].updatedAt = new Date().toISOString();
  writeJson(usersFile, users);

  record.used = true;
  writeJson(resetTokensFile, tokens);

  return res.json({ ok: true });
});

app.get("/api/cart", requireAuth, (req, res) => {
  const carts = readJson(cartsFile) || {};
  const items = Array.isArray(carts[req.auth.userId]) ? carts[req.auth.userId] : [];
  return res.json({ items });
});

app.put("/api/cart", requireAuth, (req, res) => {
  const nextItems = Array.isArray(req.body?.items) ? req.body.items : null;
  if (!nextItems) return res.status(400).json({ error: "items must be an array" });

  const carts = readJson(cartsFile) || {};
  carts[req.auth.userId] = nextItems;
  writeJson(cartsFile, carts);
  return res.json({ ok: true, items: nextItems });
});

app.delete("/api/cart", requireAuth, (req, res) => {
  const carts = readJson(cartsFile) || {};
  carts[req.auth.userId] = [];
  writeJson(cartsFile, carts);
  return res.json({ ok: true, items: [] });
});

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
