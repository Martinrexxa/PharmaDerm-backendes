-- PharmaDerm Seed Data
-- Run AFTER schema.sql in the Supabase SQL Editor
-- All statements are idempotent (ON CONFLICT DO NOTHING)
-- =====================================================================

-- =====================================================================
-- 1. ROLES
-- =====================================================================
INSERT INTO roles (id, name, description) VALUES
  (1, 'admin',    'Acceso completo al sistema'),
  (2, 'customer', 'Cliente registrado'),
  (3, 'staff',    'Soporte y operaciones')
ON CONFLICT (name) DO NOTHING;

-- =====================================================================
-- 2. CURRENCIES  (canonical: DOP = 59.40 per USD)
-- =====================================================================
INSERT INTO currencies (code, name, symbol, exchange_rate_to_usd) VALUES
  ('USD', 'Dólar americano',  'US$',  1.000000),
  ('DOP', 'Peso dominicano',  'RD$', 59.400000),
  ('EUR', 'Euro',             '€',    0.920000),
  ('MXN', 'Peso mexicano',    '$',   17.150000),
  ('COP', 'Peso colombiano',  '$',  3950.000000),
  ('ARS', 'Peso argentino',   '$',  870.000000),
  ('CLP', 'Peso chileno',     '$',  920.000000),
  ('PEN', 'Sol peruano',      'S/',   3.720000),
  ('BRL', 'Real brasileño',   'R$',   4.970000),
  ('CAD', 'Dólar canadiense', 'CA$',  1.360000),
  ('GBP', 'Libra esterlina',  '£',    0.790000),
  ('CHF', 'Franco suizo',     'CHF',  0.890000),
  ('JPY', 'Yen japonés',      '¥',  149.500000)
ON CONFLICT (code) DO NOTHING;

-- =====================================================================
-- 3. COUNTRIES
-- =====================================================================
INSERT INTO countries (code, name, currency) VALUES
  ('DO', 'República Dominicana', 'DOP'),
  ('US', 'Estados Unidos',       'USD'),
  ('PR', 'Puerto Rico',          'USD'),
  ('MX', 'México',               'MXN'),
  ('CO', 'Colombia',             'COP'),
  ('AR', 'Argentina',            'ARS'),
  ('CL', 'Chile',                'CLP'),
  ('PE', 'Perú',                 'PEN'),
  ('BR', 'Brasil',               'BRL'),
  ('VE', 'Venezuela',            'USD'),
  ('PA', 'Panamá',               'USD'),
  ('CR', 'Costa Rica',           'USD'),
  ('GT', 'Guatemala',            'USD'),
  ('HN', 'Honduras',             'USD'),
  ('SV', 'El Salvador',          'USD'),
  ('NI', 'Nicaragua',            'USD'),
  ('CU', 'Cuba',                 'USD'),
  ('EC', 'Ecuador',              'USD'),
  ('BO', 'Bolivia',              'USD'),
  ('PY', 'Paraguay',             'USD'),
  ('UY', 'Uruguay',              'USD'),
  ('ES', 'España',               'EUR'),
  ('PT', 'Portugal',             'EUR'),
  ('DE', 'Alemania',             'EUR'),
  ('FR', 'Francia',              'EUR'),
  ('IT', 'Italia',               'EUR'),
  ('CA', 'Canadá',               'CAD'),
  ('GB', 'Reino Unido',          'GBP'),
  ('CH', 'Suiza',                'CHF'),
  ('JP', 'Japón',                'JPY')
ON CONFLICT (code) DO NOTHING;

