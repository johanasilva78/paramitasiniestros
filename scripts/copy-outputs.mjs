import { copyFileSync, existsSync } from "node:fs";
if (!existsSync("amplify_outputs.json"))
  throw new Error(
    "Ejecuta npx ampx sandbox o npx ampx generate outputs --app-id APP_ID --branch main.",
  );
copyFileSync("amplify_outputs.json", "public/amplify_outputs.json");
console.log("Configuración copiada. Para AWS usa VITE_DEMO_MODE=false.");
