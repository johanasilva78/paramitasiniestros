# Paramita · Portal de Siniestros GNP

Mock interactivo del alcance completo GNP/GMM, **no piloto**. Conforme a la instrucción vigente, todas las integraciones se simulan por ahora y se mejorarán progresivamente. Incluye cuatro modalidades desde el inicio. La infraestructura AWS se conserva preparada para conexión posterior: consultar [estado real y dependencias](docs/ESTADO.md).

## Ejecutar localmente

```sh
npm ci
npm run dev
```

El modo mock está habilitado por defecto y funciona sin cuenta AWS ni servicios externos. Incluye selector de ocho perfiles, expedientes ficticios para las cuatro modalidades, carga y descarga de archivos locales, revisión documental, aprobación, registro GNP, resolución y cierre, pólizas, notificaciones, configuración, conciliación manual y simulaciones SICAS con éxito, timeout y reintentos.

Los expedientes y parámetros se guardan en localStorage; los archivos adjuntos se guardan en IndexedDB exclusivamente en este navegador. Los PDF precargados se generan como ejemplos ficticios. Para restablecer la demostración: perfil Administrador → Configuración → Datos de prueba. Usar archivos ficticios.

Para conectar AWS, establecer explícitamente `VITE_DEMO_MODE=false`. El selector de demostración y las vistas mock no se muestran en ese modo. Ninguna simulación de éxito acredita una entrega a SICAS ni una respuesta real de GNP.

```sh
npm test
npm run build
```

## Arquitectura AWS

Amplify Gen 2 + Hosting para React/Vite; Cognito con usuarios provisionados administrativamente, contraseña robusta y MFA TOTP; API Gateway HTTP con JWT; Lambda para expedientes; DynamoDB con índices por propietario y responsable, control de versión y auditoría transaccional; S3 privado y versionado para documentos con URLs firmadas y SHA-256; SQS, DLQ y Lambda de integración SICAS; GuardDuty Malware Protection, EventBridge y Lambda de veredictos por versión de archivo. Infraestructura en `amplify/backend.ts`.

Los perfiles administrativos no reciben acceso clínico implícito. El analista/aprobador sólo puede operar expedientes asignados dentro de su organización. El asegurado accede a sus propios casos. El servidor deriva usuario, empresa y rol del token Cognito y rechaza perfiles ambiguos. Asignar un aprobador requiere reasignación administrativa y registro previo del personal autorizado.

La aprobación interna requiere un aprobador distinto del solicitante y revisor; el ingreso a GNP exige folio y archivo de respaldo. Cierre no equivale a pago. Los archivos quedan en cuarentena hasta un veredicto de seguridad limpio para su versión exacta; no hay liberación manual desde el cliente.

## Conectar a AWS

Requisitos: Node 22+, cuenta AWS, región y perfil con permisos de Amplify/CDK, acceso al repositorio GitHub y autorización del proyecto.

1. Configurar el perfil AWS sin guardar credenciales en el repositorio.
2. Ejecutar `PORTAL_ORIGIN=http://localhost:5173 npx ampx sandbox --profile PERFIL` para un ambiente de desarrollo.
3. Ejecutar `node scripts/copy-outputs.mjs` y cambiar `.env.local` a `VITE_DEMO_MODE=false`.
4. Provisionar usuarios Cognito con `custom:tenant` y exactamente un grupo. Crear el registro `STAFF#<sub>` en DynamoDB para personal asignable, como se detalla en [operación](docs/OPERACION.md).
5. Para hosting: conectar `https://github.com/johanasilva78/paramitasiniestros.git` a Amplify Hosting mediante GitHub App, seleccionar `main`. Para activar el backend real, reemplazar `amplify.yml` por el contenido de `amplify.fullstack.yml` y revisar los permisos y ambiente antes de ejecutar. Configurar `PORTAL_ORIGIN=https://<dominio-del-portal>` y `VITE_DEMO_MODE=false` en el ambiente de compilación.
6. Configurar una regla de reescritura SPA a `/index.html` (200) para rutas del frontend. La API usa su propio dominio de API Gateway.
7. Ejecutar pruebas de aceptación y cerrar dependencias antes del uso con datos reales.

El pipeline predeterminado `amplify.yml` sólo compila y publica el mock estático: no despliega backend. La alternativa `amplify.fullstack.yml` despliega el backend, copia sus outputs públicos de configuración y compila el frontend en modo AWS. Nunca introducir claves de AWS o secretos SICAS en variables `VITE_*`.

Referencias de implementación: [recursos CDK en Amplify](https://docs.amplify.aws/react/build-a-backend/add-aws-services/custom-resources/), [REST API con Amplify Gen 2](https://docs.amplify.aws/react/build-a-backend/add-aws-services/rest-api/set-up-rest-api/).

## Estructura

- `src/`: interfaz, autenticación y cliente REST/demo.
- `shared/domain.ts`: modalidades, matriz documental, permisos y estados.
- `amplify/`: infraestructura y Lambdas.
- `tests/`: pruebas de dominio y aislamiento de acceso.
- `docs/`: alcance, fuentes extraídas, operación y pendientes verificables.

Los adjuntos originales permanecen fuera del repositorio. Los textos extraídos se conservan únicamente en la carpeta local ignorada `docs/source/` y se excluyen de todo el historial publicado. El repositorio sólo incluye código, datos sintéticos y documentación técnica.
