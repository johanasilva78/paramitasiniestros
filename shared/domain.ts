import { z } from "zod";
import {
  insurerIds,
  insurers,
  hasGnpChecklist,
  coverageOf,
  pendingChecklistVersion,
  type Coverage,
} from "./coverage";
export { ZodError as DomainValidationError } from "zod";
export const modalities = {
  reimbursement: "Reembolso de gastos",
  surgery: "Programación de cirugía",
  medication: "Programación de medicamentos",
  deductible: "Devolución de deducible / coaseguro",
  notice: "Aviso de siniestro · revisión manual",
} as const;
export type Modality = keyof typeof modalities;
export const checklistVersion = "gnp-2026-11-19-v2-provisional";
export type Mark = "M" | "C" | "X" | "—";
const rows: [string, string, string][] = [
  ["GNP", "Aviso de accidente o enfermedad", "MMMM"],
  ["GNP", "Cirugía Ortop, Trauma, Neuro, Vascu", "CCCC"],
  ["GNP", "Formato Único Información Bancaria", "MXXM"],
  ["GNP", "Formato Solicitud de Reembolso", "MXXM"],
  ["GNP", "Informe Médico", "MMMX"],
  ["Clínica", "Interpretación de estudios", "MMXX"],
  ["Clínica", "Nota de Urgencias", "CXXX"],
  ["Clínica", "Nota de Ingreso", "CXXX"],
  ["Clínica", "Nota de Egreso", "CXXX"],
  ["Clínica", "Recetas", "CXCX"],
  ["Clínica", "Orden de estudios", "CCXX"],
  ["Clínica", "Bitácora de terapias (rehabilitación)", "CXXX"],
  ["Clínica", "Presupuesto", "—CXX"],
  ["Personal", "Identificación oficial Titular", "MMMM"],
  ["Personal", "Identificación oficial Dependiente", "MMMM"],
  ["Personal", "Comprobante de domicilio*", "MMMM"],
  ["Personal", "Estado de cuenta*", "MMXM"],
  ["Personal", "Facturas en PDF", "MXXX"],
];
export const checklist = rows.map(([group, label, marks], i) => ({
  id: `GNP-${String(i + 1).padStart(2, "0")}`,
  group,
  label,
  marks: marks.split("") as Mark[],
}));
export function documentsFor(modality: Modality) {
  const col = Object.keys(modalities).indexOf(modality);
  if (modality === "notice") return [];
  return checklist.map((r) => ({ ...r, mark: r.marks[col] }));
}
export function documentsForClaim(c: Coverage & { modality: Modality; specializedSurgery?: boolean }) {
  if (hasGnpChecklist(c) && c.modality !== "notice")
    return documentsFor(c.modality).filter((row) =>
      (row.id !== "GNP-15" || coverageOf(c).insuredRelationship === "dependent") &&
      (row.id !== "GNP-02" || c.modality !== "surgery" || c.specializedSurgery !== false),
    );
  return [
    {
      id: "SUPPORT",
      label: "Documentos de soporte de tu solicitud",
      group: "Soporte",
      mark: "C" as Mark,
    },
  ];
}
export const maxDocumentBytes = 10 * 1024 * 1024;
export const pdfFileName = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,155}\.pdf$/i;

export function currentClaimDocuments(c: Pick<Claim, "documents">) {
  const current = new Map<string, Attachment>();
  for (const document of c.documents) {
    if (isReceipt(document.type) || isResolution(document.type)) continue;
    if ((current.get(document.type)?.version ?? 0) < document.version)
      current.set(document.type, document);
  }
  return current;
}

export function missingRequiredDocuments(c: Claim) {
  const current = currentClaimDocuments(c);
  return documentsForClaim(c).filter((row) => {
    if (row.mark !== "M") return false;
    const document = current.get(row.id);
    return documentIncomplete(document);
  });
}

function documentIncomplete(document?: Attachment) {
  return document?.state !== "UPLOADED" || document.reviewStatus === "OBSERVED" ||
    document.scan === "INFECTED";
}

