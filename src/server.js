import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import { v4 as uuidv4 } from "uuid";
import { Pool } from "pg";
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
const settingsFile = join(dataDir, "settings.json");

if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
if (!existsSync(usersFile)) writeFileSync(usersFile, "[]", "utf8");
if (!existsSync(resetTokensFile)) writeFileSync(resetTokensFile, "[]", "utf8");
if (!existsSync(verifyTokensFile)) writeFileSync(verifyTokensFile, "[]", "utf8");
if (!existsSync(cartsFile)) writeFileSync(cartsFile, "{}", "utf8");
if (!existsSync(settingsFile)) writeFileSync(settingsFile, "{}", "utf8");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || "change_this_secret";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
const BREVO_API_KEY = process.env.BREVO_API_KEY || "";
const DATABASE_URL = process.env.DATABASE_URL || "";
const USE_DB = Boolean(DATABASE_URL);

const pool = USE_DB
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      family: 4,
    })
  : null;

function normalizeOrigin(value = "") {
  return String(value).trim().replace(/\/$/, "");
}

function buildAllowedOrigins() {
  const set = new Set(
    String(process.env.FRONTEND_URLS || "")
      .split(",")
      .map((v) => normalizeOrigin(v))
      .filter(Boolean)
  );
  if (FRONTEND_URL) set.add(normalizeOrigin(FRONTEND_URL));
  set.add("http://localhost:5173");
  set.add("http://127.0.0.1:5173");
  return set;
}

const allowedOrigins = buildAllowedOrigins();

function isAllowedOrigin(origin = "") {
  const safeOrigin = normalizeOrigin(origin);
  if (!safeOrigin) return true;
  if (allowedOrigins.has(safeOrigin)) return true;
  if (/^https:\/\/pharma-derm-frontendes(?:-[a-z0-9-]+)?\.vercel\.app$/i.test(safeOrigin)) {
    return true;
  }
  return false;
}

