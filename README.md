# Stars Royalty 1.0

Plataforma web de gestión deportiva para Cheerleading y Gimnasia de alto rendimiento.

Consulta [la guía de operación, instalación, permisos y respaldos](docs/OPERACION-1.0.md). La compilación incluye interfaz y servidor; las pruebas trabajan en una base aislada.

## Inicio local

Entorno verificado: Node.js 22.17.1 y npm en Windows.

```powershell
npm.cmd install
Copy-Item .env.example .env
npm.cmd run dev:full
```

Frontend: `http://localhost:5173/`
API: `http://localhost:4000/`

Cuenta inicial de desarrollo:

- Correo: `admin@starsroyalty.local`
- Contraseña: `ChangeMe123!`

Estas cuentas son solo de demostración. Para una instalación nueva sin ejemplos usa `.env.production.example` y la guía de operación. `SEED_ADMIN_EMAIL` y `SEED_ADMIN_PASSWORD` solo crean al administrador en una base vacía: no cambian cuentas existentes. Producción rechaza cuentas activas con la contraseña de demostración.

## API

La API crea `starsroyalty.db` automáticamente usando SQLite y activa claves foráneas, WAL, Helmet, CORS limitado, validación Zod, hash bcrypt, JWT de 8 horas y bitácora de auditoría.

Rutas principales:

- `GET /api/health`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/dashboard`
- `GET|POST /api/athletes`
- `GET|POST /api/attendance`
- `GET|POST /api/goals`
- `PATCH /api/goals/:id`
- `GET|POST /api/injuries`
- `PATCH /api/injuries/:id`
- `GET /api/payments`
- `POST /api/payments`
- `PATCH /api/payments/:id/status`
- `GET|POST /api/teams`
- `GET|POST /api/disciplines`
- `PATCH /api/disciplines/:id`
- `GET|POST /api/categories`
- `PATCH /api/categories/:id`
- `POST /api/teams/:teamId/athletes`
- `GET|POST /api/events`
- `GET|POST /api/evaluations`
- `GET|POST /api/products`
- `POST /api/products/:id/movements`
- `GET|POST /api/wardrobe`
- `PATCH /api/wardrobe/:id/status`
- `GET|POST /api/communications`
- `POST /api/credentials`
- `GET /api/reports/summary`
- `GET /api/audit`

## Calidad

```powershell
npm.cmd run build
npm.cmd test
npm.cmd run lint
npm.cmd run backup
```

La interfaz incluye dashboard, atletas, rendimiento, asistencia, calendario, cobranza y abonos, inventario, competencias, comunicados, equipos, vestuario, credenciales QR, reportes, portal familiar con documentos descargables y configuración de usuarios y roles. Las integraciones externas y los límites operativos se describen en la guía.
