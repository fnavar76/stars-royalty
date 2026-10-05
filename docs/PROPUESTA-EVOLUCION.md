# Propuesta de evolución de Stars Royalty

Fecha: 30 de septiembre de 2026. Base revisada: versión 1.0.0.

Esta propuesta se basa en la estructura del proyecto, rutas y modelo de datos del servidor, módulos React, scripts de pruebas y respaldo, y documentación de operación. No implica que las funciones propuestas ya estén implementadas. No incluye una nueva revisión visual completa ni pruebas de carga. La prioridad y complejidad son estimaciones relativas; no constituyen un presupuesto.

Verificación repetida el 30 de septiembre: `npm.cmd test` completó 76 solicitudes verificadas en una base aislada. `npm.cmd run lint` terminó sin errores y conserva advertencias. Ese resultado cubre los escenarios existentes, no todos los casos adicionales identificados en esta propuesta. En esta revisión solo se agregó este documento; no se modificó la lógica de la aplicación.

## Recomendación

Priorizar una versión 1.1 centrada en permisos detallados, temporadas, facilidad de captura, cobranza y respaldo. Después ampliar la comunicación con familias y las herramientas deportivas. Integraciones de pago, mensajería externa e inteligencia artificial deben llegar cuando esos flujos estén consolidados.

## Hallazgos concretos

| Hallazgo observado | Implicación | Propuesta |
|---|---|---|
| `/api/dashboard` requiere `staff` y devuelve ingresos y gastos; `/api/athletes/:id/full` requiere `coaching` y también devuelve pagos y documentos. | El acceso a una función permite recibir información de otras áreas. Las pruebas actuales de denegación de `/api/payments` no cubren esas rutas alternativas. | Separar lectura financiera, médica y documental; filtrar también las respuestas y probar todas las rutas. Definir si un coach puede consultar solo sus equipos. |
| `guardian_consents` usa al tutor como clave y vuelve a escribir nombre y fecha al aceptar. | No existe historial separado por atleta, temporada y versión del texto aceptado. | Guardar cada aceptación con versión del documento, atleta, tutor y temporada; conservar las anteriores. |
| Varias pantallas y reportes contienen `2026` fijo. | Cambiar de temporada requiere modificar código y puede mezclar información histórica. | Configuración de academia y temporada activa, con cierre y consulta de temporadas anteriores. |
| Las rúbricas almacenan criterios, pero la evaluación conserva campos numéricos fijos. | Cambiar los criterios de una rúbrica no crea sus correspondientes calificaciones o pesos. | Evaluaciones por criterio, ponderación y versión de rúbrica; conservar los resultados históricos. |
| Los abonos disminuyen el monto del cargo y crean movimientos pagados separados. | Funciona para el saldo, pero dificulta consultar el importe original, aplicaciones de pago y reversos. | Separar cargos originales, pagos y aplicaciones; usar centavos enteros y reversos trazables. Migrar sin duplicar los saldos existentes. |
| Altas y ventas no tienen una clave de operación que impida repeticiones. | Un reintento tras perder la conexión podría registrar dos operaciones. | Bloquear doble clic en la interfaz y reconocer reintentos en la API mediante una clave única. |
| Documentos completos en base64 viajan en el expediente mediante `SELECT *`. | La descarga inicial crece con los adjuntos, aunque solo se necesite listar sus nombres. | Listar metadatos, descargar bajo demanda y valorar almacenamiento separado con respaldo coordinado. |
| Varios listados cargan todos los registros; el historial familiar tiene límites fijos. | Con más atletas aumentará el tiempo de carga, y un límite puede confundirse con el historial completo. | Paginación, filtros de servidor, índices medidos y botones para consultar más historial. |
| `family_messages` guarda consultas y estado, pero no un hilo de respuestas. | Una familia puede consultar seguimiento, pero falta una conversación completa en el portal. | Respuestas internas, responsable, estados y aviso de respuesta disponible. |
| Se usan cuadros `window.prompt`, y algunas cargas silencian los errores. | La captura ofrece poca ayuda y una falla puede parecer un listado vacío. | Formularios con validación, confirmación visible, reintento y mensajes de error específicos. |
| Hay validaciones de fecha desiguales; `dateUtils.ts` interpreta componentes sin conservar el desplazamiento horario de una fecha ISO. | Conviene comprobar fechas imposibles y horas provenientes de fuentes distintas antes de ampliar calendario e integraciones. | Política explícita para fechas civiles y horas con zona; pruebas de medianoche y cambio de mes. |
| El respaldo disponible es manual y queda en el mismo equipo. | Existe respaldo verificable, pero no una rutina programada ni evidencia de recuperación periódica. | Programación, retención, aviso de fallos, copia en destino elegido por la academia y simulacro de recuperación. |

