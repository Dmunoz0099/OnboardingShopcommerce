import express from 'express';
import multer from 'multer';
import { randomBytes, createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { one, run } from './lib/db.js';
import { sendActivationEmail, sendSolicitud, SOLICITUDES_TO } from './lib/mailer.js';
import { hashPassword, verifyPassword, passwordError } from './lib/password.js';

const PORT = +process.env.PORT || 3000;
const APP_URL = (process.env.APP_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');
const TTL_HOURS = +process.env.ACTIVATION_TTL_HOURS || 24;
const RESEND_COOLDOWN_MS = 60_000;
const SESSION_DAYS = 7;
const COOKIE = 'sc_session';
const ROLES = ['Dueño/a', 'Administración', 'Operaciones', 'Ventas', 'TI'];

if (!process.env.RESEND_API_KEY) console.warn('⚠  Falta RESEND_API_KEY en .env: los correos no se podrán enviar.');
if (!SOLICITUDES_TO.length) console.warn('⚠  Falta SOLICITUDES_TO en .env: las solicitudes de cotización/demo no llegarán a nadie.');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));

// ---------- Helpers ----------
const sha256 = s => createHash('sha256').update(s).digest('hex');
const newToken = () => randomBytes(32).toString('base64url');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

function readCookie(req, name) {
  const m = (req.headers.cookie || '').split(/;\s*/).find(c => c.startsWith(name + '='));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
}

function validateRegistro(b) {
  const nombre = String(b.nombre || '').trim().replace(/\s+/g, ' ');
  const correo = String(b.correo || '').trim().toLowerCase();
  let tel = String(b.telefono || '').replace(/\D/g, '');
  if (tel.startsWith('56')) tel = tel.slice(2);
  const rol = String(b.rol || '');
  if (nombre.length < 3 || nombre.length > 80 || nombre.split(' ').length < 2) return { error: 'Ingresa tu nombre y apellido.' };
  if (!EMAIL_RE.test(correo) || correo.length > 254) return { error: 'El correo no es válido.' };
  if (!/^[2-9]\d{8}$/.test(tel)) return { error: 'El teléfono debe tener 9 dígitos.' };
  if (!ROLES.includes(rol)) return { error: 'Elige un rol válido.' };
  return { nombre, correo, telefono: '+56' + tel, rol };
}

// Genera un token nuevo (se guarda solo su hash), lo persiste y envía el correo.
async function issueActivation(user) {
  const token = newToken();
  await run(`UPDATE usuarios SET token_hash = $1, token_expira = now() + make_interval(hours => $2), correo_enviado_at = now() WHERE id = $3`,
    [sha256(token), TTL_HOURS, user.id]);
  const link = `${APP_URL}/activar?token=${token}`;
  await sendActivationEmail({ nombre: user.nombre, correo: user.correo, link, horas: TTL_HOURS });
}

async function startSession(res, usuarioId) {
  const token = newToken();
  const maxAge = SESSION_DAYS * 86400_000;
  await run('INSERT INTO sesiones (token_hash, usuario_id, expira) VALUES ($1, $2, $3)', [sha256(token), usuarioId, new Date(Date.now() + maxAge)]);
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: APP_URL.startsWith('https://'), maxAge, path: '/' });
}

async function currentUser(req) {
  const token = readCookie(req, COOKIE);
  if (!token) return null;
  return one('SELECT u.* FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id WHERE s.token_hash = $1 AND s.expira > now()', [sha256(token)]);
}

const publicUser = u => ({
  nombre: u.nombre, correo: u.correo, telefono: u.telefono, rol: u.rol, estado: u.estado,
  tienePassword: !!u.password_hash,
  onboardingCompleto: !!u.onboarding_at,
  empresa: u.onboarding?.empresa ?? null
});

// Middleware: exige sesión de un usuario activo.
async function requireUser(req, res, next) {
  const user = await currentUser(req);
  if (!user) return res.status(401).json({ error: 'Tu sesión expiró. Inicia sesión o abre de nuevo el link de activación.' });
  if (user.estado !== 'activo') return res.status(403).json({ error: 'Primero activa tu cuenta desde el correo.' });
  req.user = user;
  next();
}

