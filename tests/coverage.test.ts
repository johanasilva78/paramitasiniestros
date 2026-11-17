import { test } from "node:test";
import assert from "node:assert/strict";
import {
  insurers,
  branches,
  coverageOf,
  hasGnpChecklist,
  pendingChecklistVersion,
} from "../shared/coverage";
import {
  claimInput,
  documentsForClaim,
  checklistVersionFor,
  normalizeClaim,
  transition,
  submissionOf,
  type Claim,
  type Actor,
} from "../shared/domain";

const base = {
  insurer: "axa",
  branch: "auto",
  product: "Seguro Autos Ejemplo",
  insuredRelationship: "holder",
  modality: "notice",
  requestedProcedure: "Aviso de accidente",
  insured: "Persona ficticia",
  policy: "POLIZA-123",
  eventDate: "2026-01-01",
  description: "Reporte de un incidente ficticio",
  subsequent: false,
  consent: true,
};
test("SOW: 18 aseguradoras, siete ramos y combinaciones diferenciadas", () => {
  assert.equal(insurers.length, 18);
  assert.equal(new Set(insurers.map((i) => i.id)).size, 18);
  assert.equal(Object.keys(branches).length, 7);
  assert.deepEqual(insurers.find((i) => i.id === "aig")?.branches, [
    "property",
    "cargo",
    "liability",
  ]);
  assert.deepEqual(insurers.find((i) => i.id === "qualitas")?.branches, [
    "auto",
    "cargo",
  ]);
  assert.deepEqual(insurers.find((i) => i.id === "thona")?.branches, ["life"]);
  assert.equal(insurers.find((i) => i.id === "gnp")?.branches.length, 7);
});
test("Captura multiaseguradora conserva producto y rechaza combinaciones o trámites incompatibles", () => {
  const parsed = claimInput.parse(base);
  assert.equal(parsed.insurer, "axa");
  assert.equal(parsed.branch, "auto");
  assert.equal(parsed.product, base.product);
  for (const input of [
    { ...base, insurer: "thona", branch: "auto" },
    { ...base, insurer: "desconocida" },
    { ...base, modality: "reimbursement" },
    { ...base, requestedProcedure: "" },
    { ...base, product: "" },
    { ...base, insurer: undefined },
    { ...base, insurer: "gnp", branch: "gmm" },
  ])
    assert.equal(claimInput.safeParse(input).success, false);
});
test("Todas las combinaciones SOW admiten recepción con reglas específicas sólo para GNP/GMM", () => {
  for (const insurer of insurers)
    for (const branch of insurer.branches) {
      const data = {
        ...base,
        insurer: insurer.id,
        branch,
        modality: hasGnpChecklist({ insurer: insurer.id, branch })
          ? "reimbursement"
          : "notice",
      };
      assert.ok(claimInput.safeParse(data).success, `${insurer.id}/${branch}`);
      const docs = documentsForClaim(
        data as Parameters<typeof documentsForClaim>[0],
      );
      if (insurer.id === "gnp" && branch === "gmm")
        assert.equal(docs.length, 18);
      else {
        assert.deepEqual(
          docs.map((d) => d.id),
          ["SUPPORT"],
        );
        assert.equal(
          checklistVersionFor(
            data as Parameters<typeof checklistVersionFor>[0],
          ),
          pendingChecklistVersion,
        );
      }
    }
});
test("Compatibilidad de expedientes previos conserva folios, archivos y eventos", () => {
  const legacy = {
    id: "old",
    status: "Ingresado en GNP",
    documents: [{ id: "original", type: "GNP-RECEIPT" }],
    events: [{ status: "Ingresado en GNP" }],
    gnp: { folio: "FOLIO-ORIGINAL" },
  } as Claim;
  const migrated = normalizeClaim(legacy);
  assert.deepEqual(coverageOf(migrated), {
    insurer: "gnp",
    branch: "gmm",
    product: branches.gmm,
    insuredRelationship: "holder",
  });
  assert.equal(migrated.status, "Ingresado en aseguradora");
  assert.equal(submissionOf(migrated)?.folio, "FOLIO-ORIGINAL");
  assert.deepEqual(migrated.documents, legacy.documents);
  assert.equal(migrated.events[0].status, "Ingresado en aseguradora");
  assert.deepEqual(normalizeClaim(migrated), migrated);
});
test("Una cobertura pendiente permite revisión y bloquea aprobación e ingreso", () => {
  const actor: Actor = { sub: "approver", tenant: "one", role: "approver" };
  const claim = {
    ...base,
    id: "case",
    tenant: "one",
    owner: "owner",
    assignee: "approver",
    reviewer: "reviewer",
    status: "En validación",
  } as Claim;
  assert.equal(
    transition(actor, claim, "Requiere revisión", "Requisitos pendientes")
      .status,
    "Requiere revisión",
  );
  assert.throws(
    () =>
      transition(
        actor,
        claim,
        "Aprobado internamente",
        "Intento de aprobación",
      ),
    /Falta aprobar el checklist/,
  );
  assert.throws(
    () =>
      transition(
        actor,
        { ...claim, status: "Aprobado internamente" },
        "Ingresado en aseguradora",
        "Intento de ingreso",
      ),
    /Falta aprobar el checklist/,
  );
});
test("El ingreso genérico conserva el flujo GNP con folio y resolución externa", () => {
  const actor: Actor = { sub: "analyst", tenant: "one", role: "analyst" };
  const claim = {
    insurer: "gnp",
    branch: "gmm",
    modality: "reimbursement",
    tenant: "one",
    owner: "owner",
    assignee: "analyst",
    status: "Aprobado internamente",
    submission: {
      folio: "FOLIO-123",
      channel: "Canal autorizado",
      evidenceId: "receipt",
      date: "2026-01-01",
      actor: "analyst",
    },
  } as Claim;
  const entered = transition(
    actor,
    claim,
    "Ingresado en aseguradora",
    "Acuse confirmado",
  );
  assert.equal(entered.status, "Ingresado en aseguradora");
  assert.throws(
    () => transition(actor, entered, "Finalizado", "Cerrar expediente"),
    /resolución externa/,
  );
  const closed = transition(
    actor,
    {
      ...entered,
      resolution: {
        result: "Respuesta favorable",
        detail: "Respuesta de la aseguradora",
        evidenceId: "result",
        date: "2026-01-01",
        actor: "analyst",
      },
    },
    "Finalizado",
    "Respuesta confirmada",
  );
  assert.equal(closed.status, "Finalizado");
});
