import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  PutCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
process.env.TABLE_NAME = "test-table";
const { handler } = await import("../amplify/functions/claims/handler");
const sample = {
  pk: "TENANT#one#CLAIM#aaaaaaaaaaaaaaaaaaaaaaaa",
  sk: "META",
  id: "aaaaaaaaaaaaaaaaaaaaaaaa",
  tenant: "one",
  owner: "alice",
  assignee: "analyst",
  modality: "reimbursement",
  insured: "Persona ficticia",
  policy: "TEST-123",
  eventDate: "2026-01-01",
  description: "Solicitud ficticia",
  subsequent: false,
  consent: true,
  status: "Aprobado internamente",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  version: 1,
  checklistVersion: "test",
  documents: [],
  events: [],
  integration: "NOT_REQUESTED",
  internalNotes: "Confidencial",
  reviewer: "reviewer",
};
let commands: unknown[] = [];
DynamoDBDocumentClient.prototype.send = async function (command: unknown) {
  commands.push(command);
  if (command instanceof GetCommand) {
    return {
      Item:
        command.input.Key?.pk === sample.pk
          ? structuredClone(sample)
          : undefined,
    };
  }
  if (command instanceof QueryCommand)
    return { Items: [structuredClone(sample)] };
  if (command instanceof PutCommand || command instanceof TransactWriteCommand)
    return {};
  throw new Error("Unexpected command");
} as typeof DynamoDBDocumentClient.prototype.send;
beforeEach(() => {
  commands = [];
});
async function invoke(
  sub: string,
  role: string,
  tenant = "one",
  path = `/claims/${sample.id}`,
  method = "GET",
  body?: unknown,
) {
  const event = {
    version: "2.0",
    rawPath: path,
    headers: {},
    body: body ? JSON.stringify(body) : undefined,
    requestContext: {
      requestId: "test",
      http: { method },
      authorizer: {
        jwt: {
          claims: { sub, "custom:tenant": tenant, "cognito:groups": [role] },
          scopes: [],
        },
      },
    },
  };
  const result = await handler(event as never, {} as never, () => {});
  assert.ok(result && typeof result === "object" && "statusCode" in result);
  const data = JSON.parse(result.body as string);
  return { status: result.statusCode, data };
}
test("API: asegurado no consulta otro propietario y se audita la denegación", async () => {
  const r = await invoke("bob", "insured");
  assert.equal(r.status, 403);
  assert.ok(
    commands.some(
      (c) =>
        c instanceof PutCommand && c.input.Item?.action === "ACCESS_DENIED",
    ),
  );
  assert.equal(r.data.internalNotes, undefined);
});
test("API: clave de organización se deriva del token; no accede a otro tenant", async () => {
  const r = await invoke("alice", "insured", "two");
  assert.equal(r.status, 404);
  const get = commands.find((c) => c instanceof GetCommand) as GetCommand;
  assert.match(String(get.input.Key?.pk), /^TENANT#two#/);
});
test("API: respuesta asegurado oculta revisión y aprobación interna", async () => {
  const r = await invoke("alice", "insured");
  assert.equal(r.status, 200);
  assert.equal(r.data.status, "En revisión");
  assert.equal(r.data.internalNotes, undefined);
  assert.equal(r.data.reviewer, undefined);
});
test("API: admin y RRHH no obtienen contenido clínico por URL directa", async () => {
  for (const role of ["admin", "hr", "support", "viewer"]) {
    const r = await invoke("administrative-user", role);
    assert.equal(r.status, 403);
  }
});
test("API: analista sin asignación no obtiene expediente", async () =>
  assert.equal((await invoke("other-analyst", "analyst")).status, 403));
test("API: lectura asignada entrega revisión interna al analista autorizado", async () => {
  const r = await invoke("analyst", "analyst");
  assert.equal(r.status, 200);
  assert.equal(r.data.internalNotes, "Confidencial");
});
test("API: alta rechaza idempotency key ausente antes de crear registros", async () => {
  const r = await invoke("alice", "insured", "one", "/claims", "POST", {
    modality: "reimbursement",
    insured: "Persona ficticia",
    policy: "TEST-123",
    eventDate: "2026-01-01",
    description: "Solicitud de prueba",
    subsequent: false,
    consent: true,
  });
  assert.equal(r.status, 400);
  assert.equal(
    commands.some((c) => c instanceof TransactWriteCommand),
    false,
  );
});
test("API: perfiles administrativos no enumeran casos clínicos", async () => {
  const r = await invoke("hr", "hr", "one", "/claims");
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.items, []);
  assert.equal(commands.length, 0);
});