Para el detalle de permisos se toma como referencia el principio de acceso mínimo y validación en cada solicitud de [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html). La política específica de acceso debe definirse con la academia.

## Mejoras de uso diario

| Propuesta | Beneficio concreto | Prioridad | Complejidad |
|---|---|---|---|
| Alta guiada: atleta → tutor existente o nuevo → equipo → documentos → cuota. | Evita recorrer varios módulos y crear tutores duplicados; permite revisión antes de guardar. | Alta | Media |
| Mensualidades recurrentes con vista previa, beca/descuento y vigencia. | Genera los cargos del periodo sin capturarlos atleta por atleta; repetir el proceso no duplica cargos. | Alta | Alta |
| Centro de pendientes por puesto. | Recepción ve documentos pendientes; finanzas, vencimientos; coaches, evaluaciones y ausencias. Cada pendiente abre su acción. | Alta | Media |
| Formularios claros para abonos, usuarios y roles. | Sustituye ventanas del navegador por campos con ayuda, resumen y validación. | Alta | Baja–media |
| Búsqueda global con resultados por atleta, tutor, equipo y folio. | Encuentra un registro y abre su expediente con menos pasos, respetando permisos. | Media | Media |
| Asistencia rápida por grupo y fecha. | Permite marcar presentes en bloque y corregir excepciones antes de guardar. | Alta | Media |
| Importación CSV con plantilla, vista previa y reporte de errores. | Facilita migrar datos existentes sin duplicarlos ni aplicar filas inválidas. | Media | Media–alta |
| Filtros guardados y acciones por lote. | Reutiliza consultas habituales y procesa grupos con una vista previa de afectados. | Media | Media |
| Botón de ayuda contextual y guía de primera configuración. | Explica qué hacer en cada módulo y el orden para iniciar una academia. | Media | Baja |
| Navegación por teclado y formularios accesibles. | Mejora el trabajo en caja y recepción; contempla foco de modales, etiquetas, mensajes anunciados y contraste. | Alta | Media |

## Novedades funcionales

| Módulo | Incorporación propuesta | Alcance y dependencia |
|---|---|---|
| Familias | Estado de cuenta descargable, comprobante de transferencia y conversación con administración. | Un comprobante queda pendiente de validación; subirlo no marca automáticamente el pago como recibido. |
| Documentación | Lista de documentos requeridos según categoría; alertas antes del vencimiento. | Requiere definir tipos, vigencias y quién puede ver cada documento. |
| Rendimiento | Objetivos por habilidad, historial de dominio y comparación del atleta consigo mismo. | Depende de rúbricas versionadas; evitar que un ranking genérico mezcle disciplinas o edades. |
| Entrenamientos | Plan semanal, objetivos de sesión y observaciones posteriores. | Vincular equipo, coach, sede y temporada. |
| Calendario | Repetición de clases, cupos y conflictos de horario de coach o sede. | Detectar superposiciones y permitir modificar una sesión o una serie completa. |
| Competencias | Lista de preparación por atleta: convocatoria, documentos, uniforme, transporte y cuota. | Unificar información ya existente, sin implicar inscripción automática en una federación. |
| Inventario | Proveedores, compras, recepción parcial, variantes por talla y conteo físico. | Diferenciar ajuste, devolución, compra y venta para mantener trazabilidad. |
| Vestuario | Pedido por equipo, fecha de entrega, anticipo y reposición. | Reutilizar cargos y pagos; distinguir venta de préstamo. |
| Captación | Prospectos, clase de prueba, seguimiento e inscripción. | Permite medir conversión y conocer por qué una familia no se inscribe. |
| Reportes | Periodo elegible, ingresos por concepto, antigüedad de saldos y retención de atletas. | Definir métricas antes de calcularlas; exportar los mismos filtros que se ven en pantalla. |
| Acceso | Lectura QR con cámara para registrar una sesión de asistencia. | Requiere permiso de cámara, sesión autorizada, selección de clase y prevención de lecturas duplicadas. Conservar entrada manual. |
| Aplicación móvil instalable | Acceso desde un icono y vistas rápidas para familias/coaches. | Preparar aplicación web instalable. La operación sin conexión requiere sincronización y solución de conflictos; debe ser una etapa separada. |