// ---------- Registro (paso 1) ----------
// Crea el usuario en estado "pendiente" y envía el correo con el link de activación.
app.post('/api/registro', async (req, res) => {
  const v = validateRegistro(req.body || {});
  if (v.error) return res.status(400).json({ error: v.error });

  let user = await one('SELECT * FROM usuarios WHERE correo = $1', [v.correo]);
  if (user?.estado === 'activo') return res.status(409).json({ error: 'Ya existe una cuenta activa con ese correo. Inicia sesión.' });
  if (user && user.correo_enviado_at && Date.now() - user.correo_enviado_at < RESEND_COOLDOWN_MS) {
    return res.status(429).json({ error: 'Ya te enviamos un link hace un momento. Revisa tu correo o espera un minuto.' });
  }

  if (user) {
    await run('UPDATE usuarios SET nombre = $1, telefono = $2, rol = $3 WHERE id = $4', [v.nombre, v.telefono, v.rol, user.id]);
    user = { ...user, ...v };
  } else {
    // ON CONFLICT: si dos registros con el mismo correo llegan a la vez, el segundo no revienta.
    user = await one(`INSERT INTO usuarios (nombre, correo, telefono, rol) VALUES ($1, $2, $3, $4)
      ON CONFLICT (correo) DO UPDATE SET nombre = EXCLUDED.nombre RETURNING *`, [v.nombre, v.correo, v.telefono, v.rol]);
  }

  try {
    await issueActivation(user);
  } catch (e) {
    console.error(e);
    await run('UPDATE usuarios SET correo_enviado_at = NULL WHERE id = $1', [user.id]);
    return res.status(502).json({ error: 'No pudimos enviar el correo de activación. Inténtalo de nuevo.' });
  }
  res.status(201).json({ ok: true, correo: user.correo });
});

// Reenvía el link. Responde igual exista o no la cuenta, para no revelar qué correos están registrados.
app.post('/api/registro/reenviar', async (req, res) => {
  const correo = String(req.body?.correo || '').trim().toLowerCase();
  if (!EMAIL_RE.test(correo)) return res.status(400).json({ error: 'El correo no es válido.' });
  const user = await one("SELECT * FROM usuarios WHERE correo = $1 AND estado = 'pendiente'", [correo]);
  if (user) {
    if (user.correo_enviado_at && Date.now() - user.correo_enviado_at < RESEND_COOLDOWN_MS) {
      return res.status(429).json({ error: 'Espera un minuto antes de pedir otro link.' });
    }
    try { await issueActivation(user); }
    catch (e) { console.error(e); return res.status(502).json({ error: 'No pudimos reenviar el link. Inténtalo en un momento.' }); }
  }
  res.json({ ok: true });
});

// ---------- Activación (link del correo) ----------
// Cambia el estado a "activo", abre sesión y vuelve al front en el paso 2.
// El token sigue sirviendo hasta que vence: así, si un antivirus de correo "visita" el link antes
// que la persona, el clic real igual abre la sesión en vez de mostrar "link inválido".
app.get('/activar', async (req, res) => {
  const token = String(req.query.token || '');
  const user = token && await one('SELECT * FROM usuarios WHERE token_hash = $1', [sha256(token)]);
  if (!user) return res.redirect('/?activacion=invalida');
  if (user.token_expira < Date.now()) return res.redirect('/?activacion=expirada&correo=' + encodeURIComponent(user.correo));

  if (user.estado !== 'activo') await run("UPDATE usuarios SET estado = 'activo', activado_at = now() WHERE id = $1", [user.id]);
  await startSession(res, user.id);
  res.redirect('/?activacion=ok');
});

app.get('/api/me', async (req, res) => {
  const user = await currentUser(req);
  if (!user) return res.status(401).json({ error: 'No autenticado.' });
  res.json(publicUser(user));
});

// ---------- Contraseña (justo después de activar) ----------
// Solo sirve para crear la primera contraseña; cambiarla después debe ir por un flujo con la contraseña actual.
app.post('/api/password', requireUser, async (req, res) => {
  if (req.user.password_hash) return res.status(409).json({ error: 'Tu cuenta ya tiene contraseña. Inicia sesión con ella.' });
  const password = req.body?.password;
  const err = passwordError(password);
  if (err) return res.status(400).json({ error: err });
  await run('UPDATE usuarios SET password_hash = $1 WHERE id = $2', [await hashPassword(password), req.user.id]);
  res.json({ ok: true });
});

// ---------- Login ----------
// Bloqueo simple en memoria: 5 intentos fallidos por correo cada 15 minutos.
const MAX_FAILS = 5, LOCK_MS = 15 * 60_000;
const fails = new Map();
const DUMMY_HASH = await hashPassword(randomBytes(16).toString('hex'));

