-- Seed dermatologists only (no table creation)
-- Scope:
-- 1) Insert/update dermatologists using real columns
-- 2) Clear old relations only for seeded dermatologists
-- 3) Insert dermatologist_concerns relations
-- 4) Insert dermatologist_skin_types relations

WITH input(name, specialty, mode, location, availability_note, rating, photo_url, is_active) AS (
  VALUES
    ('Dra. Maria Fernandez','Dermatologia Clinica - Acne y Sebo','both','Santo Domingo, RD','Disponible manana',4.9,'https://placehold.co/200x200/dbeafe/1e3a8a?text=MF',true),
    ('Dr. Carlos Mejia','Dermatologia - Acne y Comedones','virtual','Santiago, RD','Proxima disponibilidad: miercoles',4.8,'https://placehold.co/200x200/dcfce7/166534?text=CM',true),
    ('Dra. Laura Santana','Dermatologia Estetica - Control de Sebo','presencial','Santo Domingo Oeste, RD','Disponible hoy',4.7,'https://placehold.co/200x200/fef9c3/854d0e?text=LS',true),

    ('Dra. Ana Herrera','Dermatologia - Manchas y Pigmentacion','both','Piantini, Santo Domingo','Disponible hoy',5.0,'https://placehold.co/200x200/fce7f3/831843?text=AH',true),
    ('Dr. Roberto Taveras','Dermatologia Clinica - Fotodano','virtual','Consulta virtual - RD','Proxima disponibilidad: jueves',4.8,'https://placehold.co/200x200/ede9fe/4c1d95?text=RT',true),
    ('Dra. Patricia Nunez','Dermatologia - Tono y Luminosidad','presencial','Gazcue, Santo Domingo','Proxima disponibilidad: viernes',4.7,'https://placehold.co/200x200/d1fae5/065f46?text=PN',true),

    ('Dra. Sofia Perez','Dermatologia - Piel Sensible y Rosacea','both','Naco, Santo Domingo','Disponible hoy',4.9,'https://placehold.co/200x200/fde68a/92400e?text=SP',true),
    ('Dr. Andres Castillo','Dermatologia Clinica - Intolerancia Cutanea','virtual','Consulta virtual - RD','Proxima disponibilidad: jueves',4.8,'https://placehold.co/200x200/e0f2fe/0c4a6e?text=AC',true),
    ('Dra. Isabela Vargas','Dermatologia Pediatrica y Adultos - Barrera','presencial','La Romana, RD','Proxima disponibilidad: miercoles',4.7,'https://placehold.co/200x200/fef3c7/78350f?text=IV',true),

    ('Dra. Carmen Alvarez','Dermatologia - Eczema y Piel Seca','both','Los Cacicazgos, Santo Domingo','Disponible manana',5.0,'https://placehold.co/200x200/cffafe/164e63?text=CA',true),
    ('Dr. Miguel Torres','Dermatologia Clinica - Dermatitis Atopica','virtual','Consulta virtual - RD','Proxima disponibilidad: jueves',4.8,'https://placehold.co/200x200/e9d5ff/4c1d95?text=MT',true),
    ('Dra. Gabriela Rosario','Dermatologia - Hidratacion y Reparacion','presencial','Distrito Nacional, RD','Proxima disponibilidad: viernes',4.7,'https://placehold.co/200x200/d1fae5/064e3b?text=GR',true),

    ('Dra. Valeria Marte','Dermatologia Estetica - Antienvejecimiento','both','Bella Vista, Santo Domingo','Disponible manana',5.0,'https://placehold.co/200x200/fce7f3/9d174d?text=VM',true),
    ('Dr. Francisco Solano','Dermatologia Clinica - Hidratacion Profunda','virtual','Consulta virtual - RD','Proxima disponibilidad: miercoles',4.9,'https://placehold.co/200x200/dbeafe/1e40af?text=FS',true),
    ('Dra. Elena Jimenez','Dermatologia Regenerativa - Envejecimiento','presencial','Evaristo Morales, Santo Domingo','Proxima disponibilidad: viernes',4.8,'https://placehold.co/200x200/fef9c3/713f12?text=EJ',true)
),
updated AS (
  UPDATE dermatologists d
  SET
    specialty = i.specialty,
    mode = i.mode,
    location = i.location,
    availability_note = i.availability_note,
    rating = i.rating,
    photo_url = i.photo_url,
    is_active = i.is_active
  FROM input i
  WHERE LOWER(d.name) = LOWER(i.name)
  RETURNING d.id
)
INSERT INTO dermatologists (name, specialty, mode, location, availability_note, rating, photo_url, is_active)
SELECT i.name, i.specialty, i.mode, i.location, i.availability_note, i.rating, i.photo_url, i.is_active
FROM input i
WHERE NOT EXISTS (
  SELECT 1
  FROM dermatologists d
  WHERE LOWER(d.name) = LOWER(i.name)
);

WITH seeded AS (
  SELECT id, LOWER(name) AS name
  FROM dermatologists
  WHERE LOWER(name) IN (
    'dra. maria fernandez','dr. carlos mejia','dra. laura santana',
    'dra. ana herrera','dr. roberto taveras','dra. patricia nunez',
    'dra. sofia perez','dr. andres castillo','dra. isabela vargas',
    'dra. carmen alvarez','dr. miguel torres','dra. gabriela rosario',
    'dra. valeria marte','dr. francisco solano','dra. elena jimenez'
  )
)
DELETE FROM dermatologist_concerns dc
USING seeded s
WHERE dc.dermatologist_id = s.id;

