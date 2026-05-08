# PharmaDerm — Database Guide

PostgreSQL 15+ / Supabase-compatible.

---

## Execution order

Run these two files **in order** in the Supabase SQL Editor (Dashboard → SQL Editor → New query):

1. `schema.sql` — creates all tables, triggers, indexes, and RLS policies
2. `seed.sql` — inserts lookup data, brands, products, and content

Both files are **idempotent**: safe to re-run (`CREATE TABLE IF NOT EXISTS`, `ON CONFLICT DO NOTHING`).

---

## Connecting the app

1. Create a Supabase project at supabase.com
2. Go to Settings → API — copy Project URL and anon key
3. Create `.env` from `.env.example`:
   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   VITE_DATA_MODE=supabase
   ```
4. Apply `schema.sql` then `seed.sql` in the SQL Editor
5. `npm run dev`

---

## Table reference (64 tables)

### 1. Lookup / reference
| Table | Description |
|---|---|
| `roles` | `admin`, `customer`, `staff` |
| `countries` | ISO 3166-1 alpha-2 + default currency |
| `currencies` | ISO 4217 + exchange rate to USD (DOP = 59.40) |
| `skin_types` | `seca`, `normal`, `mixta`, `grasa` |
| `skin_concerns` | `acne`, `barrera`, `manchas`, etc. |
| `appointment_types` | `virtual`, `in_person`, `followup` |
| `payment_method_types` | `card`, `transfer`, `cash` |

### 2. Users
| Table | Description |
|---|---|
| `users` | Core profile; `id` matches `auth.users.id` |
| `user_sessions` | Custom token sessions |
| `user_settings` | Dark mode, language, currency preferences |
| `addresses` | Shipping addresses (multiple per user) |

### 3. Product catalog
| Table | Description |
|---|---|
| `brands` | La Roche-Posay, CeraVe |
| `product_categories` | limpieza, tratamiento, humectar, proteger |
| `product_lines` | Anthelios, Cicaplast, Effaclar, Hyalu B5, Lipikar, Toleriane, CeraVe Hydrating, CeraVe Foaming |
| `products` | Master table; prices in DOP; FK to brand, category, line |
| `product_images` | Multiple images per product (`is_primary` flag) |
| `product_sizes` | Size/price variants (150ML, 340G, Kit…) |
| `product_ingredients` | INCI list; `is_key` for hero ingredients |
| `product_benefits` | Bullet-point benefits |
| `product_skin_types` | M2M: product ↔ skin type |
| `product_concern_tags` | M2M: product ↔ skin concern |
| `product_recommendations` | Quiz-result → product rules (skin_type + concern + time_of_day → priority) |
| `product_reviews` | User reviews; `is_published` gate |
| `product_faqs` | FAQs per product |
| `product_safety_info` | Fragrance-free / paraben-free / tested flags |
| `product_pairings` | M2M: complementary products |

### 4. Favorites
| Table | Description |
|---|---|
| `favorites` | Replaces `wishlist`; M2M user ↔ product |

### 5. Quiz & Skin Analysis
| Table | Description |
|---|---|
| `quiz_questions` | Question definitions (code matches Vue step keys) |
| `quiz_question_options` | Answer options per question |
| `quiz_sessions` | One session per quiz attempt; supports anonymous |
| `quiz_images` | Selfies captured during quiz; Supabase Storage paths |
| `skin_analyses` | Generated analysis per session |
| `quiz_analysis_metrics` | Individual metric scores (barrera, poros, etc.) |

### 6. Routines
| Table | Description |
|---|---|
| `routines` | User routine linked to analysis |
| `routine_steps` | Ordered steps with `time_of_day` |
| `routine_products` | M2M bridge: routine ↔ product (flat, for quick queries) |
| `routine_history` | JSONB snapshots when routine changes |

### 7. Bank Accounts
| Table | Description |
|---|---|
| `bank_accounts` | PharmaDerm accounts shown in transfer payment UI |

### 8. Cart & Orders
| Table | Description |
|---|---|
| `carts` | Replaces `cart_sessions`; anonymous via `session_key` |
| `cart_items` | Items in cart |
| `orders` | subtotal + shipping + tax (ITBIS 18%) + discount = total |
| `order_items` | Price snapshot at purchase time |
| `payments` | Replaces `payment_transactions` |
| `invoices` | Fiscal receipt per order; `customer_rnc` for B2B |
| `order_status_history` | Status change log |
| `promo_codes` | `percent` or `fixed_dop` discount codes |
| `promo_code_uses` | Redemption log |

### 9. Appointments & Diagnosis
| Table | Description |
|---|---|
| `dermatologists` | Doctor profiles |
| `dermatologist_schedules` | Weekly schedule per dermatologist |
| `appointments` | Booking per user + dermatologist |
| `appointment_notes` | Staff/dermatologist notes |
| `diagnosis_cases` | Detailed skin case; linked to appointment + analysis |
| `diagnosis_photos` | Photos uploaded for a case |
| `diagnosis_products` | M2M: diagnosis ↔ recommended products |
| `diagnosis_recommendations` | Text recommendations (product/ingredient/avoid/lifestyle) |

### 10. Content
| Table | Description |
|---|---|
| `expert_articles` | Expert Advice articles; bilingual |
| `story_milestones` | Our Story timeline |
| `story_sections` | Our Story page sections (hero, mission, vision, values) |

### 11. Notifications & Audit
| Table | Description |
|---|---|
| `user_notifications` | In-app notifications per user |
| `notification_preferences` | Per-user notification toggles |
| `email_logs` | EmailJS log; links order, appointment, **or routine** |
| `exchange_rate_logs` | Historical rate snapshots |
| `review_votes` | Helpful/not helpful on reviews |
| `audit_log` | Admin-only action log |

---

## RLS overview

| Who | Tables | Access |
|---|---|---|
| **Anyone** (anon + authenticated) | All catalog tables | SELECT only |
| **Authenticated user** | Their own rows in user/private tables | Full CRUD |
| **Admin** (`role_id = 1`) | `email_logs`, `audit_log`, `exchange_rate_logs` | SELECT + INSERT |
| **service_role** (server-side) | All tables | Bypasses RLS entirely |

Policy pattern used throughout:
```sql
-- Catalog: public read
CREATE POLICY "public_select" ON products FOR SELECT USING (true);