app.post('/api/login', async (req, res) => {
  const correo = String(req.body?.correo || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!EMAIL_RE.test(correo) || !password) return res.status(400).json({ error: 'Ingresa tu correo y contraseña.' });

  const f = fails.get(correo);
  if (f && f.n >= MAX_FAILS && Date.now() - f.at < LOCK_MS) {
    return res.status(429).json({ error: 'Demasiados intentos. Espera 15 minutos e inténtalo de nuevo.' });
  }

  const user = await one('SELECT * FROM usuarios WHERE correo = $1', [correo]);
  // Se verifica igual contra un hash de relleno para no revelar por tiempo de respuesta si el correo existe.
  const ok = await verifyPassword(password, user?.password_hash || DUMMY_HASH) && !!user?.password_hash;
  if (!ok) {
    const n = f && Date.now() - f.at < LOCK_MS ? f.n + 1 : 1;
    fails.set(correo, { n, at: Date.now() });
    return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
  }
  fails.delete(correo);
  await startSession(res, user.id);
  res.json(publicUser(user));
});

app.post('/api/logout', async (req, res) => {
  const token = readCookie(req, COOKIE);
  if (token) await run('DELETE FROM sesiones WHERE token_hash = $1', [sha256(token)]);
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});

// ---------- Resto del onboarding (pasos 2 a 8) ----------
mkdirSync('uploads', { recursive: true });
const LOGO_TYPES = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/svg+xml': '.svg', 'image/webp': '.webp' };
const upload = multer({
  storage: multer.diskStorage({
    destination: 'uploads',
    filename: (req, file, cb) => cb(null, `logo-${Date.now()}-${randomBytes(6).toString('hex')}${LOGO_TYPES[file.mimetype]}`)
  }),
  limits: { fileSize: 2 * 1048576, files: 1 },
  fileFilter: (req, file, cb) => cb(null, file.fieldname === 'logo' && !!LOGO_TYPES[file.mimetype])
});

// Paso 8: guarda los datos y envía la solicitud (cotización o demo) al encargado de ShopCommerce.
app.post('/api/onboarding', requireUser, (req, res, next) => {
  if (!req.user.password_hash) return res.status(403).json({ error: 'Primero crea tu contraseña.' });
  if (req.user.onboarding_at) return res.status(409).json({ error: 'Ya enviaste tu solicitud. Un ejecutivo te contactará pronto.' });
  next();
}, upload.single('logo'), async (req, res) => {
  let data;
  try { data = JSON.parse(req.body.data || ''); } catch { return res.status(400).json({ error: 'Datos inválidos.' }); }
  if (!data || typeof data !== 'object' || !data.empresa || !data.rut || !data.plan) return res.status(400).json({ error: 'Faltan datos del onboarding.' });
  delete data.contacto; // los datos de contacto ya quedaron en el registro
  if (!['cotizacion', 'demo'].includes(data.tipo)) data.tipo = 'cotizacion';

  // Se guarda antes de enviar para no perder datos; onboarding_at se marca solo si el encargado recibió la solicitud.
  await run('UPDATE usuarios SET onboarding = $1, logo_path = COALESCE($2, logo_path) WHERE id = $3',
    [JSON.stringify(data), req.file?.path ?? null, req.user.id]);
  const logoPath = req.file?.path ?? req.user.logo_path;
  const logo = logoPath && { path: logoPath, mimetype: Object.keys(LOGO_TYPES).find(t => logoPath.endsWith(LOGO_TYPES[t])) };

  try {
    await sendSolicitud({ usuario: req.user, data, logo });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'Guardamos tus datos, pero no pudimos enviar la solicitud. Inténtalo de nuevo.' });
  }
  await run('UPDATE usuarios SET onboarding_at = now() WHERE id = $1', [req.user.id]);
  res.json({ ok: true });
});

// ---------- Front ----------
app.use('/assets', express.static(fileURLToPath(new URL('./assets', import.meta.url))));
app.get('/', (req, res) => res.sendFile(fileURLToPath(new URL('./index.html', import.meta.url))));

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'El logo supera los 2 MB.' : 'Archivo inválido.' });
  console.error(err);
  res.status(500).json({ error: 'Error interno.' });
});

app.listen(PORT, () => console.log(`ShopCommerce onboarding en ${APP_URL}`));
