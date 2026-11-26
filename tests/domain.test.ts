import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canRead,
  canOperate,
  checklist,
  documentsFor,
  claimInput,
  transition,
  visibleClaim,
  publicStatus,
  canUploadDocument,
  documentsForClaim,
  missingRequiredDocuments,
  documentBytes,
  claimDocumentName,
  maxDocumentBytes,
  submitClaimDraft,
  type Actor,
  type Claim,
} from "../shared/domain";
const owner: Actor = { sub: "owner", tenant: "one", role: "insured" };
const analyst: Actor = { sub: "analyst", tenant: "one", role: "analyst" };
const approver: Actor = { sub: "approver", tenant: "one", role: "approver" };
const claim: Claim = {
  id: "test",
  owner: "owner",
  tenant: "one",
  assignee: "analyst",
  modality: "reimbursement",
  insured: "Persona ficticia",
  policy: "TEST-123",
  eventDate: "2026-01-01",
  description: "Solicitud de prueba",
  subsequent: false,
  consent: true,
  status: "En validación",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  version: 1,
  checklistVersion: "test",
  documents: [],
  events: [],
  integration: "NOT_REQUESTED",
};
test("El nombre de PDF usa la póliza y el número de siniestro sin caracteres especiales", () => {
  const draft = { ...claim, id: "a1-b2", policy: "Pól. 123 / 4" };
  assert.equal(claimDocumentName(draft, "GNP-01"), "GNP01POLIZAPOL1234SINIESTROA1B2.pdf");
  assert.equal(claimDocumentName({ ...draft, subsequent: true, previousReference: "Sín / 87" }, "GNP-02"),
    "GNP02POLIZAPOL1234SINIESTROSIN87.pdf");
  assert.equal(claimDocumentName({ ...draft, gnp: {
    folio: "GNP-999", channel: "Portal", date: "2026-01-01", evidenceId: "acuse", actor: analyst.sub,
  } }, "INSURER-RESULT"), "INSURERRESULTPOLIZAPOL1234SINIESTROGNP999.pdf");
});

test("El borrador exige los mínimos aplicables y cierra los adjuntos al enviarlo", () => {
  const draft: Claim = { ...claim, status: "Borrador", assignee: analyst.sub };
  const at = "2026-01-02T00:00:00.000Z";
  assert.equal(canRead(analyst, draft), false);
  assert.throws(() => submitClaimDraft(owner, draft, at), /documentos mínimos/);
  const documents = missingRequiredDocuments(draft).map(({ id }) => ({
    id, type: id, name: 'archivo.pdf', size: 128, mime: 'application/pdf',
    key: id, sha256: '', version: 1, state: 'UPLOADED' as const, scan: 'CLEAN' as const,
  }));
  const ready = { ...draft, documents };
  assert.throws(() => submitClaimDraft(owner, {
    ...draft, documents: [{ ...documents[0], size: maxDocumentBytes + 1 }, ...documents.slice(1)],
  }, at), /10 MB/);
  const sent = submitClaimDraft(owner, ready, at);
  assert.equal(sent.status, "Recibido");
  assert.equal(sent.sentAt, at);
  assert.equal(submitClaimDraft(owner, sent, at), sent);
  assert.equal(canUploadDocument(owner, sent, documents[0].type), false);
  assert.equal(canUploadDocument(analyst, sent, "INSURER-RECEIPT"), true);
  const correction: Claim = {
    ...sent, status: "Pendiente de documentos",
    documents: [...documents, { ...documents[0], version: 2, reviewStatus: "OBSERVED" }],
  };
  assert.equal(canUploadDocument(owner, correction, documents[0].type), true);
  assert.equal(canUploadDocument(owner, correction, documents[1].type), false);
  assert.equal(documentBytes(correction), documentBytes(ready));
});

test("Cirugía muestra el formato especializado cuando aplica o falta confirmar", () => {
  const surgery = { ...claim, modality: "surgery" as const };
  assert.equal(documentsForClaim(surgery).find(({ id }) => id === "GNP-02")?.mark, "C");
  assert.equal(documentsForClaim({ ...surgery, specializedSurgery: false }).some(({ id }) => id === "GNP-02"), false);
  assert.equal(documentsForClaim({ ...surgery, specializedSurgery: true }).some(({ id }) => id === "GNP-02"), true);
});
test("QA-01: aislamiento por usuario, organización y asignación", () => {
  assert.ok(canRead(owner, claim));
  assert.ok(canRead(analyst, claim));
  assert.equal(canRead({ ...owner, sub: "other" }, claim), false);
  assert.equal(canRead({ ...analyst, tenant: "two" }, claim), false);
  assert.equal(canRead({ ...analyst, sub: "unassigned" }, claim), false);
});
test("QA-20: administración de empresa y soporte no heredan acceso clínico", () => {
  for (const role of ["hr", "admin", "support", "viewer"] as const) {
    assert.equal(canRead({ ...owner, sub: "other", role }, claim), false);
    assert.equal(canOperate({ ...owner, role }, claim), false);
  }
});
test("QA-04: matriz conserva 18 filas y las cuatro modalidades exactas", () => {
  assert.equal(checklist.length, 18);
  assert.deepEqual(
    documentsFor("deductible").map((r) => r.mark),
    [
      "M",
      "C",
      "M",
      "M",
      "X",
      "X",
      "X",
      "X",
      "X",
      "X",
      "X",
      "X",
      "X",
      "M",
      "M",
      "M",
      "M",
      "X",
    ],
  );
  assert.equal(documentsFor("reimbursement")[12].mark, "—");
  assert.equal(documentsFor("surgery")[12].mark, "C");
  assert.equal(documentsFor("medication")[9].mark, "C");
});
test("QA-05: ocho renglones condicionales mantienen su marca", () =>
  assert.equal(checklist.filter((r) => r.marks.includes("C")).length, 8));