-- =====================================================================
-- 4. SKIN TYPES
-- =====================================================================
INSERT INTO skin_types (code, name_es, name_en, description_es, description_en) VALUES
  ('seca',   'Piel seca',   'Dry skin',         'Produce poco sebo, tiende a la tirantez y descamación.',  'Produces little sebum, prone to tightness and flaking.'),
  ('normal', 'Piel normal', 'Normal skin',       'Equilibrada, sin exceso de grasa ni resequedad marcada.', 'Well balanced, no excess oil or dryness.'),
  ('mixta',  'Piel mixta',  'Combination skin',  'Zona T más grasa, mejillas normales o secas.',            'Oily T-zone with normal or dry cheeks.'),
  ('grasa',  'Piel grasa',  'Oily skin',         'Produce exceso de sebo, brillosa, poros dilatados.',      'Excess sebum production, shiny, enlarged pores.')
ON CONFLICT (code) DO NOTHING;

-- =====================================================================
-- 5. SKIN CONCERNS
-- =====================================================================
INSERT INTO skin_concerns (code, name_es, name_en) VALUES
  ('luminosidad',    'Luminosidad',            'Radiance'),
  ('deshidratacion', 'Deshidratación',         'Dehydration'),
  ('manchas',        'Manchas oscuras',        'Dark spots'),
  ('sensibilidad',   'Sensibilidad',           'Sensitivity'),
  ('arrugas',        'Líneas tempranas',       'Early wrinkles'),
  ('poros',          'Poros visibles',         'Visible pores'),
  ('barrera',        'Barrera cutánea',        'Skin barrier'),
  ('acne',           'Acné',                   'Acne'),
  ('textura',        'Textura irregular',      'Uneven texture'),
  ('rojez',          'Rojez y enrojecimiento', 'Redness')
ON CONFLICT (code) DO NOTHING;

-- =====================================================================
-- 6. APPOINTMENT TYPES
-- =====================================================================
INSERT INTO appointment_types (code, name_es, name_en, is_virtual) VALUES
  ('virtual',   'Consulta virtual',    'Virtual consultation',    TRUE),
  ('in_person', 'Consulta presencial', 'In-person consultation',  FALSE),
  ('followup',  'Seguimiento',         'Follow-up',               TRUE)
ON CONFLICT (code) DO NOTHING;

-- =====================================================================
-- 7. PAYMENT METHOD TYPES
-- =====================================================================
INSERT INTO payment_method_types (code, name_es, name_en) VALUES
  ('card',     'Tarjeta de crédito/débito', 'Credit/debit card'),
  ('transfer', 'Transferencia bancaria',    'Bank transfer'),
  ('cash',     'Efectivo contraentrega',    'Cash on delivery')
ON CONFLICT (code) DO NOTHING;

-- =====================================================================
-- 8. BRANDS
-- =====================================================================
INSERT INTO brands (slug, name, description, country_origin) VALUES
  ('la-roche-posay',
   'La Roche-Posay',
   'Marca dermocosmética desarrollada con más de 300 dermatólogos. Sus fórmulas incorporan agua termal de La Roche-Posay, rica en selenio, con propiedades antiinflamatorias.',
   'FR'),
  ('cerave',
   'CeraVe',
   'Desarrollada con dermatólogos para restaurar y mantener la barrera cutánea mediante tres ceramidas esenciales (1, 3, 6-II) y tecnología MVE de liberación prolongada.',
   'US')
ON CONFLICT (slug) DO NOTHING;

-- =====================================================================
-- 9. PRODUCT CATEGORIES
-- =====================================================================
INSERT INTO product_categories (slug, name_es, name_en, sort_order) VALUES
  ('limpieza',    'Limpieza',      'Cleansers',      1),
  ('tratamiento', 'Tratamiento',   'Treatments',     2),
  ('humectar',    'Hidratantes',   'Moisturizers',   3),
  ('proteger',    'Protección UV', 'Sun Protection', 4)
ON CONFLICT (slug) DO NOTHING;

