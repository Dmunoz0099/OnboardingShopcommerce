# Onboarding ShopCommerce

Página de login + onboarding en 8 pasos (Perfil, Empresa, Industria, Locales, Canales, Equipo, Plan, Revisión) y pantalla de activación por correo.

- `index.html`: página completa y autocontenida (HTML, CSS y JS en un solo archivo; logos embebidos). Se abre directo en el navegador.
- `assets/`: logos e ícono sueltos (`logo-light.png` para fondos claros, `logo-dark.png` para fondos oscuros, `icon.png` la bolsa).

## Conectar el backend

En `index.html` hay dos funciones simuladas para reemplazar:

- `submitOnboarding(formData)` → `POST /api/onboarding` (multipart/form-data)
  - `data`: JSON con el formulario
  - `logo`: archivo opcional (PNG, JPG, SVG o WEBP, máx. 2 MB)
  - Debe crear la cuenta en estado pendiente y enviar el correo con el link de activación.
- `resendActivation(correo)` → `POST /api/onboarding/resend` con `{ "correo": "..." }`

Estructura de `data`:

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
