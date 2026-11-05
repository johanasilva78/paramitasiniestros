# Backend independiente de Paramita

Este directorio conserva las Lambdas y las definiciones de infraestructura previamente implementadas. Tiene su propio package.json, lockfile, configuración TypeScript y pruebas. Amplify Hosting sólo instala el paquete frontend de la raíz; no procesa este proyecto.

## Validación local

Desde la raíz del repositorio:

```sh
npm ci
npm ci --prefix backend
npm run typecheck --prefix backend
npm test --prefix backend
```

`amplify/` contiene el código previo de definición Gen 2/CDK para Cognito, API Gateway, Lambda, DynamoDB, S3, GuardDuty y SQS. Se conserva como base técnica: su despliegue no forma parte de la publicación del frontend. Los scripts sandbox/deploy del paquete backend son herramientas explícitas de ese código previo; no se ejecutan desde Amplify Hosting. El despliegue productivo independiente se definirá antes de conectar servicios reales.

Los handlers importan las reglas compartidas desde `../../../../shared/domain`. Las pruebas se ejecutan con sus dependencias propias. No se han desplegado ni modificado recursos AWS mediante esta separación.
