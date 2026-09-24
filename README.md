# Onboarding ShopCommerce

Página de login + onboarding en 8 pasos (Perfil, Empresa, Industria, Locales, Canales, Equipo, Plan, Revisión) y pantalla de activación por correo.

- `index.html`: página completa y autocontenida (HTML, CSS y JS en un solo archivo; logos embebidos). Se abre directo en el navegador.
- `assets/`: logos e ícono sueltos (`logo-light.png` para fondos claros, `logo-dark.png` para fondos oscuros, `icon.png` la bolsa).

## Backend (Node + Resend)

```bash
npm install
cp .env.example .env   # completa RESEND_API_KEY, MAIL_FROM y APP_URL
npm start              # http://localhost:3000
```

La base de datos es Postgres en **Supabase** (`DATABASE_URL`, usa la connection string del *Session pooler*). Las tablas `usuarios` y `sesiones` se crean solas al arrancar, con RLS activado y sin políticas: la API pública de Supabase (anon key) no puede leerlas; solo este servidor. Los logos subidos quedan en `uploads/`.

### Flujo de activación

1. **Paso 1 (Perfil) → `POST /api/registro`** `{ nombre, correo, telefono, rol }`: crea el usuario en estado `pendiente` y envía con Resend el correo con el logo y el botón “Activar mi cuenta”.
2. **Link del correo → `GET /activar?token=...`**: cambia el estado a `activo`, abre sesión (cookie `sc_session`) y redirige a `/?activacion=ok`. El front trae los datos con `GET /api/me`.
3. **Crear contraseña → `POST /api/password`** `{ password }` (requiere la sesión; mín. 8 caracteres con letras y números; se guarda con scrypt). Después el front continúa en el **paso 2**.
4. **Paso 8 → `POST /api/onboarding`** (multipart, requiere la sesión): la empresa elige **Cotización** o **Agendar una demo** (`data.tipo`: `cotizacion` | `demo`). Se guarda el formulario (`data`) y el logo (`logo`, opcional, máx. 2 MB), y:
   - se envía la solicitud completa a `SOLICITUDES_TO` (el encargado), con el logo del cliente adjunto y *Responder* apuntando al correo del cliente;
   - se envía al cliente una confirmación de que recibimos su solicitud.
   Si falla el correo al encargado, los datos quedan guardados y el cliente puede reintentar. Una vez enviada, no se puede mandar dos veces (409).

- `POST /api/login` `{ correo, password }` abre sesión y el front retoma donde quedó (contraseña → paso 2 → listo). Bloquea 15 min tras 5 intentos fallidos. `POST /api/logout` la cierra.
- `POST /api/registro/reenviar` `{ correo }` reenvía el link (máx. 1 por minuto).
- El token vale `ACTIVATION_TTL_HOURS` (24 h por defecto) y solo se guarda su hash.
- Remitente: con `onboarding@resend.dev` Resend solo entrega al correo dueño de la cuenta. Para enviar a cualquier persona, verifica tu dominio en Resend y usa, por ejemplo, `ShopCommerce <no-reply@tudominio.cl>`.
- La plantilla del correo está en `emails/activation.js`. El logo va adjunto inline (`cid:`), así se ve sin necesitar una URL pública.

Estructura de `data` (`contacto` se ignora: ya quedó guardado en el registro):

```json
{
  "contacto": { "nombre": "Camila Rojas", "rol": "Dueño/a", "correo": "camila@empresa.cl", "telefono": "+56912345678" },
  "empresa": "Farmacias del Sur SpA",
  "rut": "76123456-7",
  "industria": "Farmacias | Retail | Electrónica | Seguros",
  "locales": 1,
  "local": { "codigo": "SUC-001", "direccion": "Av. Providencia 1234" },
  "facturador": "Bsale",
  "ecommerce": "Shopify",
  "invitados": ["colega@empresa.cl"],
  "plan": "basico | escala | premium"
}
```

`local` es `null` cuando hay más de un local. `ecommerce` es `null` si no tienen ecommerce.

Planes: Básico UF 4, Escala UF 6, Premium UF 8 (mensual).