export function canUploadDocument(a: Actor, c: Claim, type: string) {
  if (a.tenant !== c.tenant || ["Finalizado", "Resultado informado"].includes(c.status))
    return false;
  if (isReceipt(type) || isResolution(type)) return canOperate(a, c);
  if (a.sub !== c.owner && !canOperate(a, c)) return false;
  if (!c.sentAt) return true;
  if (!["Pendiente de documentos", "Documentos pendientes"].includes(c.status))
    return false;
  return documentIncomplete(currentClaimDocuments(c).get(type));
}

export function documentBytes(c: Claim, replacing?: string) {
  return [...currentClaimDocuments(c).values()].reduce(
    (total, document) => total + (document.type === replacing ? 0 : document.size),
    0,
  );
}

export function submitClaimDraft(a: Actor, c: Claim, at: string): Claim {
  if (a.tenant !== c.tenant || a.sub !== c.owner || !["insured", "employee"].includes(a.role))
    throw new Error("FORBIDDEN");
  if (c.sentAt) return c;
  if (c.status !== "Borrador") throw new Error("El expediente ya fue recibido");
  if (missingRequiredDocuments(c).length)
    throw new Error("Adjunta todos los documentos mínimos antes de enviar");
  if (documentBytes(c) > maxDocumentBytes)
    throw new Error("Los documentos superan 10 MB en conjunto");
  return {
    ...c,
    sentAt: at,
    status: "Recibido",
    events: [...c.events, { at, actor: a.sub, status: "Recibido", message: "Solicitud recibida en el portal" }],
  };
}
export function checklistVersionFor(c: Coverage & { modality: Modality }) {
  return hasGnpChecklist(c) && c.modality !== "notice"
    ? checklistVersion
    : pendingChecklistVersion;
}
export function procedureLabel(
  c: Pick<Claim, "modality" | "requestedProcedure">,
) {
  return c.modality === "notice"
    ? c.requestedProcedure || modalities.notice
    : modalities[c.modality];
}
export function submissionOf(c: Claim) {
  return c.submission ?? c.gnp;
}
export function isReceipt(type: string) {
  return ["INSURER-RECEIPT", "GNP-RECEIPT"].includes(type);
}
export function isResolution(type: string) {
  return ["INSURER-RESULT", "GNP-RESULT"].includes(type);
}
export function normalizeClaim(c: Claim): Claim {
  return {
    ...c,
    ...coverageOf(c),
    submission: submissionOf(c),
    status:
      c.status === "Ingresado en GNP" ? "Ingresado en aseguradora" : c.status,
    events: c.events.map((e) => ({
      ...e,
      status:
        e.status === "Ingresado en GNP" ? "Ingresado en aseguradora" : e.status,
    })),
  };
}
export const statuses = [
  "Borrador",
  "Recibido",
  "Pendiente de documentos",
  "Documentado",
  "En validación",
  "Requiere revisión",
  "Aprobado internamente",
  "Ingresado en GNP",
  "Ingresado en aseguradora",
  "En espera",
  "Observado",
  "Finalizado",
] as const;
export type Status = (typeof statuses)[number];
export const publicStatus = (s: Status): string =>
  ({
    Borrador: "Borrador",
    Recibido: "Recibido",
    "Pendiente de documentos": "Documentos pendientes",
    Documentado: "En revisión",
    "En validación": "En revisión",
    "Requiere revisión": "En revisión",
    "Aprobado internamente": "En revisión",
    "Ingresado en GNP": "En trámite con aseguradora",
    "Ingresado en aseguradora": "En trámite con aseguradora",
    "En espera": "En trámite con aseguradora",
    Observado: "Observado",
    Finalizado: "Resultado informado",
  })[s];
export type Role =
  | "insured"
  | "employee"
  | "hr"
  | "analyst"
  | "approver"
  | "viewer"
  | "admin"
  | "support";
