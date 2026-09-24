import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const KEYLEN = 64;

// Formato guardado: "scrypt$<salt hex>$<hash hex>"
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password.normalize('NFKC'), salt, KEYLEN);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  const [alg, saltHex, keyHex] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !saltHex || !keyHex) return false;
  const key = await scryptAsync(password.normalize('NFKC'), Buffer.from(saltHex, 'hex'), KEYLEN);
  return timingSafeEqual(key, Buffer.from(keyHex, 'hex'));
}

// Devuelve el mensaje de error o '' si es válida. Mismas reglas que en el front.
export function passwordError(p) {
  if (typeof p !== 'string' || p.length < 8) return 'Usa al menos 8 caracteres.';
  if (p.length > 128) return 'Usa como máximo 128 caracteres.';
  if (!/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(p) || !/\d/.test(p)) return 'Combina letras y números.';
  return '';
}
