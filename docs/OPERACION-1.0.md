# Operación de Stars Royalty

## Dos modalidades

**Demostración local:** `npm.cmd run dev:full`, interfaz en http://localhost:5173 y API en el puerto 4000. Los datos de ejemplo se insertan una sola vez. El inicio de desarrollo permite las cuentas de demostración; no debe publicarse en Internet.

**Instalación operativa:** crear un archivo `.env` usando `.env.production.example`. Elegir una base nueva para iniciar sin datos de demostración. Configurar correo y contraseña iniciales; estos valores solo crean al administrador cuando no hay usuarios. No cambian contraseñas de cuentas existentes.

Para generar un secreto:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Copiar ese resultado en `JWT_SECRET`. Usar una contraseña administrativa única de al menos 12 caracteres. Sustituir también el correo de ejemplo. `WEB_ORIGIN` debe coincidir con la dirección desde la que se abre la aplicación.

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd test
npm.cmd start
```

La versión compilada sirve interfaz y API en http://localhost:4000. El arranque de producción rechaza secretos de ejemplo y cuentas activas con `ChangeMe123!`. Para publicar fuera del equipo se necesita alojamiento, HTTPS y configurar el dominio; esta revisión no publica la aplicación.

## Usuarios y familias

En Configuración se crean usuarios y roles. Los permisos se comprueban en cada solicitud. Al cambiar la contraseña, desactivar la cuenta o cambiar su rol, sus sesiones anteriores dejan de ser válidas.

Para una familia: registrar al atleta con tutor, crear el usuario con rol **Padres y tutores** y seleccionar **Tutor vinculado** en la tabla de usuarios. La familia debe iniciar sesión de nuevo después de cambiar el vínculo. Solo podrá consultar los atletas y documentos compartidos de ese tutor.

Los documentos aceptan PDF, PNG, JPEG, WebP y texto, hasta 5 MB desde la interfaz. Elegir **Privado** o **Compartido con familia**. Los registros antiguos sin archivo adjunto conservan sus datos, pero requieren adjuntar un archivo para poder descargarlo.

## Cobranza e inventario

El importe del cargo se calcula como monto menos descuento más recargo. **Abonar** registra un pago parcial y disminuye el saldo pendiente. El abono queda como un movimiento pagado separado con referencia al cargo original; al liquidar, el saldo restante del cargo se marca pagado. No sumar otra vez los campos de descuento o recargo al monto guardado.

Cobranza muestra ingresos y egresos del mes. Reportes muestra acumulados históricos. Cancelados no forman parte del saldo pendiente. Las ventas al público también generan un movimiento financiero. Una venta con existencias insuficientes no modifica inventario ni genera un cargo.

La asignación de vestuario puede generar un cargo para usuarios con permiso financiero. Sin ese permiso se registra únicamente la entrega o préstamo. La asignación y el cargo se guardan juntos, o ninguno se guarda.

## Credenciales y comunicaciones

El QR contiene un folio aleatorio. Un lector que introduzca texto puede capturarlo en el validador de recepción, que requiere una sesión autorizada y comprueba vigencia y estado del titular. No abre puertas, no registra asistencia automáticamente y no sustituye acreditaciones de una federación.

Los comunicados generales y los dirigidos al equipo de la familia aparecen en su portal. Los enlaces de WhatsApp abren un borrador para que el usuario lo envíe. No existe envío automático por WhatsApp, correo o SMS. Las aceptaciones de responsiva son registros internos de la academia; no se afirma equivalencia con una firma certificada.

## Respaldo y recuperación

```powershell
npm.cmd run backup
```

El comando lee la base configurada, crea un archivo fechado en `backups/` mediante el respaldo en línea de SQLite y comprueba su integridad. Incluye cambios pendientes del WAL; no basta copiar únicamente el archivo principal mientras la aplicación está abierta. Conservar otra copia en un medio controlado por la academia.

Para recuperar, detener el servidor y configurar `DATABASE_FILE` con la ruta de una **copia** del respaldo elegido. Conservar la base anterior. Reiniciar y verificar atletas, cargos y usuarios antes de continuar capturando datos. No mezclar un respaldo con los archivos WAL de otra base.

## Verificación de la entrega

`npm.cmd test` compila el servidor y ejecuta pruebas de integración en una base nueva dentro de `.review/`. No modifica la base operativa. `npm.cmd run build` compila cliente y servidor. `npm.cmd run lint` informa también advertencias de mantenimiento de React; no deben confundirse con pruebas funcionales o de carga.

La aplicación usa SQLite local y no incluye alta disponibilidad, conciliación bancaria, timbrado fiscal, cobro con tarjeta ni mensajería automática. La recuperación de contraseña se gestiona por el administrador. Estas integraciones requieren un alcance y proveedores propios.