export interface Actor {
  sub: string;
  tenant: string;
  role: Role;
}
export interface ClaimMessage {
  id: string;
  at: string;
  from: "insured" | "staff";
  text: string;
}
export interface Attachment {
  id: string;
  type: string;
  name: string;
  size: number;
  mime: string;
  key: string;
  version: number;
  state: "PENDING" | "UPLOADED";
  reviewStatus?: "PENDING" | "ACCEPTED" | "OBSERVED";
  reviewReason?: string;
  sha256: string;
  storageVersion?: string;
  scannedVersion?: string;
  classification?: {
    status: "MATCH" | "MISMATCH" | "REVIEW";
    reason: string;
    detectedCategory?: string;
    storageVersion: string;
    expectedType: string;
  };
  scan: "PENDING" | "CLEAN" | "INFECTED";
}
export interface Claim extends Coverage {
  enrollmentId?: string;
  enrollmentVersion?: number;
  id: string;
  tenant: string;
  owner: string;
  assignee?: string;
  reviewer?: string;
  modality: Modality;
  specializedSurgery?: boolean;
  insured: string;
  policy: string;
  eventDate?: string;
  description: string;
  subsequent: boolean;
  previousReference?: string;
  consent: boolean;
  status: Status;
  createdAt: string;
  sentAt?: string;
  updatedAt: string;
  version: number;
  checklistVersion: string;
  documents: Attachment[];
  messages?: ClaimMessage[];
  events: { at: string; actor: string; status: Status; message: string }[];
  integration: "NOT_REQUESTED" | "PENDING" | "BLOCKED" | "DELIVERED";
  gnp?: {
    folio: string;
    channel: string;
    evidenceId: string;
    date: string;
    actor: string;
  };
  submission?: Claim["gnp"];
  resolution?: {
    result: string;
    detail: string;
    evidenceId: string;
    date: string;
    actor: string;
  };
  internalNotes?: string;
}
const claimFields = z.object({
  insurer: z.enum(insurerIds),
  branch: z.enum([
    "gmm",
    "surgery",
    "auto",
    "life",
    "property",
    "cargo",
    "liability",
  ]),
  product: z.string().trim().min(3).max(120),
  insuredRelationship: z.enum(["holder", "dependent"]),
  requestedProcedure: z.string().trim().max(150).optional(),
  modality: z.enum([
    "reimbursement",
    "surgery",
    "medication",
    "deductible",
    "notice",
  ]),
  specializedSurgery: z.boolean().optional(),
  insured: z.string().trim().min(3).max(150),
  policy: z.string().trim().min(3).max(80),
  eventDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(
      (x) =>
        !isNaN(Date.parse(x)) &&
        new Date(x).toISOString().slice(0, 10) === x &&
        x <= new Date().toISOString().slice(0, 10),
      "Fecha inválida o futura",
    ).optional(),
  description: z.string().trim().min(10).max(2000),
  subsequent: z.boolean(),
  previousReference: z.string().max(100).optional(),
  consent: z.literal(true),
});
const insuredFields = {
  insured: true,
  policy: true,
  insurer: true,
  branch: true,
  product: true,
  insuredRelationship: true,
} as const;
const enrollmentIdentity = {
  enrollmentId: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
  enrollmentVersion: z.number().int().positive().safe(),
};
export const enrollmentSchema = claimFields
  .pick(insuredFields)
  .extend(enrollmentIdentity)
  .refine(
    (c) =>
      insurers.some((i) => i.id === c.insurer && i.branches.includes(c.branch)),
    "Ramo no disponible para esta aseguradora en la matriz SOW",
  );
export type Enrollment = z.infer<typeof enrollmentSchema>;
export const enrolledClaimInput = claimFields
  .omit(insuredFields)
  .extend(enrollmentIdentity)
  .strict();