const corsOptions = {
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) return callback(null, true);
    return callback(new Error(`Not allowed by CORS: ${origin}`));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use((req, res, next) => {
  const requestOrigin = normalizeOrigin(req.headers.origin || "");
  if (requestOrigin && isAllowedOrigin(requestOrigin)) {
    res.header("Access-Control-Allow-Origin", requestOrigin);
    res.header("Vary", "Origin");
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type,Authorization");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  return next();
});
app.use(express.json({ limit: "10mb" }));

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

async function dbQuery(text, params = []) {
  if (!pool) throw new Error("DATABASE_URL is not configured");
  return pool.query(text, params);
}

async function ensureHistoryTable() {
  if (!USE_DB) return;
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS user_history_store (
      user_key TEXT PRIMARY KEY,
      quiz_history JSONB DEFAULT '[]'::jsonb,
      diagnostics_history JSONB DEFAULT '[]'::jsonb,
      routines JSONB DEFAULT '[]'::jsonb,
      appointments_list JSONB DEFAULT '[]'::jsonb,
      orders JSONB DEFAULT '[]'::jsonb,
      quiz_result JSONB,
      diagnostic_result JSONB,
      appointment JSONB,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

async function ensureUserSettingsTable() {
  if (!USE_DB) return;
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS user_app_settings (
      user_key TEXT PRIMARY KEY,
      language TEXT DEFAULT 'es',
      country_code TEXT DEFAULT 'DO',
      currency TEXT DEFAULT 'DOP',
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

async function ensureOrdersTables() {
  if (!USE_DB) return;
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS orders (
      id BIGSERIAL PRIMARY KEY,
      order_number TEXT,
      user_id TEXT NOT NULL,
      customer_name TEXT,
      customer_email TEXT,
      customer_phone TEXT,
      address_line TEXT,
      city TEXT,
      country_code TEXT,
      payment_method TEXT,
      delivery_method TEXT,
      currency TEXT DEFAULT 'DOP',
      subtotal NUMERIC DEFAULT 0,
      shipping NUMERIC DEFAULT 0,
      tax NUMERIC DEFAULT 0,
      discount NUMERIC DEFAULT 0,
      total NUMERIC DEFAULT 0,
      status TEXT DEFAULT 'pending',
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS order_items (
      id BIGSERIAL PRIMARY KEY,
      order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_name TEXT,
      product_sku TEXT,
      product_image TEXT,
      size_label TEXT,
      quantity INTEGER DEFAULT 1,
      unit_price_dop NUMERIC DEFAULT 0,
      subtotal NUMERIC DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

async function ensureSubscribersTable() {
  if (!USE_DB) return;
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS newsletter_subscribers (
      id BIGSERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      phone TEXT,
      consent BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

function normalizeEmail(email = "") {
  return String(email).trim().toLowerCase();
}

function pickFirst(obj, keys = [], fallback = null) {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return fallback;
}

function formatEmailDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "Pending";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(d);
}

function formatEmailTime(value) {
  const raw = String(value || "").trim();
  if (!raw) return "Pending";
  const normalized = /^\d{2}:\d{2}(:\d{2})?$/.test(raw) ? `1970-01-01T${raw}` : raw;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return raw;
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

function getMailer() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: Number(SMTP_PORT || 587) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
}

function parseFromHeader() {
  const fallback = { email: "no-reply@pharmaderm.com", name: "PharmaDerm" };
  const raw = String(process.env.SMTP_FROM || "").trim();
  if (!raw) return fallback;
  const m = raw.match(/^(.*)<([^>]+)>$/);
  if (!m) return { ...fallback, email: raw };
  return { name: m[1].trim().replace(/^"|"$/g, ""), email: m[2].trim() };
}

async function sendEmail({ to, subject, text, html }) {
  if (BREVO_API_KEY) {
    const from = parseFromHeader();
    try {
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "api-key": BREVO_API_KEY,
        },
        body: JSON.stringify({
          sender: { email: from.email, name: from.name },
          to: [{ email: to }],
          subject,
          textContent: text,
          htmlContent: html || undefined,
        }),
      });
      if (!res.ok) {
        const errTxt = await res.text().catch(() => "");
        throw new Error(`Brevo API error ${res.status}: ${errTxt}`);
      }
      return;
    } catch (brevoError) {
      console.warn("[email] Brevo failed, trying SMTP fallback:", brevoError?.message || brevoError);
    }
  }

  const transporter = getMailer();
  if (!transporter) throw new Error("No email provider configured");
  const from = process.env.SMTP_FROM || "PharmaDerm <no-reply@pharmaderm.com>";
  await Promise.race([
    transporter.sendMail({ from, to, subject, text, html }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("SMTP timeout while sending email")), 12000)
    ),
  ]);
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
  const verifyEmailHtml = `
    <div style="margin:0;padding:0;background:#f3f7fb;font-family:Arial,Helvetica,sans-serif;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:14px;border:1px solid #dbe7f3;overflow:hidden;">
              <tr>
                <td style="background:#0a5ea8;color:#ffffff;padding:14px 24px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                      <td style="width:56px;vertical-align:middle;">
                        <img src="${FRONTEND_URL}/logo-icon.png" alt="PharmaDerm" width="44" height="44" style="display:block;border:0;outline:none;text-decoration:none;border-radius:8px;background:#ffffff;padding:4px;" />
                      </td>
                      <td style="vertical-align:middle;font-size:20px;font-weight:700;color:#ffffff;padding-left:10px;">PharmaDerm</td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:24px;color:#0f172a;">
                  <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;">Verify your email</h1>
                  <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155;">Thanks for creating your PharmaDerm account. Please confirm your email to activate your account.</p>
                  <p style="margin:0 0 20px;">
                    <a href="${verifyLink}" style="display:inline-block;background:#0a5ea8;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px;">Verify account</a>
                  </p>
                  <p style="margin:0 0 10px;font-size:14px;line-height:1.6;color:#475569;">If the button does not work, copy and paste this link into your browser:</p>
                  <p style="margin:0;font-size:13px;word-break:break-all;color:#0a5ea8;">${verifyLink}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;

  try {
    await sendEmail({
      to: user.email,
      subject: "PharmaDerm - Verify your email",
      text: `Please verify your account using this link: ${verifyLink}`,
      html: verifyEmailHtml,
    });
  } catch (err) {
    console.error("[verify-email] Could not send verification email:", err?.message || err);
    console.log(`[verify-email] Verification link for ${user.email}: ${verifyLink}`);
  }
}

app.get("/api/health", async (_req, res) => {
  let dbConnected = false;
  let dbError = null;
  if (USE_DB) {
    try {
      await dbQuery("SELECT 1");
      dbConnected = true;
    } catch (err) {
      dbError = String(err?.message || "Unknown DB error");
      console.error("[health] db ping error:", dbError);
    }
  }
  res.json({
    ok: true,
    service: "pharmaderm-backend",
    useDb: USE_DB,
    dbConnected,
    dbError,
  });
});

app.post("/api/auth/register", async (req, res) => {
  const { Nombre, Apellido, Email, Telefono, Contrasena } = req.body || {};
  const rawBirthDate = req.body?.birth_date ?? req.body?.BirthDate ?? req.body?.FechaNacimiento ?? null;
  const birthDate = rawBirthDate ? String(rawBirthDate).trim() : null;
  const email = normalizeEmail(Email);

  if (!Nombre || !Apellido || !email || !Contrasena) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  let existing = null;
  if (USE_DB) {
    const r = await dbQuery(
      `SELECT id, email, email_verified AS "emailVerified" FROM users WHERE email = $1 LIMIT 1`,
      [email]
    );
    existing = r.rows[0] || null;
  } else {
    const users = readJson(usersFile);
    existing = users.find((u) => u.email === email) || null;
  }

  if (existing) {
    if (!existing.emailVerified) {
      await sendVerificationEmail(existing);
      return res.status(200).json({ ok: true, needsEmailConfirmation: true, resent: true });
    }
    return res.status(409).json({ error: "Email already exists" });
  }

  const passwordHash = await bcrypt.hash(String(Contrasena), 10);
  let user;
  if (USE_DB) {
    const created = await dbQuery(
      `INSERT INTO users (email, password_hash, first_name, last_name, phone, birth_date, email_verified)
       VALUES ($1, $2, $3, $4, $5, $6, false)
       RETURNING id, email, first_name AS nombre, last_name AS apellido, phone AS telefono, email_verified AS "emailVerified"`,
      [email, passwordHash, String(Nombre).trim(), String(Apellido).trim(), Telefono ? String(Telefono).trim() : null, birthDate]
    );
    user = created.rows[0];
  } else {
    const users = readJson(usersFile);
    user = {
      id: uuidv4(),
      nombre: String(Nombre).trim(),
      apellido: String(Apellido).trim(),
      email,
      telefono: Telefono ? String(Telefono).trim() : null,
      birth_date: birthDate,
      passwordHash,
      emailVerified: false,
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    writeJson(usersFile, users);
  }

  await sendVerificationEmail(user);
  return res.status(201).json({ ok: true, needsEmailConfirmation: true });
});

app.post("/api/auth/login", async (req, res) => {
  const { Email, Contrasena } = req.body || {};
  const email = normalizeEmail(Email);
  const password = String(Contrasena || "");

  let found = null;
  if (USE_DB) {
    const r = await dbQuery(`SELECT * FROM users WHERE email = $1 LIMIT 1`, [email]);
    const row = r.rows[0] || null;
    if (row) {
      found = {
        id: pickFirst(row, ["id", "usuarioid", "user_id"]),
        email: pickFirst(row, ["email", "Email"], email),
        passwordHash: pickFirst(row, ["password_hash", "passwordHash", "contrasena", "Contrasena", "password"]),
        emailVerified: pickFirst(
          row,
          ["email_verified", "emailVerified", "verificado_email", "verificado", "estado_verificacion"],
          true
        ),
        nombre: pickFirst(row, ["first_name", "nombre", "Nombre"], ""),
        apellido: pickFirst(row, ["last_name", "apellido", "Apellido"], ""),
        telefono: pickFirst(row, ["phone", "telefono", "Telefono"], null),
      };
    }
  } else {
    const users = readJson(usersFile);
    found = users.find((u) => u.email === email) || null;
  }

  if (!found) return res.status(401).json({ error: "Invalid credentials" });
  const storedPassword = String(found.passwordHash || "");
  const isBcrypt = storedPassword.startsWith("$2a$") || storedPassword.startsWith("$2b$") || storedPassword.startsWith("$2y$");
  const valid = isBcrypt ? await bcrypt.compare(password, storedPassword) : password === storedPassword;
  if (!valid) return res.status(401).json({ error: "Invalid credentials" });
  if (!found.emailVerified) return res.status(403).json({ error: "Email not confirmed" });

  const token = jwt.sign({ sub: found.id, email: found.email }, JWT_SECRET, { expiresIn: "7d" });
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

  if (USE_DB) {
    dbQuery(`UPDATE users SET email_verified = true, updated_at = NOW() WHERE id = $1`, [record.userId]).catch(
      (err) => console.error("[verify-email] db update error:", err?.message || err)
    );
  } else {
    const users = readJson(usersFile);
    const idx = users.findIndex((u) => u.id === record.userId);
    if (idx === -1) return res.status(400).send("User not found");
    users[idx].emailVerified = true;
    users[idx].updatedAt = new Date().toISOString();
    writeJson(usersFile, users);
  }

  record.used = true;
  writeJson(verifyTokensFile, verifyTokens);
  return res.redirect(`${FRONTEND_URL}/login?verified=1`);
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  (async () => {
    if (USE_DB) {
      const r = await dbQuery(
        `SELECT id, email, first_name AS nombre, last_name AS apellido, phone AS telefono
         FROM users WHERE id = $1 LIMIT 1`,
        [req.auth.userId]
      );
      const found = r.rows[0];
      if (!found) return res.status(404).json({ error: "User not found" });
      return res.json({ usuario: found });
    }
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
  })().catch((err) => {
    console.error("[auth/me] error:", err?.message || err);
    res.status(500).json({ error: "Internal server error" });
  });
});

app.post("/api/auth/forgot-password", async (req, res) => {
  const { Email } = req.body || {};
  const email = normalizeEmail(Email);

  let found = null;
  if (USE_DB) {
    const r = await dbQuery(`SELECT id, email FROM users WHERE email = $1 LIMIT 1`, [email]);
    found = r.rows[0] || null;
  } else {
    const users = readJson(usersFile);
    found = users.find((u) => u.email === email) || null;
  }

  if (found) {
    const tokens = readJson(resetTokensFile);
    const token = uuidv4();
    const expiresAt = Date.now() + 1000 * 60 * 30;
    tokens.push({ token, userId: found.id, email: found.email, expiresAt, used: false });
    writeJson(resetTokensFile, tokens);

    const resetLink = `${FRONTEND_URL}/reset-password?token=${encodeURIComponent(token)}`;
    const resetEmailHtml = `
      <div style="margin:0;padding:0;background:#f3f7fb;font-family:Arial,Helvetica,sans-serif;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:14px;border:1px solid #dbe7f3;overflow:hidden;">
                <tr>
                  <td style="background:#0a5ea8;color:#ffffff;padding:14px 24px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="width:56px;vertical-align:middle;">
                          <img src="${FRONTEND_URL}/logo-icon.png" alt="PharmaDerm" width="44" height="44" style="display:block;border:0;outline:none;text-decoration:none;border-radius:8px;background:#ffffff;padding:4px;" />
                        </td>
                        <td style="vertical-align:middle;font-size:20px;font-weight:700;color:#ffffff;padding-left:10px;">
                          PharmaDerm
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:24px;color:#0f172a;">
                    <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;">Reset your password</h1>
                    <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#334155;">We received a request to change your account password.</p>
                    <p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#334155;">Click the button below to create a new password:</p>
                    <p style="margin:0 0 22px;">
                      <a href="${resetLink}" style="display:inline-block;background:#0a5ea8;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px;">Reset password</a>
                    </p>
                    <p style="margin:0 0 10px;font-size:14px;line-height:1.6;color:#475569;">If the button does not work, copy and paste this link into your browser:</p>
                    <p style="margin:0 0 18px;font-size:13px;word-break:break-all;color:#0a5ea8;">${resetLink}</p>
                    <p style="margin:0;font-size:13px;line-height:1.6;color:#64748b;">This link expires in 30 minutes. If you did not request this change, you can ignore this email.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>
    `;
    try {
      await sendEmail({
        to: found.email,
        subject: "PharmaDerm - Reset your password",
        text: `Use this link to reset your password: ${resetLink}`,
        html: resetEmailHtml,
      });
    } catch (err) {
      console.error("[forgot-password] Could not send reset email:", err?.message || err);
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

  const passwordHash = await bcrypt.hash(newPassword, 10);
  if (USE_DB) {
    await dbQuery(`UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [passwordHash, record.userId]);
  } else {
    const users = readJson(usersFile);
    const idx = users.findIndex((u) => u.id === record.userId);
    if (idx === -1) return res.status(400).json({ error: "User not found" });
    users[idx].passwordHash = passwordHash;
    users[idx].updatedAt = new Date().toISOString();
    writeJson(usersFile, users);
  }

  record.used = true;
  writeJson(resetTokensFile, tokens);
  return res.json({ ok: true });
});

app.get("/api/cart", requireAuth, (req, res) => {
  (async () => {
    if (USE_DB) {
      const cartRes = await dbQuery(
        `SELECT id FROM carts WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1`,
        [req.auth.userId]
      );
      const cartId = cartRes.rows[0]?.id;
      if (!cartId) return res.json({ items: [] });
      const itemsRes = await dbQuery(
        `SELECT ci.product_id::text AS id, ci.size_label AS size, ci.quantity, ci.unit_price_dop AS "priceRD", p.name
         FROM cart_items ci
         JOIN products p ON p.id = ci.product_id
         WHERE ci.cart_id = $1
         ORDER BY ci.id ASC`,
        [cartId]
      );
      return res.json({ items: itemsRes.rows });
    }
    const carts = readJson(cartsFile) || {};
    const items = Array.isArray(carts[req.auth.userId]) ? carts[req.auth.userId] : [];
    return res.json({ items });
  })().catch((err) => {
    console.error("[cart/get] error:", err?.message || err);
    res.status(500).json({ error: "Internal server error" });
  });
});

app.put("/api/cart", requireAuth, (req, res) => {
  (async () => {
    const nextItems = Array.isArray(req.body?.items) ? req.body.items : null;
    if (!nextItems) return res.status(400).json({ error: "items must be an array" });

    if (USE_DB) {
      let cartId;
      const cartRes = await dbQuery(
        `SELECT id FROM carts WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1`,
        [req.auth.userId]
      );
      if (cartRes.rows[0]?.id) {
        cartId = cartRes.rows[0].id;
        await dbQuery(`UPDATE carts SET updated_at = NOW() WHERE id = $1`, [cartId]);
      } else {
        const created = await dbQuery(`INSERT INTO carts (user_id, currency) VALUES ($1, 'DOP') RETURNING id`, [
          req.auth.userId,
        ]);
        cartId = created.rows[0].id;
      }

      await dbQuery(`DELETE FROM cart_items WHERE cart_id = $1`, [cartId]);
      for (const it of nextItems) {
        if (!it?.id) continue;
        const q = Math.max(1, Number(it?.quantity || 1));
        const p = Number(it?.priceRD || 0);
        await dbQuery(
          `INSERT INTO cart_items (cart_id, product_id, size_label, quantity, unit_price_dop)
           VALUES ($1, $2::uuid, $3, $4, $5)`,
          [cartId, String(it.id), String(it.size || ""), q, p]
        );
      }
      return res.json({ ok: true, items: nextItems });
    }

    const carts = readJson(cartsFile) || {};
    carts[req.auth.userId] = nextItems;
    writeJson(cartsFile, carts);
    return res.json({ ok: true, items: nextItems });
  })().catch((err) => {
    console.error("[cart/put] error:", err?.message || err);
    res.status(500).json({ error: "Could not save cart" });
  });
});

app.delete("/api/cart", requireAuth, (req, res) => {
  (async () => {
    if (USE_DB) {
      const cartRes = await dbQuery(
        `SELECT id FROM carts WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1`,
        [req.auth.userId]
      );
      const cartId = cartRes.rows[0]?.id;
      if (cartId) {
        await dbQuery(`DELETE FROM cart_items WHERE cart_id = $1`, [cartId]);
        await dbQuery(`UPDATE carts SET updated_at = NOW() WHERE id = $1`, [cartId]);
      }
      return res.json({ ok: true, items: [] });
    }
    const carts = readJson(cartsFile) || {};
    carts[req.auth.userId] = [];
    writeJson(cartsFile, carts);
    return res.json({ ok: true, items: [] });
  })().catch((err) => {
    console.error("[cart/delete] error:", err?.message || err);
    res.status(500).json({ error: "Could not clear cart" });
  });
});

app.get("/api/user/profile", requireAuth, (req, res) => {
  (async () => {
    if (USE_DB) {
      const r = await dbQuery(
        `SELECT id, email, first_name, last_name, phone, birth_date
         FROM users
         WHERE id = $1
         LIMIT 1`,
        [req.auth.userId]
      );
      const row = r.rows[0] || null;
      if (!row) return res.status(404).json({ error: "User not found" });
      return res.json({
        id: row.id,
        email: row.email,
        firstName: row.first_name || "",
        lastName: row.last_name || "",
        name: `${row.first_name || ""} ${row.last_name || ""}`.trim(),
        phone: row.phone || null,
        birth_date: row.birth_date || null,
      });
    }
    const users = readJson(usersFile);
    const found = users.find((u) => u.id === req.auth.userId);
    if (!found) return res.status(404).json({ error: "User not found" });
    return res.json({
      id: found.id,
      email: found.email,
      firstName: found.nombre || found.firstName || "",
      lastName: found.apellido || found.lastName || "",
      name: `${found.nombre || found.firstName || ""} ${found.apellido || found.lastName || ""}`.trim(),
      phone: found.telefono || found.phone || null,
      birth_date: found.birth_date || null,
    });
  })().catch((err) => {
    console.error("[user/profile/get] error:", err?.message || err);
    return res.status(500).json({ error: "Could not load profile" });
  });
});

app.put("/api/user/profile", requireAuth, (req, res) => {
  (async () => {
    const firstName = String(req.body?.firstName || "").trim();
    const lastName = String(req.body?.lastName || "").trim();
    const phone = req.body?.phone ? String(req.body.phone).trim() : null;
    const birthDate = req.body?.birth_date ? String(req.body.birth_date).trim() : null;

    if (USE_DB) {
      let row = null;
      try {
        const r = await dbQuery(
          `UPDATE users
           SET first_name = $1, last_name = $2, phone = $3, birth_date = $4, updated_at = NOW()
           WHERE id = $5
           RETURNING id, email, first_name, last_name, phone, birth_date`,
          [firstName || null, lastName || null, phone, birthDate, req.auth.userId]
        );
        row = r.rows[0] || null;
      } catch {
        const r = await dbQuery(
          `UPDATE users
           SET first_name = $1, last_name = $2, phone = $3, updated_at = NOW()
           WHERE id = $4
           RETURNING id, email, first_name, last_name, phone`,
          [firstName || null, lastName || null, phone, req.auth.userId]
        );
        row = r.rows[0] || null;
      }
      if (!row) return res.status(404).json({ error: "User not found" });
      return res.json({
        ok: true,
        user: {
          id: row.id,
          email: row.email,
          firstName: row.first_name || "",
          lastName: row.last_name || "",
          name: `${row.first_name || ""} ${row.last_name || ""}`.trim(),
          phone: row.phone || null,
          birth_date: row.birth_date || birthDate || null,
        },
      });
    }

    const users = readJson(usersFile) || [];
    const idx = users.findIndex((u) => u.id === req.auth.userId);
    if (idx < 0) return res.status(404).json({ error: "User not found" });
    users[idx] = {
      ...users[idx],
      nombre: firstName || users[idx].nombre || "",
      apellido: lastName || users[idx].apellido || "",
      telefono: phone ?? users[idx].telefono ?? null,
      birth_date: birthDate ?? users[idx].birth_date ?? null,
      updatedAt: new Date().toISOString(),
    };
    writeJson(usersFile, users);
    return res.json({
      ok: true,
      user: {
        id: users[idx].id,
        email: users[idx].email,
        firstName: users[idx].nombre || "",
        lastName: users[idx].apellido || "",
        name: `${users[idx].nombre || ""} ${users[idx].apellido || ""}`.trim(),
        phone: users[idx].telefono || null,
        birth_date: users[idx].birth_date || null,
      },
    });
  })().catch((err) => {
    console.error("[user/profile/put] error:", err?.message || err);
    return res.status(500).json({ error: "Could not save profile" });
  });
});

app.get("/api/adresses", requireAuth, (req, res) => {
  (async () => {
    if (USE_DB) {
      const r = await dbQuery(
        `SELECT id, label, address_line_1, city, country_code, is_default, created_at
         FROM adresses
         WHERE user_id = $1
         ORDER BY is_default DESC, created_at DESC
         LIMIT 10`,
        [String(req.auth.userId)]
      );
      return res.json({ items: r.rows || [] });
    }
    const store = readJson(settingsFile) || {};
    const list = Array.isArray(store[`adresses_${req.auth.userId}`]) ? store[`adresses_${req.auth.userId}`] : [];
    return res.json({ items: list });
  })().catch((err) => {
    console.error("[adresses/get] error:", err?.message || err);
    return res.status(500).json({ error: "Could not load adresses" });
  });
});

app.put("/api/adresses", requireAuth, (req, res) => {
  (async () => {
    const label = String(req.body?.label || "My address").trim() || "My address";
    const addressLine = String(req.body?.address_line_1 || req.body?.address || "").trim();
    const city = String(req.body?.city || "").trim();
    const countryCode = String(req.body?.country_code || "DO").trim() || "DO";
    if (!addressLine) return res.status(400).json({ error: "address_line_1 is required" });

    if (USE_DB) {
      await dbQuery(`UPDATE adresses SET is_default = false, updated_at = NOW() WHERE user_id = $1`, [String(req.auth.userId)]);
      const ins = await dbQuery(
        `INSERT INTO adresses (user_id, label, address_line_1, city, country_code, is_default, updated_at)
         VALUES ($1, $2, $3, $4, $5, true, NOW())
         RETURNING id, label, address_line_1, city, country_code, is_default, created_at`,
        [String(req.auth.userId), label, addressLine, city || null, countryCode]
      );
      return res.json({ ok: true, item: ins.rows[0] || null });
    }

    const store = readJson(settingsFile) || {};
    const key = `adresses_${req.auth.userId}`;
    const next = {
      id: Date.now(),
      label,
      address_line_1: addressLine,
      city,
      country_code: countryCode,
      is_default: true,
      created_at: new Date().toISOString(),
    };
    const prev = Array.isArray(store[key]) ? store[key] : [];
    store[key] = [next, ...prev].slice(0, 10);
    writeJson(settingsFile, store);
    return res.json({ ok: true, item: next });
  })().catch((err) => {
    console.error("[adresses/put] error:", err?.message || err);
    return res.status(500).json({ error: "Could not save adresses" });
  });
});

// Backward compatibility alias
app.get("/api/adress", requireAuth, (req, res) => res.redirect(307, "/api/adresses"));
app.put("/api/adress", requireAuth, (req, res) => res.redirect(307, "/api/adresses"));

app.get("/api/specialists", async (_req, res) => {
  try {
    if (!USE_DB) return res.json([]);

    const docs = await dbQuery(
      `SELECT * FROM dermatologists WHERE COALESCE(is_active, true) = true ORDER BY rating DESC NULLS LAST, id ASC`
    );

    let concernsRows = [];
    let skinsRows = [];
    try {
      const concerns = await dbQuery(
        `SELECT dermatologist_id, concern_code, priority_score FROM dermatologist_concerns`
      );
      concernsRows = concerns.rows || [];
    } catch {}
    try {
      const skins = await dbQuery(
        `SELECT dermatologist_id, skin_type_code, priority_score FROM dermatologist_skin_types`
      );
      skinsRows = skins.rows || [];
    } catch {}

    const concernsByDoc = concernsRows.reduce((acc, row) => {
      const id = String(row.dermatologist_id);
      if (!acc[id]) acc[id] = { list: [], priority: {} };
      if (row.concern_code) acc[id].list.push(String(row.concern_code));
      if (row.concern_code) acc[id].priority[String(row.concern_code)] = Number(row.priority_score || 1);
      return acc;
    }, {});

    const skinsByDoc = skinsRows.reduce((acc, row) => {
      const id = String(row.dermatologist_id);
      if (!acc[id]) acc[id] = { list: [], priority: {} };
      if (row.skin_type_code) acc[id].list.push(String(row.skin_type_code));
      if (row.skin_type_code) acc[id].priority[String(row.skin_type_code)] = Number(row.priority_score || 1);
      return acc;
    }, {});

    const rows = (docs.rows || []).map((d) => {
      const id = String(d.id);
      return {
        id: d.id,
        name: d.name || d.full_name || "",
        specialty: d.specialty || "",
        mode: d.mode || "both",
        location: d.location || "",
        availability_note: d.availability_note || "",
        rating: Number(d.rating || 5),
        photo_url: d.photo_url || d.avatar_url || d.image_url || d.photo || d.avatar || null,
        concerns: concernsByDoc[id]?.list || [],
        concernPriority: concernsByDoc[id]?.priority || {},
        skinTypes: skinsByDoc[id]?.list || [],
        skinPriority: skinsByDoc[id]?.priority || {},
      };
    });

    return res.json(rows);
  } catch (err) {
    console.error("[specialists] error:", err?.message || err);
    return res.status(500).json({ error: "Could not load specialists" });
  }
});

app.post("/api/appointments", requireAuth, (req, res) => {
  (async () => {
    if (!USE_DB) return res.status(400).json({ error: "Database mode is disabled" });

    const body = req.body || {};
    const dermatologistIdRaw = body.dermatologist_id;
    const scheduledDate = String(body.scheduled_date || "").trim();
    const scheduledTime = body.scheduled_time ? String(body.scheduled_time).trim() : null;

    const dermatologistId = Number(dermatologistIdRaw);
    if (!Number.isFinite(dermatologistId)) {
      return res.status(400).json({ error: "Invalid dermatologist_id" });
    }
    if (!scheduledDate) {
      return res.status(400).json({ error: "scheduled_date is required" });
    }

    const appointmentType = body.appointment_type ? String(body.appointment_type).trim() : null;
    const mode = body.mode ? String(body.mode).trim() : null;
    const reason = body.reason ? String(body.reason).trim() : null;
    const notes = body.notes ? String(body.notes).trim() : null;
    const urgency = body.urgency ? String(body.urgency).trim() : "normal";
    const status = body.status ? String(body.status).trim() : "pending";
    const confirmationCode =
      body.confirmation_code && String(body.confirmation_code).trim()
        ? String(body.confirmation_code).trim()
        : `APT-${Date.now().toString().slice(-8)}`;
    const rawAnalysisId = body.analysis_id ? String(body.analysis_id).trim() : null;
    // Keep insert safe even if analysis_id column is numeric in some deployments.
    const analysisIdForInsert = rawAnalysisId && /^\d+$/.test(rawAnalysisId) ? rawAnalysisId : null;

    const inserted = await dbQuery(
      `INSERT INTO appointments
       (user_id, dermatologist_id, appointment_type, mode, scheduled_date, scheduled_time, reason, notes, urgency, status, confirmation_code, analysis_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id, user_id, dermatologist_id, appointment_type, mode, scheduled_date, scheduled_time, reason, notes, urgency, status, confirmation_code, analysis_id, created_at`,
      [
        req.auth.userId,
        dermatologistId,
        appointmentType,
        mode,
        scheduledDate,
        scheduledTime,
        reason,
        notes,
        urgency,
        status,
        confirmationCode,
        analysisIdForInsert,
      ]
    );

    const savedAppointment = inserted.rows[0] || null;

    if (savedAppointment?.id && rawAnalysisId) {
      try {
        await dbQuery(`ALTER TABLE diagnosis_cases ADD COLUMN IF NOT EXISTS appointment_id BIGINT`);
        await dbQuery(
          `UPDATE diagnosis_cases
           SET appointment_id = $1, updated_at = NOW()
           WHERE user_id = $2 AND id::text = $3`,
          [savedAppointment.id, req.auth.userId, String(rawAnalysisId)]
        );
      } catch (linkErr) {
        console.warn("[appointments/create] could not link appointment to diagnosis by id:", linkErr?.message || linkErr);
        try {
          // Fallback: link latest diagnosis without appointment for this user.
          await dbQuery(
            `WITH latest_case AS (
               SELECT id
               FROM diagnosis_cases
               WHERE user_id = $1 AND appointment_id IS NULL
               ORDER BY created_at DESC
               LIMIT 1
             )
             UPDATE diagnosis_cases d
             SET appointment_id = $2, updated_at = NOW()
             FROM latest_case lc
             WHERE d.id = lc.id`,
            [req.auth.userId, savedAppointment.id]
          );
        } catch (fallbackErr) {
          console.warn("[appointments/create] fallback diagnosis link failed:", fallbackErr?.message || fallbackErr);
        }
      }
    }

    return res.status(201).json({ ok: true, appointment: savedAppointment });
  })().catch((err) => {
    console.error("[appointments/create] error:", err?.message || err);
    return res.status(500).json({ error: "Could not save appointment" });
  });
});

app.get("/api/appointments", requireAuth, (req, res) => {
  (async () => {
    if (!USE_DB) return res.json({ appointments: [] });
    const rows = await dbQuery(
      `SELECT
         a.id,
         a.user_id,
         a.dermatologist_id,
         a.appointment_type,
         a.mode,
         a.scheduled_date,
         a.scheduled_time,
         a.reason,
         a.notes,
         a.urgency,
         a.status,
         a.confirmation_code,
         a.analysis_id,
         a.created_at,
         d.name AS doctor_name,
         d.specialty AS doctor_specialty,
         d.photo_url AS doctor_photo,
         d.mode AS doctor_mode
       FROM appointments a
       LEFT JOIN dermatologists d ON d.id = a.dermatologist_id
       WHERE a.user_id = $1
       ORDER BY a.scheduled_date DESC, a.scheduled_time DESC NULLS LAST, a.created_at DESC`,
      [req.auth.userId]
    );
    return res.json({ appointments: rows.rows || [] });
  })().catch((err) => {
    console.error("[appointments/list] error:", err?.message || err);
    return res.status(500).json({ error: "Could not load appointments" });
  });
});

app.get("/api/appointments/confirm", (req, res) => {
  (async () => {
    if (!USE_DB) return res.status(400).json({ status: "error", error: "Database mode is disabled" });
    const appointmentId = String(req.query.appointment_id || "").trim();
    const code = String(req.query.code || "").trim();
    if (!appointmentId || !code) return res.status(400).json({ status: "invalid" });

    const found = await dbQuery(
      `SELECT id, confirmation_code, status, scheduled_date, scheduled_time, appointment_type, mode, reason, urgency
       FROM appointments
       WHERE id = $1 AND confirmation_code = $2
       LIMIT 1`,
      [appointmentId, code]
    );
    const data = found.rows[0] || null;
    if (!data) return res.status(404).json({ status: "not_found" });

    if (data.status === "confirmed") return res.json({ status: "already", appointment: data });
    if (data.status === "cancelled" || data.status === "completed") {
      return res.json({ status: "locked", appointment: data });
    }
    if (data.status !== "pending") return res.json({ status: "locked", appointment: data });

    const upd = await dbQuery(
      `UPDATE appointments
       SET status = 'confirmed'
       WHERE id = $1 AND confirmation_code = $2 AND status = 'pending'
       RETURNING id, confirmation_code, status, scheduled_date, scheduled_time, appointment_type, mode, reason, urgency`,
      [appointmentId, code]
    );
    const updated = upd.rows[0] || null;
    if (!updated) return res.status(409).json({ status: "update_error", appointment: data });

    return res.json({ status: "success", appointment: updated });
  })().catch((err) => {
    console.error("[appointments/confirm] error:", err?.message || err);
    return res.status(500).json({ status: "error" });
  });
});

app.post("/api/email/appointment", requireAuth, (req, res) => {
  (async () => {
    const to = normalizeEmail(req.body?.to_email || req.auth?.email || "");
    if (!to) return res.status(400).json({ ok: false, error: "Missing recipient email" });
    const doctorName = String(req.body?.doctor_name || "Specialist").trim();
    const date = String(req.body?.appointment_date || "").trim();
    const time = String(req.body?.appointment_time || "").trim();
    const mode = String(req.body?.appointment_mode || "").trim();
    const confirmationUrl = String(req.body?.confirmation_url || "").trim();
    const code = String(req.body?.confirmation_code || "").trim();

    const prettyDate = formatEmailDate(date);
    const prettyTime = formatEmailTime(time);

    const text = [
      `Hello,`,
      ``,
      `Your appointment request is pending confirmation.`,
      `Doctor: ${doctorName}`,
      `Date: ${prettyDate}`,
      `Time: ${prettyTime}`,
      `Mode: ${mode || "Pending"}`,
      code ? `Code: ${code}` : "",
      confirmationUrl ? `Confirm here: ${confirmationUrl}` : "",
      ``,
      `PharmaDerm`,
    ].filter(Boolean).join("\n");
    const html = `
      <div style="margin:0;padding:0;background:#f3f7fb;font-family:Arial,Helvetica,sans-serif;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:14px;border:1px solid #dbe7f3;overflow:hidden;">
                <tr>
                  <td style="background:#0a5ea8;color:#ffffff;padding:14px 24px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="width:56px;vertical-align:middle;">
                          <img src="${FRONTEND_URL}/logo-icon.png" alt="PharmaDerm" width="44" height="44" style="display:block;border:0;outline:none;text-decoration:none;border-radius:8px;background:#ffffff;padding:4px;" />
                        </td>
                        <td style="vertical-align:middle;font-size:20px;font-weight:700;color:#ffffff;padding-left:10px;">PharmaDerm</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:24px;color:#0f172a;">
                    <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;">Confirm your appointment</h1>
                    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155;">Your appointment request is pending confirmation.</p>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e2e8f0;border-radius:10px;">
                      <tr><td style="padding:12px 14px;font-size:14px;color:#334155;"><strong>Doctor:</strong> ${doctorName || "Specialist"}</td></tr>
                      <tr><td style="padding:12px 14px;font-size:14px;color:#334155;border-top:1px solid #e2e8f0;"><strong>Date:</strong> ${prettyDate}</td></tr>
                      <tr><td style="padding:12px 14px;font-size:14px;color:#334155;border-top:1px solid #e2e8f0;"><strong>Time:</strong> ${prettyTime}</td></tr>
                      <tr><td style="padding:12px 14px;font-size:14px;color:#334155;border-top:1px solid #e2e8f0;"><strong>Mode:</strong> ${mode || "Pending"}</td></tr>
                      ${code ? `<tr><td style="padding:12px 14px;font-size:14px;color:#334155;border-top:1px solid #e2e8f0;"><strong>Code:</strong> ${code}</td></tr>` : ""}
                    </table>
                    ${confirmationUrl ? `<p style="margin:18px 0 0;"><a href="${confirmationUrl}" style="display:inline-block;background:#0a5ea8;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px;">Confirm appointment</a></p>` : ""}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>
    `;

    await sendEmail({
      to,
      subject: "PharmaDerm - Confirm your appointment",
      text,
      html,
    });
    return res.json({ ok: true });
  })().catch((err) => {
    console.error("[email/appointment] error:", err?.message || err);
    return res.status(500).json({ ok: false, error: "Could not send appointment email" });
  });
});

app.post("/api/email/routine", requireAuth, (req, res) => {
  (async () => {
    const to = normalizeEmail(req.body?.to_email || req.auth?.email || "");
    if (!to) return res.status(400).json({ ok: false, error: "Missing recipient email" });
    const userName = String(req.body?.to_name || "Client").trim();
    const skinType = String(req.body?.skin_type || "").trim();
    const diagnosis = String(req.body?.diagnosis || "").trim();
    const morning = String(req.body?.morning_routine || "").trim();
    const night = String(req.body?.night_routine || "").trim();
    const recommended = String(req.body?.recommended_products || "").trim();

    const text = [
      `Hello ${userName},`,
      ``,
      `Here is your personalized PharmaDerm routine.`,
      skinType ? `Skin type: ${skinType}` : "",
      diagnosis ? `Main concern: ${diagnosis}` : "",
      ``,
      `Morning routine:`,
      morning || "Not specified",
      ``,
      `Night routine:`,
      night || "Not specified",
      ``,
      recommended ? `Recommended products: ${recommended}` : "",
      ``,
      `PharmaDerm`,
    ].filter(Boolean).join("\n");
    const html = `
      <div style="margin:0;padding:0;background:#f3f7fb;font-family:Arial,Helvetica,sans-serif;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:14px;border:1px solid #dbe7f3;overflow:hidden;">
                <tr>
                  <td style="background:#0a5ea8;color:#ffffff;padding:14px 24px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="width:56px;vertical-align:middle;">
                          <img src="${FRONTEND_URL}/logo-icon.png" alt="PharmaDerm" width="44" height="44" style="display:block;border:0;outline:none;text-decoration:none;border-radius:8px;background:#ffffff;padding:4px;" />
                        </td>
                        <td style="vertical-align:middle;font-size:20px;font-weight:700;color:#ffffff;padding-left:10px;">PharmaDerm</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:24px;color:#0f172a;">
                    <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;">Your personalized routine</h1>
                    <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#334155;">Hi ${userName || "Client"}, here is your PharmaDerm routine.</p>
                    ${skinType ? `<p style="margin:0 0 8px;font-size:14px;color:#334155;"><strong>Skin type:</strong> ${skinType}</p>` : ""}
                    ${diagnosis ? `<p style="margin:0 0 14px;font-size:14px;color:#334155;"><strong>Main concern:</strong> ${diagnosis}</p>` : ""}
                    <div style="margin:0 0 12px;padding:12px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
                      <p style="margin:0 0 6px;font-size:14px;color:#0f172a;"><strong>Morning routine</strong></p>
                      <p style="margin:0;font-size:14px;line-height:1.6;color:#334155;">${morning || "Not specified"}</p>
                    </div>
                    <div style="margin:0 0 12px;padding:12px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
                      <p style="margin:0 0 6px;font-size:14px;color:#0f172a;"><strong>Night routine</strong></p>
                      <p style="margin:0;font-size:14px;line-height:1.6;color:#334155;">${night || "Not specified"}</p>
                    </div>
                    ${recommended ? `<div style="padding:12px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;"><p style="margin:0 0 6px;font-size:14px;color:#0f172a;"><strong>Recommended products</strong></p><p style="margin:0;font-size:14px;line-height:1.6;color:#334155;">${recommended}</p></div>` : ""}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>
    `;

    await sendEmail({
      to,
      subject: "PharmaDerm - Your personalized routine",
      text,
      html,
    });
    return res.json({ ok: true });
  })().catch((err) => {
    console.error("[email/routine] error:", err?.message || err);
    return res.status(500).json({ ok: false, error: "Could not send routine email" });
  });
});

app.post("/api/email/order", requireAuth, (req, res) => {
  (async () => {
    const to = normalizeEmail(req.body?.to_email || req.auth?.email || "");
    if (!to) return res.status(400).json({ ok: false, error: "Missing recipient email" });
    const toName = String(req.body?.to_name || "Client").trim();
    const orderNumber = String(req.body?.order_number || "").trim();
    const orderTotal = String(req.body?.order_total || "").trim();
    const paymentMethod = String(req.body?.payment_method || "").trim();
    const deliveryMethod = String(req.body?.delivery_method || "").trim();
    const estimatedDelivery = String(req.body?.estimated_delivery || "").trim();
    const products = String(req.body?.products || "").trim();
    const shippingAddress = String(req.body?.shipping_address || "").trim();

    const text = [
      `Hello ${toName},`,
      ``,
      `Your order has been confirmed.`,
      orderNumber ? `Order number: ${orderNumber}` : "",
      orderTotal ? `Total: ${orderTotal}` : "",
      paymentMethod ? `Payment method: ${paymentMethod}` : "",
      deliveryMethod ? `Delivery method: ${deliveryMethod}` : "",
      estimatedDelivery ? `Estimated delivery: ${estimatedDelivery}` : "",
      shippingAddress ? `Shipping address: ${shippingAddress}` : "",
      ``,
      `Products:`,
      products || "No products provided",
      ``,
      `PharmaDerm`,
    ].filter(Boolean).join("\n");
    const html = `
      <div style="margin:0;padding:0;background:#f3f7fb;font-family:Arial,Helvetica,sans-serif;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:14px;border:1px solid #dbe7f3;overflow:hidden;">
                <tr>
                  <td style="background:#0a5ea8;color:#ffffff;padding:14px 24px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="width:56px;vertical-align:middle;">
                          <img src="${FRONTEND_URL}/logo-icon.png" alt="PharmaDerm" width="44" height="44" style="display:block;border:0;outline:none;text-decoration:none;border-radius:8px;background:#ffffff;padding:4px;" />
                        </td>
                        <td style="vertical-align:middle;font-size:20px;font-weight:700;color:#ffffff;padding-left:10px;">PharmaDerm</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:24px;color:#0f172a;">
                    <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;">Order confirmation</h1>
                    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155;">Hi ${toName || "Client"}, your order has been confirmed.</p>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e2e8f0;border-radius:10px;">
                      ${orderNumber ? `<tr><td style="padding:12px 14px;font-size:14px;color:#334155;"><strong>Order number:</strong> ${orderNumber}</td></tr>` : ""}
                      ${orderTotal ? `<tr><td style="padding:12px 14px;font-size:14px;color:#334155;border-top:1px solid #e2e8f0;"><strong>Total:</strong> ${orderTotal}</td></tr>` : ""}
                      ${paymentMethod ? `<tr><td style="padding:12px 14px;font-size:14px;color:#334155;border-top:1px solid #e2e8f0;"><strong>Payment method:</strong> ${paymentMethod}</td></tr>` : ""}
                      ${deliveryMethod ? `<tr><td style="padding:12px 14px;font-size:14px;color:#334155;border-top:1px solid #e2e8f0;"><strong>Delivery method:</strong> ${deliveryMethod}</td></tr>` : ""}
                      ${estimatedDelivery ? `<tr><td style="padding:12px 14px;font-size:14px;color:#334155;border-top:1px solid #e2e8f0;"><strong>Estimated delivery:</strong> ${estimatedDelivery}</td></tr>` : ""}
                      ${shippingAddress ? `<tr><td style="padding:12px 14px;font-size:14px;color:#334155;border-top:1px solid #e2e8f0;"><strong>Shipping address:</strong> ${shippingAddress}</td></tr>` : ""}
                    </table>
                    <div style="margin-top:16px;padding:12px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;font-size:14px;line-height:1.6;color:#334155;">
                      <strong>Products:</strong><br />
                      ${products || "No products provided"}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>
    `;

    await sendEmail({
      to,
      subject: "PharmaDerm - Order confirmation",
      text,
      html,
    });
    return res.json({ ok: true });
  })().catch((err) => {
    console.error("[email/order] error:", err?.message || err);
    return res.status(500).json({ ok: false, error: "Could not send order email" });
  });
});

app.get("/api/user/settings", requireAuth, (req, res) => {
  (async () => {
    if (USE_DB) {
      await ensureUserSettingsTable();
      const r = await dbQuery(
        `SELECT language, country_code, currency
         FROM user_app_settings
         WHERE user_key = $1
         LIMIT 1`,
        [String(req.auth.userId)]
      );
      const row = r.rows[0] || null;
      if (!row) return res.json({ language: "es", country: "DO", currency: "DOP" });
      return res.json({
        language: row.language || "es",
        country: row.country_code || "DO",
        currency: row.currency || "DOP",
      });
    }
    const all = readJson(settingsFile) || {};
    const row = all[String(req.auth.userId)] || {};
    return res.json({
      language: row.language || "es",
      country: row.country || "DO",
      currency: row.currency || "DOP",
    });
  })().catch((err) => {
    console.error("[user/settings/get] error:", err?.message || err);
    return res.status(500).json({ error: "Could not load settings" });
  });
});

app.put("/api/user/settings", requireAuth, (req, res) => {
  (async () => {
    const language = String(req.body?.language || "es").trim() || "es";
    const country = String(req.body?.country || "DO").trim() || "DO";
    const currency = String(req.body?.currency || "DOP").trim() || "DOP";

    if (USE_DB) {
      await ensureUserSettingsTable();
      await dbQuery(
        `INSERT INTO user_app_settings (user_key, language, country_code, currency, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (user_key)
         DO UPDATE SET
           language = EXCLUDED.language,
           country_code = EXCLUDED.country_code,
           currency = EXCLUDED.currency,
           updated_at = NOW()`,
        [String(req.auth.userId), language, country, currency]
      );
      return res.json({ ok: true, language, country, currency });
    }

    const all = readJson(settingsFile) || {};
    all[String(req.auth.userId)] = { language, country, currency, updated_at: new Date().toISOString() };
    writeJson(settingsFile, all);
    return res.json({ ok: true, language, country, currency });
  })().catch((err) => {
    console.error("[user/settings/put] error:", err?.message || err);
    return res.status(500).json({ error: "Could not save settings" });
  });
});

app.post("/api/orders", requireAuth, (req, res) => {
  (async () => {
    const payload = req.body || {};
    const orderNumber = String(payload.order_number || `PD-${Date.now().toString(36).toUpperCase()}`).trim();
    const userId = String(req.auth.userId);

    if (USE_DB) {
      await ensureOrdersTables();
      const r = await dbQuery(
        `INSERT INTO orders
         (order_number, user_id, customer_name, customer_email, customer_phone, address_line, city, country_code, payment_method, delivery_method, currency, subtotal, shipping, tax, discount, total, status, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
         RETURNING id, order_number`,
        [
          orderNumber,
          userId,
          payload.customer_name || null,
          payload.customer_email || null,
          payload.customer_phone || null,
          payload.address || payload.address_line || null,
          payload.city || null,
          payload.country_code || "DO",
          payload.payment_method || "card",
          payload.delivery_method || "delivery",
          payload.currency || "DOP",
          Number(payload.subtotal || 0),
          Number(payload.shipping || 0),
          Number(payload.tax || 0),
          Number(payload.discount || 0),
          Number(payload.total || 0),
          payload.status || "confirmed",
          payload.notes || null,
        ]
      );

      const created = r.rows[0];
      const orderId = created?.id;
      const items = Array.isArray(payload.items) ? payload.items : [];
      if (orderId && items.length) {
        for (const it of items) {
          const q = Math.max(1, Number(it.quantity || 1));
          const p = Number(it.priceRD || it.price || 0);
          await dbQuery(
            `INSERT INTO order_items
             (order_id, product_name, product_sku, product_image, size_label, quantity, unit_price_dop, subtotal)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              orderId,
              String(it.name || it.product_name || "Product"),
              it.sku || it.product_sku || null,
              it.image || null,
              it.size || it.size_label || null,
              q,
              p,
              Number((p * q).toFixed(2)),
            ]
          );
        }
      }
      return res.json({ ok: true, id: orderId, order_number: created?.order_number || orderNumber });
    }

    return res.json({ ok: true, id: Date.now(), order_number: orderNumber });
  })().catch((err) => {
    console.error("[orders/post] error:", err?.message || err);
    return res.status(500).json({ error: "Could not save order" });
  });
});

app.post("/api/subscribers", (req, res) => {
  (async () => {
    const email = normalizeEmail(req.body?.email || "");
    const phone = String(req.body?.phone || "").trim() || null;
    const consent = Boolean(req.body?.consent);
    if (!email) return res.status(400).json({ ok: false, error: "Email is required" });

    if (USE_DB) {
      await ensureSubscribersTable();
      const existing = await dbQuery(`SELECT id FROM newsletter_subscribers WHERE email = $1 LIMIT 1`, [email]);
      if (existing.rows[0]?.id) {
        await dbQuery(
          `UPDATE newsletter_subscribers
           SET phone = COALESCE($2, phone), consent = $3, updated_at = NOW()
           WHERE email = $1`,
          [email, phone, consent]
        );
        return res.json({ ok: true, alreadySubscribed: true });
      }
      await dbQuery(
        `INSERT INTO newsletter_subscribers (email, phone, consent, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW())`,
        [email, phone, consent]
      );
      return res.json({ ok: true, alreadySubscribed: false });
    }

    return res.json({ ok: true, alreadySubscribed: false });
  })().catch((err) => {
    console.error("[subscribers/post] error:", err?.message || err);
    return res.status(500).json({ ok: false, error: "Could not save subscriber" });
  });
});

app.get("/api/subscribers/status", (req, res) => {
  (async () => {
    const email = normalizeEmail(req.query?.email || "");
    if (!email) return res.status(400).json({ ok: false, error: "Email is required" });
    if (!USE_DB) return res.json({ ok: true, subscribed: false });

    await ensureSubscribersTable();
    const existing = await dbQuery(`SELECT id FROM newsletter_subscribers WHERE email = $1 LIMIT 1`, [email]);
    return res.json({ ok: true, subscribed: Boolean(existing.rows[0]?.id) });
  })().catch((err) => {
    console.error("[subscribers/status] error:", err?.message || err);
    return res.status(500).json({ ok: false, error: "Could not check subscriber status" });
  });
});

app.get("/api/history", requireAuth, (req, res) => {
  (async () => {
    if (!USE_DB) {
      return res.json({
        quiz_history: [],
        diagnostics_history: [],
        routines: [],
        appointments_list: [],
        orders: [],
        quiz_result: null,
        diagnostic_result: null,
        appointment: null,
      });
    }

    await ensureHistoryTable();
    const r = await dbQuery(`SELECT * FROM user_history_store WHERE user_key = $1 LIMIT 1`, [String(req.auth.userId)]);
    const row = r.rows[0];
    if (!row) {
      return res.json({
        quiz_history: [],
        diagnostics_history: [],
        routines: [],
        appointments_list: [],
        orders: [],
        quiz_result: null,
        diagnostic_result: null,
        appointment: null,
      });
    }
    return res.json({
      quiz_history: row.quiz_history || [],
      diagnostics_history: row.diagnostics_history || [],
      routines: row.routines || [],
      appointments_list: row.appointments_list || [],
      orders: row.orders || [],
      quiz_result: row.quiz_result || null,
      diagnostic_result: row.diagnostic_result || null,
      appointment: row.appointment || null,
      updated_at: row.updated_at || null,
    });
  })().catch((err) => {
    console.error("[history/get] error:", err?.message || err);
    res.status(500).json({ error: "Could not load history" });
  });
});

app.put("/api/history", requireAuth, (req, res) => {
  (async () => {
    if (!USE_DB) return res.json({ ok: true });
    await ensureHistoryTable();

    const payload = req.body || {};
    const quizHistory = Array.isArray(payload.quiz_history) ? payload.quiz_history : [];
    const diagnosticsHistory = Array.isArray(payload.diagnostics_history) ? payload.diagnostics_history : [];
    const routines = Array.isArray(payload.routines) ? payload.routines : [];
    const appointmentsList = Array.isArray(payload.appointments_list) ? payload.appointments_list : [];
    const orders = Array.isArray(payload.orders) ? payload.orders : [];
    const quizResult = payload.quiz_result ?? null;
    const diagnosticResult = payload.diagnostic_result ?? null;
    const appointment = payload.appointment ?? null;

    await dbQuery(
      `INSERT INTO user_history_store
       (user_key, quiz_history, diagnostics_history, routines, appointments_list, orders, quiz_result, diagnostic_result, appointment, updated_at)
       VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, NOW())
       ON CONFLICT (user_key)
       DO UPDATE SET
         quiz_history = EXCLUDED.quiz_history,
         diagnostics_history = EXCLUDED.diagnostics_history,
         routines = EXCLUDED.routines,
         appointments_list = EXCLUDED.appointments_list,
         orders = EXCLUDED.orders,
         quiz_result = EXCLUDED.quiz_result,
         diagnostic_result = EXCLUDED.diagnostic_result,
         appointment = EXCLUDED.appointment,
         updated_at = NOW()`,
      [
        String(req.auth.userId),
        JSON.stringify(quizHistory),
        JSON.stringify(diagnosticsHistory),
        JSON.stringify(routines),
        JSON.stringify(appointmentsList),
        JSON.stringify(orders),
        JSON.stringify(quizResult),
        JSON.stringify(diagnosticResult),
        JSON.stringify(appointment),
      ]
    );

    return res.json({ ok: true });
  })().catch((err) => {
    console.error("[history/put] error:", err?.message || err);
    res.status(500).json({ error: "Could not save history" });
  });
});

app.post("/api/quiz/save", requireAuth, (req, res) => {
  (async () => {
    if (!USE_DB) return res.status(400).json({ error: "Database mode is disabled" });

    const payload = req.body || {};
    const photoMeta = payload.photoMeta || {};
    const skinType = payload.skinType || null;
    const barrierReactivity = payload.answers?.barrierReactivity || null;
    const postCleanseFeel = payload.answers?.postCleanseFeel || null;
    const shinePattern = payload.answers?.shinePattern || null;
    const breakoutPattern = payload.answers?.breakoutPattern || null;
    const age = payload.age || null;

    // Best effort: resolve skin_type_id from catalog table when available.
    let skinTypeId = null;
    if (skinType) {
      try {
        const st = await dbQuery(`SELECT id FROM skin_types WHERE code = $1 LIMIT 1`, [skinType]);
        skinTypeId = st.rows[0]?.id || null;
      } catch {
        skinTypeId = null;
      }
    }

    const quizInsert = await dbQuery(
      `INSERT INTO quiz_sessions
       (user_id, skin_type_id, barrier_reactivity, post_cleanse_feel, shine_pattern, breakout_pattern, age, photo_meta, selfie_stored, completed)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, true)
       RETURNING id`,
      [
        req.auth.userId,
        skinTypeId,
        barrierReactivity,
        postCleanseFeel,
        shinePattern,
        breakoutPattern,
        age,
        JSON.stringify(photoMeta || {}),
        Boolean(payload.selfie),
      ]
    );

    const quizSessionId = quizInsert.rows[0]?.id;
    if (!quizSessionId) return res.status(500).json({ error: "Could not create quiz session" });

    await dbQuery(
      `INSERT INTO skin_analyses
       (quiz_session_id, user_id, primary_concern, profile_title, profile_summary, detailed_findings, routine_focus, metrics)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb)`,
      [
        quizSessionId,
        req.auth.userId,
        payload.primaryConcern || null,
        payload.profileTitle || null,
        payload.profileSummary || null,
        JSON.stringify(payload.detailedFindings || []),
        payload.routineFocus || null,
        JSON.stringify(payload.fullMetrics || []),
      ]
    );

    // Save selfie reference in quiz_images (same table used by frontend/Supabase flow).
    // If selfie is a data URL, we keep it as public_url so diagnostics can render it.
    if (payload.selfie) {
      try {
        await dbQuery(
          `INSERT INTO quiz_images
           (quiz_session_id, storage_path, public_url, is_selfie, face_detected, brightness)
           VALUES ($1, $2, $3, true, $4, $5)`,
          [
            quizSessionId,
            null,
            String(payload.selfie),
            Boolean(photoMeta?.faceDetected),
            Number(photoMeta?.brightness || 0) || null,
          ]
        );
      } catch (imgErr) {
        console.warn("[quiz/save] quiz_images insert failed:", imgErr?.message || imgErr);
      }
    }

    return res.json({ ok: true, quizSessionId });
  })().catch((err) => {
    console.error("[quiz/save] error:", err?.message || err);
    res.status(500).json({ error: "Could not save quiz in database" });
  });
});

app.get("/api/diagnostics/latest", requireAuth, (req, res) => {
  (async () => {
    if (!USE_DB) return res.json({ case: null, photos: [] });

    const c = await dbQuery(
      `SELECT * FROM diagnosis_cases WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [req.auth.userId]
    );
    const row = c.rows[0] || null;
    if (!row) return res.json({ case: null, photos: [] });

    const p = await dbQuery(
      `SELECT id, diagnosis_id, url, is_selfie, uploaded_at
       FROM diagnosis_photos
       WHERE diagnosis_id = $1
       ORDER BY uploaded_at ASC, id ASC`,
      [row.id]
    );

    return res.json({ case: row, photos: p.rows || [] });
  })().catch((err) => {
    console.error("[diagnostics/latest] error:", err?.message || err);
    res.status(500).json({ error: "Could not load diagnostics" });
  });
});

app.put("/api/diagnostics/latest", requireAuth, (req, res) => {
  (async () => {
    if (!USE_DB) return res.status(400).json({ error: "Database mode is disabled" });

    const form = req.body?.form || {};
    const generatedInsight = req.body?.generatedInsight || null;
    const imagePreviews = Array.isArray(req.body?.imagePreviews) ? req.body.imagePreviews : [];

    const existing = await dbQuery(
      `SELECT id FROM diagnosis_cases WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [req.auth.userId]
    );

    let diagnosisId = existing.rows[0]?.id || null;
    if (diagnosisId) {
      await dbQuery(
        `UPDATE diagnosis_cases
         SET description = $1,
             duration = $2,
             urgency = $3,
            symptoms = $4,
            affected_areas = $5,
            priorities = $6,
             routine_level = $7,
             previous_consult = $8,
             generated_insight = $9::jsonb,
             status = 'saved',
             updated_at = NOW()
         WHERE id = $10`,
        [
          form.description || null,
          form.duration || null,
          form.urgency || null,
          Array.isArray(form.symptoms) ? form.symptoms : [],
          Array.isArray(form.areas) ? form.areas : [],
          Array.isArray(form.priorities) ? form.priorities : [],
          form.routineLevel || null,
          form.previousConsult || null,
          JSON.stringify(generatedInsight || {}),
          diagnosisId,
        ]
      );
    } else {
      const ins = await dbQuery(
        `INSERT INTO diagnosis_cases
         (user_id, description, duration, urgency, symptoms, affected_areas, priorities, routine_level, previous_consult, generated_insight, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, 'saved')
         RETURNING id`,
        [
          req.auth.userId,
          form.description || null,
          form.duration || null,
          form.urgency || null,
          Array.isArray(form.symptoms) ? form.symptoms : [],
          Array.isArray(form.areas) ? form.areas : [],
          Array.isArray(form.priorities) ? form.priorities : [],
          form.routineLevel || null,
          form.previousConsult || null,
          JSON.stringify(generatedInsight || {}),
        ]
      );
      diagnosisId = ins.rows[0]?.id || null;
    }

    if (diagnosisId) {
      await dbQuery(`DELETE FROM diagnosis_photos WHERE diagnosis_id = $1 AND is_selfie = false`, [diagnosisId]);
      for (const url of imagePreviews) {
        if (!url) continue;
        await dbQuery(
          `INSERT INTO diagnosis_photos (diagnosis_id, url, is_selfie, uploaded_at)
           VALUES ($1, $2, false, NOW())`,
          [diagnosisId, String(url)]
        );
      }
    }

    return res.json({ ok: true, diagnosisId });
  })().catch((err) => {
    console.error("[diagnostics/save] error:", err?.message || err);
    res.status(500).json({ error: "Could not save diagnostics" });
  });
});

app.put("/api/diagnostics/step1", requireAuth, (req, res) => {
  (async () => {
    if (!USE_DB) return res.status(400).json({ error: "Database mode is disabled" });

    const form = req.body?.form || {};
    const generatedInsight = req.body?.generatedInsight || null;

    const existing = await dbQuery(
      `SELECT id FROM diagnosis_cases WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [req.auth.userId]
    );

    let diagnosisId = existing.rows[0]?.id || null;
    if (diagnosisId) {
      await dbQuery(
        `UPDATE diagnosis_cases
         SET description = $1,
             duration = $2,
             urgency = $3,
            symptoms = $4,
            affected_areas = $5,
            priorities = $6,
             routine_level = $7,
             previous_consult = $8,
             generated_insight = $9::jsonb,
             status = 'saved',
             updated_at = NOW()
         WHERE id = $10`,
        [
          form.description || null,
          form.duration || null,
          form.urgency || null,
          Array.isArray(form.symptoms) ? form.symptoms : [],
          Array.isArray(form.areas) ? form.areas : [],
          Array.isArray(form.priorities) ? form.priorities : [],
          form.routineLevel || null,
          form.previousConsult || null,
          JSON.stringify(generatedInsight || {}),
          diagnosisId,
        ]
      );
    } else {
      const ins = await dbQuery(
        `INSERT INTO diagnosis_cases
         (user_id, description, duration, urgency, symptoms, affected_areas, priorities, routine_level, previous_consult, generated_insight, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, 'saved')
         RETURNING id`,
        [
          req.auth.userId,
          form.description || null,
          form.duration || null,
          form.urgency || null,
          Array.isArray(form.symptoms) ? form.symptoms : [],
          Array.isArray(form.areas) ? form.areas : [],
          Array.isArray(form.priorities) ? form.priorities : [],
          form.routineLevel || null,
          form.previousConsult || null,
          JSON.stringify(generatedInsight || {}),
        ]
      );
      diagnosisId = ins.rows[0]?.id || null;
    }

    return res.json({ ok: true, diagnosisId });
  })().catch((err) => {
    console.error("[diagnostics/step1] error:", err?.message || err);
    res.status(500).json({ error: "Could not save diagnostic step 1" });
  });
});

app.put("/api/diagnostics/photos", requireAuth, (req, res) => {
  (async () => {
    if (!USE_DB) return res.status(400).json({ error: "Database mode is disabled" });
    const imagePreviews = Array.isArray(req.body?.imagePreviews) ? req.body.imagePreviews : [];

    const existing = await dbQuery(
      `SELECT id FROM diagnosis_cases WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [req.auth.userId]
    );
    const diagnosisId = existing.rows[0]?.id || null;
    if (!diagnosisId) return res.status(400).json({ error: "Save step 1 first" });

    await dbQuery(`DELETE FROM diagnosis_photos WHERE diagnosis_id = $1 AND is_selfie = false`, [diagnosisId]);
    for (const url of imagePreviews) {
      if (!url) continue;
      await dbQuery(
        `INSERT INTO diagnosis_photos (diagnosis_id, url, is_selfie, uploaded_at)
         VALUES ($1, $2, false, NOW())`,
        [diagnosisId, String(url)]
      );
    }

    return res.json({ ok: true, diagnosisId });
  })().catch((err) => {
    console.error("[diagnostics/photos] error:", err?.message || err);
    res.status(500).json({ error: "Could not save photos" });
  });
});

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT} | DB mode: ${USE_DB ? "ON" : "OFF"}`);
});

