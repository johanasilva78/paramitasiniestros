import { defineFunction } from "@aws-amplify/backend";
export const integration = defineFunction({
  name: "sicas-dispatcher",
  entry: "./handler.ts",
  timeoutSeconds: 30,
  resourceGroupName: "data",
});
