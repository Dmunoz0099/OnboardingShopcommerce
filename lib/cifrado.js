import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// Cifrado en reposo del certificado digital y su contraseña (AES-256-GCM).
// CERT_ENC_KEY: 32 bytes en base64, fuera de la base de datos. Genera una con:
//   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
const key = process.env.CERT_ENC_KEY ? Buffer.from(process.env.CERT_ENC_KEY, 'base64') : null;
export const cifradoListo = key?.length === 32;
if (process.env.CERT_ENC_KEY && !cifradoListo) console.warn('⚠  CERT_ENC_KEY debe ser una llave de 32 bytes en base64.');

// Formato: iv (12 bytes) | tag (16 bytes) | datos cifrados.
export function cifrar(buf) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const datos = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), datos]);
}

export function descifrar(buf) {
  const d = createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]);
}
