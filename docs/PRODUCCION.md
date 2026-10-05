# Salida a producción

Esta aplicación se publica como un único servicio Node.js: el servidor sirve la interfaz compilada y la API. La base SQLite debe guardarse en un disco persistente y privado.

## Base inicial limpia

No copies `starsroyalty.db` ni ningún archivo de `backups/` al servidor. Conservan información de prueba y datos de operación local.

1. En el servidor, copia `.env.production.example` como `.env`.
2. Define un `JWT_SECRET` aleatorio de al menos 32 caracteres. En PowerShell:

   ```powershell
   node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
   ```

3. Sustituye `SEED_ADMIN_EMAIL` y `SEED_ADMIN_PASSWORD` por la cuenta administrativa real. La contraseña debe ser única y tener al menos 12 caracteres.
4. Mantén `SEED_DEMO=false` y usa una ruta persistente y exclusiva para `DATABASE_FILE`, por ejemplo `/data/starsroyalty-production.db` en Linux.
5. Define `WEB_ORIGIN` con el dominio final, por ejemplo `https://app.starsroyalty.mx`.

Al primer arranque se crean las tablas, los roles y únicamente el administrador indicado. No se insertan atletas, tutores, pagos, inventario, asistencias ni datos de demostración. En la interfaz se registran después las disciplinas, categorías, equipos, usuarios y atletas reales.

## Verificación antes de publicar

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd test
npm.cmd start
```

Abre la dirección configurada y confirma que aparecen el inicio de sesión y una base sin atletas. Inicia sesión con el administrador configurado, cambia su contraseña si corresponde y crea los usuarios operativos mínimos.

Configura un respaldo diario con `npm.cmd run backup`, guardando `backups/` fuera del servidor o en almacenamiento privado. Nunca incluyas la base, copias de respaldo, `.env` ni archivos con documentos de atletas en Git.

## Dónde alojarla

Usa un proveedor que ejecute Node.js y ofrezca volumen persistente, HTTPS y variables de entorno. Un VPS administrado, Render, Railway o Fly.io son opciones compatibles si se configura un volumen privado para `DATABASE_FILE` y una tarea de respaldo externa.

GitHub Pages solo debe usarse, si acaso, para una página pública informativa. No puede ejecutar el servidor Node/Express ni mantener una base SQLite modificable, por lo que no puede alojar esta aplicación operativa. Tampoco conviene publicar información de atletas, sesiones o contraseñas en un repositorio.

## Lista de salida

- Dominio propio y HTTPS activos.
- `WEB_ORIGIN` igual al dominio HTTPS final.
- Base SQLite en volumen persistente y fuera del repositorio.
- Secreto JWT y contraseña administrativa exclusivos.
- Respaldo automatizado y prueba de recuperación.
- Cuenta de administración, cuentas de coaches/caja y permisos revisados.
- Catálogos operativos cargados: disciplinas, categorías, equipos y precios.
- Prueba con un atleta de ejemplo creada y eliminada antes del arranque oficial.
