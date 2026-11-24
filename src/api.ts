import * as mock from "./mock";
import { Amplify } from "aws-amplify";
import {
  type SignInOutput,
  fetchAuthSession,
  fetchMFAPreference,
  fetchUserAttributes,
  signIn,
  confirmSignIn,
  signOut,
  resetPassword,
  confirmResetPassword,
  updatePassword,
} from "aws-amplify/auth";
import {
  claimInput,
  enrolledClaimInput,
  checklistVersionFor,
  normalizeClaim,
  isReceipt,
  isResolution,
  canUploadDocument,
  documentBytes,
  maxDocumentBytes,
  pdfFileName,
  submitClaimDraft,
  documentsForClaim,
  canOperate,
  transition,
  type Claim,
  type Actor,
  type Enrollment,
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
class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function read(): Claim[] {
  return mock
    .stored<Claim[]>(mock.mockKeys.claims, mock.seedClaims())
    .map(normalizeClaim);
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
  if (!r.ok) {
    const data = await r.json().catch(() => null);
    throw new ApiError(data?.error || "Error de conexión", r.status);
  }
  return r.json();
}
export async function me() {
  if (demo) return actor;
  try {
    return await request<Actor>("/me");
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      await logout();
    }
    throw error;
  }
}
export async function listEnrollments() {
  if (demo) return mock.enrollments(actor.sub);
  return (await request<{ items: Enrollment[] }>("/me/enrollments")).items;
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
      if (c.status !== "Borrador") c.assignee = actor.sub;
    });
    write(all);
  }
  if (role === "analyst") {
    const all = read();
    all.forEach((c) => {
      if (c.status !== "Borrador") c.assignee = actor.sub;
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
  const credentials = { username: email, password };
  try {
    return await signIn(credentials);
  } catch (error) {
    if (!(error instanceof Error) || error.name !== "UserAlreadyAuthenticatedException") {
      throw error;
    }
    await logout();
    return signIn(credentials);
  }
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
export async function accountDetails() {
  const [attributes, mfa] = await Promise.allSettled([
    fetchUserAttributes(),
    fetchMFAPreference(),
  ]);
  if (attributes.status === "rejected") throw attributes.reason;
  return {
    email: attributes.value.email,
    emailVerified: attributes.value.email_verified === "true",
    authenticatorConfigured:
      mfa.status === "fulfilled" ? mfa.value.enabled?.includes("TOTP") ?? false : undefined,
  };
}
export async function changePassword(oldPassword: string, newPassword: string) {
  await updatePassword({ oldPassword, newPassword });
}
export async function listClaims() {
  if (demo) {
    if (["hr", "admin", "viewer", "support"].includes(actor.role)) return [];
    return read().filter(
      (c) =>
        (["analyst", "approver"].includes(actor.role) && c.status !== "Borrador") ||
        c.owner === actor.sub,
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
  return items.map(normalizeClaim);
}
export async function getClaim(id: string) {
  if (demo) {
    const c = read().find((c) => c.id === id);
    if (!c) throw new Error("Expediente no encontrado");
    return c;
  }
  return normalizeClaim(await request<Claim>(`/claims/${id}`));
}
export async function createClaim(data: unknown, key: string) {
  const payload = enrolledClaimInput.parse(data);
  if (!demo) return request<Claim>("/claims", "POST", payload, key);
  if (!["insured", "employee"].includes(actor.role))
    throw new Error("Acceso denegado");
  const enrollment = mock
    .enrollments(actor.sub)
    .find(
      (item) =>
        item.enrollmentId === payload.enrollmentId &&
        item.enrollmentVersion === payload.enrollmentVersion,
    );
  if (!enrollment)
    throw new Error(
      "La póliza y persona seleccionadas ya no están disponibles en tu cuenta.",
    );
  const input = claimInput.parse({ ...payload, ...enrollment });
  if (
    input.modality !== "notice" &&
    !mock.settings().enabled.includes(input.modality)
  )
    throw new Error(
      "Modalidad deshabilitada en la configuración de demostración",
    );
  const all = read();
  const existing = all.find((c) => c.id === key && c.owner === actor.sub);
  if (existing) return existing;
  const date = new Date().toISOString();
  const c: Claim = {
    ...input,
    enrollmentId: enrollment.enrollmentId,
    enrollmentVersion: enrollment.enrollmentVersion,
    id: key,
    tenant: demoActor.tenant,
    owner: actor.sub,
    assignee: "demo-analyst",
    status: "Borrador",
    createdAt: date,
    updatedAt: date,
    version: 1,
    checklistVersion: checklistVersionFor(input),
    documents: [],
    events: [
      {
        at: date,
        actor: actor.sub,
        status: "Borrador",
        message: "Borrador guardado",
      },
    ],
    integration: "NOT_REQUESTED",
  };
  write([c, ...all]);
  return c;
}
export async function submitClaim(c: Claim) {
  if (!demo) return request<Claim>(`/claims/${c.id}/submit`, "POST", {});
  const all = read();
  const current = all.find((item) => item.id === c.id) ?? c;
  const updated = submitClaimDraft(actor, current, new Date().toISOString());
  if (updated === current) return current;
  updated.version++;
  updated.updatedAt = updated.sentAt!;
  write(all.map((item) => item.id === c.id ? updated : item));
  mock.addNotice(c.id, "Solicitud recibida (simulación)");
  return updated;
}
export async function sendClaimMessage(c: Claim, text: string) {
  if (!demo) return request<Claim>(`/claims/${c.id}/messages`, "POST", { text });
  const all = read();
  const current = all.find((item) => item.id === c.id);
  if (!current || current.status === "Borrador" ||
    !(canOperate(actor, current) || (actor.sub === current.owner && ["insured", "employee"].includes(actor.role))))
    throw new Error("La conversación no está disponible");
  const message = text.trim();
  if (!message || message.length > 1000) throw new Error("Escribe un mensaje de hasta 1.000 caracteres");
  const messages = current.messages ?? [];
  if (messages.length >= 50) throw new Error("Se alcanzó el límite de mensajes de este expediente");
  const at = new Date().toISOString();
  current.messages = [...messages, { id: crypto.randomUUID(), at, from: canOperate(actor, current) ? "staff" : "insured", text: message }];
  current.version++;
  current.updatedAt = at;
  write(all);
  return current;
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
  if (!pdfFileName.test(file.name) || (file.type && file.type !== "application/pdf"))
    throw new Error("Selecciona un PDF con un nombre que use letras sin acentos, números, espacios, guiones o guiones bajos");
  const evidence = isReceipt(type) || isResolution(type);
  if (file.size < 1 || file.size + (evidence ? 0 : documentBytes(c, type)) > maxDocumentBytes)
    throw new Error("Los documentos no pueden superar 10 MB en conjunto");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer(),
  );
  const sha256 = Array.from(new Uint8Array(digest))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
  const mime = "application/pdf";
  if (demo) {
    const documentId = crypto.randomUUID();
    if (!(await file.slice(0, 512).text()).trimStart().startsWith("%PDF-"))
      throw new Error("El contenido del archivo no corresponde a un PDF");
    await mock.saveMockFile(documentId, file);
    const all = read();
    const current = all.find((x) => x.id === c.id)!;
    if (!canUploadDocument(actor, current, type) || (!evidence &&
      !documentsForClaim(current).some((row) => row.id === type && ["M", "C"].includes(row.mark))))
      throw new Error("La carga no está disponible para este documento");
    if (file.size + (evidence ? 0 : documentBytes(current, type)) > maxDocumentBytes)
      throw new Error("Los documentos no pueden superar 10 MB en conjunto");
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
export async function saveSubmission(
  c: Claim,
  data: { folio: string; channel: string; evidenceId: string; date: string },
) {
  if (!demo) return request<Claim>(`/claims/${c.id}/submission`, "POST", data);
  if (!c.documents.some((d) => d.id === data.evidenceId && isReceipt(d.type)))
    throw new Error("Adjunta el acuse de la aseguradora");
  const updated = { ...c, submission: { ...data, actor: actor.sub } };
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
    !c.documents.some((d) => d.id === data.evidenceId && isResolution(d.type))
  )
    throw new Error("Adjunta la resolución de la aseguradora");
  const updated = { ...c, resolution: { ...data, actor: actor.sub } };
  write(read().map((x) => (x.id === c.id ? updated : x)));
  mock.addNotice(c.id, "Expediente actualizado (simulación)");
  return updated;
}

export type AssignableClaim = Pick<Claim, "id" | "createdAt" | "status" | "assignee" | "version">;
export type AssignableStaff = { id: string; role: "analyst" | "approver"; displayName?: string };

export function assignmentCases(cursor?: string) {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return request<{ items: AssignableClaim[]; cursor?: string }>(`/admin/assignments${query}`);
}

export function assignmentStaff() {
  return request<{ items: AssignableStaff[] }>("/admin/staff");
}

export async function assignClaim(id: string, assignee: string, version?: number) {
  if (!demo) return request<{ id: string; assignee: string; version?: number }>(
    `/claims/${id}/assign`, "POST", { assignee, version },
  );
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
