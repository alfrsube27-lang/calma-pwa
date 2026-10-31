-- ===========================================================
-- Base de datos D1 de Calma (SQLite)
-- Solo guarda lo mínimo: a qué teléfono avisar, qué avisar
-- y un respaldo opcional. Los datos de verdad viven en el móvil.
-- ===========================================================

-- Suscripciones push (normalmente una sola: tu iPhone)
CREATE TABLE IF NOT EXISTS suscripciones (
  endpoint TEXT PRIMARY KEY,
  p256dh   TEXT NOT NULL,
  auth     TEXT NOT NULL,
  creado   INTEGER NOT NULL
);

-- Recordatorios futuros que el cron debe disparar
CREATE TABLE IF NOT EXISTS recordatorios (
  id        TEXT PRIMARY KEY,     -- id estable generado por la app
  titulo    TEXT NOT NULL,
  cuerpo    TEXT NOT NULL,
  url       TEXT,
  enviar_en INTEGER NOT NULL,     -- epoch en milisegundos
  urgente   INTEGER NOT NULL DEFAULT 0,
  enviado   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_recordatorios_pendientes
  ON recordatorios (enviado, enviar_en);

-- Configuración del servidor (modo día difícil, zona horaria)
CREATE TABLE IF NOT EXISTS config (
  clave TEXT PRIMARY KEY,
  valor TEXT
);

-- Salidas de dinero detectadas en el correo (Yape, Plin, el banco).
-- Guardamos lo mínimo para reconocerlas: el monto, de dónde vino y una
-- línea corta de referencia. Nunca el correo entero.
CREATE TABLE IF NOT EXISTS por_clasificar (
  id     TEXT PRIMARY KEY,          -- hash del aviso: evita duplicados
  monto  REAL NOT NULL,
  origen TEXT NOT NULL,             -- yape | plin | banco
  texto  TEXT,
  fecha  TEXT NOT NULL,             -- "AAAA-MM-DD" en la zona del usuario
  hora   TEXT,
  creado INTEGER NOT NULL,
  leido  INTEGER NOT NULL DEFAULT 0 -- 1 = la app ya se lo llevó
);

CREATE INDEX IF NOT EXISTS idx_por_clasificar_pendientes
  ON por_clasificar (leido, creado);

-- Respaldo opcional del JSON completo (una sola fila)
CREATE TABLE IF NOT EXISTS respaldo (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  json        TEXT NOT NULL,
  actualizado INTEGER NOT NULL
);
