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
    })
  : null;

function buildAllowedOrigins() {
  const set = new Set(
    String(process.env.FRONTEND_URLS || "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean)
  );
  if (FRONTEND_URL) set.add(FRONTEND_URL);
  set.add("http://localhost:5173");
  return set;
}

const allowedOrigins = buildAllowedOrigins();

function isAllowedOrigin(origin = "") {
  if (!origin) return true;
  if (allowedOrigins.has(origin)) return true;
  if (/^https:\/\/pharma-derm-frontendes-[a-z0-9-]+-lewin-martinezs-projects\.vercel\.app$/i.test(origin)) {
    return true;
  }
  return false;
}

app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) return callback(null, true);
      return callback(new Error("Not allowed by CORS"));
    },
  })
);
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

async function dbQuery(text, params = []) {
  if (!pool) throw new Error("DATABASE_URL is not configured");
  return pool.query(text, params);
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

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "pharmaderm-backend", useDb: USE_DB });
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
    const r = await dbQuery(
      `SELECT id, email, password_hash AS "passwordHash", email_verified AS "emailVerified",
              first_name AS nombre, last_name AS apellido, phone AS telefono
       FROM users WHERE email = $1 LIMIT 1`,
      [email]
    );
    found = r.rows[0] || null;
  } else {
    const users = readJson(usersFile);
    found = users.find((u) => u.email === email) || null;
  }

  if (!found) return res.status(401).json({ error: "Invalid credentials" });
  const valid = await bcrypt.compare(password, found.passwordHash);
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

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT} | DB mode: ${USE_DB ? "ON" : "OFF"}`);
});