-- =====================================================================
-- 10. PRODUCT LINES
-- =====================================================================
INSERT INTO product_lines (brand_id, slug, name, description) VALUES
  -- La Roche-Posay
  ((SELECT id FROM brands WHERE slug='la-roche-posay'), 'anthelios',  'Anthelios',  'Línea de protección solar con tecnología UVMune 400, la más avanzada contra los rayos UVA ultra-largos.'),
  ((SELECT id FROM brands WHERE slug='la-roche-posay'), 'cicaplast',  'Cicaplast',  'Fórmulas reparadoras para piel irritada, dañada y con tendencia a cicatrices. Con Pantenol y Zinc.'),
  ((SELECT id FROM brands WHERE slug='la-roche-posay'), 'effaclar',   'Effaclar',   'Línea purificante para piel grasa y con tendencia acneica. Reduce poros y exceso de sebo.'),
  ((SELECT id FROM brands WHERE slug='la-roche-posay'), 'hyalu-b5',   'Hyalu B5',   'Concentrado de ácido hialurónico puro + vitamina B5 para hidratación profunda y efecto relleno.'),
  ((SELECT id FROM brands WHERE slug='la-roche-posay'), 'lipikar',    'Lipikar',    'Cuidado intensivo para piel seca y atópica. Restaura el manto lipídico con Shea y Niacinamida.'),
  ((SELECT id FROM brands WHERE slug='la-roche-posay'), 'toleriane',  'Toleriane',  'Diseñada para pieles sensibles e intolerantes. Sin conservantes agresivos, con agua termal.'),
  -- CeraVe
  ((SELECT id FROM brands WHERE slug='cerave'), 'cerave-hydrating', 'CeraVe Hydrating', 'Fórmulas hidratantes con ceramidas y ácido hialurónico para piel seca y normal.'),
  ((SELECT id FROM brands WHERE slug='cerave'), 'cerave-foaming',   'CeraVe Foaming',   'Limpiadores en espuma para piel normal a grasa, sin resecar la barrera cutánea.')
ON CONFLICT (slug) DO NOTHING;

-- =====================================================================
-- 11. PRODUCTS — La Roche-Posay
-- =====================================================================
INSERT INTO products (slug, brand_id, category_id, line_id, name, size_label, price_dop, rating, review_count, is_active)
SELECT
  p.slug,
  b.id  AS brand_id,
  c.id  AS category_id,
  l.id  AS line_id,
  p.name, p.size_label, p.price_dop, p.rating, p.review_count, TRUE
FROM (VALUES
  ('lrp-toleriane-purifying-foaming-cleanser', 'la-roche-posay', 'limpieza',    'toleriane',  'Toleriane Purifying Foaming Face Wash',          '400ML', 1850.00, 4.0, 3141),
  ('lrp-toleriane-dermo-cleanser',             'la-roche-posay', 'limpieza',    'toleriane',  'Toleriane Dermo-Cleanser',                       '200ML', 1650.00, 4.4, 1854),
  ('lrp-effaclar-gel-moussant',                'la-roche-posay', 'limpieza',    'effaclar',   'Effaclar Gel Moussant Purifiant',                '200ML', 1750.00, 4.2, 2005),
  ('lrp-pure-vitamin-c10-serum',               'la-roche-posay', 'tratamiento', 'toleriane',  'Pure Vitamin C10 Serum',                         '30ML',  2850.00, 4.0, 1872),
  ('lrp-hyalu-b5-serum',                       'la-roche-posay', 'tratamiento', 'hyalu-b5',   'Hyalu B5 Pure Hyaluronic Acid Serum',            '30ML',  2650.00, 4.4, 2211),
  ('lrp-effaclar-duo-plus',                    'la-roche-posay', 'tratamiento', 'effaclar',   'Effaclar Duo+ Anti-Acne Moisturiser',            '40ML',  2450.00, 4.3, 1654),
  ('lrp-toleriane-double-repair-moisturizer',  'la-roche-posay', 'humectar',    'toleriane',  'Toleriane Double Repair Face Moisturizer',       '100ML', 2250.00, 4.4, 2491),
  ('lrp-toleriane-sensitive-fluide',           'la-roche-posay', 'humectar',    'toleriane',  'Toleriane Sensitive Fluide',                     '40ML',  1950.00, 4.2,  991),
  ('lrp-lipikar-baume-ap',                     'la-roche-posay', 'humectar',    'lipikar',    'Lipikar Baume AP+ Intense',                      '400ML', 3250.00, 4.7, 3102),
  ('lrp-anthelios-uvmune-fluid-spf50',         'la-roche-posay', 'proteger',    'anthelios',  'Anthelios UVMune 400 Invisible Fluid SPF 50+',   '50ML',  2950.00, 4.5,  554),
  ('lrp-anthelios-pigment-correct-spf50',      'la-roche-posay', 'proteger',    'anthelios',  'Anthelios Pigment Correct Photocorrector SPF 50','50ML',  3150.00, 4.3,  388)
) AS p(slug, brand_slug, category_slug, line_slug, name, size_label, price_dop, rating, review_count)
JOIN brands            b ON b.slug = p.brand_slug
JOIN product_categories c ON c.slug = p.category_slug
JOIN product_lines     l ON l.slug = p.line_slug
ON CONFLICT (slug) DO NOTHING;

