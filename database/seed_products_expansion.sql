-- Product expansion seed (CeraVe + La Roche-Posay)
-- Run AFTER database/schema.sql and database/seed.sql
-- Safe to run multiple times (ON CONFLICT on slug updates core fields)

INSERT INTO products (
  slug, brand_id, category_id, line_id, name, size_label, price_dop, rating, review_count, is_active
)
SELECT
  p.slug,
  b.id,
  c.id,
  l.id,
  p.name,
  p.size_label,
  p.price_dop,
  p.rating,
  p.review_count,
  TRUE
FROM (
  VALUES
  -- CeraVe (35+)
  ('cerave-moisturizing-cream','cerave','humectar','cerave-hydrating','Moisturizing Cream','340G',1128.00,4.8,6321),
  ('cerave-hydrating-facial-cleanser','cerave','limpieza','cerave-hydrating','Hydrating Facial Cleanser','236ML',950.00,4.7,4201),
  ('cerave-foaming-facial-cleanser','cerave','limpieza','cerave-foaming','Foaming Facial Cleanser','236ML',950.00,4.6,5182),
  ('cerave-pm-facial-moisturizing-lotion','cerave','humectar','cerave-hydrating','PM Facial Moisturizing Lotion','89ML',950.00,4.6,4108),
  ('cerave-skin-renewing-retinol-serum','cerave','tratamiento','cerave-hydrating','Skin Renewing Retinol Serum','30ML',1187.00,4.3,1980),
  ('cerave-hydrating-hyaluronic-acid-serum','cerave','tratamiento','cerave-hydrating','Hydrating Hyaluronic Acid Serum','30ML',1187.00,4.5,1740),
  ('cerave-hydrating-mineral-sunscreen-spf50','cerave','proteger','cerave-hydrating','Hydrating Mineral Sunscreen SPF 50','75ML',950.00,4.1,1304),
  ('cerave-acne-control-cleanser','cerave','limpieza','cerave-foaming','Acne Control Cleanser','237ML',1068.00,4.4,2591),
  ('cerave-acne-foaming-cream-cleanser','cerave','limpieza','cerave-foaming','Acne Foaming Cream Cleanser','150ML',1068.00,4.4,2190),
  ('cerave-renewing-sa-cleanser','cerave','limpieza','cerave-foaming','Renewing SA Cleanser','236ML',1009.00,4.6,3570),
  ('cerave-cream-to-foam-cleanser','cerave','limpieza','cerave-hydrating','Hydrating Cream-To-Foam Cleanser','236ML',950.00,4.5,2415),
  ('cerave-foaming-oil-cleanser','cerave','limpieza','cerave-hydrating','Foaming Oil Cleanser','236ML',1009.00,4.5,1432),
  ('cerave-hydrating-cleanser-bar','cerave','limpieza','cerave-hydrating','Hydrating Cleanser Bar','128G',534.00,4.4,1241),
  ('cerave-blemish-control-cleanser','cerave','limpieza','cerave-foaming','Blemish Control Cleanser','236ML',1009.00,4.3,1099),
  ('cerave-hydrating-micellar-water','cerave','limpieza','cerave-hydrating','Hydrating Micellar Water','296ML',772.00,4.4,2018),
  ('cerave-moisturizing-lotion','cerave','humectar','cerave-hydrating','Moisturizing Lotion','355ML',1068.00,4.7,5290),
  ('cerave-daily-moisturizing-lotion','cerave','humectar','cerave-hydrating','Daily Moisturizing Lotion','236ML',891.00,4.6,4200),
  ('cerave-am-facial-moisturizing-lotion-spf30','cerave','humectar','cerave-hydrating','AM Facial Moisturizing Lotion SPF 30','89ML',1009.00,4.3,6185),
  ('cerave-am-facial-moisturizing-lotion-spf50','cerave','humectar','cerave-hydrating','AM Facial Moisturizing Lotion SPF 50','52ML',1128.00,4.4,2418),
  ('cerave-ultra-light-moisturizing-lotion-spf30','cerave','humectar','cerave-hydrating','Ultra-Light Moisturizing Lotion SPF 30','52ML',1187.00,4.5,1760),
  ('cerave-oil-control-moisturizing-gel-cream','cerave','humectar','cerave-hydrating','Oil Control Moisturizing Gel-Cream','52ML',1128.00,4.4,1322),
  ('cerave-skin-renewing-night-cream','cerave','humectar','cerave-hydrating','Skin Renewing Night Cream','48G',1366.00,4.6,1653),
  ('cerave-healing-ointment','cerave','humectar','cerave-hydrating','Healing Ointment','144G',891.00,4.8,4900),
  ('cerave-itch-relief-moisturizing-cream','cerave','humectar','cerave-hydrating','Itch Relief Moisturizing Cream','340G',1187.00,4.5,1140),
  ('cerave-diabetics-dry-skin-relief','cerave','humectar','cerave-hydrating','Diabetics Dry Skin Relief Moisturizing Cream','236ML',1128.00,4.4,843),
  ('cerave-eye-repair-cream','cerave','humectar','cerave-hydrating','Eye Repair Cream','14ML',1128.00,4.2,1930),
  ('cerave-baby-moisturizing-lotion','cerave','humectar','cerave-hydrating','Baby Moisturizing Lotion','237ML',712.00,4.7,1011),
  ('cerave-baby-cream','cerave','humectar','cerave-hydrating','Baby Cream','142G',712.00,4.7,998),
  ('cerave-resurfacing-retinol-serum','cerave','tratamiento','cerave-hydrating','Resurfacing Retinol Serum','30ML',1307.00,4.5,2860),
  ('cerave-skin-renewing-vitamin-c-serum','cerave','tratamiento','cerave-hydrating','Skin Renewing Vitamin C Serum','30ML',1425.00,4.4,1912),
  ('cerave-hydrating-hyaluronic-serum','cerave','tratamiento','cerave-hydrating','Hydrating Hyaluronic Serum','30ML',1187.00,4.5,1774),
  ('cerave-acne-control-gel','cerave','tratamiento','cerave-foaming','Acne Control Gel','40ML',1187.00,4.3,1329),
  ('cerave-skin-renewing-retinol-serum-alt','cerave','tratamiento','cerave-hydrating','Skin Renewing Retinol Serum (Advanced)','30ML',1484.00,4.4,1114),
  ('cerave-hydrating-mineral-sunscreen-spf30','cerave','proteger','cerave-hydrating','Hydrating Mineral Sunscreen SPF 30','75ML',950.00,4.2,1420),
  ('cerave-hydrating-mineral-sunscreen-spf30-sheer-tint','cerave','proteger','cerave-hydrating','Hydrating Mineral Sunscreen SPF 30 Sheer Tint','50ML',1009.00,4.3,1885),
  ('cerave-invisible-zinc-sunscreen-spf50','cerave','proteger','cerave-hydrating','Invisible Zinc Sunscreen SPF 50','50ML',1009.00,4.5,1222),
  ('cerave-hydrating-sheer-sunscreen-spf30','cerave','proteger','cerave-hydrating','Hydrating Sheer Sunscreen SPF 30','88ML',950.00,4.2,1044),
  ('cerave-body-mineral-sunscreen-spf50','cerave','proteger','cerave-hydrating','Body Mineral Sunscreen SPF 50','150ML',1068.00,4.3,832),

  -- La Roche-Posay (extra focused on acne/oily/anti-aging)
  ('lrp-effaclar-k-plus','la-roche-posay','tratamiento','effaclar','Effaclar K+ Renewing Lotion','40ML',2079.00,4.4,882),
  ('lrp-effaclar-micro-peeling-gel','la-roche-posay','limpieza','effaclar','Effaclar Micro-Peeling Purifying Gel','200ML',1662.00,4.5,1201),
  ('lrp-effaclar-serum-ultra-concentrated','la-roche-posay','tratamiento','effaclar','Effaclar Ultra Concentrated Serum','30ML',2551.00,4.5,1328),
  ('lrp-anthelios-clear-skin-spf60','la-roche-posay','proteger','anthelios','Anthelios Clear Skin Oil Free SPF 60','50ML',2019.00,4.5,2250),
  ('lrp-redermic-r-retinol-cream','la-roche-posay','tratamiento','toleriane','Redermic R Retinol Cream','30ML',2433.00,4.4,1043),
  ('lrp-pure-vitamin-c10-serum','la-roche-posay','tratamiento','toleriane','Pure Vitamin C10 Serum','30ML',2670.00,4.4,1872),
  ('lrp-retinol-b3-serum','la-roche-posay','tratamiento','hyalu-b5','Retinol B3 Serum','30ML',2670.00,4.5,1530),
  ('lrp-hyalu-b5-aquagel-spf30','la-roche-posay','proteger','hyalu-b5','Hyalu B5 Aquagel SPF 30','50ML',2433.00,4.4,734),
  ('lrp-hyalu-b5-pure-hyaluronic-acid-serum','la-roche-posay','tratamiento','hyalu-b5','Hyalu B5 Pure Hyaluronic Acid Serum','30ML',2375.00,4.5,2476),
  ('lrp-hyalu-b5-water-gel-moisturizer','la-roche-posay','humectar','hyalu-b5','Hyalu B5 Water Gel Moisturizer','50ML',2375.00,4.5,844),
  ('lrp-hyalu-b5-suractivated-cream','la-roche-posay','humectar','hyalu-b5','Hyalu B5 Suractivated Cream','50ML',2375.00,4.7,1832),
  ('lrp-toleriane-double-repair-face-moisturizer','la-roche-posay','humectar','toleriane','Toleriane Double Repair Face Moisturizer','100ML',1425.00,4.6,2716),
  ('lrp-toleriane-double-repair-matte','la-roche-posay','humectar','toleriane','Toleriane Double Repair Matte Moisturizer','75ML',1425.00,4.4,988),
  ('lrp-toleriane-hydrating-gentle-facial-cleanser','la-roche-posay','limpieza','toleriane','Toleriane Hydrating Gentle Facial Cleanser','400ML',1187.00,4.6,2716),
  ('lrp-lipikar-ap-max-triple-repair-cream','la-roche-posay','humectar','lipikar','Lipikar AP+MAX Triple Repair Moisturizing Cream','400ML',1781.00,4.7,2901),
  ('lrp-lipikar-ap-gentle-foaming-cleansing-oil','la-roche-posay','limpieza','lipikar','Lipikar AP+ Gentle Foaming Cleansing Oil','400ML',1484.00,4.7,1710),
  ('lrp-lipikar-urea-10-roughness-smoothing-lotion','la-roche-posay','humectar','lipikar','Lipikar Urea 10% Roughness Smoothing Lotion','400ML',1781.00,4.5,404),
  ('lrp-effaclar-mat-mattifying-moisturizer','la-roche-posay','humectar','effaclar','Effaclar Mat Mattifying Moisturizer','40ML',2138.00,4.4,781)
) AS p(slug, brand_slug, category_slug, line_slug, name, size_label, price_dop, rating, review_count)
JOIN brands b ON b.slug = p.brand_slug
JOIN product_categories c ON c.slug = p.category_slug
JOIN product_lines l ON l.slug = p.line_slug
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  size_label = EXCLUDED.size_label,
  price_dop = EXCLUDED.price_dop,
  rating = EXCLUDED.rating,
  review_count = EXCLUDED.review_count,
  is_active = TRUE;
