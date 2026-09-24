import { layout, button, esc } from './layout.js';

// Correo de activación que recibe la persona al registrarse (paso 1).
export function activationEmail({ nombre, link, horas, logoSrc }) {
  const first = nombre.trim().split(/\s+/)[0] || '';
  const subject = 'Activa tu cuenta ShopCommerce';

  const html = layout({
    title: subject,
    preheader: 'Confirma tu correo para continuar con la configuración de tu cuenta.',
    logoSrc,
    footer: 'Si no creaste una cuenta en ShopCommerce, ignora este correo.',
    body: `
        <tr><td style="padding:24px 40px 0">
          <h1 style="margin:0 0 12px;font-size:24px;line-height:1.3;color:#111827">Hola${first ? ', ' + esc(first) : ''} 👋</h1>
          <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#374151">
            Gracias por registrarte en <b>ShopCommerce</b>. Para proteger tu cuenta necesitamos confirmar que este correo es tuyo.
          </p>
          <p style="margin:0 0 28px;font-size:16px;line-height:1.6;color:#374151">
            Presiona el botón para <b>activar tu cuenta</b> y continuar con la configuración de tu empresa.
          </p>
        </td></tr>
        <tr><td align="center" style="padding:0 40px 28px">${button(link, 'Activar mi cuenta')}</td></tr>
        <tr><td style="padding:0 40px 28px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EAF0FF;border-radius:14px">
            <tr><td style="padding:16px 20px;font-size:14px;line-height:1.6;color:#1C41DE">
              <b>¿Qué sigue?</b><br>
              1. Activa tu cuenta con el botón.<br>
              2. Crea tu contraseña.<br>
              3. Completa los datos de tu empresa y pide tu cotización o demo.
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:0 40px 32px;font-size:13px;line-height:1.6;color:#6B7280">
          El link vence en ${horas} horas. Si el botón no funciona, copia y pega esta dirección en tu navegador:<br>
          <a href="${esc(link)}" style="color:#1C41DE;word-break:break-all">${esc(link)}</a>
        </td></tr>`
  });

  const text = `Hola${first ? ', ' + first : ''}:

Gracias por registrarte en ShopCommerce. Abre este link para activar tu cuenta y continuar con la configuración:

${link}

El link vence en ${horas} horas.
Si no creaste una cuenta en ShopCommerce, ignora este correo.`;

  return { subject, html, text };
}
