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

Amplify Hosting publica exclusivamente React/Vite desde la raíz de este repositorio. El backend de API Gateway, Lambdas, DynamoDB, S3 y Cognito se conserva en `backend/` como proyecto independiente. Las definiciones previas Gen 2 están en `backend/amplify/` y no se instalan, compilan ni despliegan durante la publicación del frontend. La conexión productiva y el despliegue del backend se realizarán por separado.

Los perfiles administrativos no reciben acceso clínico implícito. El analista/aprobador sólo puede operar expedientes asignados dentro de su organización. El asegurado accede a sus propios casos. El servidor deriva usuario, empresa y rol del token Cognito y rechaza perfiles ambiguos. Asignar un aprobador requiere reasignación administrativa y registro previo del personal autorizado.

La aprobación interna requiere un aprobador distinto del solicitante y revisor; el ingreso a GNP exige folio y archivo de respaldo. Cierre no equivale a pago. Los archivos quedan en cuarentena hasta un veredicto de seguridad limpio para su versión exacta; no hay liberación manual desde el cliente.

## Publicar el frontend desde GitHub

1. En Amplify Hosting crear una aplicación nueva: **Create new app → GitHub**. Una aplicación previamente detectada como Gen 2 puede conservar su configuración; usar una aplicación nueva para esta separación.
2. Autorizar `johanasilva78/paramitasiniestros` y seleccionar la rama `main`.
3. Usar la raíz del repositorio; no seleccionar `backend/` ni activar monorepo.
4. Mantener el `amplify.yml` del repositorio. Comando: `VITE_DEMO_MODE=true npm run build`. Directorio de salida: `dist`.
5. La aplicación debe configurarse como frontend estático React/Vite, sin despliegue de backend ni pipeline `ampx`. No agregar secretos ni permisos CDK para publicar este mock.
6. Pulsar **Save and deploy** y abrir la URL HTTPS generada. Los nuevos commits de `main` activarán compilaciones automáticas si esta opción está habilitada.

`amplify.yml` sólo instala el paquete raíz y publica `dist`. Las dependencias de Gen 2/CDK y los comandos de despliegue están exclusivamente en `backend/package.json`. Los cambios no modifican los permisos de la cuenta AWS. El hosting sigue necesitando los permisos normales de Amplify; si la consola conserva una detección Gen 2, revisar la aplicación y raíz seleccionadas antes de continuar.

## Preparación del backend independiente

```sh
npm ci
npm ci --prefix backend
npm run typecheck --prefix backend
npm test --prefix backend
```

Consultar [backend/README.md](backend/README.md). La preparación y las pruebas no crean recursos AWS. En la conexión real, la configuración pública de Cognito/API se suministrará al frontend y se establecerá `VITE_DEMO_MODE=false`. Nunca introducir credenciales de AWS o secretos SICAS en variables `VITE_*`.

Referencia: [configuración de compilación de Amplify Hosting](https://docs.aws.amazon.com/amplify/latest/userguide/build-settings.html).

## Estructura

- `src/`: interfaz, autenticación y cliente REST/demo.
- `shared/domain.ts`: modalidades, matriz documental, permisos y estados.
- `backend/`: infraestructura, Lambdas, dependencias y pruebas del backend, separadas del frontend.
- `tests/`: pruebas de dominio y mock del frontend. Las pruebas de API y análisis de documentos están en `backend/tests/`.
- `docs/`: alcance, operación y pendientes verificables.

Los adjuntos originales permanecen fuera del repositorio. Los textos extraídos se conservan únicamente en la carpeta local ignorada `docs/source/` y se excluyen de todo el historial publicado. El repositorio sólo incluye código, datos sintéticos y documentación técnica.
