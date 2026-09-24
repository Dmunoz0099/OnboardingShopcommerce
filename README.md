# Onboarding ShopCommerce

Página de login + onboarding en 8 pasos y pantalla de activación por correo:

1. Perfil · 2. Industria · 3. Tu empresa · 4. Locales · 5. ¿Cómo quieres vender? · 6. Equipo · 7. Plan · 8. Revisión

- `index.html`: página completa y autocontenida (HTML, CSS y JS en un solo archivo; logos embebidos). Se abre directo en el navegador.
- `assets/`: logos e ícono sueltos (`logo-light.png` para fondos claros, `logo-dark.png` para fondos oscuros, `icon.png` la bolsa).

## Diseño

- Página web a pantalla completa, fondo blanco (`#0E1627` en modo oscuro), header fijo con el logo, el cambio de tema y "Ya tengo cuenta" / "Crear cuenta".
- En todas las pantallas (login, los 8 pasos, activación, contraseña y listo) el **formulario va a la izquierda** (máx. 640 px) y **las imágenes a la derecha** en una tarjeta fija (`position: sticky`). En la columna del formulario no hay ilustraciones, miniaturas, avatares ni confeti: el logo subido se ve solo en la tarjeta de empresa de la derecha.
- Bajo 1180 px se oculta la columna derecha. En móvil (≤ 760 px) el pie "Atrás / Continuar →" queda fijo abajo.
- La cantidad de segmentos y el "Paso X de N" salen de las secciones `.stage` del HTML. Para reordenar pasos basta con mover la sección: cada una tiene `data-step` (clave) y `data-name`.
- Las listas editables están como constantes al inicio del script: `INDUSTRIAS`, `CANALES`, `MEDIOS_PAGO` (con `soloEn` para limitar un medio a ciertos canales, p. ej. Efectivo solo en POS), `PLATAFORMAS`, `PLANES` y `REGIONES` (las 346 comunas agrupadas por región).

## Backend (Node + Resend)

```bash
pnpm install
cp .env.example .env   # completa RESEND_API_KEY, MAIL_FROM, APP_URL y CERT_ENC_KEY
pnpm start             # http://localhost:4099
```

La base de datos es Postgres en **Supabase** (`DATABASE_URL`, usa la connection string del *Session pooler*). Las tablas `usuarios` y `sesiones` se crean solas al arrancar, con RLS activado y sin políticas: la API pública de Supabase (anon key) no puede leerlas; solo este servidor. Los logos y los certificados cifrados quedan en `uploads/`.

### Flujo de activación

1. **Paso 1 (Perfil) → `POST /api/registro`** `{ nombre, correo, telefono, rol }`: crea el usuario en estado `pendiente` y envía con Resend el correo con el logo y el botón “Activar mi cuenta”.
2. **Link del correo → `GET /activar?token=...`**: cambia el estado a `activo`, abre sesión (cookie `sc_session`) y redirige a `/?activacion=ok`. El front trae los datos con `GET /api/me`.
3. **Crear contraseña → `POST /api/password`** `{ password }` (requiere la sesión; mín. 8 caracteres con letras y números; se guarda con scrypt). Después el front continúa en el **paso 2 (Industria)**.
4. **Paso 8 → `POST /api/onboarding`** (multipart, requiere la sesión; ver contrato abajo). Se envía como solicitud de cotización. Se guardan los datos y, si corresponde, el logo y el certificado cifrado, y:
   - se envía la solicitud completa a `SOLICITUDES_TO` (el encargado), con el logo del cliente adjunto y *Responder* apuntando al correo del cliente. **El certificado nunca va en el correo**;
   - se envía al cliente una confirmación de que recibimos su solicitud.
   Si falla el correo al encargado, los datos quedan guardados y el cliente puede reintentar. Una vez enviada, no se puede mandar dos veces (409).

- `POST /api/login` `{ correo, password }` abre sesión y el front retoma donde quedó (contraseña → paso 2 → listo). Bloquea 15 min tras 5 intentos fallidos. `POST /api/logout` la cierra.
- `POST /api/registro/reenviar` `{ correo }` reenvía el link (máx. 1 por minuto).
- El token vale `ACTIVATION_TTL_HOURS` (24 h por defecto) y solo se guarda su hash.
- Remitente: con `onboarding@resend.dev` Resend solo entrega al correo dueño de la cuenta. Para enviar a cualquier persona, verifica tu dominio en Resend y usa, por ejemplo, `ShopCommerce <no-reply@tudominio.cl>`.
- La plantilla del correo está en `emails/activation.js`. El logo va adjunto inline (`cid:`), así se ve sin necesitar una URL pública.

## Contrato de `POST /api/onboarding`

El front lo envía con `submitOnboarding(formData)` como `multipart/form-data`:

