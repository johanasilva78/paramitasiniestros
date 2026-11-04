import * as mock from "./mock";
import { Amplify } from "aws-amplify";
import {
  type SignInOutput,
  fetchAuthSession,
  signIn,
  confirmSignIn,
  signOut,
  resetPassword,
  confirmResetPassword,
} from "aws-amplify/auth";
import {
  claimInput,
  checklistVersion,
  transition,
  type Claim,
  type Actor,
  type Modality,
} from "../shared/domain";
export const demo = import.meta.env.VITE_DEMO_MODE !== "false";
let endpoint = "";
export const demoActor: Actor = {
  sub: "demo-insured",
  tenant: "paramita-demo",
  role: "insured",
};
let actor = demoActor;
function read(): Claim[] {
  return mock.stored(mock.mockKeys.claims, mock.seedClaims());
}
function write(claims: Claim[]) {
  localStorage.setItem("paramita-demo-v1", JSON.stringify(claims));
}
export async function init() {
  if (demo) return;
  const response = await fetch("/amplify_outputs.json");
  if (!response.ok)
    throw new Error(
      "Falta la configuración AWS. Genera amplify_outputs.json y cópialo a public/.",
    );
  const outputs = await response.json();
  Amplify.configure(outputs);
  endpoint = outputs.custom.apiUrl;
}
export async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
  idempotencyKey?: string,
): Promise<T> {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  if (!token) throw new Error("Inicia sesión para continuar");
  const r = await fetch(`${endpoint}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Error de conexión");
  return data;
}
export async function me() {
  if (demo) return actor;
  return request<Actor>("/me");
}
export function setDemoRole(role: Actor["role"]) {
  actor = {
    ...demoActor,
    role,
    sub: ["analyst", "approver"].includes(role)
      ? `demo-${role}`
      : role === "employee"
        ? "demo-employee"
        : demoActor.sub,
  };
  if (role === "approver") {
    const all = read();
    all.forEach((c) => {
      c.assignee = actor.sub;
    });
    write(all);
  }
  if (role === "analyst") {
    const all = read();
    all.forEach((c) => {
      c.assignee = actor.sub;
    });
    write(all);
  }
  return actor;
}
export async function login(
  email: string,
  password: string,
): Promise<SignInOutput> {
  if (demo) return { isSignedIn: true, nextStep: { signInStep: "DONE" } };
  return signIn({ username: email, password });
}
export async function confirmLogin(
  input: Parameters<typeof confirmSignIn>[0],
): Promise<SignInOutput> {
  if (demo) return { isSignedIn: true, nextStep: { signInStep: "DONE" } };
  return confirmSignIn(input);
}
export async function forgotPassword(
  input: Parameters<typeof resetPassword>[0],
) {
  if (demo) return;
  return resetPassword(input);
}
export async function resetForgottenPassword(
  input: Parameters<typeof confirmResetPassword>[0],
) {
  if (demo) return;
  return confirmResetPassword(input);
}
export async function logout() {
  if (!demo) await signOut();
}
export async function listClaims() {
  if (demo) {
    if (["hr", "admin", "viewer", "support"].includes(actor.role)) return [];
    return read().filter(
      (c) =>
        ["analyst", "approver"].includes(actor.role) || c.owner === actor.sub,
    );
  }
  let items: Claim[] = [];
  let cursor: string | undefined;
  do {
    const page = await request<{ items: Claim[]; cursor?: string }>(
      `/claims${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
    );
    items = items.concat(page.items);
    cursor = page.cursor;
  } while (cursor);
  return items;
}
export async function getClaim(id: string) {
  if (demo) {
    const c = read().find((c) => c.id === id);
    if (!c) throw new Error("Expediente no encontrado");
    return c;
  }
  return request<Claim>(`/claims/${id}`);
}
export async function createClaim(data: unknown, key: string) {
  const input = claimInput.parse(data);
  if (demo && !mock.settings().enabled.includes(input.modality))
    throw new Error(
      "Modalidad deshabilitada en la configuración de demostración",
    );
  if (!demo) return request<Claim>("/claims", "POST", input, key);
  const all = read();
  const existing = all.find((c) => c.id === key);
  if (existing) return existing;
  const date = new Date().toISOString();
  const c: Claim = {
    ...input,
    id: key,
    tenant: demoActor.tenant,
    owner: actor.sub,
    assignee: "demo-analyst",
    status: "Recibido",
    createdAt: date,
    updatedAt: date,
    version: 1,
    checklistVersion,
    documents: [],
    events: [
      {
        at: date,
        actor: actor.sub,
        status: "Recibido",
        message: "Solicitud recibida",
      },
    ],
    integration: "NOT_REQUESTED",
  };
  write([c, ...all]);
  mock.addNotice(c.id, "Solicitud registrada (simulación)");
  return c;
}
export async function changeStatus(
  c: Claim,
  status: Claim["status"],
  reason: string,
) {
  if (!demo)
    return request<Claim>(`/claims/${c.id}/transition`, "POST", {
      status,
      reason,
      version: c.version,
    });
  const updated = transition(actor, c, status, reason);
  updated.version++;
  updated.updatedAt = new Date().toISOString();
  updated.events.push({
    at: updated.updatedAt,
    actor: actor.sub,
    status,
    message: "Estado actualizado por Paramita",
  });
  write(read().map((x) => (x.id === c.id ? updated : x)));
  mock.addNotice(c.id, "Expediente actualizado (simulación)");
  return updated;
}
export async function upload(c: Claim, type: string, file: File) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer(),
  );
  const sha256 = Array.from(new Uint8Array(digest))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
  const mime =
    file.type ||
    (file.name.endsWith(".xml")
      ? "application/xml"
      : "application/octet-stream");
  if (file.size > 10 * 1024 * 1024) throw new Error("El archivo excede 10 MB");
  if (
    ![
      "application/pdf",
      "image/png",
      "image/jpeg",
      "application/xml",
      "text/xml",
    ].includes(mime)
  )
    throw new Error("Selecciona PDF, JPG, PNG o XML");
  if (demo) {
    const all = read();
    const current = all.find((x) => x.id === c.id)!;
    const documentId = crypto.randomUUID();
    await mock.saveMockFile(documentId, file);
    current.documents.push({
      id: documentId,
      type,
      name: file.name,
      size: file.size,
      mime,
      key: "demo",
      sha256,
      version: current.documents.filter((d) => d.type === type).length + 1,
      state: "UPLOADED",
      scan: "CLEAN",
    });
    write(all);
    mock.addNotice(c.id, "Documento recibido (simulación)");
    return current;
  }
  const ticket = await request<{
    document: { id: string };
    url: string;
    checksum: string;
  }>(`/claims/${c.id}/uploads`, "POST", {
    type,
    name: file.name,
    size: file.size,
    mime,
    sha256,
  });
  const response = await fetch(ticket.url, {
    method: "PUT",
    headers: { "content-type": mime, "x-amz-checksum-sha256": ticket.checksum },
    body: file,
  });
  if (!response.ok)
    throw new Error("Falló la carga a almacenamiento; vuelve a intentarlo");
  return request<Claim>(
    `/claims/${c.id}/documents/${ticket.document.id}/complete`,
    "POST",
    {},
  );
}
export async function download(c: Claim, id: string) {
  if (demo) {
    const document = c.documents.find((d) => d.id === id);
    if (!document) throw new Error("Documento no encontrado");
    const blob =
      (await mock.getMockFile(id)) ||
      (document.key === "mock-generated"
        ? mock.samplePdf(document.name)
        : undefined);
    if (!blob)
      throw new Error(
        "El archivo local ya no está disponible; vuelve a adjuntarlo",
      );
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = document.name;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  const { url } = await request<{ url: string }>(
    `/claims/${c.id}/documents/${id}`,
  );
  window.open(url, "_blank", "noopener,noreferrer");
}
export async function sendSicas(c: Claim) {
  if (demo) return mock.transfer(c.id);
  return request<{ state: string }>(
    `/claims/${c.id}/integration`,
    "POST",
    {},
    crypto.randomUUID(),
  );
}
export async function saveGnp(
  c: Claim,
  data: { folio: string; channel: string; evidenceId: string; date: string },
) {
  if (!demo) return request<Claim>(`/claims/${c.id}/gnp`, "POST", data);
  if (
    !c.documents.some(
      (d) => d.id === data.evidenceId && d.type === "GNP-RECEIPT",
    )
  )
    throw new Error("Adjunta el acuse GNP");
  const updated = { ...c, gnp: { ...data, actor: actor.sub } };
  write(read().map((x) => (x.id === c.id ? updated : x)));
  mock.addNotice(c.id, "Expediente actualizado (simulación)");
  return updated;
}
export type { Modality };

export async function reviewDocument(
  c: Claim,
  id: string,
  status: "ACCEPTED" | "OBSERVED",
  reason: string,
) {
  if (!demo)
    return request<Claim>(`/claims/${c.id}/documents/${id}/review`, "POST", {
      status,
      reason,
    });
  const updated = structuredClone(c);
  const doc = updated.documents.find((d) => d.id === id);
  if (!doc) throw new Error("Documento no encontrado");
  doc.reviewStatus = status;
  doc.reviewReason = reason;
  if (status === "OBSERVED") updated.status = "Pendiente de documentos";
  updated.events.push({
    at: new Date().toISOString(),
    actor: actor.sub,
    status: updated.status,
    message: `Documento ${doc.type}: ${reason}`,
  });
  write(read().map((x) => (x.id === c.id ? updated : x)));
  mock.addNotice(c.id, "Expediente actualizado (simulación)");
  return updated;
}
export async function saveResolution(
  c: Claim,
  data: { result: string; detail: string; evidenceId: string; date: string },
) {
  if (!demo) return request<Claim>(`/claims/${c.id}/resolution`, "POST", data);
  if (
    !c.documents.some(
      (d) => d.id === data.evidenceId && d.type === "GNP-RESULT",
    )
  )
    throw new Error("Adjunta la resolución GNP");
  const updated = { ...c, resolution: { ...data, actor: actor.sub } };
  write(read().map((x) => (x.id === c.id ? updated : x)));
  mock.addNotice(c.id, "Expediente actualizado (simulación)");
  return updated;
}

export async function assignClaim(id: string, assignee: string) {
  if (!demo) return request(`/claims/${id}/assign`, "POST", { assignee });
  const user = mock
    .settings()
    .users.find(
      (u) =>
        u.id === assignee &&
        u.active &&
        ["analyst", "approver"].includes(u.role),
    );
  if (!user) throw new Error("Selecciona un analista o aprobador activo");
  const all = read();
  const c = all.find((c) => c.id === id);
  if (!c) throw new Error("Expediente no encontrado");
  c.assignee = assignee;
  write(all);
  return { id, assignee };
}
