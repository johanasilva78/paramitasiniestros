import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as mock from "../src/mock";
const memory = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => memory.set(k, v),
    removeItem: (k: string) => memory.delete(k),
  },
  configurable: true,
});
beforeEach(() => memory.clear());
test("Mock incluye cuatro modalidades, expedientes activos y cierre con evidencia", () => {
  const cases = mock.seedClaims();
  assert.equal(new Set(cases.map((c) => c.modality)).size, 4);
  const closed = cases.find((c) => c.status === "Finalizado");
  assert.ok(closed?.gnp && closed.resolution);
  assert.ok(
    closed.documents.find((d) => d.id === closed.resolution?.evidenceId),
  );
});
test("Mock SICAS conserva expediente y archivos tras timeout y reintento", () => {
  const original = mock.seedClaims()[0];
  const failed = mock.transfer(original.id, true);
  assert.equal(failed.state, "FAILED");
  let stored = mock.stored(mock.mockKeys.claims, mock.seedClaims());
  assert.deepEqual(stored[0].documents, original.documents);
  assert.equal(stored[0].status, original.status);
  const success = mock.transfer(original.id);
  assert.equal(success.state, "DELIVERED");
  assert.equal(success.attempt, 2);
  assert.ok(success.receipt?.startsWith("SICAS-MOCK-"));
  assert.equal(mock.jobs().length, 2);
  stored = mock.stored(mock.mockKeys.claims, mock.seedClaims());
  assert.equal(stored[0].integration, "DELIVERED");
  assert.equal(stored[0].status, original.status);
});
test("Configuración de mock se versiona y mantiene modalidades seleccionadas", () => {
  const settings = mock.settings();
  settings.enabled = ["surgery"];
  mock.saveSettings(settings);
  assert.equal(mock.settings().version, 2);
  assert.deepEqual(mock.settings().enabled, ["surgery"]);
});
test("Almacenamiento dañado recupera datos de demostración", () => {
  memory.set(mock.mockKeys.settings, "{broken");
  assert.equal(mock.settings().enabled.length, 4);
});
test("PDF de ejemplo identifica de forma visible su carácter ficticio", async () => {
  const pdf = mock.samplePdf("Documento de prueba");
  assert.equal(pdf.type, "application/pdf");
  const content = await pdf.text();
  assert.ok(content.startsWith("%PDF-1.4"));
  assert.match(content, /DOCUMENTO FICTICIO/);
  assert.match(content, /Sin validez clinica ni contractual/);
});
