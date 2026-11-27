CREATE TABLE IF NOT EXISTS entregas (
  orden_id TEXT PRIMARY KEY,
  referencia TEXT NOT NULL UNIQUE,
  correo TEXT NOT NULL,
  productos TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  aprobado_en INTEGER,
  primer_envio_en INTEGER,
  enviado_en INTEGER
);

CREATE INDEX IF NOT EXISTS entregas_pendientes
  ON entregas (aprobado_en, primer_envio_en)
  WHERE enviado_en IS NULL;