-- =====================================================================
-- 12. PRODUCTS — CeraVe
-- =====================================================================
INSERT INTO products (slug, brand_id, category_id, line_id, name, size_label, price_dop, rating, review_count, is_active)
SELECT
  p.slug, b.id, c.id, l.id, p.name, p.size_label, p.price_dop, p.rating, p.review_count, TRUE
FROM (VALUES
  ('cerave-hydrating-cleanser',               'cerave', 'limpieza',    'cerave-hydrating', 'Hydrating Facial Cleanser',             '236ML', 1650.00, 4.5, 4201),
  ('cerave-foaming-facial-cleanser',          'cerave', 'limpieza',    'cerave-foaming',   'Foaming Facial Cleanser',               '236ML', 1550.00, 4.6, 5182),
  ('cerave-skin-renewing-retinol-serum',      'cerave', 'tratamiento', 'cerave-hydrating', 'Skin Renewing Retinol Serum',           '30ML',  2450.00, 4.3, 1980),
  ('cerave-hydrating-hyaluronic-acid-serum',  'cerave', 'tratamiento', 'cerave-hydrating', 'Hydrating Hyaluronic Acid Serum',       '30ML',  2250.00, 4.5, 1740),
  ('cerave-moisturizing-cream',               'cerave', 'humectar',    'cerave-hydrating', 'Moisturizing Cream',                    '340G',  1950.00, 4.8, 6321),
  ('cerave-pm-facial-moisturizing-lotion',    'cerave', 'humectar',    'cerave-hydrating', 'PM Facial Moisturizing Lotion',         '89ML',  1850.00, 4.6, 4108),
  ('cerave-am-facial-moisturizing-lotion',    'cerave', 'humectar',    'cerave-hydrating', 'AM Facial Moisturizing Lotion SPF 30',  '89ML',  2050.00, 4.5, 3214),
  ('cerave-hydrating-mineral-sunscreen-spf50','cerave', 'proteger',    'cerave-hydrating', 'Hydrating Mineral Sunscreen SPF 50',    '75ML',  2350.00, 4.1, 1304)
) AS p(slug, brand_slug, category_slug, line_slug, name, size_label, price_dop, rating, review_count)
JOIN brands            b ON b.slug = p.brand_slug
JOIN product_categories c ON c.slug = p.category_slug
JOIN product_lines     l ON l.slug = p.line_slug
ON CONFLICT (slug) DO NOTHING;

-- =====================================================================
-- 13. PRODUCT SAFETY INFO (all products: fragrance-free, paraben-free,
--     dermatologist-tested)
-- =====================================================================
INSERT INTO product_safety_info (product_id, fragrance_free, paraben_free, dermatologist_tested, allergy_tested)
SELECT id, TRUE, TRUE, TRUE, TRUE FROM products
ON CONFLICT (product_id) DO NOTHING;

