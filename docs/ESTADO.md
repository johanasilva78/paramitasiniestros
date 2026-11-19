# Estado verificable de la implementación

## Observaciones al portal · 19/11/2026

El alta usa el padrón de la cuenta para comprobar la relación entre asegurado y póliza. Los expedientes nuevos se guardan como borradores. **Documentos → Enviar** comprueba los mínimos aplicables, registra la recepción y cierra la carga ordinaria. Paramita puede solicitar correcciones. El límite de 10 MB se aplica a las versiones vigentes de los documentos de la solicitud. El acuse y la resolución externa se cargan aparte por el equipo asignado. Los expedientes anteriores conservan su estado, folio y adjuntos.

El checklist provisional usa las marcas base de cada trámite GNP/GMM. La identificación del dependiente se pide cuando corresponde y el formato de cirugía especializada aparece según la respuesta del asegurado. La aprobación de mínimos y de reglas adicionales por padecimiento, hospital o preexistencia sigue pendiente. Las coberturas sin checklist configurado conservan la recepción para revisión manual.

El expediente incluye mensajería entre el asegurado y el equipo asignado, el siguiente paso y el tiempo transcurrido en la etapa actual. En Amplify Hosting se pueden configurar horas de SLA por etapa y el teléfono oficial de Siniestros Paramita con las variables de `.env.example`. El vencimiento aparece en pantalla cuando hay un SLA configurado. Las alertas programadas y la conciliación automática de correo y WhatsApp requieren sus propias integraciones.

La clasificación disponible identifica la categoría del adjunto cuando el validador está conectado. La comprobación de identidad, RFC, vigencia y emisores requiere fuentes y reglas autorizadas. La detección de pólizas vigentes desde SICAS requiere acceso y contrato de API. La vista de empresa sigue disponible con datos de demostración. El panel real requiere métricas, importes y permisos de RR. HH. aprobados.

La instrucción vigente es construir por ahora un mock completo e ir sustituyendo simulaciones por integraciones reales. El alcance final sigue siendo completo; no se considera un piloto. El frontend se publica en Amplify Hosting; el backend y las integraciones reales siguen pendientes de conexión y validación.

## Reconciliación con el SOW · 17/11/2026

Se incorpora el inventario de 18 aseguradoras y siete ramos, con validación de combinaciones tanto en la captura como en API. Se guardan aseguradora, ramo, producto declarado, relación titular/dependiente y trámite. El SOW no proporciona catálogo de productos comerciales ni checklists completos para todas las combinaciones.

GNP/GMM mantiene sus cuatro modalidades y matriz documental de referencia. Las demás combinaciones permiten registrar aviso y soportes para revisión manual, con aprobación, ingreso y cierre bloqueados hasta contar con requisitos y canal aprobados. El formulario, bandeja, búsqueda, filtros, CSV, detalle, resumen administrativo y reportes distinguen cobertura. Documentos permite consultar el inventario completo y limita el checklist GNP a su combinación.

La lectura compatible conserva los expedientes previos como GNP/GMM, su folio, archivos y versiones; normaliza los estados de ingreso a aseguradora. Los ejemplos nuevos incluyen AXA/Autos, Thona/Vida, AIG/Daños y Bupa/GMM; en navegadores con datos previos se conservan éstos, y se pueden crear avisos nuevos o reiniciar los datos ficticios desde Configuración.

Esto resuelve la estructura multiaseguradora y la recepción, no acredita automatización aprobada para todas las aseguradoras. Siguen pendientes integración SICAS, canales reales, validación automática documental, permisos detallados por póliza/aseguradora, SLA/VIP, textos legales y UAT.

## Demostración disponible

Ocho perfiles; cuatro modalidades; expedientes de ejemplo en distintas etapas; pólizas; alta, archivos locales y descarga; revisión/subsanación, aprobación, folio y resolución GNP; reportes; empresa/monitoreo sin documentos clínicos; usuarios y modalidades configurables; plantillas; notificaciones con lectura y reintento; conciliación manual de correos ficticios; SICAS simulado con acuses, timeout, historial y reintentos; reinicio de todos los datos de prueba. Los análisis de archivos y las entregas externas se marcan como simulados.

Los archivos se guardan en IndexedDB local. El mock funciona por defecto, sin claves, cuenta AWS ni llamadas a SICAS/GNP/correo. Los textos completos de los adjuntos internos se excluyen del historial de Git.

## Separación frontend/backend

Amplify Hosting compila únicamente el paquete React/Vite de la raíz. Infraestructura, dependencias Gen 2/CDK y pruebas de API se conservan en `backend/`. No hay `amplify/backend.ts`, dependencias `@aws-amplify/backend` ni comandos `ampx` en el paquete raíz. El backend se conectará y desplegará por separado.

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
