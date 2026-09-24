// Estructura común de los correos. Tablas + estilos inline para que se vean bien en Gmail, Outlook y Apple Mail.
export const LOGO_CID = 'shopcommerce-logo';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const button = (href, label) => `
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td align="center" bgcolor="#1C41DE" style="border-radius:14px">
      <a href="${esc(href)}" target="_blank" style="display:inline-block;padding:16px 36px;font-size:16px;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:14px">${esc(label)}</a>
    </td>
  </tr></table>`;

// `body` es HTML de filas <tr> que van dentro de la tarjeta blanca.
export function layout({ title, preheader, body, footer, logoSrc = `cid:${LOGO_CID}` }) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:#F3F5FB;font-family:Arial,Helvetica,sans-serif;color:#111827">
  <div style="display:none;max-height:0;overflow:hidden">${esc(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F5FB">
    <tr><td align="center" style="padding:32px 16px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:20px;overflow:hidden">
        <tr><td style="background:#1C41DE;height:6px;font-size:0;line-height:0">&nbsp;</td></tr>
        <tr><td align="center" style="padding:36px 40px 8px">
          <img src="${logoSrc}" width="200" alt="ShopCommerce" style="display:block;width:200px;max-width:100%;height:auto;border:0">
        </td></tr>
        ${body}
        <tr><td style="padding:20px 40px;border-top:1px solid #E5E7EB;font-size:12px;line-height:1.6;color:#9CA3AF">
          ${footer}<br>
          ShopCommerce · Conecta, Vende, Crece.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