-- =====================================================================
-- 14. BANK ACCOUNTS  (used in transfer payment UI)
-- =====================================================================
INSERT INTO bank_accounts (bank_name, account_holder, account_number, account_type, currency, is_active, sort_order) VALUES
  ('Asociación Cibao',          'PharmaDerm SRL', '0201-8765-4321', 'Cta. de Ahorros',  'DOP', TRUE, 1),
  ('Banco Popular Dominicano',  'PharmaDerm SRL', '826-123456-8',   'Cta. Corriente',   'DOP', TRUE, 2),
  ('Banco de Reservas (Banreservas)', 'PharmaDerm SRL', '9100-1234567-8', 'Cta. Corriente', 'DOP', TRUE, 3)
ON CONFLICT DO NOTHING;

-- =====================================================================
-- 15. DERMATOLOGISTS
-- =====================================================================
INSERT INTO dermatologists (name, specialty, mode, location, availability_note, rating) VALUES
  ('Dra. Elena Martínez',  'Acné, poros y piel sensible',                       'Virtual',              'Santo Domingo, RD', 'Próxima disponible: Mañana', 4.9),
  ('Dra. Camila Reyes',    'Recuperación de barrera, deshidratación y manchas', 'In person',            'Santiago, RD',      'Próxima disponible: Viernes', 4.8),
  ('Dra. Laura Fernández', 'Dermatología integral',                              'Virtual & In person',  'Santo Domingo, RD', 'Próxima disponible: Hoy',    5.0)
ON CONFLICT DO NOTHING;

-- =====================================================================
-- 16. DERMATOLOGIST SCHEDULES  (Mon–Fri 09:00–17:00, 30-min slots)
-- =====================================================================
INSERT INTO dermatologist_schedules (dermatologist_id, day_of_week, start_time, end_time, slot_minutes)
SELECT d.id, dow, '09:00', '17:00', 30
FROM dermatologists d
CROSS JOIN (VALUES (1),(2),(3),(4),(5)) AS t(dow)
ON CONFLICT DO NOTHING;

-- =====================================================================
-- 17. PROMO CODES
-- =====================================================================
INSERT INTO promo_codes (code, description, discount_type, discount_value, min_order_dop, max_uses, is_active) VALUES
  ('BIENVENIDO10', '10% de descuento en tu primer pedido',  'percent',   10.00,  500.00, 500, TRUE),
  ('RUTINA15',     '15% al completar el quiz de piel',      'percent',   15.00, 1000.00, 200, TRUE),
  ('ENVIOGRATIS',  'Envío gratis sin mínimo de compra',     'fixed_dop', 250.00,    0.00, 100, TRUE)
ON CONFLICT (code) DO NOTHING;

-- =====================================================================
-- 18. QUIZ QUESTIONS & OPTIONS
--     Codes match the step keys used in Quiz.vue
-- =====================================================================
INSERT INTO quiz_questions (code, question_es, question_en, type, sort_order) VALUES
  ('skinType',          '¿Cómo describirías tu tipo de piel?',                        'How would you describe your skin type?',              'single', 1),
  ('barrierReactivity', 'Después de limpiar tu rostro sin aplicar nada, ¿cómo se siente?', 'After cleansing with nothing applied, how does your skin feel?', 'single', 2),
  ('postCleanseFeels',  '¿Con qué frecuencia notas brillo en tu zona T (frente, nariz, mentón)?', 'How often do you notice shine in your T-zone?', 'single', 3),
  ('shinePattern',      '¿Tu piel tiende a enrojecerse, irritarse o reaccionar con facilidad?', 'Does your skin tend to redden, get irritated, or react easily?', 'single', 4),
  ('primaryConcern',    '¿Cuál es tu principal preocupación de piel ahora mismo?',    'What is your primary skin concern right now?',        'single', 5),
  ('age',               '¿En qué rango de edad te encuentras?',                       'What age range are you in?',                          'single', 6)
ON CONFLICT (code) DO NOTHING;

