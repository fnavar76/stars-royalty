# Validación de Stars Royalty 1.0.0

Fecha: 29 de septiembre de 2026. Entorno: Windows, Node.js 22.17.1, Chrome conectado mediante extensión.

## Resultado técnico

- Compilación de interfaz y API: correcta. La carga diferida del generador QR eliminó la advertencia de paquete mayor de 500 kB.
- Integración: 76 solicitudes verificadas en una base aislada, con aserciones adicionales de importes, permisos, número de registros y persistencia.
- Reinicio de la base de prueba: conserva equipos, atletas e ingresos; no inserta datos de demostración en producción.
- Lint: termina sin errores, con advertencias de React sobre dependencias de efectos y actualización de estado, además de avisos menores de mantenimiento. No se afirma que el código esté libre de advertencias.
- Respaldo de la base operativa: realizado mediante SQLite backup y comprobado con `integrity_check` antes de reiniciar la API local.
- Arranque local actualizado: API en puerto 4000 y Vite en 5173, respuesta HTTP comprobada.

## Flujos comprobados

Autenticación; autorización de administrador, coach y familia; revocación de sesión al desactivar un usuario; vinculación de tutor; creación y edición de equipos; reasignación repetida de atletas y reversión ante error; asistencia sin duplicados y rechazo de fecha inexistente; metas; lesiones; evaluaciones; eventos y convocatoria de equipos; cargos con descuento y recargo; abonos y liquidación; rechazo de sobrepago; ventas al público; existencias insuficientes sin modificación de stock; vestuario sin asignaciones parciales cuando se deniega el cargo; documentos compartidos y privados; rechazo de HTML adjunto; credenciales con consulta autenticada; filtro de comunicados familiares.

## Revisión visual

Se comprobaron inicio de sesión, panel, atletas, expediente, QR, equipos, cobranza, reportes, portal familiar, documentos y restauración de sesión. Se corrigió la recarga que dejaba a la familia en un resumen vacío. Se probó una ventana móvil de 390 × 844 en el portal y se restableció el tamaño original. No se observó desbordamiento horizontal en esa comprobación.

No es una certificación de todos los dispositivos ni una prueba de carga. Una apertura final de pestaña agotó el tiempo de conexión del navegador; las verificaciones de los servidores locales continuaron respondiendo correctamente.

## Cambios principales

- Los ejemplos no sobrescriben datos personales al reiniciar.
- Los permisos se verifican contra el usuario activo y su rol vigente.
- El portal familiar tiene navegación independiente y avisos filtrados.
- Los documentos incluyen archivo descargable y control de visibilidad.
- QR real con folio aleatorio, en lugar de iconos decorativos.
- Asignaciones deportivas y cargos de vestuario atómicos.
- Abonos parciales, ventas al público registradas y exportación CSV protegida ante fórmulas.
- Indicadores sin valores ficticios: asistencia sin registros, coach sin asignar e ingresos históricos identificados.
- Compilación completa, comando de producción y respaldo verificable.

## Alcance de entrega

Versión local 1.0.0 preparada y comprobada. No se realizó publicación en Internet. Para instalación operativa se requiere configurar secretos y cuentas reales según [OPERACION-1.0.md](../OPERACION-1.0.md). Se mantienen fuera del alcance los proveedores de correo, WhatsApp automático, cobro bancario, timbrado fiscal y alta disponibilidad.
