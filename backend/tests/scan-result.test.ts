import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  DynamoDBDocumentClient,
  GetCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
process.env.TABLE_NAME = "test";
process.env.BUCKET_NAME = "test-bucket";
const { handler } = await import("../amplify/functions/scan-result/handler");
let commands: unknown[] = [];
DynamoDBDocumentClient.prototype.send = async function (command: unknown) {
  commands.push(command);
  if (command instanceof GetCommand)
    return {
      Item: {
        version: 1,
        documents: [
          { id: "doc", key: "tenant/claim/doc/test.pdf", storageVersion: "v1" },
        ],
      },
    };
  return {};
} as typeof DynamoDBDocumentClient.prototype.send;
beforeEach(() => {
  commands = [];
});
async function invoke(
  result: string,
  versionId = "v1",
  bucketName = "test-bucket",
) {
  await handler(
    {
      id: "event",
      source: "aws.guardduty",
      time: "2026-01-01",
      detail: {
        scanStatus: "COMPLETED",
        s3ObjectDetails: {
          bucketName,
          objectKey: "tenant/claim/doc/test.pdf",
          versionId,
        },
        scanResultDetails: { scanResultStatus: result },
      },
    } as never,
    {} as never,
    () => {},
  );
}
function verdict() {
  const c = commands.find((c) => c instanceof TransactWriteCommand) as
    TransactWriteCommand | undefined;
  return c?.input.TransactItems?.[0].Update?.ExpressionAttributeValues?.[":s"];
}
test("Escáner: sólo resultado limpio libera la versión exacta", async () => {
  await invoke("NO_THREATS_FOUND");
  assert.equal(verdict(), "CLEAN");
});
test("Escáner: un evento de otra versión no libera el documento actual", async () => {
  await invoke("NO_THREATS_FOUND", "v2");
  assert.equal(verdict(), undefined);
});
test("Escáner: amenazas y fallos conservan bloqueo", async () => {
  await invoke("THREATS_FOUND");
  assert.equal(verdict(), "INFECTED");
  commands = [];
  await invoke("FAILED");
  assert.equal(verdict(), "PENDING");
});
test("Escáner: evento de bucket ajeno se ignora", async () => {
  await invoke("NO_THREATS_FOUND", "v1", "another-bucket");
  assert.equal(commands.length, 0);
});
