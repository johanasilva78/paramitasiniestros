# Estado verificable de la implementación

La instrucción vigente es construir por ahora un mock completo e ir sustituyendo simulaciones por integraciones reales. El alcance final sigue siendo completo; no se considera un piloto. No se despliegan servicios AWS en esta entrega.

## Demostración disponible

Ocho perfiles; cuatro modalidades; expedientes de ejemplo en distintas etapas; pólizas; alta, archivos locales y descarga; revisión/subsanación, aprobación, folio y resolución GNP; reportes; empresa/monitoreo sin documentos clínicos; usuarios y modalidades configurables; plantillas; notificaciones con lectura y reintento; conciliación manual de correos ficticios; SICAS simulado con acuses, timeout, historial y reintentos; reinicio de todos los datos de prueba. Los análisis de archivos y las entregas externas se marcan como simulados.

Los archivos se guardan en IndexedDB local. El mock funciona por defecto, sin claves, cuenta AWS ni llamadas a SICAS/GNP/correo. Los textos completos de los adjuntos internos se excluyen del historial de Git.

## Implementado en código

- Interfaz responsive basada en el mockup: acceso, tablero, bandeja con filtros/paginación/exportación, alta guiada, checklist, carga, expediente, historial, revisión, gestión GNP, reportes, integración y configuración.
- Cuatro modalidades modeladas y habilitadas. Matriz GNP completa de 18 filas y M/C/X/—, ocho filas condicionales preservadas sin exigir disparadores no aprobados.
- Infraestructura Amplify Gen 2, Cognito, API Gateway, Lambda API, DynamoDB, S3, SQS/DLQ y Lambda de integración.
- Propiedad/tenant/asignación comprobados en servidor, grupos Cognito, MFA, separación revisor/aprobador, auditoría transaccional y control de concurrencia.
- Alta idempotente, seguimiento por expediente, carga con hash, objetos nuevos por versión, confirmación desde S3 y cuarentena.
- Folio GNP manual ligado a evidencia, revisión/observaciones por documento y registro de resolución externa con respaldo específico de cierre. Sin interpretación automática de cobertura ni confirmación de pagos.
- Infraestructura de análisis GuardDuty para S3 y Lambda de veredictos por versión de objeto; liberación exclusivamente por resultado limpio.
- Worker SICAS explícitamente bloqueado hasta tener contrato técnico real.

## Integraciones y validaciones reales pendientes para producción

- Conexión y despliegue efectivos en AWS; verificación de infraestructura, permisos y recursos en cuenta/ambiente elegidos.
- Contrato, accesos e integración real SICAS con pruebas y acuses por documento.
- Validar el escaneo GuardDuty desplegado con archivos limpios, EICAR, errores y concurrencia; hasta recibir un resultado limpio para la versión exacta, la descarga permanece bloqueada.
- Recibir las plantillas oficiales GNP: el Excel enumera requisitos pero no contiene los formularios descargables.
- Aprobar campos específicos de cada modalidad, checklist, condiciones, reglas de vigencia, textos de consentimiento/privacidad y retención.
- Extender la autorización provisional a política formal por empresa, aseguradora, póliza y facultades; construir vistas administrativas agregadas para RR. HH., monitoreo y soporte. Actualmente esos perfiles no reciben expedientes clínicos.
- Administración completa de usuarios, roles, plantillas y catálogos con aprobación/versionado; actualmente hay catálogo de lectura y asignación administrativa de casos.
- Correlación/conciliación manual de recepciones de correo y portal con evidencia; no hay integración de correo/WhatsApp/SharePoint.
- Notificaciones externas por canal/plantilla con auditoría de entrega; actualmente sólo hay avisos del portal derivados de estados.
- Reportes y SLA definitivos, alertas, fallos de entrega, políticas VIP y soporte operativo.
- Pruebas de API desplegada, carga real, fallos de terceros, UAT, revisión de privacidad y restauración. Las pruebas locales de dominio no sustituyen QA/UAT.

La definición de “no piloto” significa que estos puntos forman parte del trabajo de cierre del proyecto; no quedan excluidos por etiquetarlos como una fase posterior. No utilizar datos reales mientras existan dependencias de privacidad, validación y operación sin resolver.
