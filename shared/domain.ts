import { z } from "zod";
export const modalities = {
  reimbursement: "Reembolso de gastos",
  surgery: "Programación de cirugía",
  medication: "Programación de medicamentos",
  deductible: "Devolución de deducible / coaseguro",
} as const;
export type Modality = keyof typeof modalities;
export const checklistVersion = "gnp-2026-11-04-v1-provisional";
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
  ["Personal", "Facturas PDF + XML", "MXXX"],
];
export const checklist = rows.map(([group, label, marks], i) => ({
  id: `GNP-${String(i + 1).padStart(2, "0")}`,
  group,
  label,
  marks: marks.split("") as Mark[],
}));
export function documentsFor(modality: Modality) {
  const col = Object.keys(modalities).indexOf(modality);
  return checklist.map((r) => ({ ...r, mark: r.marks[col] }));
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
  scan: "PENDING" | "CLEAN" | "INFECTED";
}
export interface Claim {
  id: string;
  tenant: string;
  owner: string;
  assignee?: string;
  reviewer?: string;
  modality: Modality;
  insured: string;
  policy: string;
  eventDate: string;
  description: string;
  subsequent: boolean;
  previousReference?: string;
  consent: boolean;
  status: Status;
  createdAt: string;
  updatedAt: string;
  version: number;
  checklistVersion: string;
  documents: Attachment[];
  events: { at: string; actor: string; status: Status; message: string }[];
  integration: "NOT_REQUESTED" | "PENDING" | "BLOCKED" | "DELIVERED";
  gnp?: {
    folio: string;
    channel: string;
    evidenceId: string;
    date: string;
    actor: string;
  };
  resolution?: {
    result: string;
    detail: string;
    evidenceId: string;
    date: string;
    actor: string;
  };
  internalNotes?: string;
}
export const claimInput = z
  .object({
    modality: z.enum(["reimbursement", "surgery", "medication", "deductible"]),
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
      ),
    description: z.string().trim().min(10).max(2000),
    subsequent: z.boolean(),
    previousReference: z.string().max(100).optional(),
    consent: z.literal(true),
  })
  .refine(
    (x) => !x.subsequent || !!x.previousReference,
    "Indica la referencia previa",
  );
export function canRead(a: Actor, c: Claim) {
  return (
    a.tenant === c.tenant &&
    (a.sub === c.owner ||
      ((a.role === "analyst" || a.role === "approver") && c.assignee === a.sub))
  );
}
export function canOperate(a: Actor, c: Claim) {
  return (
    canRead(a, c) &&
    ["analyst", "approver"].includes(a.role) &&
    c.assignee === a.sub
  );
}
export function visibleClaim(a: Actor, c: Claim) {
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
    "Aprobado internamente": ["Ingresado en GNP", "Pendiente de documentos"],
    "Ingresado en GNP": ["En espera", "Observado", "Finalizado"],
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
  if (next === "Ingresado en GNP" && !c.gnp)
    throw new Error("Registra folio y evidencia GNP");
  if (next === "Finalizado" && (!c.gnp || !c.resolution))
    throw new Error(
      "Registra resolución externa y evidencia específica de cierre",
    );
  return {
    ...c,
    status: next,
    reviewer: next === "En validación" ? a.sub : c.reviewer,
  };
}
