import { copyFileSync, existsSync } from "node:fs";
if (!existsSync("backend/amplify_outputs.json"))
  throw new Error(
    "Falta backend/amplify_outputs.json. Primero configura el backend independiente.",
  );
copyFileSync("backend/amplify_outputs.json", "public/amplify_outputs.json");
console.log("Configuración copiada. Para AWS usa VITE_DEMO_MODE=false.");
