import { Resend } from 'resend';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { LOGO_CID } from '../emails/layout.js';
import { activationEmail } from '../emails/activation.js';
import { solicitudInternaEmail, solicitudClienteEmail } from '../emails/solicitud.js';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.MAIL_FROM || 'ShopCommerce <onboarding@resend.dev>';
// Encargado(s) que reciben las solicitudes de cotización/demo. Varios separados por coma.
export const SOLICITUDES_TO = (process.env.SOLICITUDES_TO || '').split(',').map(s => s.trim()).filter(Boolean);

// El logo va adjunto inline (cid:) para que se vea sin depender de una URL pública.
// contentType explícito: sin él Resend lo manda como application/octet-stream y Gmail no lo muestra inline.
const LOGO = { filename: 'shopcommerce.png', content: readFileSync(new URL('../assets/logo-light.png', import.meta.url)), contentType: 'image/png', contentId: LOGO_CID };

async function send({ to, replyTo, subject, html, text, attachments = [], category }) {
  const { data, error } = await resend.emails.send({
    from: FROM, to, replyTo, subject, html, text,
    attachments: [LOGO, ...attachments],
    tags: [{ name: 'category', value: category }]
  });
  if (error) throw new Error(`Resend: ${error.name} – ${error.message}`);
  return data;
}

export function sendActivationEmail({ nombre, correo, link, horas }) {
  return send({ to: [correo], category: 'activation', ...activationEmail({ nombre, link, horas }) });
}

// Envía la solicitud al encargado (con el logo del cliente adjunto) y la confirmación al cliente.
// Si falla el correo al encargado se lanza el error; la confirmación al cliente es secundaria.
export async function sendSolicitud({ usuario, data, logo }) {
  if (!SOLICITUDES_TO.length) throw new Error('Falta SOLICITUDES_TO en .env');
  const adjuntos = logo ? [{ filename: `logo-${data.empresa.replace(/[^\w-]+/g, '_')}${basename(logo.path).match(/\.\w+$/)?.[0] || ''}`, content: readFileSync(logo.path), contentType: logo.mimetype }] : [];
  await send({
    to: SOLICITUDES_TO, replyTo: usuario.correo, category: 'solicitud',
    attachments: adjuntos,
    ...solicitudInternaEmail({ usuario, data: { ...data, tieneLogo: !!logo } })
  });
  try {
    await send({ to: [usuario.correo], replyTo: SOLICITUDES_TO[0], category: 'solicitud-confirmacion', ...solicitudClienteEmail({ usuario, data }) });
  } catch (e) { console.error('No se pudo enviar la confirmación al cliente:', e.message); }
}