-- User private: scoped to own user_id
CREATE POLICY "own_all" ON addresses
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

---

## Renamed tables (breaking vs old schema)

| Old name | New name |
|---|---|
| `wishlist` | `favorites` |
| `cart_sessions` | `carts` |
| `payment_transactions` | `payments` |

Tables **not** renamed: `quiz_sessions`, `diagnosis_cases`.

---

## Price & tax conventions

- All prices stored in **DOP**. Frontend converts via `src/utils/currency.js`.
- Exchange rate: `1 USD = 59.40 DOP` — update `currencies` table to change it.
- **ITBIS = 18%** Dominican VAT, calculated at checkout and stored in `orders.tax`.

---

## localStorage ↔ Supabase mapping

| localStorage key (`pharmaderm_` prefix) | Supabase table |
|---|---|
| `quiz_result` / `quiz_history` | `quiz_sessions`, `skin_analyses` |
| `routines` | `routines`, `routine_steps`, `routine_products` |
| `orders` | `orders`, `order_items`, `payments` |
| `appointments_list` | `appointments` |
| `diagnostic_result` | `diagnosis_cases` |
| `settings` | `user_settings` |
| `cart` | `carts`, `cart_items` |
| `email_logs` | `email_logs` |

---

## Adding a new product

1. Ensure the brand, category, and line rows exist.
2. `INSERT INTO products (slug, brand_id, category_id, line_id, name, size_label, price_dop, ...)`.
3. Add rows to `product_images`, `product_sizes`, `product_ingredients`, `product_benefits`, `product_skin_types`, `product_concern_tags`, `product_safety_info` as needed.
4. Add recommendation rules in `product_recommendations` so the quiz result engine can surface it.
