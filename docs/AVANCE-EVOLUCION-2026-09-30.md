# Evolución de Stars Royalty — 30 de septiembre de 2026

## Funciones incorporadas

- Centro operativo con pendientes por permisos y navegación visual.
- Alta guiada de atletas con tutor existente, equipo y cargo opcional; importación CSV con vista previa y rechazo de duplicados.
- Prospectos, planes de entrenamiento, mensualidades con descuento y generación por periodo sin duplicar cargos.
- Conversaciones con familias y revisión de comprobantes; revisar un comprobante no registra automáticamente un ingreso.
- Temporadas activas y responsivas versionadas por atleta y temporada.
- Rúbricas ponderadas con versiones, evaluaciones y resultados visibles para la familia correspondiente.
- Clases semanales con comprobación de conflictos y capacidad; asistencia por folio QR y lector de cámara cuando el navegador lo admite.
- Tareas para preparar competencias; proveedores, compras y recepciones parciales de inventario.
- Análisis por periodo, exportación CSV y antigüedad del saldo actual.
- Requisitos documentales, búsqueda global y respaldo automático cada 24 horas mientras el servidor está encendido.
- Formularios de abonos y permisos, estados de carga/error, mejoras adaptables, carga de módulos bajo demanda y página sin conexión sin almacenar datos privados.

## Verificación

- Compilación de cliente y servidor correcta.
- 140 solicitudes de integración correctas contra una base aislada, incluyendo permisos, persistencia, duplicados, compras, altas, importación, calendario y QR.
- Recuperación de respaldo en una base independiente con integridad y referencias correctas.
- Revisión en Chrome de escritorio y pantalla de 390 px; comprobación de navegación del centro operativo.
- Cambio de periodo comprobado en navegador: conserva fechas y muestra cero ingresos cuando el intervalo no tiene movimientos.
- API local actualizada y comprobada en el puerto 4000. Respaldo previo: `backups/starsroyalty-2026-09-30T19-35-53-813Z.db`.
- El análisis estático todavía informa advertencias de React en componentes existentes; no se considera terminada su limpieza.

## Recuperación

Crear copia: `npm.cmd run backup`.

Comprobar una copia: `npm.cmd run restore:check -- backups/nombre-del-respaldo.db`.

La comprobación crea un archivo nuevo en `.review`; no reemplaza la base operativa. Los respaldos automáticos no se eliminan solos y requieren conservar una copia externa por separado.

## Alcance pendiente de la propuesta

Esta entrega es un avance funcional, no el cierre de toda la propuesta. Quedan la separación completa de cargos, aplicaciones y reversos contables; permisos médicos/documentales granulares y alcance por equipo; historial integral por temporada; paginación general; seguimiento ampliado de vestuario; y limpieza restante de componentes. Integraciones externas, recuperación de contraseñas por correo, pagos en línea y copias remotas necesitan configuración específica y no están activadas.

La cámara QR requiere permiso del usuario y compatibilidad del navegador; no se verificó una captura física de cámara. El folio manual y su validación sí se probaron. La pantalla sin conexión no permite operar sin servidor.