| Parte | Tipo | Cuándo |
|---|---|---|
| `data` | texto (JSON, abajo) | siempre |
| `logo` | archivo PNG, JPG, SVG o WEBP, máx. 2 MB, mín. 120×120 px | opcional |
| `certificado` | archivo `.pfx` o `.p12`, máx. 2 MB | solo si `facturador.tipo` es `shopcommerce` |
| `certificadoPassword` | texto, mín. 4 caracteres, **fuera del JSON** | solo si `facturador.tipo` es `shopcommerce` |

```json
{
  "contacto": { "nombre": "Camila Rojas", "rol": "Dueño/a", "correo": "camila@empresa.cl", "telefono": "+56912345678" },
  "industria": "Farmacias",
  "empresa": {
    "razonSocial": "Farmacias del Sur SpA",
    "rut": "76123456-0",
    "giro": "Venta al por menor de productos farmacéuticos",
    "direccion": "Av. Providencia 1234",
    "comuna": "Providencia",
    "ciudad": "Santiago",
    "pais": "Chile"
  },
  "locales": [
    { "codigo": "SUC-001", "direccion": "Av. Providencia 1234", "comuna": "Providencia" },
    { "codigo": "SUC-002", "direccion": "Los Leones 55", "comuna": "Las Condes" }
  ],
  "canales": [
    { "canal": "pos", "mediosPago": ["transbank", "efectivo"] },
    { "canal": "ecommerce", "plataforma": "Shopify", "mediosPago": ["getnet", "otro"], "otroMedioPago": "Sodexo" }
  ],
  "facturador": { "tipo": "shopcommerce" },
  "invitados": ["colega@empresa.cl"],
  "plan": "basico"
}
```

Con otro facturador: `"facturador": { "tipo": "otro", "nombre": "Bsale" }` (sin `certificado` ni `certificadoPassword`).

Valores posibles:

- El front ya no envía `tipo`: el servidor lo toma como `cotizacion` (todavía acepta `demo` si se envía).
- `industria`: `Farmacias` | `Retail` | `Electrónica` | `Seguros` | `Moda` | `Ferretería` | `Aerolíneas` | `Minimarket` | `Comida`.
- `empresa.rut`: sin puntos y con guion (dígito verificador validado en el front). `empresa.comuna` y `locales[].comuna` son siempre una comuna de la lista oficial, escrita como en ella. `empresa.pais` es siempre `Chile`.
- `locales`: de 1 a 50. `codigo`: letras, números, `-` o `_`, máx. 20, sin repetirse entre locales (sin distinguir mayúsculas). `direccion` incluye numeración.
- `canales[].canal`: `pos` | `ecommerce` | `whatsapp` | `instagram` | `app` (al menos uno, en ese orden).
- `canales[].mediosPago` (al menos uno por canal): `transbank` | `bci-pagos` | `getnet` | `mercado-pago` | `flow` | `khipu` | `efectivo` (solo en `pos`) | `transferencia` | `otro`. Si incluye `otro`, viene `otroMedioPago` con el texto.
- `canales[].plataforma`: solo en `ecommerce`: `Shopify` | `WooCommerce` | `VTEX` | `Jumpseller` | `Magento`, o el texto escrito si eligieron "Otro".
- `plan`: `basico` (UF 4) | `escala` (UF 6) | `premium` (UF 8), mensual.
- `contacto` se ignora en el servidor: ya quedó guardado en el registro.

Respuestas: `200 { ok: true }` · `400 { error }` datos incompletos o archivo inválido · `401/403` sin sesión o sin contraseña · `409` ya enviada · `502` datos guardados pero falló el correo al encargado · `503` falta `CERT_ENC_KEY` y se envió un certificado.

### Seguridad del certificado digital

- **En el navegador**: el certificado y su contraseña viven solo en memoria. Nunca se guardan en `localStorage`/`sessionStorage`, no se escriben en consola, la revisión muestra solo "Certificado cargado ✓" y se borran de memoria apenas el envío sale bien. El front solo los envía en un contexto seguro (HTTPS; `localhost` se permite para desarrollo). En producción, sirve la app **solo por HTTPS**.
- **En el servidor**: multer los recibe en memoria (nunca tocan el disco sin cifrar). Ambos se **cifran en reposo** con AES-256-GCM (`lib/cifrado.js`) usando `CERT_ENC_KEY`, que vive fuera de la base de datos:
  - el archivo queda en `uploads/cert-<id>.enc` (permisos `600`) y su ruta en `usuarios.certificado_path`;
  - la contraseña cifrada (base64) queda en `usuarios.certificado_password_enc`.
  - Formato: `iv (12 bytes) | tag (16 bytes) | datos`. `descifrar()` los devuelve cuando el facturador los necesite.
- Si `CERT_ENC_KEY` no está configurada, el servidor responde `503` en vez de guardar el certificado sin cifrar.
