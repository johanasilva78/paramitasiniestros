import { defineFunction } from "@aws-amplify/backend";
export const scanResult = defineFunction({
  name: "document-scan-result",
  entry: "./handler.ts",
  resourceGroupName: "data",
  timeoutSeconds: 30,
});
