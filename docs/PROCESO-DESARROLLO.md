# Proceso de desarrollo y validacion

> Documento histórico de desarrollo. Para el estado de la versión 1.0.0 consultar [Validación](revision/VALIDACION-1.0.md) y [Operación](OPERACION-1.0.md).

## Estado actual

### Completado

- SPA responsive con identidad visual Stars Royalty.
- Dashboard general con indicadores y agenda.
- Login con JWT y cierre de sesion.
- Roles base y modo de privacidad local.
- API Express con SQLite relacional.
- Hash de contrasenas con bcrypt.
- Validacion de payloads con Zod.
- CORS para puertos locales de desarrollo.
- Auditoria de operaciones.
- Modulo Atletas conectado a base de datos.
- Expediente de atleta con tutor, emergencia, informacion medica y fotografia.
- Migracion automatica de `photo_data` en la tabla `athletes`.
- Seed de disciplinas, categorias, equipos, atletas, pagos y productos.
- Endpoints disponibles para equipos, eventos, evaluaciones, pagos, inventario, vestuario, comunicados, credenciales, reportes y auditoria.
- Portal familiar conectado a una cuenta de tutor: muestra únicamente sus atletas, cobros, asistencia, evaluación, agenda y consentimiento persistente.
- Autorización de API por rol para operaciones deportivas, financieras, inventario, administración, documentos y auditoría.
- Administración de usuarios y roles: alta, cambio de rol, activación/desactivación, restablecimiento de contraseña y roles personalizados con permisos configurables.

### En desarrollo

- Conectar cada pantalla restante con sus endpoints.
- Reemplazar acciones demo por operaciones CRUD persistentes.
- Cargar datos de API en tablas y tarjetas del frontend.
- Ampliar las vistas familiares de solo lectura (calendario, comunicados y credenciales) con contratos específicos, sin reutilizar endpoints internos.
- Completar pruebas de flujo desde la interfaz.

## Orden de implementacion

Cada modulo se trabaja con este ciclo:

1. Revisar tabla y contrato de API.
2. Crear o corregir endpoint `GET`, `POST`, `PATCH` o `DELETE`.
3. Validar datos con Zod.
4. Registrar cambios en `audit_logs`.
5. Conectar formulario y tabla del frontend.
6. Mostrar estado de carga, error y confirmacion.
7. Probar persistencia en SQLite.
8. Ejecutar `npm run build` y `npm run lint`.
9. Probar el flujo completo con login JWT.

## Fases

### Fase 1: Expedientes y deporte

- Atletas y fotografia: completado.
- Evaluaciones y rubricas.
- Metas individuales.
- Lesiones y restricciones.
- Asistencia con presente, retardo, falta justificada y falta injustificada.
- Historial y graficas de rendimiento.

### Fase 2: Operacion deportiva

- Disciplinas y categorias.
- Equipos y coaches.
- Plantillas, titulares, suplentes y atletas en prueba.
- Horarios, sedes y salones.
- Calendario de entrenamientos, eventos y competencias.

### Fase 3: Finanzas y activos

- Cargos, pagos parciales, descuentos y recargos.
- Recibos y reportes financieros.
- Productos, variantes, tallas, colores y existencias.
- Movimientos de inventario y ventas.
- Vestuario, entregas, devoluciones y pendientes.

### Fase 4: Comunicacion y acceso

- Comunicados internos.
- Mensajes preparados para WhatsApp.
- Credenciales con QR y vigencia.
- Portal de padres y tutores: base funcional terminada; falta extender la misma política de acceso a todos los endpoints generales antes de producción.
- Privacidad por rol.
- Auditoria visible para administracion.

### Fase 5: Calidad y produccion

- Pruebas de API autenticadas.
- Pruebas de formularios y persistencia.
- Validacion responsive en escritorio y movil.
- Variables de entorno seguras.
- Backups de SQLite o migracion a PostgreSQL.
- Recuperacion real de contrasena por correo.
- Almacenamiento de documentos y fotografias fuera de SQLite.

## Validacion de cada modulo

Un modulo se considera terminado cuando:

- Puede crear, consultar y modificar sus registros.
- Los datos sobreviven un reinicio de la API.
- El frontend refleja los datos guardados.
- Los permisos bloquean acciones no autorizadas.
- Se registra la operacion en auditoria.
- Tiene estados de carga, vacio, error y exito.
- Pasa build, lint y prueba manual del flujo principal.

## Comandos

```powershell
npm install
Copy-Item .env.example .env
npm run dev:full
npm run build
npm run lint
```

Frontend: `http://localhost:5173/` o el siguiente puerto libre.

API: `http://localhost:4000/`.