export const claimInput = claimFields
  .superRefine((c, ctx) => {
    if (!insurers.find((i) => i.id === c.insurer)?.branches.includes(c.branch))
      ctx.addIssue({
        code: "custom",
        path: ["branch"],
        message: "Ramo no disponible para esta aseguradora en la matriz SOW",
      });
    if (!hasGnpChecklist(c) && c.modality !== "notice")
      ctx.addIssue({
        code: "custom",
        path: ["modality"],
        message: "Esta cobertura requiere aviso para revisión manual",
      });
    if (hasGnpChecklist(c) && c.modality === "notice")
      ctx.addIssue({
        code: "custom",
        path: ["modality"],
        message: "Selecciona una modalidad GNP/GMM",
      });
    if (c.specializedSurgery !== undefined && c.modality !== "surgery")
      ctx.addIssue({
        code: "custom",
        path: ["specializedSurgery"],
        message: "La especialidad sólo aplica a programación de cirugía",
      });
    if (
      c.modality === "notice" &&
      (!c.requestedProcedure || c.requestedProcedure.length < 3)
    )
      ctx.addIssue({
        code: "custom",
        path: ["requestedProcedure"],
        message: "Describe el trámite solicitado",
      });
  })
  .refine(
    (x) => !x.subsequent || !!x.previousReference?.trim(),
    "Indica el número de siniestro",
  );
export function canRead(a: Actor, c: Claim) {
  return (
    a.tenant === c.tenant &&
    (a.sub === c.owner ||
      ((a.role === "analyst" || a.role === "approver") && c.assignee === a.sub && c.status !== "Borrador"))
  );
}
export function canOperate(a: Actor, c: Claim) {
  return (
    canRead(a, c) &&
    ["analyst", "approver"].includes(a.role) &&
    c.status !== "Borrador" &&
    c.assignee === a.sub
  );
}
export function visibleClaim(a: Actor, c: Claim) {
  c = normalizeClaim(c);
  if (canOperate(a, c)) return c;
  const { internalNotes, reviewer, ...rest } = c;
  return {
    ...rest,
    status: publicStatus(c.status),
    events: c.events.map((e) => ({ ...e, status: publicStatus(e.status) })),
  };
}
export function transition(a: Actor, c: Claim, next: Status, reason: string) {
  if (!canOperate(a, c)) throw new Error("FORBIDDEN");
  if (reason.trim().length < 5)
    throw new Error("Indica el motivo de la transición");
  const allowed: Partial<Record<Status, Status[]>> = {
    Recibido: ["Pendiente de documentos", "En validación"],
    "Pendiente de documentos": ["En validación"],
    Documentado: ["En validación"],
    "En validación": [
      "Pendiente de documentos",
      "Requiere revisión",
      "Aprobado internamente",
    ],
    "Requiere revisión": ["En validación", "Pendiente de documentos"],
    "Aprobado internamente": [
      "Ingresado en aseguradora",
      "Ingresado en GNP",
      "Pendiente de documentos",
    ],
    "Ingresado en GNP": ["En espera", "Observado", "Finalizado"],
    "Ingresado en aseguradora": ["En espera", "Observado", "Finalizado"],
    "En espera": ["Observado", "Finalizado"],
    Observado: ["Pendiente de documentos", "En espera", "Finalizado"],
  };
  if (!allowed[c.status]?.includes(next))
    throw new Error("Transición no permitida");
  if (
    next === "Aprobado internamente" &&
    (a.role !== "approver" ||
      !c.reviewer ||
      c.reviewer === a.sub ||
      c.owner === a.sub)
  )
    throw new Error("Se requiere aprobador distinto del revisor y solicitante");
  if (next === "Aprobado internamente" && c.sentAt && missingRequiredDocuments(c).length)
    throw new Error("Completa los documentos mínimos antes de aprobar");
  if (
    !hasGnpChecklist(c) &&
    [
      "Aprobado internamente",
      "Ingresado en aseguradora",
      "Ingresado en GNP",
      "Finalizado",
    ].includes(next)
  )
    throw new Error(
      "Falta aprobar el checklist y el canal de esta cobertura. Mantén el caso en revisión manual.",
    );
  if (
    ["Ingresado en GNP", "Ingresado en aseguradora"].includes(next) &&
    !submissionOf(c)
  )
    throw new Error("Registra folio y evidencia de la aseguradora");
  if (next === "Finalizado" && (!submissionOf(c) || !c.resolution))
    throw new Error(
      "Registra resolución externa y evidencia específica de cierre",
    );
  return {
    ...c,
    status: next,
    reviewer: next === "En validación" ? a.sub : c.reviewer,
  };
}
