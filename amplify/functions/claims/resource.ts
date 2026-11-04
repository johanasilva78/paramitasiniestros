import { defineFunction } from "@aws-amplify/backend";
export const claims = defineFunction({
  name: "claims-api",
  entry: "./handler.ts",
  timeoutSeconds: 30,
  memoryMB: 512,
  resourceGroupName: "data",
});
