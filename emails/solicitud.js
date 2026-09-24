import { layout, button, esc } from './layout.js';

export const TIPOS = { cotizacion: 'Cotización', demo: 'Demo' };
export const PLANES = { basico: 'Plan Básico · UF 4 / mes', escala: 'Plan Escala · UF 6 / mes', premium: 'Plan Premium · UF 8 / mes' };

const fecha = () => new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'long', timeStyle: 'short' });

const section = (titulo, filas) => `
        <tr><td style="padding:0 40px 20px">
          <div style="font-size:12px;font-weight:bold;letter-spacing:.06em;text-transform:uppercase;color:#6B7280;margin:0 0 8px">${esc(titulo)}</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F9FAFB;border-radius:14px">
            ${filas.filter(([, v]) => v !== undefined).map(([k, v], i) => `
            <tr>
              <td style="padding:10px 16px;font-size:14px;color:#6B7280;width:38%;vertical-align:top;${i ? 'border-top:1px solid #EEF0F4' : ''}">${esc(k)}</td>
              <td style="padding:10px 16px;font-size:14px;color:#111827;font-weight:bold;vertical-align:top;${i ? 'border-top:1px solid #EEF0F4' : ''}">${v}</td>
            </tr>`).join('')}
          </table>
        </td></tr>`;

const CANALES = { pos: 'POS', ecommerce: 'Ecommerce', whatsapp: 'WhatsApp', instagram: 'Instagram', app: 'App' };
const MEDIOS = { transbank: 'Transbank', 'bci-pagos': 'BCI Pagos', getnet: 'Getnet', 'mercado-pago': 'Mercado Pago', flow: 'Flow', khipu: 'Khipu', efectivo: 'Efectivo', transferencia: 'Transferencia' };
const medios = c => c.mediosPago.map(m => m === 'otro' ? `Otro: ${c.otroMedioPago || '—'}` : MEDIOS[m] || m).join(', ');
const canalTxt = c => (c.plataforma ? `${c.plataforma} · ` : '') + medios(c);
const localTxt = l => `${l.codigo} · ${l.direccion}, ${l.comuna}`;
// El certificado nunca va en el correo: queda cifrado en el servidor.
const facturadorTxt = f => f.tipo === 'shopcommerce' ? 'Facturador ShopCommerce (certificado recibido y cifrado en el servidor)' : f.nombre;

function detalle(u, d) {
  const e = d.empresa;
  return {
    contacto: [
      ['Nombre', esc(u.nombre)],
      ['Rol', esc(u.rol)],
      ['Correo', `<a href="mailto:${esc(u.correo)}" style="color:#1C41DE">${esc(u.correo)}</a>`],
      ['Teléfono', `<a href="tel:${esc(u.telefono)}" style="color:#1C41DE">${esc(u.telefono)}</a>`]
    ],
    empresa: [
      ['Razón social', esc(e.razonSocial)],
      ['RUT', esc(e.rut)],
      ['Giro', esc(e.giro)],
      ['Dirección', `${esc(e.direccion)}<br>${esc(e.comuna)}, ${esc(e.ciudad)}, ${esc(e.pais || 'Chile')}`],
      ['Industria', esc(d.industria)],
      ['Logo', d.tieneLogo ? 'Adjunto en este correo' : 'No subió logo']
    ],
    locales: d.locales.map((l, i) => [`Local ${i + 1}`, esc(localTxt(l))]),
    canales: [
      ...d.canales.map(c => [CANALES[c.canal] || c.canal, esc(canalTxt(c))]),
      ['Facturador', esc(facturadorTxt(d.facturador))]
    ],
    equipo: [['Equipo invitado', d.invitados?.length ? d.invitados.map(esc).join('<br>') : 'Nadie por ahora']],
    plan: [['Plan de interés', esc(PLANES[d.plan] || d.plan)]]
  };
}

