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

if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
if (!existsSync(usersFile)) writeFileSync(usersFile, "[]", "utf8");
if (!existsSync(resetTokensFile)) writeFileSync(resetTokensFile, "[]", "utf8");
if (!existsSync(verifyTokensFile)) writeFileSync(verifyTokensFile, "[]", "utf8");
if (!existsSync(cartsFile)) writeFileSync(cartsFile, "{}", "utf8");

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

function normalizeEmail(email = "") {
  return String(email).trim().toLowerCase();
}

function pickFirst(obj, keys = [], fallback = null) {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return fallback;
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

async function sendEmail({ to, subject, text }) {
  if (BREVO_API_KEY) {
    const from = parseFromHeader();
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
      }),
    });
    if (!res.ok) {
      const errTxt = await res.text().catch(() => "");
      throw new Error(`Brevo API error ${res.status}: ${errTxt}`);
    }
    return;
  }

  const transporter = getMailer();
  if (!transporter) throw new Error("No email provider configured");
  const from = process.env.SMTP_FROM || "PharmaDerm <no-reply@pharmaderm.com>";
  await Promise.race([
    transporter.sendMail({ from, to, subject, text }),
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

  try {
    await sendEmail({
      to: user.email,
      subject: "PharmaDerm - Verify your email",
      text: `Please verify your account using this link: ${verifyLink}`,
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
      `INSERT INTO users (email, password_hash, first_name, last_name, phone, email_verified)
       VALUES ($1, $2, $3, $4, $5, false)
       RETURNING id, email, first_name AS nombre, last_name AS apellido, phone AS telefono, email_verified AS "emailVerified"`,
      [email, passwordHash, String(Nombre).trim(), String(Apellido).trim(), Telefono ? String(Telefono).trim() : null]
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
    try {
      await sendEmail({
        to: found.email,
        subject: "PharmaDerm - Restablecer contrasena",
        text: `Usa este enlace para restablecer tu contrasena: ${resetLink}`,
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