-- Quiz question options
INSERT INTO quiz_question_options (question_id, value, label_es, label_en, emoji, sort_order)
SELECT q.id, o.value, o.label_es, o.label_en, o.emoji, o.sort_order
FROM quiz_questions q
JOIN (VALUES
  -- skinType
  ('skinType', 'seca',   'Seca',   'Dry',         '🏜️', 1),
  ('skinType', 'normal', 'Normal', 'Normal',       '✨', 2),
  ('skinType', 'mixta',  'Mixta',  'Combination', '🌗', 3),
  ('skinType', 'grasa',  'Grasa',  'Oily',        '💧', 4),
  -- barrierReactivity
  ('barrierReactivity', 'resilient',     'Cómoda y equilibrada',  'Comfortable and balanced',   '😊', 1),
  ('barrierReactivity', 'mild',          'Un poco tirante',       'Slightly tight',              '😐', 2),
  ('barrierReactivity', 'reactive',      'Tirante y sensible',    'Tight and sensitive',         '😟', 3),
  ('barrierReactivity', 'very_reactive', 'Muy tirante/irritada',  'Very tight/irritated',        '😣', 4),
  -- postCleanseFeels / shinePattern
  ('postCleanseFeels', 'rarely',     'Rara vez',          'Rarely',           '🌙', 1),
  ('postCleanseFeels', 'sometimes',  'A veces',           'Sometimes',        '☀️', 2),
  ('postCleanseFeels', 'often',      'Frecuentemente',    'Often',            '🌟', 3),
  ('postCleanseFeels', 'always',     'Siempre',           'Always',           '🔆', 4),
  -- shinePattern
  ('shinePattern', 'no',         'No, casi nunca',    'No, almost never',       '✅', 1),
  ('shinePattern', 'mild',       'Levemente',         'Mildly',                 '🟡', 2),
  ('shinePattern', 'moderate',   'Moderadamente',     'Moderately',             '🟠', 3),
  ('shinePattern', 'often',      'Seguido',           'Often',                  '🔴', 4),
  -- primaryConcern
  ('primaryConcern', 'deshidratacion', 'Deshidratación',  'Dehydration',     '💧', 1),
  ('primaryConcern', 'manchas',        'Manchas',         'Dark spots',      '🔵', 2),
  ('primaryConcern', 'acne',           'Acné',            'Acne',            '🫧', 3),
  ('primaryConcern', 'sensibilidad',   'Sensibilidad',    'Sensitivity',     '🌸', 4),
  ('primaryConcern', 'arrugas',        'Líneas finas',    'Fine lines',      '⏳', 5),
  ('primaryConcern', 'luminosidad',    'Luminosidad',     'Radiance',        '✨', 6),
  -- age
  ('age', '18-24', '18-24 años', '18-24 years', NULL, 1),
  ('age', '25-34', '25-34 años', '25-34 years', NULL, 2),
  ('age', '35-44', '35-44 años', '35-44 years', NULL, 3),
  ('age', '45-54', '45-54 años', '45-54 years', NULL, 4),
  ('age', '55+',   '55+ años',   '55+ years',   NULL, 5)
) AS o(q_code, value, label_es, label_en, emoji, sort_order)
  ON q.code = o.q_code
ON CONFLICT DO NOTHING;

