# Operación del ambiente AWS

## Identidad

Cognito sólo permite usuarios creados por administración. Crear `custom:tenant` al provisionar la cuenta: es inmutable y nunca se recibe en la captura del portal. Asignar exactamente un grupo: insured, employee, hr, analyst, approver, viewer, admin o support. La contraseña temporal y el enrolamiento TOTP se completan en el primer acceso. Recuperación por correo en Cognito.

Para personal asignable, crear un registro DynamoDB:

```json
{"pk":"TENANT#organizacion","sk":"STAFF#sub-cognito","role":"analyst"}
```

La creación y revisión de este registro es una operación administrativa restringida. El endpoint de asignación exige grupo admin y valida el registro dentro de su tenant. El administrador utiliza ID completo de expediente y sub del responsable; recibe confirmación sin contenido clínico.

## Datos

Tabla: PK `TENANT#<tenant>#CLAIM#<id>`, SK `META`, `AUDIT#...` o `JOB#...`. GSI `byOwner` y `byAssignee`. Las lecturas individuales son consistentes; los listados GSI pueden reflejar cambios con latencia. Las mutaciones del expediente usan condición de versión y auditoría transaccional. No se registran cuerpos clínicos en logs.

No borrar ni editar documentos originales. Una carga crea un identificador y objeto S3 nuevos, conserva hash y versión de tipo documental, y requiere confirmación de tamaño y hash desde S3. Las versiones documentales anteriores permanecen asociadas al expediente. GuardDuty Malware Protection analiza cada nueva versión y publica veredictos en EventBridge. Una Lambda actualiza el veredicto con control de concurrencia y auditoría. Las descargas usan VersionId y sólo se habilitan para la versión exacta declarada limpia; errores, amenazas, análisis omitidos y resultados para otra versión mantienen el bloqueo HTTP 423. No liberar archivos alterando la UI. Validar el plan y la entrega de eventos después del despliegue.

DynamoDB y S3 tienen política RETAIN; DynamoDB tiene recuperación a un punto en el tiempo y S3 versionado. La retención legal y eliminación del expediente requieren política aprobada y procedimientos específicos antes de producción.

## SICAS

La cola almacena solicitudes, con operación idempotente en DynamoDB y dead letter queue. El worker actual marca BLOCKED / SICAS_CONTRACT_NOT_CONFIGURED. No consulta ni envía datos a un endpoint supuesto. Al integrar, implementar consulta de póliza, envío de expediente y archivos, acuse individual, reconciliación y reintentos idempotentes según contrato real. Mantener el estado de integración separado del estado de negocio. Un fallo no debe eliminar el expediente.

## GNP

Gestión manual/asistida por canal autorizado. Adjuntar acuse en Documentos, registrar folio/canal/evidencia y después cambiar el estado a Ingresado en GNP. El portal no automatiza la navegación del portal de la aseguradora ni decide cobertura.

## Despliegue y recuperación

CI verifica por separado el paquete frontend de la raíz y el backend de `backend/`. `amplify.yml` publica únicamente el frontend estático; no instala dependencias ni ejecuta comandos del backend. Las definiciones existentes de infraestructura están aisladas en `backend/amplify/`; cualquier despliegue del backend se prepara y ejecuta por separado, con su cuenta, región, dominio y permisos. La aplicación Amplify Hosting no debe configurarse como despliegue fullstack Gen 2. Revisar CloudFormation y resultados de sandbox/pipeline antes de dar por disponibles los recursos. Revertir frontend con una compilación previa; para cambios de datos mantener compatibilidad y respaldos. No destruir el backend para resolver una incidencia. Acordar RPO/RTO y restauración con Paramita.
