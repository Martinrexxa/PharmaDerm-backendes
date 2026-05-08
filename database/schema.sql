-- PharmaDerm Database Schema
-- PostgreSQL 15+ | Supabase-compatible
-- Execute ONCE in the Supabase SQL Editor (Dashboard â†’ SQL Editor â†’ New query)
-- =====================================================================

-- =====================================================================
-- EXTENSIONS
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================================
-- HELPER: auto-update updated_at on any table that has the column
-- =====================================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- =====================================================================
-- 1. LOOKUP / REFERENCE TABLES
-- =====================================================================

CREATE TABLE IF NOT EXISTS roles (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(50) UNIQUE NOT NULL,   -- 'admin','customer','staff'
  description TEXT
);

CREATE TABLE IF NOT EXISTS countries (
  code     CHAR(2) PRIMARY KEY,              -- ISO 3166-1 alpha-2
  name     VARCHAR(120) NOT NULL,
  currency CHAR(3) NOT NULL                  -- default currency for this country
);

CREATE TABLE IF NOT EXISTS currencies (
  code                 CHAR(3) PRIMARY KEY,  -- ISO 4217
  name                 VARCHAR(80) NOT NULL,
  symbol               VARCHAR(10) NOT NULL,
  exchange_rate_to_usd NUMERIC(14,6) NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS skin_types (
  id             SERIAL PRIMARY KEY,
  code           VARCHAR(20) UNIQUE NOT NULL, -- 'seca','normal','mixta','grasa'
  name_es        VARCHAR(60) NOT NULL,
  name_en        VARCHAR(60) NOT NULL,
  description_es TEXT,
  description_en TEXT
);

CREATE TABLE IF NOT EXISTS skin_concerns (
  id      SERIAL PRIMARY KEY,
  code    VARCHAR(40) UNIQUE NOT NULL,
  name_es VARCHAR(80) NOT NULL,
  name_en VARCHAR(80) NOT NULL
);

CREATE TABLE IF NOT EXISTS appointment_types (
  id          SERIAL PRIMARY KEY,
  code        VARCHAR(40) UNIQUE NOT NULL,
  name_es     VARCHAR(80) NOT NULL,
  name_en     VARCHAR(80) NOT NULL,
  description TEXT,
  is_virtual  BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS payment_method_types (
  id        SERIAL PRIMARY KEY,
  code      VARCHAR(30) UNIQUE NOT NULL,  -- 'card','transfer','cash'
  name_es   VARCHAR(60) NOT NULL,
  name_en   VARCHAR(60) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE
);

-- =====================================================================
-- 2. USERS
-- =====================================================================

CREATE TABLE IF NOT EXISTS users (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email              VARCHAR(254) UNIQUE NOT NULL,
  password_hash      TEXT,                      -- null when using Supabase Auth
  role_id            INTEGER REFERENCES roles(id) DEFAULT 2,
  first_name         VARCHAR(80),
  last_name          VARCHAR(80),
  phone              VARCHAR(30),
  country_code       CHAR(2) REFERENCES countries(code) DEFAULT 'DO',
  preferred_lang     CHAR(2) DEFAULT 'es',
  preferred_currency CHAR(3) REFERENCES currencies(code) DEFAULT 'DOP',
  is_active          BOOLEAN DEFAULT TRUE,
  email_verified     BOOLEAN DEFAULT FALSE,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW(),
  deleted_at         TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  ip_address  INET,
  user_agent  TEXT
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id      UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  is_dark      BOOLEAN DEFAULT FALSE,
  language     CHAR(2) DEFAULT 'es',
  country_code CHAR(2) REFERENCES countries(code) DEFAULT 'DO',
  currency     CHAR(3) REFERENCES currencies(code) DEFAULT 'DOP',
  email_promo  BOOLEAN DEFAULT TRUE,
  email_orders BOOLEAN DEFAULT TRUE,
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS addresses (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label          VARCHAR(60),               -- 'Casa','Trabajo'
  full_name      VARCHAR(160),
  phone          VARCHAR(30),
  address_line_1 TEXT NOT NULL,
  address_line_2 TEXT,
  city           VARCHAR(80) NOT NULL,
  state          VARCHAR(80),
  postal_code    VARCHAR(20),
  country_code   CHAR(2) REFERENCES countries(code) DEFAULT 'DO',
  is_default     BOOLEAN DEFAULT FALSE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- 3. PRODUCT CATALOG
-- =====================================================================

CREATE TABLE IF NOT EXISTS brands (
  id             SERIAL PRIMARY KEY,
  slug           VARCHAR(80) UNIQUE NOT NULL,
  name           VARCHAR(120) NOT NULL,
  description    TEXT,
  country_origin CHAR(2),
  logo_url       TEXT,
  is_active      BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS product_categories (
  id         SERIAL PRIMARY KEY,
  slug       VARCHAR(80) UNIQUE NOT NULL,
  name_es    VARCHAR(80) NOT NULL,
  name_en    VARCHAR(80) NOT NULL,
  parent_id  INTEGER REFERENCES product_categories(id),
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS product_lines (
  id          SERIAL PRIMARY KEY,
  brand_id    INTEGER NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  slug        VARCHAR(80) UNIQUE NOT NULL,
  name        VARCHAR(120) NOT NULL,
  description TEXT,
  is_active   BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS products (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug          VARCHAR(160) UNIQUE NOT NULL,
  brand_id      INTEGER REFERENCES brands(id),
  category_id   INTEGER REFERENCES product_categories(id),
  line_id       INTEGER REFERENCES product_lines(id),
  name          VARCHAR(200) NOT NULL,
  name_en       VARCHAR(200),
  short_desc    TEXT,
  short_desc_en TEXT,
  long_desc     TEXT,
  long_desc_en  TEXT,
  price_dop     NUMERIC(10,2) NOT NULL DEFAULT 0,
  price_usd     NUMERIC(10,4),
  compare_price NUMERIC(10,2),
  sku           VARCHAR(80),
  barcode       VARCHAR(80),
  size_label    VARCHAR(40),
  rating        NUMERIC(3,2) DEFAULT 0,
  review_count  INTEGER DEFAULT 0,
  is_active     BOOLEAN DEFAULT TRUE,
  is_featured   BOOLEAN DEFAULT FALSE,
  stock         INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS product_images (
  id         SERIAL PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  alt_text   VARCHAR(200),
  sort_order INTEGER DEFAULT 0,
  is_primary BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS product_sizes (
  id         SERIAL PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  label      VARCHAR(40) NOT NULL,  -- '150ML','340G','Kit'
  sku        VARCHAR(80),
  price_dop  NUMERIC(10,2),
  stock      INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS product_ingredients (
  id              SERIAL PRIMARY KEY,
  product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  ingredient_name VARCHAR(120) NOT NULL,
  inci_name       VARCHAR(120),
  purpose         VARCHAR(120),
  is_key          BOOLEAN DEFAULT FALSE,
  sort_order      INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS product_benefits (
  id         SERIAL PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  benefit_es VARCHAR(200) NOT NULL,
  benefit_en VARCHAR(200),
  icon       VARCHAR(60),            -- material-icons name
  sort_order INTEGER DEFAULT 0
);

-- Bridge: product â†” skin_type (M2M)
CREATE TABLE IF NOT EXISTS product_skin_types (
  product_id   UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  skin_type_id INTEGER NOT NULL REFERENCES skin_types(id),
  PRIMARY KEY (product_id, skin_type_id)
);

-- Bridge: product â†” skin_concern (M2M)
CREATE TABLE IF NOT EXISTS product_concern_tags (
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  concern_id INTEGER NOT NULL REFERENCES skin_concerns(id),
  PRIMARY KEY (product_id, concern_id)
);

-- Recommendation rules: which products to suggest for a quiz result
CREATE TABLE IF NOT EXISTS product_recommendations (
  id             SERIAL PRIMARY KEY,
  product_id     UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  skin_type_code VARCHAR(20) REFERENCES skin_types(code),    -- NULL = all types
  concern_code   VARCHAR(40) REFERENCES skin_concerns(code), -- NULL = all concerns
  time_of_day    VARCHAR(10),  -- 'morning','night','both', NULL = either
  priority       SMALLINT DEFAULT 5,  -- 1 = highest priority shown first
  reason_es      TEXT,
  reason_en      TEXT
);

CREATE TABLE IF NOT EXISTS product_reviews (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id   UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  rating       SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title        VARCHAR(200),
  body         TEXT,
  is_verified  BOOLEAN DEFAULT FALSE,
  is_published BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_faqs (
  id          SERIAL PRIMARY KEY,
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  question_es TEXT NOT NULL,
  answer_es   TEXT NOT NULL,
  question_en TEXT,
  answer_en   TEXT,
  sort_order  INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS product_safety_info (
  product_id           UUID PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  suitable_for         TEXT[],
  not_for              TEXT[],
  fragrance_free       BOOLEAN DEFAULT FALSE,
  paraben_free         BOOLEAN DEFAULT FALSE,
  dermatologist_tested BOOLEAN DEFAULT FALSE,
  allergy_tested       BOOLEAN DEFAULT FALSE,
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- Bridge: product â†” paired product (M2M, complementary products)
CREATE TABLE IF NOT EXISTS product_pairings (
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  paired_with UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  reason_es   VARCHAR(200),
  reason_en   VARCHAR(200),
  sort_order  INTEGER DEFAULT 0,
  PRIMARY KEY (product_id, paired_with)
);

-- =====================================================================
-- 4. FAVORITES  (replaces wishlist)
-- =====================================================================

CREATE TABLE IF NOT EXISTS favorites (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  added_at   TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, product_id)
);

-- =====================================================================
-- 5. QUIZ & SKIN ANALYSIS
-- =====================================================================

CREATE TABLE IF NOT EXISTS quiz_questions (
  id          SERIAL PRIMARY KEY,
  code        VARCHAR(40) UNIQUE NOT NULL, -- matches Vue step keys
  question_es TEXT NOT NULL,
  question_en TEXT,
  type        VARCHAR(20) DEFAULT 'single', -- 'single','multi','scale'
  sort_order  INTEGER DEFAULT 0,
  is_active   BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS quiz_question_options (
  id          SERIAL PRIMARY KEY,
  question_id INTEGER NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
  value       VARCHAR(40) NOT NULL,
  label_es    VARCHAR(120) NOT NULL,
  label_en    VARCHAR(120),
  emoji       VARCHAR(10),
  sort_order  INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS quiz_sessions (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id            UUID REFERENCES users(id) ON DELETE SET NULL,
  session_key        VARCHAR(80),               -- for anonymous users
  skin_type_id       INTEGER REFERENCES skin_types(id),
  barrier_reactivity VARCHAR(30),               -- 'resilient','mild','reactive','very_reactive'
  post_cleanse_feel  VARCHAR(30),
  shine_pattern      VARCHAR(30),
  breakout_pattern   VARCHAR(30),
  age                SMALLINT,
  photo_meta         JSONB,                     -- { brightness, contrast, faceDetected }
  selfie_stored      BOOLEAN DEFAULT FALSE,
  completed          BOOLEAN DEFAULT FALSE,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quiz_images (
  id              SERIAL PRIMARY KEY,
  quiz_session_id UUID NOT NULL REFERENCES quiz_sessions(id) ON DELETE CASCADE,
  storage_path    TEXT,                 -- Supabase Storage object path
  public_url      TEXT,
  is_selfie       BOOLEAN DEFAULT TRUE,
  face_detected   BOOLEAN,
  brightness      NUMERIC(5,2),
  uploaded_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS skin_analyses (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quiz_session_id   UUID NOT NULL REFERENCES quiz_sessions(id) ON DELETE CASCADE,
  user_id           UUID REFERENCES users(id) ON DELETE SET NULL,
  primary_concern   VARCHAR(40),
  profile_title     VARCHAR(200),
  profile_summary   TEXT,
  detailed_findings JSONB,
  routine_focus     TEXT,
  metrics           JSONB,               -- array of { key, label, score, note }
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quiz_analysis_metrics (
  id          SERIAL PRIMARY KEY,
  analysis_id UUID NOT NULL REFERENCES skin_analyses(id) ON DELETE CASCADE,
  metric_key  VARCHAR(40) NOT NULL,     -- 'barrera','deshidratacion','poros'
  label_es    VARCHAR(80) NOT NULL,
  score       NUMERIC(4,2) NOT NULL CHECK (score BETWEEN 0 AND 10),
  note_es     VARCHAR(120),
  is_summary  BOOLEAN DEFAULT FALSE     -- TRUE = shown in summary card
);

-- =====================================================================
-- 6. ROUTINES
-- =====================================================================

CREATE TABLE IF NOT EXISTS routines (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  analysis_id    UUID REFERENCES skin_analyses(id) ON DELETE SET NULL,
  name           VARCHAR(200),
  primary_concern VARCHAR(40),
  skin_type_code VARCHAR(20),
  is_active      BOOLEAN DEFAULT TRUE,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS routine_steps (
  id          SERIAL PRIMARY KEY,
  routine_id  UUID NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
  time_of_day VARCHAR(10) NOT NULL,    -- 'morning','night'
  step_number SMALLINT NOT NULL,
  product_id  UUID REFERENCES products(id) ON DELETE SET NULL,
  category    VARCHAR(40),            -- 'LIMPIEZA','TRATAMIENTO','HUMECTAR','PROTEGER'
  note        TEXT
);

-- Bridge: routine â†” products (M2M, flat lookup without step ordering)
CREATE TABLE IF NOT EXISTS routine_products (
  routine_id  UUID NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  time_of_day VARCHAR(10) DEFAULT 'both',  -- 'morning','night','both'
  step_number SMALLINT,
  added_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (routine_id, product_id)
);

CREATE TABLE IF NOT EXISTS routine_history (
  id          BIGSERIAL PRIMARY KEY,
  routine_id  UUID NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  snapshot    JSONB NOT NULL,          -- full routine_steps snapshot
  archived_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- 7. BANK ACCOUNTS  (used in transfer payment instructions)
-- =====================================================================

CREATE TABLE IF NOT EXISTS bank_accounts (
  id             SERIAL PRIMARY KEY,
  bank_name      VARCHAR(120) NOT NULL,
  account_holder VARCHAR(160) NOT NULL,
  account_number VARCHAR(40) NOT NULL,
  account_type   VARCHAR(40),          -- 'Cta. Corriente','Cta. de Ahorros'
  currency       CHAR(3) REFERENCES currencies(code) DEFAULT 'DOP',
  is_active      BOOLEAN DEFAULT TRUE,
  sort_order     INTEGER DEFAULT 0
);

-- =====================================================================
-- 8. CART & ORDERS
-- =====================================================================

CREATE TABLE IF NOT EXISTS carts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  session_key VARCHAR(80),             -- for anonymous cart
  currency    CHAR(3) REFERENCES currencies(code) DEFAULT 'DOP',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cart_items (
  id             SERIAL PRIMARY KEY,
  cart_id        UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  product_id     UUID NOT NULL REFERENCES products(id),
  size_label     VARCHAR(40),
  quantity       INTEGER NOT NULL DEFAULT 1,
  unit_price_dop NUMERIC(10,2) NOT NULL,
  added_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number    VARCHAR(30) UNIQUE NOT NULL,
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  customer_name   VARCHAR(160) NOT NULL,
  customer_email  VARCHAR(254) NOT NULL,
  customer_phone  VARCHAR(30),
  address_line    TEXT,
  city            VARCHAR(80),
  country_code    CHAR(2) REFERENCES countries(code) DEFAULT 'DO',
  payment_method  VARCHAR(30),         -- 'card','transfer','cash'
  delivery_method VARCHAR(30) DEFAULT 'delivery',
  currency        CHAR(3) REFERENCES currencies(code) DEFAULT 'DOP',
  subtotal        NUMERIC(12,2) NOT NULL,
  shipping        NUMERIC(10,2) DEFAULT 0,
  tax             NUMERIC(10,2) DEFAULT 0,   -- ITBIS 18%
  discount        NUMERIC(10,2) DEFAULT 0,
  total           NUMERIC(12,2) NOT NULL,
  status          VARCHAR(30) DEFAULT 'pending',  -- 'pending','confirmed','shipped','delivered','cancelled'
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id             SERIAL PRIMARY KEY,
  order_id       UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id     UUID REFERENCES products(id) ON DELETE SET NULL,
  -- snapshot at time of purchase:
  product_name   VARCHAR(200) NOT NULL,
  product_sku    VARCHAR(80),
  size_label     VARCHAR(40),
  quantity       INTEGER NOT NULL DEFAULT 1,
  unit_price_dop NUMERIC(10,2) NOT NULL,
  subtotal       NUMERIC(12,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id         UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  method           VARCHAR(30) NOT NULL,
  bank_name        VARCHAR(80),
  reference_number VARCHAR(120),
  receipt_url      TEXT,
  amount           NUMERIC(12,2) NOT NULL,
  currency         CHAR(3) DEFAULT 'DOP',
  status           VARCHAR(30) DEFAULT 'pending',  -- 'pending','confirmed','failed','refunded'
  processed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoices (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id       UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  invoice_number VARCHAR(30) UNIQUE NOT NULL,
  issued_at      TIMESTAMPTZ DEFAULT NOW(),
  due_at         TIMESTAMPTZ,
  customer_name  VARCHAR(160),
  customer_rnc   VARCHAR(20),           -- RNC/Cédula for fiscal receipt
  subtotal       NUMERIC(12,2) NOT NULL,
  tax            NUMERIC(10,2) DEFAULT 0,
  total          NUMERIC(12,2) NOT NULL,
  currency       CHAR(3) DEFAULT 'DOP',
  status         VARCHAR(20) DEFAULT 'issued',  -- 'issued','paid','cancelled'
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_status_history (
  id         BIGSERIAL PRIMARY KEY,
  order_id   UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status     VARCHAR(30) NOT NULL,
  note       TEXT,
  changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS promo_codes (
  id             SERIAL PRIMARY KEY,
  code           VARCHAR(40) UNIQUE NOT NULL,
  description    VARCHAR(200),
  discount_type  VARCHAR(20) NOT NULL DEFAULT 'percent',  -- 'percent','fixed_dop'
  discount_value NUMERIC(10,2) NOT NULL,
  min_order_dop  NUMERIC(10,2) DEFAULT 0,
  max_uses       INTEGER,
  used_count     INTEGER DEFAULT 0,
  valid_from     TIMESTAMPTZ,
  valid_until    TIMESTAMPTZ,
  is_active      BOOLEAN DEFAULT TRUE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS promo_code_uses (
  id               BIGSERIAL PRIMARY KEY,
  promo_id         INTEGER NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
  user_id          UUID REFERENCES users(id) ON DELETE SET NULL,
  order_id         UUID REFERENCES orders(id) ON DELETE SET NULL,
  discount_applied NUMERIC(10,2) NOT NULL,
  used_at          TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- 9. APPOINTMENTS & DIAGNOSIS
-- =====================================================================

CREATE TABLE IF NOT EXISTS dermatologists (
  id                SERIAL PRIMARY KEY,
  name              VARCHAR(160) NOT NULL,
  specialty         VARCHAR(200),
  mode              VARCHAR(40),          -- 'Virtual','In person','Both'
  location          VARCHAR(160),
  availability_note VARCHAR(200),
  rating            NUMERIC(3,2) DEFAULT 5.0,
  photo_url         TEXT,
  is_active         BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS dermatologist_schedules (
  id               SERIAL PRIMARY KEY,
  dermatologist_id INTEGER NOT NULL REFERENCES dermatologists(id) ON DELETE CASCADE,
  day_of_week      SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),  -- 0=Sun
  start_time       TIME NOT NULL,
  end_time         TIME NOT NULL,
  slot_minutes     SMALLINT DEFAULT 30
);

CREATE TABLE IF NOT EXISTS appointments (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID REFERENCES users(id) ON DELETE SET NULL,
  dermatologist_id  INTEGER REFERENCES dermatologists(id),
  appointment_type  VARCHAR(40),
  mode              VARCHAR(30),
  scheduled_date    DATE,
  scheduled_time    TIME,
  reason            TEXT,
  notes             TEXT,
  urgency           VARCHAR(20) DEFAULT 'Low',
  status            VARCHAR(30) DEFAULT 'pending',  -- 'pending','confirmed','completed','cancelled'
  confirmation_code VARCHAR(30),
  analysis_id       UUID REFERENCES skin_analyses(id),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS appointment_notes (
  id             SERIAL PRIMARY KEY,
  appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  author_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  body           TEXT NOT NULL,
  is_private     BOOLEAN DEFAULT FALSE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS diagnosis_cases (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID REFERENCES users(id) ON DELETE SET NULL,
  appointment_id    UUID REFERENCES appointments(id),
  analysis_id       UUID REFERENCES skin_analyses(id),
  description       TEXT,
  duration          VARCHAR(60),
  urgency           VARCHAR(20),
  symptoms          TEXT[],
  affected_areas    TEXT[],
  priorities        TEXT[],
  routine_level     VARCHAR(40),
  previous_consult  VARCHAR(40),
  generated_insight JSONB,
  status            VARCHAR(30) DEFAULT 'draft',
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS diagnosis_photos (
  id           SERIAL PRIMARY KEY,
  diagnosis_id UUID NOT NULL REFERENCES diagnosis_cases(id) ON DELETE CASCADE,
  url          TEXT NOT NULL,
  is_selfie    BOOLEAN DEFAULT FALSE,
  uploaded_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Bridge: diagnosis â†” product (products recommended by the dermatologist)
CREATE TABLE IF NOT EXISTS diagnosis_products (
  diagnosis_id UUID NOT NULL REFERENCES diagnosis_cases(id) ON DELETE CASCADE,
  product_id   UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  note_es      TEXT,
  sort_order   INTEGER DEFAULT 0,
  PRIMARY KEY (diagnosis_id, product_id)
);

CREATE TABLE IF NOT EXISTS diagnosis_recommendations (
  id           SERIAL PRIMARY KEY,
  diagnosis_id UUID NOT NULL REFERENCES diagnosis_cases(id) ON DELETE CASCADE,
  rec_type     VARCHAR(30) NOT NULL,  -- 'product','ingredient','avoid','lifestyle'
  text_es      TEXT NOT NULL,
  text_en      TEXT,
  sort_order   INTEGER DEFAULT 0
);

-- =====================================================================
-- 10. CONTENT
-- =====================================================================

CREATE TABLE IF NOT EXISTS expert_articles (
  id            SERIAL PRIMARY KEY,
  slug          VARCHAR(120) UNIQUE NOT NULL,
  category      VARCHAR(60),
  title_es      VARCHAR(200) NOT NULL,
  title_en      VARCHAR(200),
  excerpt_es    TEXT,
  excerpt_en    TEXT,
  body_es       TEXT,
  body_en       TEXT,
  read_time_min SMALLINT DEFAULT 3,
  icon          VARCHAR(60),           -- material-icons name
  is_published  BOOLEAN DEFAULT TRUE,
  sort_order    INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS story_milestones (
  id             SERIAL PRIMARY KEY,
  year           SMALLINT NOT NULL,
  title_es       VARCHAR(200),
  title_en       VARCHAR(200),
  description_es TEXT,
  description_en TEXT,
  sort_order     INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS story_sections (
  id         SERIAL PRIMARY KEY,
  slug       VARCHAR(80) UNIQUE NOT NULL,
  type       VARCHAR(30),   -- 'hero','mission','vision','values','team'
  title_es   VARCHAR(200),
  title_en   VARCHAR(200),
  body_es    TEXT,
  body_en    TEXT,
  image_url  TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active  BOOLEAN DEFAULT TRUE
);

-- =====================================================================
-- 11. NOTIFICATIONS
-- =====================================================================

CREATE TABLE IF NOT EXISTS user_notifications (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       VARCHAR(60) NOT NULL,  -- 'order_update','appointment_reminder','promo'
  title      VARCHAR(200) NOT NULL,
  body       TEXT,
  is_read    BOOLEAN DEFAULT FALSE,
  action_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id               UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  order_updates         BOOLEAN DEFAULT TRUE,
  appointment_reminders BOOLEAN DEFAULT TRUE,
  routine_tips          BOOLEAN DEFAULT TRUE,
  promos                BOOLEAN DEFAULT TRUE,
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- 12. MISC / AUDIT
-- =====================================================================

CREATE TABLE IF NOT EXISTS email_logs (
  id             BIGSERIAL PRIMARY KEY,
  type           VARCHAR(60) NOT NULL,  -- 'order_confirmation','appointment_confirmation','routine_ready'
  to_email       VARCHAR(254) NOT NULL,
  order_id       UUID REFERENCES orders(id) ON DELETE SET NULL,
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  routine_id     UUID REFERENCES routines(id) ON DELETE SET NULL,
  status         VARCHAR(20) DEFAULT 'pending',  -- 'pending','sent','failed'
  provider       VARCHAR(30) DEFAULT 'emailjs',
  error_message  TEXT,
  sent_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exchange_rate_logs (
  id            BIGSERIAL PRIMARY KEY,
  from_currency CHAR(3) NOT NULL,
  to_currency   CHAR(3) NOT NULL,
  rate          NUMERIC(14,6) NOT NULL,
  source        VARCHAR(60) DEFAULT 'manual',
  recorded_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS review_votes (
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  review_id UUID NOT NULL REFERENCES product_reviews(id) ON DELETE CASCADE,
  is_helpful BOOLEAN NOT NULL,
  voted_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, review_id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGSERIAL PRIMARY KEY,
  actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  action      VARCHAR(80) NOT NULL,   -- 'order.created','user.updated'
  entity_type VARCHAR(60),
  entity_id   TEXT,
  payload     JSONB,
  ip_address  INET,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- TRIGGERS: auto-update updated_at
-- =====================================================================

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_user_settings_updated_at
  BEFORE UPDATE ON user_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_routines_updated_at
  BEFORE UPDATE ON routines FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_carts_updated_at
  BEFORE UPDATE ON carts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_diagnosis_cases_updated_at
  BEFORE UPDATE ON diagnosis_cases FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_notification_prefs_updated_at
  BEFORE UPDATE ON notification_preferences FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_product_safety_updated_at
  BEFORE UPDATE ON product_safety_info FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================
-- INDEXES
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_users_email               ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_active              ON users(is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_products_slug             ON products(slug);
CREATE INDEX IF NOT EXISTS idx_products_brand            ON products(brand_id);
CREATE INDEX IF NOT EXISTS idx_products_category         ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_line             ON products(line_id);
CREATE INDEX IF NOT EXISTS idx_products_active           ON products(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_products_featured         ON products(is_featured) WHERE is_featured = TRUE;
CREATE INDEX IF NOT EXISTS idx_product_recs              ON product_recommendations(product_id, skin_type_code, concern_code);
CREATE INDEX IF NOT EXISTS idx_quiz_user                 ON quiz_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_images_session       ON quiz_images(quiz_session_id);
CREATE INDEX IF NOT EXISTS idx_analysis_quiz             ON skin_analyses(quiz_session_id);
CREATE INDEX IF NOT EXISTS idx_analysis_user             ON skin_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_routines_user             ON routines(user_id);
CREATE INDEX IF NOT EXISTS idx_carts_user                ON carts(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_user               ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status             ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created            ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order         ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_order            ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_order            ON invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_appointments_user         ON appointments(user_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date         ON appointments(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_diagnosis_user            ON diagnosis_cases(user_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_order          ON email_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_routine        ON email_logs(routine_id);
CREATE INDEX IF NOT EXISTS idx_order_status_history      ON order_status_history(order_id);
CREATE INDEX IF NOT EXISTS idx_promo_uses_order          ON promo_code_uses(order_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user        ON user_notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_exchange_rate_logs        ON exchange_rate_logs(from_currency, to_currency, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_quiz_metrics_analysis     ON quiz_analysis_metrics(analysis_id);
CREATE INDEX IF NOT EXISTS idx_diagnosis_recs            ON diagnosis_recommendations(diagnosis_id);
CREATE INDEX IF NOT EXISTS idx_routine_history_user      ON routine_history(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor               ON audit_log(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity              ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_favorites_user            ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_expert_articles_pub       ON expert_articles(is_published, sort_order);

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================

-- Enable RLS on every table
ALTER TABLE roles                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE countries                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE currencies                ENABLE ROW LEVEL SECURITY;
ALTER TABLE skin_types                ENABLE ROW LEVEL SECURITY;
ALTER TABLE skin_concerns             ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_types         ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_method_types      ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings             ENABLE ROW LEVEL SECURITY;
ALTER TABLE addresses                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE brands                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_categories        ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_lines             ENABLE ROW LEVEL SECURITY;
ALTER TABLE products                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_images            ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_sizes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_ingredients       ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_benefits          ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_skin_types        ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_concern_tags      ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_recommendations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_reviews           ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_faqs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_safety_info       ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_pairings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_questions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_question_options     ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_sessions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_images               ENABLE ROW LEVEL SECURITY;
ALTER TABLE skin_analyses             ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_analysis_metrics     ENABLE ROW LEVEL SECURITY;
ALTER TABLE routines                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE routine_steps             ENABLE ROW LEVEL SECURITY;
ALTER TABLE routine_products          ENABLE ROW LEVEL SECURITY;
ALTER TABLE routine_history           ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_accounts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE carts                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items                ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items               ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_status_history      ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_codes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_code_uses           ENABLE ROW LEVEL SECURITY;
ALTER TABLE dermatologists            ENABLE ROW LEVEL SECURITY;
ALTER TABLE dermatologist_schedules   ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments              ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_notes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagnosis_cases           ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagnosis_photos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagnosis_products        ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagnosis_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE expert_articles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_milestones          ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_sections            ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_notifications        ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences  ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs                ENABLE ROW LEVEL SECURITY;
ALTER TABLE exchange_rate_logs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_votes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log                 ENABLE ROW LEVEL SECURITY;

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- A. PUBLIC CATALOG â€” anyone (anon + authenticated) can SELECT
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

CREATE POLICY "public_select" ON roles               FOR SELECT USING (true);
CREATE POLICY "public_select" ON countries           FOR SELECT USING (true);
CREATE POLICY "public_select" ON currencies          FOR SELECT USING (true);
CREATE POLICY "public_select" ON skin_types          FOR SELECT USING (true);
CREATE POLICY "public_select" ON skin_concerns       FOR SELECT USING (true);
CREATE POLICY "public_select" ON appointment_types   FOR SELECT USING (true);
CREATE POLICY "public_select" ON payment_method_types FOR SELECT USING (true);
CREATE POLICY "public_select" ON brands              FOR SELECT USING (true);
CREATE POLICY "public_select" ON product_categories  FOR SELECT USING (true);
CREATE POLICY "public_select" ON product_lines       FOR SELECT USING (true);
CREATE POLICY "public_select" ON products            FOR SELECT USING (true);
CREATE POLICY "public_select" ON product_images      FOR SELECT USING (true);
CREATE POLICY "public_select" ON product_sizes       FOR SELECT USING (true);
CREATE POLICY "public_select" ON product_ingredients FOR SELECT USING (true);
CREATE POLICY "public_select" ON product_benefits    FOR SELECT USING (true);
CREATE POLICY "public_select" ON product_skin_types  FOR SELECT USING (true);
CREATE POLICY "public_select" ON product_concern_tags FOR SELECT USING (true);
CREATE POLICY "public_select" ON product_recommendations FOR SELECT USING (true);
CREATE POLICY "public_select" ON product_reviews     FOR SELECT USING (is_published = true);
CREATE POLICY "public_select" ON product_faqs        FOR SELECT USING (true);
CREATE POLICY "public_select" ON product_safety_info FOR SELECT USING (true);
CREATE POLICY "public_select" ON product_pairings    FOR SELECT USING (true);
CREATE POLICY "public_select" ON quiz_questions      FOR SELECT USING (is_active = true);
CREATE POLICY "public_select" ON quiz_question_options FOR SELECT USING (true);
CREATE POLICY "public_select" ON dermatologists      FOR SELECT USING (is_active = true);
CREATE POLICY "public_select" ON dermatologist_schedules FOR SELECT USING (true);
CREATE POLICY "public_select" ON expert_articles     FOR SELECT USING (is_published = true);
CREATE POLICY "public_select" ON story_milestones    FOR SELECT USING (true);
CREATE POLICY "public_select" ON story_sections      FOR SELECT USING (is_active = true);
CREATE POLICY "public_select" ON bank_accounts       FOR SELECT USING (is_active = true);
CREATE POLICY "public_select" ON promo_codes         FOR SELECT USING (is_active = true);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- B. USERS â€” own row only
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

CREATE POLICY "users_own_select" ON users
  FOR SELECT TO authenticated USING (auth.uid() = id);

CREATE POLICY "users_own_update" ON users
  FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- C. USER PRIVATE TABLES â€” full CRUD scoped to own user_id
--    FOR ALL with both USING + WITH CHECK covers SELECT/INSERT/UPDATE/DELETE
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

CREATE POLICY "own_all" ON user_sessions
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_all" ON user_settings
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_all" ON addresses
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_all" ON favorites
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- D. QUIZ & ANALYSIS
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

CREATE POLICY "own_all" ON quiz_sessions
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_all" ON quiz_images
  FOR ALL TO authenticated
  USING  (quiz_session_id IN (SELECT id FROM quiz_sessions WHERE user_id = auth.uid()))
  WITH CHECK (quiz_session_id IN (SELECT id FROM quiz_sessions WHERE user_id = auth.uid()));

CREATE POLICY "own_all" ON skin_analyses
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_all" ON quiz_analysis_metrics
  FOR ALL TO authenticated
  USING  (analysis_id IN (SELECT id FROM skin_analyses WHERE user_id = auth.uid()))
  WITH CHECK (analysis_id IN (SELECT id FROM skin_analyses WHERE user_id = auth.uid()));

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- E. ROUTINES
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

CREATE POLICY "own_all" ON routines
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_all" ON routine_steps
  FOR ALL TO authenticated
  USING  (routine_id IN (SELECT id FROM routines WHERE user_id = auth.uid()))
  WITH CHECK (routine_id IN (SELECT id FROM routines WHERE user_id = auth.uid()));

CREATE POLICY "own_all" ON routine_products
  FOR ALL TO authenticated
  USING  (routine_id IN (SELECT id FROM routines WHERE user_id = auth.uid()))
  WITH CHECK (routine_id IN (SELECT id FROM routines WHERE user_id = auth.uid()));

CREATE POLICY "own_all" ON routine_history
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- F. CART & ORDERS
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

CREATE POLICY "own_all" ON carts
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_all" ON cart_items
  FOR ALL TO authenticated
  USING  (cart_id IN (SELECT id FROM carts WHERE user_id = auth.uid()))
  WITH CHECK (cart_id IN (SELECT id FROM carts WHERE user_id = auth.uid()));

CREATE POLICY "own_select" ON orders
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "own_insert" ON orders
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_update" ON orders
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_all" ON order_items
  FOR ALL TO authenticated
  USING  (order_id IN (SELECT id FROM orders WHERE user_id = auth.uid()))
  WITH CHECK (order_id IN (SELECT id FROM orders WHERE user_id = auth.uid()));

CREATE POLICY "own_all" ON payments
  FOR ALL TO authenticated
  USING  (order_id IN (SELECT id FROM orders WHERE user_id = auth.uid()))
  WITH CHECK (order_id IN (SELECT id FROM orders WHERE user_id = auth.uid()));

CREATE POLICY "own_select" ON invoices
  FOR SELECT TO authenticated
  USING (order_id IN (SELECT id FROM orders WHERE user_id = auth.uid()));

CREATE POLICY "own_select" ON order_status_history
  FOR SELECT TO authenticated
  USING (order_id IN (SELECT id FROM orders WHERE user_id = auth.uid()));

CREATE POLICY "own_all" ON promo_code_uses
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- G. APPOINTMENTS & DIAGNOSIS
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

CREATE POLICY "own_all" ON appointments
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_select" ON appointment_notes
  FOR SELECT TO authenticated
  USING (appointment_id IN (SELECT id FROM appointments WHERE user_id = auth.uid()));

CREATE POLICY "own_all" ON diagnosis_cases
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_all" ON diagnosis_photos
  FOR ALL TO authenticated
  USING  (diagnosis_id IN (SELECT id FROM diagnosis_cases WHERE user_id = auth.uid()))
  WITH CHECK (diagnosis_id IN (SELECT id FROM diagnosis_cases WHERE user_id = auth.uid()));

CREATE POLICY "own_all" ON diagnosis_products
  FOR ALL TO authenticated
  USING  (diagnosis_id IN (SELECT id FROM diagnosis_cases WHERE user_id = auth.uid()))
  WITH CHECK (diagnosis_id IN (SELECT id FROM diagnosis_cases WHERE user_id = auth.uid()));

CREATE POLICY "own_select" ON diagnosis_recommendations
  FOR SELECT TO authenticated
  USING (diagnosis_id IN (SELECT id FROM diagnosis_cases WHERE user_id = auth.uid()));

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- H. NOTIFICATIONS
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

CREATE POLICY "own_all" ON user_notifications
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_all" ON notification_preferences
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_all" ON review_votes
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- I. ADMIN-ONLY TABLES
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

CREATE POLICY "admin_select" ON email_logs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role_id = 1));

CREATE POLICY "admin_insert" ON email_logs
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role_id = 1));

CREATE POLICY "admin_select" ON audit_log
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role_id = 1));

CREATE POLICY "admin_insert" ON audit_log
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role_id = 1));

CREATE POLICY "admin_insert" ON exchange_rate_logs
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role_id = 1));