-- =====================================================================
-- 19. EXPERT ADVICE ARTICLES
-- =====================================================================
INSERT INTO expert_articles (slug, category, title_es, title_en, excerpt_es, excerpt_en, read_time_min, icon, is_published, sort_order) VALUES
  ('hidratacion-vs-humectacion',
   'HIDRATACIÓN',
   'Hidratación vs. Humectación: ¿Cuál es la diferencia?',
   'Hydration vs. Moisturization: What is the difference?',
   'Muchos confunden estos conceptos. Hidratación añade agua a la piel; humectación la retiene mediante ingredientes oclusivos y emolientes.',
   'Many confuse these concepts. Hydration adds water to skin; moisturization retains it through occlusive and emollient ingredients.',
   3, 'water_drop', TRUE, 1),

  ('importancia-del-spf',
   'PROTECCIÓN',
   'Por qué el SPF es el paso más importante de tu rutina',
   'Why SPF is the most important step in your routine',
   'El filtro solar previene el fotoenvejecimiento, las manchas y el cáncer de piel. Sin él, el resto de tu rutina pierde eficacia.',
   'Sunscreen prevents photoaging, dark spots, and skin cancer. Without it, the rest of your routine loses effectiveness.',
   4, 'wb_sunny', TRUE, 2),

  ('capas-skincare',
   'ACTIVOS',
   'Cómo aplicar los productos de skincare en el orden correcto',
   'How to layer skincare products correctly',
   'El orden incorrecto reduce la absorción y efectividad. Regla de oro: de más ligero a más pesado, de más bajo pH a más alto.',
   'Wrong layering order reduces absorption and effectiveness. Golden rule: lightest to heaviest, lowest to highest pH.',
   5, 'science', TRUE, 3),

  ('piel-reactiva',
   'SENSIBILIDAD',
   'Rutina para piel reactiva o sensible',
   'Routine for reactive or sensitive skin',
   'La piel sensible necesita un enfoque minimalista, sin fragrancias y con activos suaves como ceramidas y avenanthramidas.',
   'Sensitive skin needs a minimalist, fragrance-free approach with gentle actives like ceramides and avenanthramides.',
   3, 'spa', TRUE, 4),

  ('ceramidas-que-son',
   'ACTIVOS',
   'Ceramidas: el secreto de una barrera cutánea sana',
   'Ceramides: the secret to a healthy skin barrier',
   'Las ceramidas representan el 50% de los lípidos de la barrera cutánea. Aprende cómo reponerlas con la ciencia detrás de CeraVe.',
   'Ceramides make up 50% of skin barrier lipids. Learn how to replenish them with the science behind CeraVe.',
   4, 'shield', TRUE, 5),

  ('acido-hialuronico-guia',
   'HIDRATACIÓN',
   'Guía completa del ácido hialurónico',
   'Complete guide to hyaluronic acid',
   'El ácido hialurónico puede retener hasta 1000 veces su peso en agua. Descubre cómo usarlo correctamente para maximizar su efecto.',
   'Hyaluronic acid can retain up to 1000 times its weight in water. Discover how to use it correctly for maximum effect.',
   4, 'water_full', TRUE, 6)
ON CONFLICT (slug) DO NOTHING;

-- =====================================================================
-- 20. OUR STORY — MILESTONES
--     Basado en el documento real del proyecto PharmaDerm (2026)
-- =====================================================================
INSERT INTO story_milestones (year, title_es, title_en, description_es, description_en, sort_order) VALUES
  (2026, 'Fundación de PharmaDerm',   'PharmaDerm Founded',
   'PharmaDerm nace en Santiago de los Caballeros como microempresa comercial privada, con modelo de venta digital y enfoque en productos dermatológicos de calidad.',
   'PharmaDerm is founded in Santiago de los Caballeros as a private commercial micro-enterprise, with a digital sales model focused on quality dermatological products.', 1),

  (2026, 'Alianzas estratégicas',     'Strategic Partnerships',
   'PharmaDerm establece alianzas con marcas reconocidas a nivel mundial como CeraVe y La Roche-Posay, garantizando productos originales y recomendados dermatológicamente.',
   'PharmaDerm establishes partnerships with globally recognized brands such as CeraVe and La Roche-Posay, ensuring original and dermatologist-recommended products.', 2),

  (2026, 'Plataforma digital',        'Digital Platform',
   'Lanzamiento del catálogo en línea y sistema de atención personalizada, permitiendo a los clientes recibir orientación básica y seguimiento postventa desde cualquier lugar.',
   'Launch of online catalog and personalized service system, allowing customers to receive basic guidance and post-sale follow-up from anywhere.', 3),

  (2027, 'Expansión de catálogo',     'Catalog Expansion',
   'Ampliación del inventario y comunidad de clientes, fortaleciendo el posicionamiento de PharmaDerm como referente confiable en el mercado dermatológico de Santiago.',
   'Expansion of inventory and customer community, strengthening PharmaDerm''s positioning as a reliable reference in the dermatological market of Santiago.', 4),

  (2028, 'Punto físico proyectado',   'Physical Location (Projected)',
   'A largo plazo, PharmaDerm proyecta establecer un punto físico de atención en Santiago de los Caballeros, con mayor inventario, alianzas estratégicas y presencia nacional.',
   'Long-term, PharmaDerm projects establishing a physical location in Santiago de los Caballeros, with greater inventory, strategic alliances, and national presence.', 5)