WITH seeded AS (
  SELECT id, LOWER(name) AS name
  FROM dermatologists
  WHERE LOWER(name) IN (
    'dra. maria fernandez','dr. carlos mejia','dra. laura santana',
    'dra. ana herrera','dr. roberto taveras','dra. patricia nunez',
    'dra. sofia perez','dr. andres castillo','dra. isabela vargas',
    'dra. carmen alvarez','dr. miguel torres','dra. gabriela rosario',
    'dra. valeria marte','dr. francisco solano','dra. elena jimenez'
  )
)
DELETE FROM dermatologist_skin_types dst
USING seeded s
WHERE dst.dermatologist_id = s.id;

WITH seeded AS (
  SELECT id, LOWER(name) AS name
  FROM dermatologists
  WHERE LOWER(name) IN (
    'dra. maria fernandez','dr. carlos mejia','dra. laura santana',
    'dra. ana herrera','dr. roberto taveras','dra. patricia nunez',
    'dra. sofia perez','dr. andres castillo','dra. isabela vargas',
    'dra. carmen alvarez','dr. miguel torres','dra. gabriela rosario',
    'dra. valeria marte','dr. francisco solano','dra. elena jimenez'
  )
)
INSERT INTO dermatologist_concerns (dermatologist_id, concern_code, priority_score)
SELECT s.id, x.concern_code, x.priority_score
FROM seeded s
JOIN (
  VALUES
    ('dra. maria fernandez','acne',10),('dra. maria fernandez','poros',10),('dra. maria fernandez','textura',6),
    ('dr. carlos mejia','acne',10),('dr. carlos mejia','poros',10),('dr. carlos mejia','textura',6),
    ('dra. laura santana','acne',9),('dra. laura santana','poros',8),('dra. laura santana','textura',6),
    ('dra. ana herrera','manchas',10),('dra. ana herrera','luminosidad',7),
    ('dr. roberto taveras','manchas',10),('dr. roberto taveras','arrugas',6),
    ('dra. patricia nunez','manchas',9),('dra. patricia nunez','luminosidad',9),
    ('dra. sofia perez','sensibilidad',10),('dra. sofia perez','barrera',10),('dra. sofia perez','rojez',8),
    ('dr. andres castillo','sensibilidad',10),('dr. andres castillo','barrera',8),('dr. andres castillo','rojez',7),
    ('dra. isabela vargas','barrera',10),('dra. isabela vargas','sensibilidad',8),
    ('dra. carmen alvarez','barrera',9),('dra. carmen alvarez','sensibilidad',8),('dra. carmen alvarez','deshidratacion',8),
    ('dr. miguel torres','barrera',8),('dr. miguel torres','sensibilidad',8),('dr. miguel torres','deshidratacion',7),
    ('dra. gabriela rosario','deshidratacion',10),('dra. gabriela rosario','barrera',8),
    ('dra. valeria marte','arrugas',10),('dra. valeria marte','deshidratacion',8),('dra. valeria marte','luminosidad',7),
    ('dr. francisco solano','deshidratacion',10),('dr. francisco solano','arrugas',7),
    ('dra. elena jimenez','arrugas',10),('dra. elena jimenez','deshidratacion',8),('dra. elena jimenez','manchas',5)
) AS x(name, concern_code, priority_score)
ON s.name = x.name;

WITH seeded AS (
  SELECT id, LOWER(name) AS name
  FROM dermatologists
  WHERE LOWER(name) IN (
    'dra. maria fernandez','dr. carlos mejia','dra. laura santana',
    'dra. ana herrera','dr. roberto taveras','dra. patricia nunez',
    'dra. sofia perez','dr. andres castillo','dra. isabela vargas',
    'dra. carmen alvarez','dr. miguel torres','dra. gabriela rosario',
    'dra. valeria marte','dr. francisco solano','dra. elena jimenez'
  )
)
INSERT INTO dermatologist_skin_types (dermatologist_id, skin_type_code, priority_score)
SELECT s.id, x.skin_type_code, x.priority_score
FROM seeded s
JOIN (
  VALUES
    ('dra. maria fernandez','grasa',10),('dra. maria fernandez','mixta',8),
    ('dr. carlos mejia','grasa',10),('dr. carlos mejia','mixta',8),
    ('dra. laura santana','grasa',10),('dra. laura santana','mixta',7),
    ('dra. ana herrera','normal',8),('dra. ana herrera','mixta',8),
    ('dr. roberto taveras','normal',7),('dr. roberto taveras','mixta',7),
    ('dra. patricia nunez','normal',8),('dra. patricia nunez','mixta',8),
    ('dra. sofia perez','seca',8),('dra. sofia perez','normal',8),
    ('dr. andres castillo','seca',8),('dr. andres castillo','normal',7),
    ('dra. isabela vargas','seca',8),('dra. isabela vargas','normal',8),
    ('dra. carmen alvarez','seca',10),('dra. carmen alvarez','normal',7),
    ('dr. miguel torres','seca',10),('dr. miguel torres','normal',7),
    ('dra. gabriela rosario','seca',10),('dra. gabriela rosario','normal',8),
    ('dra. valeria marte','normal',8),('dra. valeria marte','seca',7),
    ('dr. francisco solano','seca',9),('dr. francisco solano','normal',8),
    ('dra. elena jimenez','normal',8),('dra. elena jimenez','seca',7)
) AS x(name, skin_type_code, priority_score)
ON s.name = x.name;