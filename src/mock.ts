import {
  checklistVersion,
  documentsFor,
  type Claim,
  type Role,
  type Status,
  type Modality,
} from "../shared/domain";
export const mockKeys = {
  claims: "paramita-demo-v1",
  settings: "paramita-mock-settings",
  jobs: "paramita-mock-jobs",
  notifications: "paramita-mock-notifications",
  inbox: "paramita-mock-inbox",
};
export function stored<T>(key: string, initial: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : structuredClone(initial);
  } catch {
    return structuredClone(initial);
  }
}
export function persist(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}
export const sampleNames = [
  "María López García",
  "Carlos Pérez Díaz",
  "Ana Torres Ruiz",
  "Luis Mendoza Ortiz",
  "Sofía Ramírez León",
  "Jorge Ruiz Mora",
];
export function seedClaims(): Claim[] {
  const modes: Modality[] = [
    "reimbursement",
    "surgery",
    "medication",
    "deductible",
  ];
  const states: Status[] = [
    "En validación",
    "Pendiente de documentos",
    "Ingresado en GNP",
    "Finalizado",
    "Recibido",
    "Requiere revisión",
    "Aprobado internamente",
    "En espera",
    "Observado",
    "Documentado",
    "En validación",
    "Recibido",
  ];
  return states.map((status, i) => {
    const id = `demo-${String(18 - i).padStart(4, "0")}`,
      at = `2026-10-${String(28 - i).padStart(2, "0")}T14:00:00Z`,
      modality = modes[i % 4];
    const docs =
      i === 1
        ? []
        : documentsFor(modality)
            .filter((d) => d.mark === "M")
            .slice(0, 3)
            .map((d, j) => ({
              id: `mock-doc-${i}-${j}`,
              type: d.id,
              name: `${d.id}_ejemplo_ficticio.pdf`,
              size: 800,
              mime: "application/pdf",
              key: "mock-generated",
              version: 1,
              state: "UPLOADED" as const,
              scan: "CLEAN" as const,
              sha256: "0".repeat(64),
            }));
    const external = [
      "Ingresado en GNP",
      "Finalizado",
      "En espera",
      "Observado",
    ].includes(status);
    if (external)
      docs.push({
        id: `mock-receipt-${i}`,
        type: "GNP-RECEIPT",
        name: "acuse_ficticio.pdf",
        size: 800,
        mime: "application/pdf",
        key: "mock-generated",
        version: 1,
        state: "UPLOADED",
        scan: "CLEAN",
        sha256: "0".repeat(64),
      });
    if (status === "Finalizado")
      docs.push({
        id: `mock-result-${i}`,
        type: "GNP-RESULT",
        name: "resolucion_ficticia.pdf",
        size: 800,
        mime: "application/pdf",
        key: "mock-generated",
        version: 1,
        state: "UPLOADED",
        scan: "CLEAN",
        sha256: "0".repeat(64),
      });
    return {
      id,
      tenant: "paramita-demo",
      owner: i < 4 ? "demo-insured" : "demo-employee",
      assignee: "demo-analyst",
      reviewer: "demo-analyst",
      modality,
      insured: sampleNames[i % sampleNames.length],
      policy: i % 2 ? "GNP-COLECTIVA-DEMO" : "GNP-INDIVIDUAL-DEMO",
      eventDate: at.slice(0, 10),
      description:
        "Solicitud ficticia para explorar el flujo del portal. No corresponde a una persona ni a un siniestro real.",
      subsequent: i === 4,
      previousReference: i === 4 ? "SIN-2026-0018" : undefined,
      consent: true,
      status,
      createdAt: at,
      updatedAt: at,
      version: 1,
      checklistVersion,
      documents: docs,
      events: [
        {
          at,
          actor: "demo-insured",
          status: "Recibido",
          message: "Solicitud ficticia recibida en el portal",
        },
        {
          at,
          actor: "demo-analyst",
          status,
          message: "Hito de ejemplo para demostrar el seguimiento",
        },
      ],
      integration: external ? "DELIVERED" : "NOT_REQUESTED",
      gnp: external
        ? {
            folio: `GNP-DEMO-${1000 + i}`,
            channel: "Portal GNP (simulado)",
            evidenceId: `mock-receipt-${i}`,
            date: at,
            actor: "demo-analyst",
          }
        : undefined,
      resolution:
        status === "Finalizado"
          ? {
              result: "Respuesta favorable",
              detail:
                "Resolución ficticia para demostrar el cierre. No acredita cobertura ni pago.",
              evidenceId: `mock-result-${i}`,
              date: at,
              actor: "demo-analyst",
            }
          : undefined,
    };
  });
}
export interface MockUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
}
export interface MockSettings {
  version: number;
  enabled: Modality[];
  users: MockUser[];
  templates: { name: string; body: string }[];
}
const defaults: MockSettings = {
  version: 1,
  enabled: ["reimbursement", "surgery", "medication", "deductible"],
  users: [
    {
      id: "demo-analyst",
      name: "Luis Cabrera · Ficticio",
      email: "analista@example.invalid",
      role: "analyst",
      active: true,
    },
    {
      id: "demo-approver",
      name: "Ana Pérez · Ficticia",
      email: "aprobador@example.invalid",
      role: "approver",
      active: true,
    },
    {
      id: "demo-insured",
      name: "María López · Ficticia",
      email: "asegurado@example.invalid",
      role: "insured",
      active: true,
    },
  ],
  templates: [
    {
      name: "Acuse de recepción",
      body: "Recibimos tu solicitud {folio}. Puedes consultar su avance en el portal.",
    },
    {
      name: "Solicitud de documentos",
      body: "Tu expediente {folio} tiene documentos pendientes. Consulta el detalle en el portal.",
    },
    {
      name: "Resultado informado",
      body: "Se ha registrado una respuesta de GNP para tu expediente {folio}.",
    },
  ],
};
export function settings() {
  return stored(mockKeys.settings, defaults);
}
export function saveSettings(data: MockSettings) {
  persist(mockKeys.settings, { ...data, version: data.version + 1 });
}
export interface MockJob {
  id: string;
  claimId: string;
  at: string;
  state: "DELIVERED" | "FAILED";
  receipt?: string;
  error?: string;
  attempt: number;
  files: number;
}
export function jobs() {
  return stored<MockJob[]>(mockKeys.jobs, []);
}
export interface MockNotice {
  id: string;
  claimId: string;
  at: string;
  subject: string;
  state: "DELIVERED" | "FAILED" | "READ";
  channel: "Portal" | "Email simulado";
}
export function notices() {
  return stored<MockNotice[]>(mockKeys.notifications, [
    {
      id: "notice-initial",
      claimId: "demo-0017",
      at: "2026-10-27T14:00:00Z",
      subject: "Documentos pendientes en tu expediente",
      state: "DELIVERED",
      channel: "Portal",
    },
  ]);
}
export function addNotice(claimId: string, subject: string, fail = false) {
  persist(mockKeys.notifications, [
    {
      id: crypto.randomUUID(),
      claimId,
      at: new Date().toISOString(),
      subject,
      state: fail ? "FAILED" : "DELIVERED",
      channel: "Email simulado",
    },
    ...notices(),
  ]);
}
export function transfer(claimId: string, fail = false) {
  const all = stored<Claim[]>(mockKeys.claims, seedClaims());
  const c = all.find((c) => c.id === claimId);
  if (!c) throw new Error("Expediente no encontrado");
  const job: MockJob = {
    id: crypto.randomUUID(),
    claimId,
    at: new Date().toISOString(),
    state: fail ? "FAILED" : "DELIVERED",
    receipt: fail ? undefined : `SICAS-MOCK-${crypto.randomUUID().slice(0, 8)}`,
    error: fail ? "TIMEOUT_SIMULADO" : undefined,
    attempt: 1 + jobs().filter((j) => j.claimId === claimId).length,
    files: c.documents.length,
  };
  persist(mockKeys.jobs, [job, ...jobs()]);
  c.integration = fail ? "BLOCKED" : "DELIVERED";
  persist(mockKeys.claims, all);
  addNotice(
    claimId,
    fail
      ? "Transferencia simulada pendiente de reintento"
      : "Transferencia simulada completada",
  );
  return job;
}
export interface InboxEntry {
  id: string;
  subject: string;
  reference: string;
  state: "PENDING" | "LINKED" | "DISCARDED";
  claimId?: string;
  reason?: string;
  at?: string;
}
export function inbox() {
  return stored<InboxEntry[]>(mockKeys.inbox, [
    {
      id: "EMAIL-DEMO-01",
      subject: "Documentos adicionales · referencia incompleta",
      reference: "Póliza GNP-COLECTIVA-DEMO",
      state: "PENDING",
    },
    {
      id: "EMAIL-DEMO-02",
      subject: "Reembolso · posible recepción duplicada",
      reference: "SIN-2026-0018",
      state: "PENDING",
    },
  ]);
}
export function resetMock() {
  Object.values(mockKeys).forEach((k) => localStorage.removeItem(k));
  return new Promise<void>((resolve, reject) => {
    const r = indexedDB.deleteDatabase("paramita-mock-files");
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
    r.onblocked = () =>
      reject(new Error("Cierra otras pestañas para reiniciar los archivos"));
  });
}
function fileDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open("paramita-mock-files", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("files");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function saveMockFile(id: string, file: Blob) {
  const db = await fileDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("files", "readwrite");
      tx.objectStore("files").put(file, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function getMockFile(id: string) {
  const db = await fileDb();
  try {
    return await new Promise<Blob | undefined>((resolve, reject) => {
      const r = db.transaction("files").objectStore("files").get(id);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
}
export function samplePdf(label: string) {
  const clean = label.replace(/[^a-zA-Z0-9 -]/g, " ").slice(0, 90);
  const stream = `BT /F1 15 Tf 40 750 Td (PARAMITA - DOCUMENTO FICTICIO) Tj 0 -30 Td /F1 10 Tf (${clean}) Tj 0 -25 Td (Solo demostracion. Sin validez clinica ni contractual.) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => String(n).padStart(10, "0") + " 00000 n ")
    .join(
      "\n",
    )}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}