// Correo interno: le llega al encargado de ShopCommerce que recibe las solicitudes.
export function solicitudInternaEmail({ usuario: u, data: d }) {
  const emp = d.empresa.razonSocial;
  const tipo = TIPOS[d.tipo] || TIPOS.cotizacion;
  const subject = `Nueva solicitud de ${tipo.toLowerCase()}: ${emp}`;
  const x = detalle(u, d);
  const asunto = encodeURIComponent(`ShopCommerce · Tu ${tipo.toLowerCase()} para ${emp}`);

  const html = layout({
    title: subject,
    preheader: `${u.nombre} de ${emp} pidió una ${tipo.toLowerCase()} (${PLANES[d.plan] || d.plan}).`,
    footer: `Solicitud recibida el ${esc(fecha())} desde el onboarding web. Responder este correo le escribe directo al cliente.`,
    body: `
        <tr><td style="padding:24px 40px 20px">
          <span style="display:inline-block;padding:6px 12px;border-radius:999px;background:${d.tipo === 'demo' ? '#E6F6F5;color:#00786F' : '#EAF0FF;color:#1C41DE'};font-size:13px;font-weight:bold">${d.tipo === 'demo' ? 'Agendar demo' : 'Cotización'}</span>
          <h1 style="margin:14px 0 8px;font-size:24px;line-height:1.3;color:#111827">${esc(emp)}</h1>
          <p style="margin:0;font-size:16px;line-height:1.6;color:#374151">
            <b>${esc(u.nombre)}</b> (${esc(u.rol)}) ${d.tipo === 'demo' ? 'quiere agendar una demo' : 'pidió una cotización'} del <b>${esc(PLANES[d.plan] || d.plan)}</b>.
          </p>
        </td></tr>
        ${section('Contacto', x.contacto)}
        ${section('Empresa', x.empresa)}
        ${section('Locales', x.locales)}
        ${section('Canales y facturación', x.canales)}
        ${section('Equipo', x.equipo)}
        ${section('Plan', x.plan)}
        <tr><td align="center" style="padding:4px 40px 32px">${button(`mailto:${u.correo}?subject=${asunto}`, `Responder a ${u.nombre.split(/\s+/)[0]}`)}</td></tr>`
  });

  const text = `Nueva solicitud de ${tipo.toLowerCase()} — ${emp}

Contacto: ${u.nombre} (${u.rol})
Correo: ${u.correo}
Teléfono: ${u.telefono}

Razón social: ${emp}
RUT: ${d.empresa.rut}
Giro: ${d.empresa.giro}
Dirección: ${d.empresa.direccion}, ${d.empresa.comuna}, ${d.empresa.ciudad}, ${d.empresa.pais || 'Chile'}
Industria: ${d.industria}

Locales (${d.locales.length}):
${d.locales.map((l, i) => `  Local ${i + 1}: ${localTxt(l)}`).join('\n')}

Canales:
${d.canales.map(c => `  ${CANALES[c.canal] || c.canal}: ${canalTxt(c)}`).join('\n')}
Facturador: ${facturadorTxt(d.facturador)}

Equipo invitado: ${d.invitados?.length ? d.invitados.join(', ') : 'Nadie por ahora'}
Plan de interés: ${PLANES[d.plan] || d.plan}

Recibida el ${fecha()}.`;

  return { subject, html, text };
}

// Confirmación para el cliente: "recibimos tu solicitud".
export function solicitudClienteEmail({ usuario: u, data: d }) {
  const first = u.nombre.trim().split(/\s+/)[0];
  const demo = d.tipo === 'demo';
  const subject = demo ? 'Recibimos tu solicitud de demo' : 'Recibimos tu solicitud de cotización';
  const siguiente = demo
    ? 'Un ejecutivo te escribirá para coordinar el día y la hora de tu demo.'
    : 'Un ejecutivo preparará tu cotización y te la enviará a este correo.';

  const html = layout({
    title: subject,
    preheader: siguiente,
    footer: 'Si tienes dudas, responde este correo.',
    body: `
        <tr><td style="padding:24px 40px 12px">
          <h1 style="margin:0 0 12px;font-size:24px;line-height:1.3;color:#111827">¡Gracias, ${esc(first)}!</h1>
          <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#374151">
            Recibimos la solicitud de ${demo ? 'demo' : 'cotización'} de <b>${esc(d.empresa.razonSocial)}</b> para el <b>${esc(PLANES[d.plan] || d.plan)}</b>.
          </p>
          <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#374151">${siguiente}</p>
        </td></tr>`
  });

  const text = `¡Gracias, ${first}!

Recibimos la solicitud de ${demo ? 'demo' : 'cotización'} de ${d.empresa.razonSocial} para el ${PLANES[d.plan] || d.plan}.
${siguiente}`;

  return { subject, html, text };
}