ON CONFLICT DO NOTHING;

-- =====================================================================
-- 21. OUR STORY — PAGE SECTIONS
--     Misión, visión y valores tomados del documento real del proyecto
-- =====================================================================
INSERT INTO story_sections (slug, type, title_es, title_en, body_es, body_en, sort_order) VALUES
  ('hero',
   'hero',
   'Productos dermatológicos de calidad, para ti',
   'Quality dermatological products, for you',
   'PharmaDerm es una microempresa dedicada a la venta y distribución de productos dermatológicos confiables, originales y de calidad, especialmente de marcas reconocidas como CeraVe y La Roche-Posay. Nace en Santiago de los Caballeros con proyección nacional y modelo inicialmente digital.',
   'PharmaDerm is a micro-enterprise dedicated to selling and distributing reliable, original, and quality dermatological products, especially from recognized brands like CeraVe and La Roche-Posay. Founded in Santiago de los Caballeros with national projection and an initial digital model.',
   1),

  ('mision',
   'mission',
   'Nuestra Misión',
   'Our Mission',
   'Ofrecer productos dermatológicos de calidad, accesibles y confiables, orientados al cuidado, salud y bienestar de la piel, mediante un servicio responsable, eficiente y personalizado, apoyado en herramientas digitales, orientación básica y una adecuada organización interna que permita satisfacer las necesidades de los clientes.',
   'To offer quality, accessible, and reliable dermatological products focused on skin care, health, and well-being, through a responsible, efficient, and personalized service supported by digital tools, basic guidance, and proper internal organization to meet customer needs.',
   2),

  ('vision',
   'vision',
   'Nuestra Visión',
   'Our Vision',
   'Consolidar progresivamente a PharmaDerm como una microempresa especializada en dermatología, reconocida por la calidad de sus productos, la atención personalizada, la innovación en sus servicios y su compromiso con el cuidado integral de la piel, logrando una presencia estable y competitiva dentro del mercado local.',
   'To progressively establish PharmaDerm as a specialized dermatology micro-enterprise, recognized for the quality of its products, personalized attention, innovation in its services, and commitment to comprehensive skin care, achieving a stable and competitive presence in the local market.',
   3),

  ('valores',
   'values',
   'Nuestros Valores',
   'Our Values',
   'Responsabilidad • Calidad • Ética • Compromiso con el cliente • Innovación • Servicio • Sostenibilidad',
   'Responsibility • Quality • Ethics • Customer commitment • Innovation • Service • Sustainability',
   4),

  ('propuesta',
   'proposal',
   'Nuestra Propuesta',
   'Our Proposal',
   'PharmaDerm no solo vende productos, sino que brinda orientación básica según el tipo de piel, recomendaciones personalizadas, marketing educativo y seguimiento postventa. Nos diferenciamos por ofrecer soluciones organizadas para piel grasa, sensible, con acné, resequedad, manchas y recuperación de la barrera cutánea.',
   'PharmaDerm not only sells products but provides basic guidance based on skin type, personalized recommendations, educational marketing, and post-sale follow-up. We differentiate ourselves by offering organized solutions for oily, sensitive, acne-prone, dry skin, dark spots, and skin barrier recovery.',
   5)
ON CONFLICT (slug) DO NOTHING;
