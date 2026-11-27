CREATE TABLE IF NOT EXISTS clientes (
  google_sub TEXT PRIMARY KEY NOT NULL,
  correo TEXT NOT NULL,
  creado_en INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS sesiones_clientes (
  token_hash TEXT PRIMARY KEY NOT NULL,
  google_sub TEXT NOT NULL REFERENCES clientes(google_sub),
  vence INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS sesiones_clientes_vence ON sesiones_clientes (vence);

CREATE TABLE IF NOT EXISTS pedidos_clientes (
  orden_id TEXT PRIMARY KEY NOT NULL,
  referencia TEXT NOT NULL UNIQUE,
  google_sub TEXT NOT NULL REFERENCES clientes(google_sub),
  creado_en INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS pedidos_clientes_historial
  ON pedidos_clientes (google_sub, creado_en DESC, orden_id);