## Integraciones a evaluar después

- **Correo y WhatsApp:** plantillas, destinatarios autorizados, preferencias, programación, cola de envíos y registro de entrega. Requieren proveedor, credenciales y costos por confirmar; los enlaces actuales son borradores manuales.
- **Pagos en línea:** referencia por cargo, confirmación verificable del proveedor, conciliación, reembolsos y manejo de notificaciones duplicadas. No confirmar pagos solo porque el navegador vuelve a una página de éxito.
- **Varias sedes:** aislamiento y consolidación de datos, horarios, inventario y permisos por sede. La existencia de un catálogo de sedes no equivale a este funcionamiento completo.
- **Asistente de redacción:** borradores de comunicados y resúmenes de progreso revisados por el coach. Evitar decisiones automáticas sobre salud, sanciones o selección deportiva; evaluar tratamiento de datos antes de conectar un proveedor.

## Base técnica a reforzar

1. Dividir `server/index.ts` en módulos de autenticación, atletas, deportes, finanzas y documentos, manteniendo pruebas de comportamiento.
2. Crear migraciones de base numeradas y verificables; evitar tratar cualquier error de modificación de esquema como si la columna ya existiera.
3. Resolver advertencias React, cancelar peticiones obsoletas, manejar estados de carga y agregar una pantalla de recuperación ante errores de interfaz.
4. Añadir pruebas de permisos por campo y equipo, doble envío, reverso de abonos, recuperación de respaldo, cambio de temporada y recorridos de interfaz por rol.
5. Automatizar compilación y pruebas en cada entrega; añadir registro de versión, salud del servicio y errores sin datos sensibles.
6. Preparar recuperación de contraseña con un mecanismo limitado y verificable; valorar segundo factor para administración al publicar el sistema.
7. Medir volumen y concurrencia antes de decidir cambiar SQLite. El proyecto no aporta todavía una prueba de carga que justifique una migración de motor.

## Orden de implementación propuesto

**1.1 — Operación confiable.** Permisos por información, temporadas, consentimiento versionado, formularios de abonos/roles, prevención de duplicados, alertas básicas y respaldo programado. Criterio de salida: un coach sin finanzas no recibe importes en ninguna ruta; un reintento no duplica operaciones; se recupera un respaldo y se conserva el historial de temporadas.

**1.2 — Menos captura y mejor atención.** Alta guiada, mensualidades recurrentes, importación, estados de cuenta, comprobantes pendientes y respuestas a familias. Criterio de salida: alta completa sin duplicar tutor; generación repetible de mensualidades; trazabilidad de cada comprobante y respuesta.

**1.3 — Desarrollo deportivo.** Rúbricas dinámicas, planes de entrenamiento, asistencia QR, calendario recurrente y preparación de competencias. Criterio de salida: una evaluación histórica conserva sus criterios y puntuaciones aunque cambie la rúbrica; una lectura repetida no duplica asistencia.

**2.0 — Integración y expansión.** Aplicación instalable, proveedores de mensajería/pagos y varias sedes, seleccionados según uso real. Cada integración requiere presupuesto, configuración y pruebas específicas.

## Decisiones que conviene resolver al iniciar

La academia debe definir la visibilidad financiera y médica de cada puesto, reglas de mensualidad y becas, tratamiento de hermanos y múltiples tutores, temporadas, alcance de sedes, canales de comunicación y volumen esperado de usuarios. Estas decisiones afinan la propuesta; no impiden comenzar con las correcciones y facilidades de 1.1.