test("QA-10: analista no aprueba; aprobador requiere asignación y separación de funciones", () => {
  assert.throws(() =>
    transition(analyst, claim, "Aprobado internamente", "Revisión completa"),
  );
  assert.throws(() =>
    transition(approver, claim, "Aprobado internamente", "Revisión completa"),
  );
  assert.throws(() =>
    transition(
      approver,
      { ...claim, assignee: "approver", reviewer: "approver" },
      "Aprobado internamente",
      "Revisión completa",
    ),
  );
  assert.equal(
    transition(
      approver,
      { ...claim, assignee: "approver", reviewer: "analyst" },
      "Aprobado internamente",
      "Revisión completa",
    ).status,
    "Aprobado internamente",
  );
});
test("Ingreso GNP requiere folio y no permite saltar estados", () => {
  assert.throws(() =>
    transition(
      analyst,
      { ...claim, status: "Aprobado internamente" },
      "Ingresado en GNP",
      "Acuse recibido",
    ),
  );
  assert.throws(() =>
    transition(analyst, claim, "Finalizado", "Cerrar solicitud"),
  );
});
test("QA-15: vista asegurado oculta hallazgos y estado de aprobación interna", () => {
  const visible = visibleClaim(owner, {
    ...claim,
    status: "Aprobado internamente",
    internalNotes: "Hallazgo privado",
    reviewer: "analyst",
  });
  assert.equal(visible.status, "En revisión");
  assert.equal("internalNotes" in visible, false);
  assert.equal("reviewer" in visible, false);
  assert.equal(publicStatus("Finalizado"), "Resultado informado");
});
test("QA-18: discrepancias permiten revisión humana sin rechazo automático", () =>
  assert.equal(
    transition(analyst, claim, "Requiere revisión", "Póliza no localizada")
      .status,
    "Requiere revisión",
  ));
test("Captura exige consentimiento y referencia previa en subsecuentes", () => {
  const input = {
    insurer: "gnp",
    branch: "gmm",
    product: "Gastos Médicos Mayores",
    insuredRelationship: "holder",
    modality: claim.modality,
    insured: claim.insured,
    policy: claim.policy,
    eventDate: claim.eventDate,
    description: claim.description,
    subsequent: false,
    consent: true,
  };
  assert.ok(claimInput.safeParse(input).success);
  assert.equal(
    claimInput.safeParse({ ...input, consent: false }).success,
    false,
  );
  assert.equal(
    claimInput.safeParse({ ...input, subsequent: true }).success,
    false,
  );
  assert.equal(
    claimInput.safeParse({ ...input, eventDate: "2099-01-01" }).success,
    false,
  );
});
test("Fecha de evento rechaza fechas inexistentes del calendario", () => {
  assert.equal(
    claimInput.safeParse({
      insurer: "gnp",
      branch: "gmm",
      product: "Gastos Médicos Mayores",
      insuredRelationship: "holder",
      modality: "reimbursement",
      insured: "Persona ficticia",
      policy: "TEST-123",
      eventDate: "2026-02-31",
      description: "Solicitud ficticia de reembolso",
      subsequent: false,
      consent: true,
    }).success,
    false,
  );
});
test("Aprobación exige evidencia de revisor previo", () =>
  assert.throws(() =>
    transition(
      approver,
      { ...claim, assignee: "approver" },
      "Aprobado internamente",
      "Expediente revisado",
    ),
  ));
test("Cierre requiere resolución y respaldo externo específico", () => {
  assert.throws(() =>
    transition(
      analyst,
      {
        ...claim,
        status: "En espera",
        gnp: {
          folio: "FOLIO",
          channel: "Portal",
          evidenceId: "receipt",
          date: "2026-01-01",
          actor: "analyst",
        },
      },
      "Finalizado",
      "Respuesta externa recibida",
    ),
  );
});
