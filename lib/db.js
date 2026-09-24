import pg from 'pg';

if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL en .env (connection string de Supabase).');

// Supabase exige SSL. Su certificado lo firma la CA de Supabase, que no viene en Node,
// por eso no se valida la cadena salvo que se entregue la CA en SUPABASE_CA (ruta al .crt).
const ssl = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false
  : process.env.SUPABASE_CA ? { ca: (await import('node:fs')).readFileSync(process.env.SUPABASE_CA, 'utf8') }
  : { rejectUnauthorized: false };

// sslmode en la URL pisa la opción ssl de arriba, así que se quita.
const connectionString = process.env.DATABASE_URL.replace(/([?&])sslmode=[^&]*&?/, '$1').replace(/[?&]$/, '');
export const pool = new pg.Pool({ connectionString, ssl, max: 5 });

// Primera fila o null.
export const one = async (sql, params = []) => (await pool.query(sql, params)).rows[0] ?? null;
export const run = (sql, params = []) => pool.query(sql, params);

// Esquema. Idempotente: se ejecuta en cada arranque.
// RLS activado sin políticas: la Data API de Supabase (anon/authenticated) no puede leer ni escribir estas tablas;
// solo este servidor, que se conecta como dueño de las tablas.
await pool.query(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre            TEXT NOT NULL,
    correo            TEXT NOT NULL UNIQUE,
    telefono          TEXT NOT NULL,
    rol               TEXT NOT NULL,
    estado            TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','activo')),
    token_hash        TEXT UNIQUE,
    token_expira      TIMESTAMPTZ,
    correo_enviado_at TIMESTAMPTZ,
    activado_at       TIMESTAMPTZ,
    password_hash     TEXT,
    onboarding        JSONB,
    logo_path         TEXT,
    onboarding_at     TIMESTAMPTZ,
    creado_at         TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS sesiones (
    token_hash TEXT PRIMARY KEY,
    usuario_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    expira     TIMESTAMPTZ NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sesiones_usuario_idx ON sesiones (usuario_id);

  ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
  ALTER TABLE sesiones ENABLE ROW LEVEL SECURITY;
`);
