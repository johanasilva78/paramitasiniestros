import { MockWorkspace } from "./MockWorkspace";
import * as mock from "./mock";
import {
  useEffect,
  useEffectEvent,
  useId,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  type LucideIcon,
  Activity,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Bell,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  Clock3,
  FileCheck2,
  FileText,
  LayoutDashboard,
  LogOut,
  Search,
  Settings,
  ShieldCheck,
  UploadCloud,
  Users,
  UserRound,
  X,
  LoaderCircle,
  CircleHelp,
  Building2,
  ChartNoAxesCombined,
  Mail,
  LockKeyhole,
  Flower,
  ExternalLink,
} from "lucide-react";
import * as api from "./api";
import {
  modalities,
  documentsFor,
  documentsForClaim,
  procedureLabel,
  submissionOf,
  isReceipt,
  isResolution,
  checklist,
  checklistVersion,
  publicStatus,
  statuses,
  transition,
  canOperate,
  canUploadDocument,
  currentClaimDocuments,
  documentBytes,
  maxDocumentBytes,
  missingRequiredDocuments,
  type Claim,
  type Actor,
  type Enrollment,
  type Modality,
  type Status,
} from "../shared/domain";
import {
  insurers,
  branches,
  coverageOf,
  insurerName,
  hasGnpChecklist,
  type Insurer,
  type Branch,
} from "../shared/coverage";
const labels: Record<Actor["role"], string> = {
  insured: "Asegurado individual",
  employee: "Empleado",
  hr: "Administración de empresa",
  analyst: "Analista Paramita",
  approver: "Aprobador Paramita",
  viewer: "Monitoreo",
  admin: "Administrador",
  support: "Siniestros Paramita",
};
const supportPhone = import.meta.env.VITE_PARAMITA_CLAIMS_PHONE?.trim();
const stageSlaHours = [
  undefined,
  import.meta.env.VITE_SLA_DOCUMENTS_HOURS,
  import.meta.env.VITE_SLA_REVIEW_HOURS,
  import.meta.env.VITE_SLA_INSURER_HOURS,
].map(Number);
const date = (s: string) =>
  new Date(s).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
const shortId = (id: string) =>
  id.startsWith("demo-")
    ? `SIN-2026-${id.slice(-4)}`
    : `SIN-${id.slice(0, 8).toUpperCase()}`;

function customerNotices(claims: Claim[]) {
  return claims.flatMap((claim) => {
    const notices = documentsToCorrect(claim).map((document) => ({
      id: `${claim.id}:observed:${document.id}`,
      title: "Te solicitaron una corrección",
      at: claim.updatedAt,
      claim,
      correction: true,
    }));
    if (claim.resolution) {
      notices.push({
        id: `${claim.id}:resolution:${claim.resolution.date}`,
        title: "Resultado de la aseguradora disponible",
        at: claim.resolution.date,
        claim,
        correction: false,
      });
    }
    let previous = "";
    for (const [index, event] of claim.events.entries()) {
      const status = publicStatus(event.status) || event.status;
      if (status === previous) continue;
      previous = status;
      if (!index || status === "Resultado informado") continue;
      notices.push({
        id: `${claim.id}:status:${event.at}:${index}`,
        title: `Estado actualizado · ${status}`,
        at: event.at,
        claim,
        correction: false,
      });
    }
    return notices;
  }).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 25);
}

function readNoticeIds(key: string): string[] {
  try {
    const ids = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}
function BrandLogo({ partner = false }: { partner?: boolean }) {
  const filterId = useId();
  return (
    <svg
      className="brand-logo"
      role="img"
      aria-label={partner ? "Waspert · Premium Insurance Brokers" : "Paramita"}
      viewBox={partner ? "16 14 306 76" : "20 16 240 66"}
      width={partner ? 306 : 240}
      height={partner ? 76 : 66}
    >
      <defs>
        {/* Remove the screenshots' pale backdrop without redrawing the logos. */}
        <filter id={filterId} colorInterpolationFilters="sRGB">
          <feColorMatrix
            type="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  -1 -1 -1 0 2.65"
          />
        </filter>
      </defs>
      <image
        href={partner ? "/logos/waspert.png" : "/logos/paramita.png"}
        width={partner ? 336 : 278}
        height={partner ? 100 : 98}
        filter={`url(#${filterId})`}
      />
    </svg>
  );
}
function Brand({ onHome }: { onHome?: () => void }) {
  if (onHome) {
    return (
      <button type="button" className="brand brand-home" onClick={onHome} aria-label="Ir a Inicio">
        <BrandLogo />
      </button>
    );
  }
  return (
    <div className="brand">
      <BrandLogo />
    </div>
  );
}
function Badge({ status }: { status: string }) {
  const color = /Finalizado|Resultado informado/.test(status)
    ? "green"
    : /Pendiente|Observado|Observaciones/.test(status)
      ? "amber"
      : /revisión|validación/.test(status)
        ? "blue"
        : "neutral";
  return (
    <span className={`badge ${color}`}>
      <i />
      {status}
    </span>
  );
}
function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <FileText size={32} />
      <h3>{text}</h3>
      <p>La información aparecerá aquí cuando esté disponible.</p>
    </div>
  );
}
export function App() {
  const [ready, setReady] = useState(false),
    [actor, setActor] = useState<Actor | null>(null),
    [fatal, setFatal] = useState(""),
    [toast, setToast] = useState(""),
    [claims, setClaims] = useState<Claim[]>([]),
    [page, setPage] = useState("Inicio"),
    [selected, setSelected] = useState<Claim | null>(null),
    [showDocumentCorrections, setShowDocumentCorrections] = useState(false),
    [loading, setLoading] = useState(false),
    [notifications, setNotifications] = useState(false),
    [noticeReads, setNoticeReads] = useState<{ key: string; ids: string[] }>({ key: "", ids: [] });
  const notify = (s: string) => {
    setToast(s);
  };
  async function refresh() {
    setLoading(true);
    try {
      setClaims(await api.listClaims());
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    api
      .init()
      .then(async () => {
        if (api.demo) {
          setActor(api.demoActor);
        } else {
          try {
            setActor(await api.me());
          } catch {}
        }
        setReady(true);
      })
      .catch((e) => {
        setFatal(e.message);
        setReady(true);
      });
  }, []);
  useEffect(() => {
    if (actor) void refresh();
  }, [actor]);
  useEffect(() => {
    if (api.demo || !actor || !["insured", "employee"].includes(actor.role)) return;
    let active = true;
    async function updateNotices() {
      if (document.visibilityState !== "visible") return;
      try {
        const newest = await api.listClaims();
        if (active) setClaims(newest);
      } catch {
        // Keep the last loaded notices if the background refresh fails.
      }
    }
    const interval = setInterval(updateNotices, 45_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [actor]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 6500);
      return () => clearTimeout(t);
    }
  }, [toast]);
  function go(p: string) {
    setPage(p);
    setSelected(null);
  }
  async function open(c: Claim, correctDocuments = false) {
    try {
      setSelected(await api.getClaim(c.id));
      setShowDocumentCorrections(correctDocuments);
      setPage("Expediente");
    } catch (e) {
      notify((e as Error).message);
    }
  }
  const operator = !!actor && ["analyst", "approver"].includes(actor.role);
  const administrative =
    !!actor && ["hr", "viewer", "admin", "support"].includes(actor.role);
  const canCreate = actor?.role === "insured" || actor?.role === "employee";
  const liveNotices = !api.demo && canCreate ? customerNotices(claims) : [];
  const noticeKey = actor ? `paramita-notices:${encodeURIComponent(actor.tenant)}:${encodeURIComponent(actor.sub)}` : "";
  const readIds = new Set(noticeReads.key === noticeKey ? noticeReads.ids : readNoticeIds(noticeKey));
  function markNoticesRead(ids: string[]) {
    const next = [...new Set([...ids, ...readIds])].slice(0, 250);
    setNoticeReads({ key: noticeKey, ids: next });
    try {
      localStorage.setItem(noticeKey, JSON.stringify(next));
    } catch {
      // Read state remains available in the current session.
    }
  }
  const viewStatus = (c: Claim) =>
    operator ? c.status : publicStatus(c.status as Status) || c.status;
  const active = claims.filter(
    (c) =>
      !["Finalizado", "Borrador", "Resultado informado"].includes(c.status),
  );
  if (!ready)
    return (
      <div className="boot">
        <LoaderCircle className="spin" />
        Preparando tu portal…
      </div>
    );
  if (fatal)
    return (
      <div className="boot">
        <CircleAlert />
        <h2>Configuración pendiente</h2>
        <p>{fatal}</p>
      </div>
    );
  if (!actor)
    return (
      <Login
        onLogin={async () => {
          setActor(await api.me());
        }}
        notify={notify}
        toast={toast}
      />
    );
  const nav: [string, LucideIcon][] = [
    ["Inicio", LayoutDashboard],
    ...(canCreate
      ? [["Nuevo siniestro", UploadCloud] as [string, LucideIcon]]
      : []),
    ...(canCreate ? [["Mis siniestros", ClipboardList] as [string, LucideIcon]] : []),
    ...(operator ? [["Bandeja asignada", ClipboardList] as [string, LucideIcon]] : []),
    ["Documentos", FileText],
    ...(canCreate
      ? [["Mis pólizas", ShieldCheck] as [string, LucideIcon]]
      : []),
    ...(api.demo ? [["Notificaciones", Bell] as [string, LucideIcon]] : []),
  ];
  if (operator)
    nav.push(["Reportes", ChartNoAxesCombined], ["Integraciones", Activity]);
  if (actor.role === "admin") nav.push(["Configuración", Settings]);
  if (api.demo && operator) nav.push(["Conciliación", Mail]);
  if (api.demo && actor.role === "hr") nav.push(["Empresa", Building2]);
  if (api.demo && actor.role === "viewer")
    nav.push(["Monitoreo", ChartNoAxesCombined]);
  if (api.demo && actor.role === "support") nav.push(["Soporte", Activity]);
  return (
    <div className="app-shell">
      {api.demo && (
        <div className="demo-strip">
          <span>
            AMBIENTE DE DEMOSTRACIÓN · Datos ficticios · Sin conexión a AWS
          </span>
          <label>
            Vista de{" "}
            <select
              aria-label="Perfil de demostración"
              value={actor.role}
              onChange={(e) => {
                setActor(api.setDemoRole(e.target.value as Actor["role"]));
                go("Inicio");
              }}
            >
              {Object.entries(labels).map(([k, v]) => (
                <option value={k} key={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <header className="header">
        <Brand onHome={() => go("Inicio")} />
        <div className="header-right">
          <span className="partner">
            <BrandLogo partner />
          </span>
          <div className="header-divider" />
          <button
            className="icon-button notification-button"
            aria-label="Notificaciones"
            aria-expanded={notifications}
            onClick={() => {
              if (!notifications && !api.demo && canCreate) void refresh();
              setNotifications(!notifications);
            }}
          >
            <Bell size={20} />
            {(liveNotices.some((notice) => !readIds.has(notice.id)) ||
              ((api.demo || !canCreate) && claims.some((c) => c.status === "Pendiente de documentos"))) && (
              <i />
            )}
          </button>
          {!api.demo && canCreate ? (
            <button className="user account-button" aria-label="Mi cuenta" onClick={() => go("Mi cuenta")}>
              <span className="avatar"><UserRound size={18} /></span>
              <span><strong>Mi cuenta</strong><small>{labels[actor.role]}</small></span>
            </button>
          ) : (
            <div className="user">
              <span className="avatar">{operator ? "AP" : "ML"}</span>
              <div>
                <strong>{operator ? "Equipo Paramita" : "Mi cuenta"}</strong>
                <small>{labels[actor.role]}</small>
              </div>
            </div>
          )}
          <button
            className="icon-button"
            aria-label="Cerrar sesión"
            onClick={async () => {
              await api.logout();
              setClaims([]);
              setNotifications(false);
              go("Inicio");
              setActor(null);
            }}
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>
      <nav className="navigation">
        {nav.map(([n, Icon]) => (
          <button
            key={n}
            className={page === n ? "active" : ""}
            aria-current={page === n ? "page" : undefined}
            onClick={() => go(n)}
          >
            <Icon size={17} />
            {n === "Nuevo siniestro" ? "Cargar siniestro" : n}
          </button>
        ))}
        <span className="secure">
          <ShieldCheck size={14} /> Conexión protegida
        </span>
      </nav>
      {notifications && (
        <aside className="notification-panel">
          <div className="section-heading">
            <h3>Notificaciones</h3>
            <button
              className="icon-button"
              onClick={() => setNotifications(false)}
              aria-label="Cerrar notificaciones"
            >
              <X size={18} />
            </button>
          </div>
          {!api.demo && canCreate ? (
            <>
              {liveNotices.some((notice) => !readIds.has(notice.id)) && (
                <button className="text-button" onClick={() => markNoticesRead(liveNotices.map((notice) => notice.id))}>
                  Marcar todas como leídas
                </button>
              )}
              {liveNotices.map((notice) => (
                <button
                  className={`notice-row ${readIds.has(notice.id) ? "" : "unread"}`}
                  key={notice.id}
                  onClick={() => {
                    markNoticesRead([notice.id]);
                    void open(notice.claim, notice.correction);
                    setNotifications(false);
                  }}
                >
                  <Bell size={17} />
                  <span>
                    <b>{notice.title}</b>
                    <small>{shortId(notice.claim.id)} · {date(notice.at)}{readIds.has(notice.id) ? "" : " · Sin leer"}</small>
                  </span>
                  <ChevronRight size={16} />
                </button>
              ))}
              {!liveNotices.length && <p>No tienes notificaciones.</p>}
            </>
          ) : (
            <>
          {claims
            .filter((c) => c.status === "Pendiente de documentos")
            .map((c) => (
              <button
                className="notice-row"
                key={c.id}
                onClick={() => {
                  void open(c);
                  setNotifications(false);
                }}
              >
                <CircleAlert size={20} />
                <span>
                  <b>Completa tu documentación</b>
                  <small>
                    {shortId(c.id)} · {procedureLabel(c)}
                  </small>
                </span>
                <ChevronRight size={16} />
              </button>
            ))}
          {!claims.some((c) => c.status === "Pendiente de documentos") && (
            <p>No tienes avisos pendientes.</p>
          )}
            </>
          )}
        </aside>
      )}
      <main>
        {page === "Mi cuenta" && !api.demo && canCreate && (
          <CustomerAccount key={actor.sub} roleLabel={labels[actor.role]} />
        )}
        {api.demo &&
          ([
            "Notificaciones",
            "Empresa",
            "Monitoreo",
            "Soporte",
            "Conciliación",
            "Configuración",
            "Integraciones",
          ].includes(page) ||
            (page === "Inicio" && administrative)) && (
            <MockWorkspace
              view={
                page === "Inicio"
                  ? (
                      {
                        hr: "Empresa",
                        viewer: "Monitoreo",
                        support: "Soporte",
                        admin: "Configuración",
                      } as Record<string, string>
                    )[actor.role]
                  : page
              }
              role={actor.role}
              notify={notify}
              onRefresh={() => void refresh()}
            />
          )}
        {page === "Inicio" && (!administrative || !api.demo) && (
          <>
            <div className="breadcrumb">
              Portal de siniestros <ChevronRight size={12} /> Inicio
            </div>
            <section className="welcome">
              <div>
                <div className="eyebrow">CONTIGO, EN CADA PASO</div>
                <h1>
                  {operator
                    ? "Expedientes asignados"
                    : "Registra y consulta tus siniestros"}
                </h1>
                <p>
                  {operator
                    ? "Organiza, revisa y da seguimiento a los expedientes asignados."
                    : "Registra y consulta tus trámites de forma fácil, clara y segura."}
                </p>
                {canCreate && (
                  <>
                    <button
                      className="primary"
                      onClick={() => go("Nuevo siniestro")}
                    >
                      <UploadCloud size={18} /> Cargar siniestro
                    </button>
                    <p className="claim-entry-hint">
                      Guarda tu solicitud, adjunta los documentos y envíala a Paramita.
                      Consulta el avance en Mis siniestros.
                    </p>
                  </>
                )}
              </div>
              <div className="welcome-art">
                <div className="orbit orbit-one" />
                <div className="orbit orbit-two" />
                <div className="shield">
                  <ShieldCheck size={76} strokeWidth={1.1} />
                </div>
                <span className="floating-note">
                  <CheckCircle2 size={18} /> Estamos para acompañarte
                </span>
                <Flower className="art-flower" size={150} strokeWidth={0.5} />
              </div>
            </section>
            <div className="stats">
              {[
                {
                  label: "En proceso",
                  n: active.length,
                  icon: Clock3,
                  color: "blue",
                  text: "Seguimiento de tus trámites",
                },
                {
                  label: "Documentos pendientes",
                  n: claims.filter(
                    (c) => c.status === "Pendiente de documentos",
                  ).length,
                  icon: FileText,
                  color: "amber",
                  text: "Requieren tu atención",
                },
                {
                  label: "En aseguradora",
                  n: claims.filter((c) =>
                    [
                      "Ingresado en aseguradora",
                      "En espera",
                      "En trámite con aseguradora",
                    ].includes(c.status),
                  ).length,
                  icon: ShieldCheck,
                  color: "purple",
                  text: "Gestión con tu aseguradora",
                },
                {
                  label: "Finalizados",
                  n: claims.filter((c) =>
                    ["Finalizado", "Resultado informado"].includes(c.status),
                  ).length,
                  icon: CheckCircle2,
                  color: "green",
                  text: "Resultado informado",
                },
              ].map(({ label, n, icon: Icon, color, text }) => (
                <button
                  className="stat-card"
                  key={label}
                  disabled={administrative}
                  onClick={() => go(operator ? "Bandeja asignada" : "Mis siniestros")}
                >
                  <span className={`stat-icon ${color}`}>
                    <Icon size={23} />
                  </span>
                  <div>
                    <span>{label}</span>
                    <strong>{n.toString().padStart(2, "0")}</strong>
                    <small>{text}</small>
                  </div>
                </button>
              ))}
            </div>
            <div className="dashboard-grid">
              <section className="panel">
                <div className="section-heading">
                  <div>
                    <h2>
                      {operator
                        ? "Expedientes asignados"
                        : "Mis siniestros recientes"}
                    </h2>
                    <p>Consulta los últimos movimientos de tus trámites.</p>
                  </div>
                  {!administrative && (
                    <button
                      className="text-button"
                      onClick={() => go(operator ? "Bandeja asignada" : "Mis siniestros")}
                    >
                      Ver todos <ArrowRight size={15} />
                    </button>
                  )}
                </div>
                {loading ? (
                  <div className="empty">
                    <LoaderCircle className="spin" />
                  </div>
                ) : (
                  <ClaimTable
                    claims={claims.slice(0, 5)}
                    onOpen={open}
                    viewStatus={viewStatus}
                  />
                )}
              </section>
              <aside className="panel help-panel">
                <span className="help-icon">
                  <CircleHelp size={24} />
                </span>
                <h2>
                  Te acompañamos
                  <br />
                  en tu trámite
                </h2>
                <p>Ten a la mano los documentos de tu reclamación.</p>
                <div className="help-divider" />
                <h4>¿Qué documentos necesito?</h4>
                <p>
                  Cada trámite tiene su propia lista. Consúltala antes de
                  iniciar.
                </p>
                <button className="secondary" onClick={() => go("Documentos")}>
                  Consultar documentos <ArrowRight size={15} />
                </button>
                {supportPhone && <p>Siniestros Paramita · <a href={`tel:${supportPhone}`}>{supportPhone}</a></p>}
                <span className="muted">
                  18 aseguradoras · 7 ramos en el catálogo
                </span>
              </aside>
            </div>
            <div className="bottom-note">
              <LockKeyhole size={15} />
              <span>
                Tus datos y documentos son privados y se consultan según los
                permisos de tu cuenta.
              </span>
            </div>
            {administrative && (
              <div className="info-banner">
                <ShieldCheck size={20} />
                El perfil {labels[actor.role]} tiene acceso administrativo
                limitado. Los expedientes y documentos clínicos requieren una
                autorización específica.
              </div>
            )}
          </>
        )}
        {(page === "Mis siniestros" || page === "Bandeja asignada") && (
          <ClaimsPage
            claims={claims}
            onOpen={open}
            viewStatus={viewStatus}
            onNew={() => go("Nuevo siniestro")}
            canCreate={canCreate}
          />
        )}
        {page === "Mis pólizas" && canCreate && (
          <EnrollmentPage
            key={`policies-${actor.sub}`}
            title="Mis pólizas"
            text="Consulta las personas y pólizas asignadas a tu cuenta."
          >
            {(items) => (
              <div className="mock-policy-grid">
                {items.map((item) => (
                  <section className="panel" key={item.enrollmentId}>
                    <span className="insurer-tag">
                      {insurerName(item)} · {branches[item.branch]}
                    </span>
                    <h2>{item.product}</h2>
                    <EnrollmentSummary enrollment={item} />
                  </section>
                ))}
              </div>
            )}
          </EnrollmentPage>
        )}
        {page === "Nuevo siniestro" && canCreate && (
          <EnrollmentPage
            key={`new-claim-${actor.sub}`}
            title="Cargar siniestro"
            text="Completa los datos, adjunta tus documentos y envía la solicitud a Paramita."
          >
            {(items) => (
              <NewClaim
                actor={actor}
                enrollments={items}
                onCancel={() => go("Inicio")}
                onDraftSaved={() => { void refresh(); }}
                onLeaveDraft={() => {
                  go("Mis siniestros");
                  void refresh();
                }}
                onSubmit={(c) => {
                  setSelected(c);
                  setShowDocumentCorrections(false);
                  setPage("Expediente");
                  window.scrollTo(0, 0);
                  void refresh();
                }}
                notify={notify}
              />
            )}
          </EnrollmentPage>
        )}
        {page === "Expediente" && selected && (
          <ClaimDetail
            key={selected.id}
            c={selected}
            actor={actor}
            showDocumentCorrections={showDocumentCorrections}
            notify={notify}
            onBack={() => go(operator ? "Bandeja asignada" : "Mis siniestros")}
            onUpdate={(c) => {
              setSelected(c);
              void refresh();
            }}
          />
        )}
        {page === "Documentos" && (
          <>
            <PageHeading
              title="Documentación para tu trámite"
              text="Consulta la cobertura disponible y los requisitos documentales definidos."
            />
            <DocumentCatalog />
          </>
        )}
        {page === "Reportes" && <Reports claims={claims} />}
        {page === "Integraciones" && !api.demo && (
          <>
            <PageHeading
              title="Integración con SICAS"
              text="Seguimiento de solicitudes de transferencia documental."
            />
            <div className="info-banner">
              <CircleAlert size={20} />
              El contrato técnico de SICAS está pendiente. Las solicitudes se
              conservan para seguimiento; no se reportan entregas sin acuse.
            </div>
            <section className="panel">
              <ClaimTable
                claims={claims}
                onOpen={open}
                viewStatus={(c) =>
                  c.integration === "DELIVERED"
                    ? "Entregado"
                    : c.integration === "NOT_REQUESTED"
                      ? "Sin solicitud"
                      : c.integration
                }
              />
            </section>
          </>
        )}
        {page === "Configuración" && !api.demo && (
          <>
            <PageHeading
              title="Configuración del portal"
              text="Catálogos, modalidades y controles de acceso."
            />
            <section className="panel">
              <div className="section-heading">
                <h2>GNP · Gastos Médicos Mayores</h2>
                <Badge status="Configuración provisional" />
              </div>
              <div className="catalog-cards">
                {Object.entries(modalities)
                  .filter(([id]) => id !== "notice")
                  .map(([id, label]) => (
                    <div key={id}>
                      <ShieldCheck size={24} />
                      <h3>{label}</h3>
                      <span className="badge green">Habilitado</span>
                    </div>
                  ))}
              </div>
              <p className="muted">
                Checklist: {checklistVersion}. La aprobación de reglas y textos
                legales se registra mediante cambios versionados en el
                repositorio.
              </p>
            </section>
            <section className="panel">
              <h2>Asignación de expedientes</h2>
              <AssignmentWorkspace key={actor.sub} notify={notify} />
            </section>
            <DocumentCatalog />
          </>
        )}
      </main>
      <footer>
        <Brand />
        <span>Portal de Siniestros · Paramita</span>
        <span>Tu información, en buenas manos.</span>
      </footer>
      {toast && (
        <div role="status" className="toast">
          <CircleAlert size={20} />
          {toast}
          <button aria-label="Cerrar aviso" onClick={() => setToast("")}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
function PageHeading({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">PORTAL DE SINIESTROS</div>
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
      {action}
    </div>
  );
}
function CustomerAccount({ roleLabel }: { roleLabel: string }) {
  const [details, setDetails] = useState<Awaited<ReturnType<typeof api.accountDetails>>>();
  const [accountError, setAccountError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [changed, setChanged] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let active = true;
    api.accountDetails().then(
      (data) => { if (active) setDetails(data); },
      () => { if (active) setAccountError("No pudimos consultar los datos de tu cuenta."); },
    );
    return () => { active = false; };
  }, []);

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const current = String(data.get("current"));
    const password = String(data.get("password"));
    setChanged(false);
    if (password !== data.get("confirm")) {
      setPasswordError("Las contraseñas nuevas no coinciden.");
      return;
    }
    setPasswordError("");
    setSaving(true);
    try {
      await api.changePassword(current, password);
      form.reset();
      setChanged(true);
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      if (name === "NotAuthorizedException") {
        setPasswordError("Comprueba tu contraseña actual o vuelve a iniciar sesión.");
      } else if (name === "InvalidPasswordException" || name === "PasswordHistoryPolicyViolationException") {
        setPasswordError("Elige una contraseña nueva que cumpla las reglas de seguridad de tu cuenta.");
      } else {
        setPasswordError("No pudimos cambiar tu contraseña. Intenta de nuevo.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeading title="Mi cuenta" text="Consulta tus datos y administra tu contraseña." />
      <section className="panel account-panel">
        <h2>Datos de acceso</h2>
        {accountError ? <p role="alert">{accountError}</p> : details ? (
          <dl className="summary-grid">
            <div><dt>Perfil</dt><dd>{roleLabel}</dd></div>
            <div>
              <dt>Correo electrónico</dt>
              <dd>{details.email ?? "Sin correo registrado"}</dd>
              {details.email && <small>{details.emailVerified ? "Correo verificado" : "Correo pendiente de verificación"}</small>}
            </div>
            <div>
              <dt>Aplicación autenticadora (MFA)</dt>
              <dd>{details.authenticatorConfigured === undefined
                ? "Estado no disponible"
                : details.authenticatorConfigured ? "Configurada" : "Sin configurar"}</dd>
            </div>
          </dl>
        ) : <p role="status">Consultando los datos de tu cuenta…</p>}
      </section>
      <section className="panel account-panel">
        <h2>Cambiar contraseña</h2>
        <form className="account-password" onSubmit={savePassword}>
          <label>Contraseña actual<input name="current" type="password" autoComplete="current-password" required /></label>
          <label>Nueva contraseña<input name="password" type="password" autoComplete="new-password" required /></label>
          <label>Confirma la nueva contraseña<input name="confirm" type="password" autoComplete="new-password" required /></label>
          {passwordError && <p role="alert">{passwordError}</p>}
          {changed && <p role="status">Contraseña actualizada.</p>}
          <button className="primary" disabled={saving}>{saving ? "Guardando…" : "Cambiar contraseña"}</button>
        </form>
      </section>
    </>
  );
}

function documentsToCorrect(claim: Claim) {
  if (["Finalizado", "Resultado informado"].includes(claim.status)) return [];
  const latestByType = new Map<string, Claim["documents"][number]>();
  for (const document of claim.documents) {
    if (document.state !== "UPLOADED" || isReceipt(document.type) || isResolution(document.type)) continue;
    const latest = latestByType.get(document.type);
    if (!latest || document.version > latest.version) latestByType.set(document.type, document);
  }
  return [...latestByType.values()].filter((document) => document.reviewStatus === "OBSERVED");
}

function ClaimTable({
  claims,
  onOpen,
  viewStatus,
  showCorrections = false,
}: {
  claims: Claim[];
  onOpen: (c: Claim, correctDocuments?: boolean) => void;
  viewStatus: (c: Claim) => string;
  showCorrections?: boolean;
}) {
  return claims.length ? (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Folio</th>
            <th>Asegurado</th>
            <th>Aseguradora / ramo</th>
            <th>Trámite</th>
            <th>Registro</th>
            <th>Estado</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {claims.map((c) => {
            const needsCorrection = showCorrections && documentsToCorrect(c).length > 0;
            return (
              <tr key={c.id}>
                <td>
                  <button className="folio" onClick={() => onOpen(c)}>
                    {shortId(c.id)}
                  </button>
                </td>
                <td>{c.insured}</td>
                <td>
                  {insurerName(c)}
                  <br />
                  <small>{branches[coverageOf(c).branch]}</small>
                </td>
                <td>{procedureLabel(c)}</td>
                <td className="nowrap">{date(c.createdAt)}</td>
                <td>
                  <Badge status={viewStatus(c)} />
                  {needsCorrection && <span className="document-review-state">Requiere tu acción</span>}
                </td>
                <td>
                  <button
                    className="table-button"
                    onClick={() => onOpen(c, needsCorrection)}
                    aria-label={`${needsCorrection ? "Corregir documentos de" : "Ver"} ${shortId(c.id)}`}
                  >
                    {needsCorrection ? "Corregir documentos" : "Ver"} <ChevronRight size={13} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty text="Aún no hay siniestros en esta vista" />
  );
}
function ClaimsPage({
  claims,
  onOpen,
  viewStatus,
  onNew,
  canCreate,
}: {
  claims: Claim[];
  onOpen: (c: Claim, correctDocuments?: boolean) => void;
  viewStatus: (c: Claim) => string;
  onNew: () => void;
  canCreate: boolean;
}) {
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState("Todos"),
    [modality, setModality] = useState(""),
    [insurer, setInsurer] = useState(""),
    [branch, setBranch] = useState(""),
    [current, setCurrent] = useState(1);
  const corrections = new Set(canCreate ? claims.filter((c) => documentsToCorrect(c).length).map((c) => c.id) : []);
  const actionFilter = "Requiere tu acción";
  const filtered = claims.filter(
    (c) =>
      (filter === "Todos" || (filter === actionFilter ? corrections.has(c.id) : viewStatus(c) === filter)) &&
      (!modality || c.modality === modality) &&
      (!insurer || coverageOf(c).insurer === insurer) &&
      (!branch || coverageOf(c).branch === branch) &&
      `${shortId(c.id)} ${c.insured} ${c.policy} ${insurerName(c)} ${coverageOf(c).product}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  function exportCsv() {
    const escape = (s: string) =>
      `"${s.replace(/"/g, '""').replace(/^[=+@-]/, "'$&")}"`;
    const rows = [
      [
        "Folio",
        "Asegurado",
        "Aseguradora",
        "Ramo",
        "Producto",
        "Trámite",
        "Registro",
        "Estado",
      ],
      ...filtered.map((c) => [
        shortId(c.id),
        c.insured,
        insurerName(c),
        branches[coverageOf(c).branch],
        coverageOf(c).product,
        procedureLabel(c),
        date(c.createdAt),
        viewStatus(c),
      ]),
    ];
    const url = URL.createObjectURL(
      new Blob(
        ["\ufeff" + rows.map((r) => r.map(escape).join(",")).join("\r\n")],
        { type: "text/csv;charset=utf-8" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "siniestros-paramita.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <PageHeading
        title={canCreate ? "Mis siniestros" : "Bandeja asignada"}
        text="Todos tus trámites y movimientos, en un solo lugar."
        action={
          <div className="actions">
            <button className="secondary" onClick={exportCsv}>
              <ArrowDownToLine size={16} />
              Exportar
            </button>
            {canCreate && (
              <button className="primary" onClick={onNew}>
                <UploadCloud size={17} />
                Cargar siniestro
              </button>
            )}
          </div>
        }
      />
      <section className="panel">
        <div className="tabs">
          {["Todos", ...(canCreate ? [actionFilter] : []), ...new Set(claims.map(viewStatus))].map((t) => (
            <button
              className={filter === t ? "active" : ""}
              key={t}
              onClick={() => {
                setFilter(t);
                setCurrent(1);
              }}
            >
              {t}{" "}
              <span>
                {t === "Todos"
                  ? claims.length
                  : t === actionFilter
                    ? corrections.size
                    : claims.filter((c) => viewStatus(c) === t).length}
              </span>
            </button>
          ))}
        </div>
        <div className="filters">
          <label className="search">
            <Search size={17} />
            <input
              placeholder="Buscar por folio, asegurado o póliza…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrent(1);
              }}
            />
          </label>
          <select
            aria-label="Filtrar trámite"
            value={modality}
            onChange={(e) => {
              setModality(e.target.value);
              setCurrent(1);
            }}
          >
            <option value="">Todos los trámites</option>
            {Object.entries(modalities).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          <select
            aria-label="Filtrar aseguradora"
            value={insurer}
            onChange={(e) => {
              setInsurer(e.target.value);
              setCurrent(1);
            }}
          >
            <option value="">Todas las aseguradoras</option>
            {insurers.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Filtrar ramo"
            value={branch}
            onChange={(e) => {
              setBranch(e.target.value);
              setCurrent(1);
            }}
          >
            <option value="">Todos los ramos</option>
            {Object.entries(branches).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <ClaimTable
          claims={filtered.slice((current - 1) * 8, current * 8)}
          onOpen={onOpen}
          viewStatus={viewStatus}
          showCorrections={canCreate}
        />
        <div className="pagination">
          <span>{filtered.length} siniestros encontrados</span>
          <div>
            <button
              disabled={current === 1}
              onClick={() => setCurrent(current - 1)}
              aria-label="Página anterior"
            >
              <ArrowLeft size={15} />
            </button>
            <span>
              Página {current} de {Math.max(1, Math.ceil(filtered.length / 8))}
            </span>
            <button
              disabled={current * 8 >= filtered.length}
              onClick={() => setCurrent(current + 1)}
              aria-label="Página siguiente"
            >
              <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
function DocumentCatalog() {
  const [insurer, setInsurer] = useState<Insurer>("gnp");
  const [branch, setBranch] = useState<Branch>("gmm");
  return (
    <>
      <section className="panel coverage-catalog">
        <h2>Aseguradoras y ramos</h2>
        <p>
          Catálogo de 18 aseguradoras y 7 ramos. La disponibilidad en esta
          matriz no acredita cobertura de una póliza ni aprobación para
          automatizar.
        </p>
        <div className="coverage-selectors">
          <Field label="Aseguradora">
            <select
              value={insurer}
              onChange={(e) => {
                const id = e.target.value as Insurer;
                setInsurer(id);
                setBranch(insurers.find((i) => i.id === id)!.branches[0]);
              }}
            >
              {insurers.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Ramo / cobertura">
            <select
              value={branch}
              onChange={(e) => setBranch(e.target.value as Branch)}
            >
              {insurers
                .find((i) => i.id === insurer)!
                .branches.map((id) => (
                  <option key={id} value={id}>
                    {branches[id]}
                  </option>
                ))}
            </select>
          </Field>
        </div>
        <details>
          <summary>Consultar matriz completa de cobertura</summary>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Aseguradora</th>
                  {Object.values(branches).map((name) => (
                    <th key={name}>{name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {insurers.map((i) => (
                  <tr key={i.id}>
                    <td>{i.name}</td>
                    {Object.keys(branches).map((id) => (
                      <td key={id}>
                        {i.branches.includes(id as Branch) ? "Sí" : "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>
      {hasGnpChecklist({ insurer, branch }) ? (
        <GnpDocumentCatalog />
      ) : (
        <section className="panel">
          <h2>Requisitos pendientes de aprobación</h2>
          <p>
            {insurerName({ insurer })} · {branches[branch]}: los requisitos de
            esta combinación están pendientes de definición. Puedes registrar un
            aviso y adjuntar soportes para revisión manual; Paramita confirmará
            los requisitos y el canal.
          </p>
        </section>
      )}
    </>
  );
}
function GnpDocumentCatalog() {
  const [modality, setModality] = useState<Modality>("reimbursement");
  return (
    <section className="panel">
      <div className="section-heading">
        <h2>Checklist por tipo de reclamación</h2>
        <select
          aria-label="Modalidad del checklist"
          value={modality}
          onChange={(e) => setModality(e.target.value as Modality)}
        >
          {Object.entries(modalities)
            .filter(
              ([id]) =>
                id !== "notice" &&
                (!api.demo || mock.settings().enabled.includes(id as Modality)),
            )
            .map(([id, n]) => (
              <option key={id} value={id}>
                {n}
              </option>
            ))}
        </select>
      </div>
      <div className="info-banner">
        <CircleAlert size={19} />
        <span>
          Matriz de referencia pendiente de aprobación. Los documentos
          condicionales se presentan sin bloquear el envío. M = marca base; C =
          sólo si aplica; X = no aplica; — = celda vacía.
        </span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Documento</th>
              <th>Grupo</th>
              <th>Marca</th>
            </tr>
          </thead>
          <tbody>
            {documentsFor(modality).map((r) => (
              <tr key={r.id}>
                <td>{r.id}</td>
                <td>{r.label}</td>
                <td>{r.group}</td>
                <td>
                  <span
                    className={`badge ${r.mark === "C" ? "amber" : r.mark === "M" ? "blue" : "neutral"}`}
                  >
                    {r.mark}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">
        * Referencia de antigüedad: 3 meses. Interpretación de vigencias y
        actualización semestral de formatos pendiente de aprobación.
      </p>
    </section>
  );
}
function EnrollmentPage({
  title,
  text,
  children,
}: {
  title: string;
  text: string;
  children: (items: Enrollment[]) => ReactNode;
}) {
  const [items, setItems] = useState<Enrollment[] | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    api.listEnrollments().then(
      (result) => {
        if (active) setItems(result);
      },
      () => {
        if (active) setError("No pudimos consultar las pólizas de tu cuenta.");
      },
    );
    return () => {
      active = false;
    };
  }, [attempt]);
  return (
    <>
      <PageHeading title={title} text={text} />
      {items?.length ? (
        children(items)
      ) : (
        <section className="panel">
          {error ? (
            <>
              <p role="alert">{error}</p>
              <button
                className="secondary"
                onClick={() => {
                  setError("");
                  setAttempt((count) => count + 1);
                }}
              >
                Reintentar
              </button>
            </>
          ) : items ? (
            <p>
              Tu cuenta aún no tiene personas y pólizas asignadas. Contacta a
              Paramita para actualizar tus datos.
            </p>
          ) : (
            <p role="status">Consultando las pólizas de tu cuenta…</p>
          )}
        </section>
      )}
    </>
  );
}
function EnrollmentSummary({ enrollment }: { enrollment: Enrollment }) {
  return (
    <dl className="summary-grid">
      <div>
        <dt>Nombre del asegurado afectado</dt>
        <dd>{enrollment.insured}</dd>
      </div>
      <div>
        <dt>Relación con la póliza</dt>
        <dd>
          {enrollment.insuredRelationship === "holder"
            ? "Titular"
            : "Dependiente / beneficiario"}
        </dd>
      </div>
      <div>
        <dt>Póliza</dt>
        <dd>{enrollment.policy}</dd>
      </div>
    </dl>
  );
}
const newClaimSteps = [
  "Póliza y trámite",
  "Detalle del siniestro",
  "Revisión de datos",
  "Documentos",
];

function NewClaimSteps({ step }: { step: number }) {
  return (
    <div className="steps" role="group" aria-label="Pasos para cargar siniestro">
      {newClaimSteps.map((label, index) => (
        <div
          className={index <= step ? "done" : ""}
          aria-current={index === step ? "step" : undefined}
          key={label}
        >
          <span aria-hidden="true">{index < step ? <Check size={16} /> : index + 1}</span>
          <b>{label}</b>
        </div>
      ))}
    </div>
  );
}

function NewClaim({
  actor,
  enrollments,
  onCancel,
  onDraftSaved,
  onLeaveDraft,
  onSubmit,
  notify,
}: {
  actor: Actor;
  enrollments: Enrollment[];
  onCancel: () => void;
  onDraftSaved: () => void;
  onLeaveDraft: () => void;
  onSubmit: (c: Claim) => void;
  notify: (s: string) => void;
}) {
  const [step, setStep] = useState(0),
    [busy, setBusy] = useState(false),
    [savedClaim, setSavedClaim] = useState<Claim | null>(null),
    [saveError, setSaveError] = useState(""),
    [idempotency] = useState(() => crypto.randomUUID());
  const [enrollmentId, setEnrollmentId] = useState(
    enrollments.length === 1 ? enrollments[0].enrollmentId : "",
  );
  const enrollment = enrollments.find(
    (item) => item.enrollmentId === enrollmentId,
  );
  const configured = !!enrollment && hasGnpChecklist(enrollment);
  const enabledModalities = api.demo ? mock.settings().enabled : undefined;
  const [data, setData] = useState({
    requestedProcedure: "",
    modality: (enabledModalities?.[0] || "reimbursement") as Modality,
    description: "",
    subsequent: false,
    previousReference: "",
    consent: false,
  });
  const [specializedSurgery, setSpecializedSurgery] = useState("");
  const modality = configured ? data.modality : "notice";
  const update = <K extends keyof typeof data>(
    key: K,
    value: (typeof data)[K],
  ) => setData((current) => ({ ...current, [key]: value }));
  function selectEnrollment(id: string) {
    setEnrollmentId(id);
    setSpecializedSurgery("");
    setData((current) => ({
      ...current,
      modality: enabledModalities?.[0] || "reimbursement",
      requestedProcedure: "",
      consent: false,
    }));
  }
  async function next(e: FormEvent) {
    e.preventDefault();
    if (!enrollment || busy) return;
    if (step < 2) {
      setStep(step + 1);
      return;
    }
    setBusy(true);
    setSaveError("");
    try {
      const created = await api.createClaim(
        {
          ...data,
          modality,
          specializedSurgery: modality === "surgery" && specializedSurgery !== "unknown"
            ? specializedSurgery === "yes" : undefined,
          enrollmentId,
          enrollmentVersion: enrollment.enrollmentVersion,
        },
        idempotency,
      );
      setSavedClaim(created);
      onDraftSaved();
      window.scrollTo(0, 0);
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (savedClaim) {
    return (
      <>
        <NewClaimSteps step={3} />
        <ClaimDetail
          c={savedClaim}
          actor={actor}
          intake
          showDocumentCorrections={false}
          onBack={onLeaveDraft}
          onUpdate={(updated) => {
            if (savedClaim.status === "Borrador" && updated.status !== "Borrador") {
              onSubmit(updated);
            } else {
              setSavedClaim(updated);
            }
          }}
          notify={notify}
        />
      </>
    );
  }
  return (
    <>
      <NewClaimSteps step={step} />
      <div className="form-layout">
        <form className="panel form-panel" onSubmit={next}>
          <h2>{newClaimSteps[step]}</h2>
          {step === 0 && (
            <div className="form-fields">
              {enrollments.length > 1 && (
                <Field label="Persona asegurada y póliza *">
                  <select
                    required
                    value={enrollmentId}
                    onChange={(e) => selectEnrollment(e.target.value)}
                  >
                    <option value="" disabled>
                      Selecciona una opción
                    </option>
                    {enrollments.map((item) => (
                      <option key={item.enrollmentId} value={item.enrollmentId}>
                        {item.insured} · {insurerName(item)} · {item.policy} ·{" "}
                        {branches[item.branch]} · {item.product}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {enrollment && (
                <>
                  <p>
                    {insurerName(enrollment)} · {branches[enrollment.branch]} ·{" "}
                    {enrollment.product}
                  </p>
                  <EnrollmentSummary enrollment={enrollment} />
                  {!configured && (
                    <div className="info-banner">
                      <CircleAlert size={19} />
                      <span>
                        Puedes registrar tu aviso y adjuntar soportes para
                        revisión manual. Los trámites, requisitos y canal de
                        esta cobertura están pendientes de definición y
                        aprobación por Paramita.
                      </span>
                    </div>
                  )}
                  <Field label="Tipo de trámite *">
                    <select
                      value={modality}
                      onChange={(e) => {
                        setSpecializedSurgery("");
                        update("modality", e.target.value as Modality);
                      }}
                    >
                      {Object.entries(modalities)
                        .filter(([id]) =>
                          configured
                            ? id !== "notice" &&
                              (!enabledModalities ||
                                enabledModalities.includes(id as Modality))
                            : id === "notice",
                        )
                        .map(([id, n]) => (
                          <option value={id} key={id}>
                            {n}
                          </option>
                        ))}
                    </select>
                  </Field>
                  {!configured && (
                    <Field
                      label="Trámite solicitado *"
                      hint="Describe lo que necesitas gestionar. Paramita confirmará el trámite aplicable."
                    >
                      <input
                        required
                        minLength={3}
                        maxLength={150}
                        value={data.requestedProcedure}
                        onChange={(e) =>
                          update("requestedProcedure", e.target.value)
                        }
                        placeholder="Describe tu solicitud"
                      />
                    </Field>
                  )}
                  <Field label="Tipo de reclamación">
                    <select
                      value={data.subsequent ? "subsequent" : "initial"}
                      onChange={(e) =>
                        update("subsequent", e.target.value === "subsequent")
                      }
                    >
                      <option value="initial">Inicial</option>
                      <option value="subsequent">Complemento</option>
                    </select>
                  </Field>
                  {data.subsequent && (
                    <Field
                      label="Número de siniestro *"
                      hint="Indica el número asignado por la aseguradora al siniestro que estás complementando."
                    >
                      <input
                        required
                        maxLength={100}
                        value={data.previousReference}
                        onChange={(e) =>
                          update("previousReference", e.target.value)
                        }
                      />
                    </Field>
                  )}
                </>
              )}
            </div>
          )}
          {step === 1 && (
            <div className="form-fields">
              {modality === "surgery" && (
                <Field label="¿La cirugía es ortopédica, traumatológica, neurológica o vascular? *">
                  <select required value={specializedSurgery} onChange={(e) => setSpecializedSurgery(e.target.value)}>
                    <option value="" disabled>Selecciona una opción</option>
                    <option value="yes">Sí</option>
                    <option value="no">No</option>
                    <option value="unknown">Aún no lo sé</option>
                  </select>
                </Field>
              )}
              <Field
                label="Descripción de la solicitud *"
                hint="Cuéntanos qué ocurrió y qué necesitas gestionar."
              >
                <textarea
                  required
                  minLength={10}
                  maxLength={2000}
                  rows={5}
                  value={data.description}
                  onChange={(e) => update("description", e.target.value)}
                  placeholder="Por ejemplo, si solicitas un reembolso, describe la atención recibida."
                />
              </Field>
              <div className="info-banner">
                <FileText size={19} />
                Podrás adjuntar tus documentos después de guardar el borrador.
              </div>
            </div>
          )}
          {step === 2 && enrollment && (
            <>
              <dl className="summary-grid">
                <div>
                  <dt>Aseguradora y producto</dt>
                  <dd>
                    {insurerName(enrollment)} · {branches[enrollment.branch]} ·{" "}
                    {enrollment.product}
                  </dd>
                </div>
                <div>
                  <dt>Trámite</dt>
                  <dd>{procedureLabel({ ...data, modality })}</dd>
                </div>
                <div>
                  <dt>Nombre del asegurado afectado</dt>
                  <dd>{enrollment.insured}</dd>
                </div>
                <div>
                  <dt>Póliza</dt>
                  <dd>{enrollment.policy}</dd>
                </div>
                <div>
                  <dt>Reclamación</dt>
                  <dd>
                    {data.subsequent
                      ? `Complemento · ${data.previousReference}`
                      : "Inicial"}
                  </dd>
                </div>
              </dl>
              <p>{data.description}</p>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  required
                  checked={data.consent}
                  onChange={(e) => update("consent", e.target.checked)}
                />
                <span>
                  {api.demo
                    ? "Confirmo el uso de datos ficticios en esta demostración."
                    : "Confirmo que la información es correcta y autorizo el registro de esta solicitud para su gestión por Paramita."}
                </span>
              </label>
              <p className="muted">
                Paramita recibirá la solicitud cuando pulses Enviar en Documentos.{" "}
                {configured
                  ? ""
                  : "Esta solicitud requiere revisión manual y definición de sus requisitos."}
              </p>
            </>
          )}
          {step === 2 && saveError && (
            <div className="info-banner" role="alert">
              <CircleAlert size={19} />
              <span>No se pudo guardar el borrador. {saveError}</span>
            </div>
          )}
          <div className="form-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => (step ? setStep(step - 1) : onCancel())}
            >
              <ArrowLeft size={16} />
              {step ? "Regresar" : "Cancelar"}
            </button>
            <button className="primary" disabled={busy || !enrollment}>
              {busy ? (
                <LoaderCircle className="spin" size={17} />
              ) : step === 2 ? (
                "Guardar y cargar documentos"
              ) : (
                "Continuar"
              )}
              <ArrowRight size={16} />
            </button>
          </div>
        </form>
        <aside className="panel guide-panel">
          <h3>Antes de enviar tu solicitud</h3>
          <p>Ten a mano los documentos de tu reclamación.</p>
          <div className="guide-item">
            <ShieldCheck size={22} />
            <div>
              <b>Seguimiento transparente</b>
              <p>Consulta los hitos confirmados desde tu expediente.</p>
            </div>
          </div>
          <div className="guide-item">
            <FileCheck2 size={22} />
            <div>
              <b>Documentación guiada</b>
              <p>
                {configured
                  ? `Checklist de referencia para ${modalities[modality].toLowerCase()}.`
                  : "Adjunta los soportes de tu solicitud en el expediente."}
              </p>
            </div>
          </div>
          <div className="guide-item">
            <LockKeyhole size={22} />
            <div>
              <b>Información protegida</b>
              <p>Acceso restringido según tu perfil y expediente.</p>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
function ClaimDetail({
  c,
  actor,
  intake = false,
  showDocumentCorrections,
  onBack,
  onUpdate,
  notify,
}: {
  c: Claim;
  actor: Actor;
  intake?: boolean;
  showDocumentCorrections: boolean;
  onBack: () => void;
  onUpdate: (c: Claim) => void;
  notify: (s: string) => void;
}) {
  const customer = ["insured", "employee"].includes(actor.role);
  const corrections = customer ? documentsToCorrect(c) : [];
  const [tab, setTab] = useState(
      intake || showDocumentCorrections || (customer && (c.status === "Borrador" || c.documents.length === 0))
        ? "Documentos"
        : "Resumen",
    ),
    [busy, setBusy] = useState(false),
    [next, setNext] = useState<Status>("En validación"),
    [reason, setReason] = useState(""),
    [message, setMessage] = useState(""),
    [now, setNow] = useState(Date.now),
    [folio, setFolio] = useState(""),
    [channel, setChannel] = useState(""),
    [evidence, setEvidence] = useState(""),
    [expiredClassification, setExpiredClassification] = useState(""),
    [focusDocument, setFocusDocument] = useState(showDocumentCorrections ? corrections[0]?.type : undefined);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (tab !== "Documentos" || !focusDocument) return;
    const row = document.getElementById(`document-row-${focusDocument}`);
    row?.focus();
    row?.scrollIntoView({ block: "nearest" });
    setFocusDocument(undefined);
  }, [tab, focusDocument]);
  const pendingClassification = api.demo
    ? ""
    : c.documents
        .filter((d) => d.state === "UPLOADED" && d.storageVersion && !d.classification)
        .map((d) => d.id)
        .join(",");
  const applyClassificationUpdate = useEffectEvent((updated: Claim) => {
    if (updated.version > c.version) onUpdate(updated);
  });
  useEffect(() => {
    if (!pendingClassification) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const deadline = Date.now() + 90_000;
    async function poll() {
      try {
        const updated = await api.getClaim(c.id);
        if (active) applyClassificationUpdate(updated);
      } catch {
        // A transient read failure can be retried within this polling window.
      }
      if (!active) return;
      if (Date.now() < deadline) timer = setTimeout(poll, 5_000);
      else setExpiredClassification(pendingClassification);
    }
    timer = setTimeout(poll, 5_000);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [c.id, pendingClassification]);
  const operator = ["analyst", "approver"].includes(actor.role);
  const availableTransitions = operator ? statuses.filter((status) => {
    if (status === "Ingresado en GNP") return false;
    try {
      transition(actor, c, status, "Consulta de transiciones disponibles");
      return true;
    } catch {
      return false;
    }
  }) : [];
  const nextStatus = availableTransitions.includes(next) ? next : availableTransitions[0];
  const configured = hasGnpChecklist(c);
  const submission = submissionOf(c);
  const coverage = coverageOf(c);
  const draft = c.status === "Borrador";
  const missing = missingRequiredDocuments(c);
  const current = currentClaimDocuments(c);
  const totalBytes = documentBytes(c);
  const rows = documentsForClaim(c).filter((r) => ["M", "C"].includes(r.mark));
  const historicalRows = configured
    ? documentsFor(c.modality).filter((row) => current.has(row.id) && !rows.some(({ id }) => id === row.id))
    : [];
  const documentStage = draft || ["Pendiente de documentos", "Documentos pendientes"].includes(c.status);
  const finished = ["Finalizado", "Resultado informado"].includes(c.status);
  const atInsurer = ["Ingresado en aseguradora", "En trámite con aseguradora", "En espera", "Observado"].includes(c.status);
  const stage = finished ? 4 : documentStage ? 1 : submission || c.status === "Aprobado internamente" || atInsurer ? 3 : 2;
  const stageStatuses = [
    [],
    ["Borrador", "Pendiente de documentos", "Documentos pendientes"],
    ["Recibido", "Documentado", "En validación", "Requiere revisión", "En revisión"],
    ["Aprobado internamente", "Ingresado en aseguradora", "En trámite con aseguradora", "En espera", "Observado"],
    ["Finalizado", "Resultado informado"],
  ][stage];
  let stageStart = c.createdAt;
  for (const event of c.events) {
    if (!stageStatuses.includes(event.status)) stageStart = "";
    else if (!stageStart) stageStart = event.at;
  }
  stageStart ||= submission?.date ?? c.sentAt ?? c.createdAt;
  const elapsedHours = Math.max(0, Math.floor((now - Date.parse(stageStart)) / 3_600_000));
  const slaHours = stageSlaHours[stage];
  const hasSla = Number.isFinite(slaHours) && slaHours > 0;
  const nextStep = draft
    ? "Adjunta los documentos mínimos y envía la solicitud a Paramita."
    : documentStage
      ? "Revisa la observación y adjunta los documentos solicitados."
      : finished
        ? "Consulta el resultado informado por Paramita."
        : atInsurer
          ? "Paramita dará seguimiento a la respuesta de la aseguradora."
          : stage === 3
            ? "Paramita ingresará el expediente ante la aseguradora."
            : "Paramita revisará la solicitud y te avisará si necesita información adicional.";
  const uploaded = new Set(
    c.documents
      .filter((d) => d.state === "UPLOADED" && d.scan !== "INFECTED" &&
        (isReceipt(d.type) || isResolution(d.type) || current.get(d.type)?.id === d.id))
      .map((d) =>
        isReceipt(d.type)
          ? "INSURER-RECEIPT"
          : isResolution(d.type)
            ? "INSURER-RESULT"
            : d.type,
      ),
  );
  async function perform(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function upload(type: string, file: File) {
    await perform(async () => {
      onUpdate(await api.upload(c, type, file));
      notify(
        api.demo
          ? "Archivo guardado sólo en este navegador. Análisis de seguridad simulado."
          : "Archivo recibido. Estamos comprobando su categoría con IA.",
      );
    });
  }
  return (
    <>
      <button className="back-button" onClick={onBack}>
        <ArrowLeft size={16} />
        {operator ? "Volver a la bandeja asignada" : "Volver a mis siniestros"}
      </button>
      {!intake && draft && customer && <NewClaimSteps step={3} />}
      {!intake && <section className="panel detail-head">
        <div className="detail-title">
          <span className="stat-icon blue">
            <ClipboardList size={26} />
          </span>
          <div>
            <div className="title-line">
              <h1>{shortId(c.id)}</h1>
              <Badge
                status={
                  operator
                    ? c.status
                    : publicStatus(c.status as Status) || c.status
                }
              />
            </div>
            <p>
              {branches[coverage.branch]} <span>·</span> {procedureLabel(c)}
            </p>
          </div>
          <span className="insurer-tag">{insurerName(c)}</span>
        </div>
        {!draft && <div className="timeline">
          {[
            { label: "Registro", done: true },
            {
              label: "Documentación",
              done: !draft && (configured ? missing.length === 0 : !!c.sentAt),
            },
            {
              label: "Revisión Paramita",
              done: [
                "En validación",
                "En revisión",
                "Aprobado internamente",
                "Ingresado en aseguradora",
                "En trámite con aseguradora",
                "Finalizado",
                "Resultado informado",
              ].includes(c.status),
            },
            { label: "Gestión con aseguradora", done: !!submission },
            {
              label: "Resultado informado",
              done: ["Finalizado", "Resultado informado"].includes(c.status),
            },
          ].map((s, i) => (
            <div className={s.done ? "complete" : ""} key={s.label}
              aria-current={i === stage && !finished ? "step" : undefined}>
              <span>{s.done ? <Check size={14} /> : i + 1}</span>
              <b>{s.label}</b>
              <small>
                {i === 0
                  ? date(c.createdAt)
                  : s.done
                    ? "Registrado"
                    : i === stage ? "En curso" : "Pendiente"}
              </small>
            </div>
          ))}
        </div>}
        {!draft && <div className="claim-next-step">
          <p><strong>{finished ? "Resultado" : "Siguiente paso"}</strong> · {nextStep}</p>
          {!finished && (
            <p className={hasSla && elapsedHours >= slaHours ? "sla-overdue" : "muted"}>
              {elapsedHours === 0 ? "Menos de una hora en esta etapa" : `${elapsedHours} h en esta etapa`}
              {hasSla && ` · SLA interno de ${slaHours} h${elapsedHours >= slaHours ? " · Vencido" : ""}`}
            </p>
          )}
        </div>}
      </section>}
      {!intake && !configured && (
        <div className="info-banner">
          <CircleAlert size={20} />
          <span>
            Recepción para revisión manual. Los requisitos y el canal de{" "}
            {insurerName(c)} / {branches[coverage.branch]} requieren definición
            y aprobación antes de aprobar o ingresar este expediente.
          </span>
        </div>
      )}
      <section className={`panel detail-body${intake ? " intake-documents" : ""}`}>
        {!intake && <div className="tabs">
          {[
            "Resumen",
            "Documentos",
            "Historial",
            ...(!draft && (customer || canOperate(actor, c)) ? ["Mensajes"] : []),
            ...(operator
              ? ["Revisión", "Gestión con aseguradora", "SICAS"]
              : []),
          ].map((t) => (
            <button
              className={tab === t ? "active" : ""}
              onClick={() => setTab(t)}
              key={t}
            >
              {t}
              {t === "Documentos" && <span>{c.documents.length}</span>}
            </button>
          ))}
        </div>}
        {tab === "Resumen" && (
          <div className="detail-grid">
            <div>
              <h2>Información del siniestro</h2>
              <dl className="summary-grid">
                <div>
                  <dt>Aseguradora</dt>
                  <dd>{insurerName(c)}</dd>
                </div>
                <div>
                  <dt>Ramo / cobertura</dt>
                  <dd>{branches[coverage.branch]}</dd>
                </div>
                <div>
                  <dt>Producto declarado</dt>
                  <dd>{coverage.product}</dd>
                </div>
                <div>
                  <dt>Relación con la póliza</dt>
                  <dd>
                    {coverage.insuredRelationship === "dependent"
                      ? "Dependiente / beneficiario"
                      : "Titular"}
                  </dd>
                </div>
                <div>
                  <dt>Nombre del asegurado afectado</dt>
                  <dd>{c.insured}</dd>
                </div>
                <div>
                  <dt>Póliza</dt>
                  <dd>{c.policy}</dd>
                </div>
                <div>
                  <dt>Trámite</dt>
                  <dd>{procedureLabel(c)}</dd>
                </div>
                <div>
                  <dt>Fecha de registro</dt>
                  <dd>{date(c.createdAt)}</dd>
                </div>
                <div>
                  <dt>Inicio del registro</dt>
                  <dd>{date(c.createdAt)}</dd>
                </div>
                <div>
                  <dt>Última actualización</dt>
                  <dd>{date(c.updatedAt)}</dd>
                </div>
                <div>
                  <dt>ID completo del expediente</dt>
                  <dd><code>{c.id}</code></dd>
                </div>
                {submission && (
                  <div>
                    <dt>Folio de la aseguradora</dt>
                    <dd>{submission.folio} · {date(submission.date)}</dd>
                  </div>
                )}
              </dl>
              <h3>Solicitud</h3>
              <p>{c.description}</p>
              {c.resolution && (
                <div className="info-banner">
                  <ShieldCheck size={20} />
                  <div>
                    <b>
                      Resultado informado por {insurerName(c)}:{" "}
                      {c.resolution.result}
                    </b>
                    <p>{c.resolution.detail}</p>
                    <small>{date(c.resolution.date)}</small>
                  </div>
                </div>
              )}
              {c.subsequent && (
                <p className="info-banner">
                  Número de siniestro: {c.previousReference}. Asociación sujeta a
                  verificación.
                </p>
              )}
            </div>
            <aside className="next-steps">
              <h3>Próximos pasos</h3>
              <div className="guide-item">
                <FileCheck2 size={23} />
                <div>
                  <b>Revisa tus documentos</b>
                  <p>
                    {uploaded.size} tipos documentales recibidos. Consulta en Documentos qué archivos requieren atención.
                  </p>
                </div>
              </div>
              <div className="guide-item">
                <ShieldCheck size={23} />
                <div>
                  <b>Revisión por Paramita</b>
                  <p>Los avances confirmados aparecerán en el historial.</p>
                </div>
              </div>
              <button
                className="secondary"
                onClick={() => setTab("Documentos")}
              >
                Ver documentación <ArrowRight size={15} />
              </button>
            </aside>
          </div>
        )}
        {tab === "Documentos" && (
          <>
            {corrections.length > 0 && (
              <div className="info-banner">
                <CircleAlert size={20} />
                <div>
                  <b>Requiere tu acción</b>
                  <p>El equipo de revisión solicitó corregir estos documentos.</p>
                  {corrections.map((d) => (
                    <button className="secondary" key={d.id} onClick={() => setFocusDocument(d.type)}>
                      {rows.find((row) => row.id === d.type)?.label ?? d.type}
                      <ChevronRight size={14} />
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="section-heading">
              <div>
                <h2>{intake || (draft && customer) ? "Cargar documentos" : "Documentos de tu expediente"}</h2>
                <p>
                  Sólo PDF · Hasta 10 MB en conjunto para los documentos de la solicitud.
                </p>
              </div>
              <span className="badge blue">
                {(totalBytes / 1024 / 1024).toFixed(2)} de 10 MB
              </span>
            </div>
            {draft && customer && !api.demo && (
              <p>Cuando esté disponible, el resultado del análisis con IA aparecerá junto al PDF.</p>
            )}
            <div className="info-banner">
              <CircleAlert size={19} />
              <span>
                {configured
                  ? "Los documentos marcados como Mínimo se requieren para enviar. Adjunta los condicionales sólo si aplican."
                  : "Los soportes son opcionales durante la recepción. Esta lista no constituye un checklist aprobado."}{" "}
                Usa nombres sin acentos, con letras, números, espacios, guiones o guiones bajos.
              </span>
            </div>
            {draft && customer && (
              <div className="draft-send">
                <p>
                  {missing.length
                    ? `Faltan ${missing.length} tipos de documento mínimo.`
                    : "El borrador está listo. Al enviar, Paramita recibirá la solicitud y los archivos quedarán cerrados a cambios salvo que te pidan una corrección."}
                </p>
                <button
                  className="primary"
                  disabled={busy || missing.length > 0 || totalBytes > maxDocumentBytes}
                  onClick={() => void perform(async () => {
                    onUpdate(await api.submitClaim(c));
                    notify("Solicitud enviada a Paramita");
                  })}
                >
                  Enviar <ArrowRight size={16} />
                </button>
              </div>
            )}
            <div className="upload-list">
              {[
                ...rows,
                ...historicalRows.map((row) => ({ ...row, mark: "Histórico" })),
                ...(operator
                  ? [
                      {
                        id: "INSURER-RECEIPT",
                        label: "Acuse de ingreso a la aseguradora",
                        mark: "C",
                      },
                      {
                        id: "INSURER-RESULT",
                        label: "Resolución externa de la aseguradora",
                        mark: "C",
                      },
                    ]
                  : []),
              ].map((r) => (
                <div className="upload-row" key={r.id} id={`document-row-${r.id}`} tabIndex={-1}>
                  <span
                    className={`file-icon ${uploaded.has(r.id) ? "received" : ""}`}
                  >
                    {uploaded.has(r.id) ? (
                      <CheckCircle2 size={23} />
                    ) : (
                      <FileText size={23} />
                    )}
                  </span>
                  <div>
                    <b>{r.label}</b>
                    <small>
                      {r.id === "SUPPORT"
                        ? "Soporte opcional · requisitos por confirmar"
                        : r.mark === "Histórico" ? "Adjunto histórico"
                        : r.mark === "C"
                          ? "Condicional · sólo si aplica"
                          : "Mínimo para enviar"}
                      {c.documents
                        .filter(
                          (d) =>
                            d.type === r.id ||
                            (r.id === "INSURER-RECEIPT" && isReceipt(d.type)) ||
                            (r.id === "INSURER-RESULT" && isResolution(d.type)),
                        )
                        .map((d) => (
                          <span key={d.id}>
                            {d.state === "UPLOADED" ? <button
                              className="document-version"
                              onClick={() =>
                                void perform(() => api.download(c, d.id))
                              }
                              key={d.id}
                            >
                              {d.name} · v{d.version} ·{" "}
                              {(d.size / 1024).toFixed(0)} KB ·{" "}
                              {d.scan === "CLEAN" ? "Analizado" : "Cuarentena"}
                              <ArrowDownToLine size={12} />
                            </button> : <span className="document-review-state">{d.name} · Carga incompleta</span>}
                            {d.classification &&
                              d.classification.storageVersion === d.storageVersion &&
                              d.classification.expectedType === d.type && (
                                <span className="document-review-state">
                                  IA · {d.classification.status === "MATCH"
                                    ? "Coincide"
                                    : d.classification.status === "MISMATCH"
                                      ? "No coincide"
                                      : "Requiere revisión"}
                                  {" · "}{d.classification.reason}
                                  {d.classification.detectedCategory &&
                                    ` · Tipo detectado: ${d.classification.detectedCategory}`}
                                </span>
                              )}
                            {!api.demo && d.state === "UPLOADED" && d.storageVersion && !d.classification && (
                              <span className="document-review-state" role="status">
                                {expiredClassification === pendingClassification
                                  ? "IA · Resultado pendiente"
                                  : "IA · Procesando documento…"}
                              </span>
                            )}
                            {d.reviewStatus && (
                              <span className="document-review-state">
                                {d.reviewStatus === "ACCEPTED"
                                  ? "Revisión del equipo · Aceptado"
                                  : "Revisión del equipo · Observado"}
                                {d.reviewReason && ` · ${d.reviewReason}`}
                              </span>
                            )}
                            {operator && !finished && r.mark !== "Histórico" && d.state === "UPLOADED" &&
                              current.get(d.type)?.id === d.id && (
                              <DocumentReview
                                c={c}
                                documentId={d.id}
                                notify={notify}
                                onUpdate={onUpdate}
                              />
                            )}
                          </span>
                        ))}
                    </small>
                  </div>
                  {r.mark !== "Histórico" && canUploadDocument(actor, c, r.id) && <label className={`upload-button ${busy ? "disabled" : ""}`}>
                    <UploadCloud size={17} />
                    {corrections.some((d) => d.type === r.id)
                      ? "Subir corrección"
                      : uploaded.has(r.id) ? "Nueva versión" : "Adjuntar"}
                    <input
                      type="file"
                      aria-label={`Adjuntar ${r.label}`}
                      disabled={busy}
                      accept=".pdf,application/pdf"
                      onChange={(e) => {
                        if (e.target.files?.[0])
                          void upload(r.id, e.target.files[0]);
                        e.target.value = "";
                      }}
                    />
                  </label>}
                </div>
              ))}
            </div>
            <p className="muted">Versión del checklist: {c.checklistVersion}</p>
          </>
        )}
        {tab === "Historial" && (
          <>
            <h2>Historial del expediente</h2>
            <div className="event-list">
              {[...c.events].reverse().map((e, i) => (
                <div key={`${e.at}-${i}`}>
                  <span className="event-dot">
                    <Check size={13} />
                  </span>
                  <div>
                    <b>
                      {operator
                        ? e.status
                        : publicStatus(e.status as Status) || e.status}
                    </b>
                    <p>{e.message}</p>
                    <small>{new Date(e.at).toLocaleString("es-MX")}</small>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        {tab === "Mensajes" && (
          <section className="claim-messages">
            <div className="section-heading">
              <h2>Mensajes del expediente</h2>
              <button className="secondary" disabled={busy} onClick={() => void perform(async () => {
                onUpdate(await api.getClaim(c.id));
              })}>Actualizar mensajes</button>
            </div>
            {c.messages?.length ? (
              <ol className="message-list">
                {c.messages.map((item) => (
                  <li key={item.id}>
                    <b>{item.from === "staff" ? "Equipo Paramita" : "Asegurado"}</b>
                    <small>{new Date(item.at).toLocaleString("es-MX")}</small>
                    <p>{item.text}</p>
                  </li>
                ))}
              </ol>
            ) : <p>Aún no hay mensajes sobre esta solicitud.</p>}
            <form className="form-fields" onSubmit={(event) => {
              event.preventDefault();
              void perform(async () => {
                onUpdate(await api.sendClaimMessage(c, message));
                setMessage("");
              });
            }}>
              <Field label="Mensaje">
                <textarea value={message} rows={4} required maxLength={1000}
                  onChange={(event) => setMessage(event.target.value)} />
              </Field>
              <button className="primary" disabled={busy || !message.trim()}>Enviar mensaje</button>
            </form>
          </section>
        )}
        {tab === "Revisión" && (
          <>
            <h2>Revisión y control interno</h2>
            <p>
              Los cambios internos se registran con actor, fecha y motivo. Una
              aprobación interna permite preparar la gestión ante la
              aseguradora.
            </p>
            {nextStatus ? <div className="form-fields">
              <Field label="Nuevo estado">
                <select
                  value={nextStatus}
                  onChange={(e) => setNext(e.target.value as Status)}
                >
                  {availableTransitions.map((status) => <option key={status}>{status}</option>)}
                </select>
              </Field>
              <Field label="Motivo / hallazgo interno">
                <textarea
                  value={reason}
                  minLength={5}
                  maxLength={1000}
                  rows={4}
                  onChange={(e) => setReason(e.target.value)}
                />
              </Field>
              <button
                className="primary"
                disabled={busy || reason.trim().length < 5}
                onClick={() =>
                  void perform(async () => {
                    onUpdate(await api.changeStatus(c, nextStatus, reason));
                    setReason("");
                    notify("Transición registrada");
                  })
                }
              >
                <ShieldCheck size={17} />
                Registrar revisión
              </button>
            </div> : <p>No hay cambios de estado disponibles para este expediente con tu perfil.</p>}
            {c.internalNotes && (
              <div className="info-banner">
                Último hallazgo interno: {c.internalNotes}
              </div>
            )}
          </>
        )}
        {tab === "Gestión con aseguradora" && (
          <>
            <h2>Registro de gestión con {insurerName(c)}</h2>
            <p>
              Registra el canal autorizado, el folio externo y el acuse. Puedes
              adjuntar el respaldo en Documentos.
            </p>
            {submission && (
              <div className="info-banner">
                <CheckCircle2 size={20} />
                Folio registrado: {submission.folio} · {submission.channel} ·{" "}
                {date(submission.date)}
              </div>
            )}
            <form
              className="form-fields"
              onSubmit={(e) => {
                e.preventDefault();
                void perform(async () => {
                  onUpdate(
                    await api.saveSubmission(c, {
                      folio,
                      channel,
                      evidenceId: evidence,
                      date: new Date().toISOString(),
                    }),
                  );
                  notify("Acuse de la aseguradora registrado");
                });
              }}
            >
              <Field label="Folio externo de la aseguradora *">
                <input
                  required
                  minLength={3}
                  maxLength={100}
                  value={folio}
                  onChange={(e) => setFolio(e.target.value)}
                />
              </Field>
              <Field label="Canal autorizado *">
                <input
                  required
                  minLength={3}
                  maxLength={100}
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                />
              </Field>
              <Field label="Evidencia / acuse adjunto *">
                <select
                  required
                  value={evidence}
                  onChange={(e) => setEvidence(e.target.value)}
                >
                  <option value="">Selecciona un acuse cargado</option>
                  {c.documents
                    .filter((d) => isReceipt(d.type) && d.state === "UPLOADED")
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} · v{d.version}
                      </option>
                    ))}
                </select>
              </Field>
              <button className="primary" disabled={busy}>
                Guardar gestión <Check size={16} />
              </button>
            </form>
            <ResolutionForm c={c} notify={notify} onUpdate={onUpdate} />
          </>
        )}
        {tab === "SICAS" && (
          <>
            <h2>Transferencia documental a SICAS</h2>
            <div className="info-banner">
              <CircleAlert size={20} />
              {api.demo
                ? "Adaptador SICAS simulado: prueba la entrega y consulta un acuse ficticio sin enviar datos a terceros."
                : "Contrato API pendiente. El adaptador conserva el expediente sin declarar una entrega real."}
            </div>
            <p>
              Las transferencias tienen un identificador propio y pueden
              reconciliarse por operación.
            </p>
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                void perform(async () => {
                  const result = await api.sendSicas(c);
                  if (api.demo) onUpdate(await api.getClaim(c.id));
                  notify(
                    `Solicitud SICAS: ${result.state}. Consulta el acuse de la operación antes de confirmar la entrega.`,
                  );
                })
              }
            >
              <ExternalLink size={16} />
              Registrar solicitud de transferencia
            </button>
          </>
        )}
      </section>
    </>
  );
}
function Reports({ claims }: { claims: Claim[] }) {
  const total = claims.length;
  return (
    <>
      <PageHeading
        title="Reportes de siniestros"
        text="Indicadores de los expedientes dentro de tu ámbito de acceso."
      />
      <section className="panel coverage-report">
        <h2>Expedientes por aseguradora y ramo</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Aseguradora</th>
                <th>Ramo</th>
                <th>Expedientes</th>
                <th>Requisitos pendientes</th>
              </tr>
            </thead>
            <tbody>
              {insurers.flatMap((i) =>
                i.branches.map((branch) => {
                  const cases = claims.filter(
                    (c) =>
                      coverageOf(c).insurer === i.id &&
                      coverageOf(c).branch === branch,
                  );
                  return cases.length ? (
                    <tr key={`${i.id}-${branch}`}>
                      <td>{i.name}</td>
                      <td>{branches[branch]}</td>
                      <td>{cases.length}</td>
                      <td>
                        {hasGnpChecklist({ insurer: i.id, branch })
                          ? "Matriz de referencia GNP/GMM"
                          : "Definición por Paramita"}
                      </td>
                    </tr>
                  ) : null;
                }),
              )}
            </tbody>
          </table>
        </div>
        {!total && <Empty text="Sin expedientes para esta distribución" />}
      </section>
      <section className="panel">
        <div className="section-heading">
          <h2>Distribución por tipo de trámite</h2>
          <span className="badge blue">{total} expedientes</span>
        </div>
        <div className="report-bars">
          {Object.entries(modalities).map(([id, label]) => {
            const n = claims.filter((c) => c.modality === id).length;
            return (
              <div key={id}>
                <span>{label}</span>
                <div>
                  <i style={{ width: `${total ? (n / total) * 100 : 0}%` }} />
                </div>
                <b>{n}</b>
              </div>
            );
          })}
        </div>
      </section>
      <section className="panel">
        <h2>Estados de la operación</h2>
        <div className="catalog-cards">
          {[...new Set(claims.map((c) => c.status))].map((s) => (
            <div key={s}>
              <Badge status={s} />
              <strong className="report-number">
                {claims.filter((c) => c.status === s).length}
              </strong>
              <p>expedientes</p>
            </div>
          ))}
        </div>
        {!total && <Empty text="Sin datos para calcular indicadores" />}
      </section>
    </>
  );
}
function AssignmentWorkspace({ notify }: { notify: (s: string) => void }) {
  const [cases, setCases] = useState<api.AssignableClaim[]>([]);
  const [staff, setStaff] = useState<api.AssignableStaff[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [reload, setReload] = useState(0);
  const [id, setId] = useState("");
  const [assignee, setAssignee] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const selected = cases.find((item) => item.id === id);
  const memberLabel = (member: api.AssignableStaff) =>
    `${member.displayName || member.id} · ${labels[member.role]}`;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([api.assignmentCases(), api.assignmentStaff()]).then(
      ([page, directory]) => {
        if (!active) return;
        setCases(page.items);
        setCursor(page.cursor);
        setStaff(directory.items);
        setLoading(false);
      },
      () => {
        if (!active) return;
        setError("No pudimos cargar la lista de asignación.");
        setLoading(false);
      },
    );
    return () => { active = false; };
  }, [reload]);

  async function more() {
    if (!cursor) return;
    setLoading(true);
    setError("");
    try {
      const next = await api.assignmentCases(cursor);
      setCases((current) => [...new Map([...current, ...next.items].map((item) => [item.id, item])).values()]);
      setCursor(next.cursor);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !assignee) return;
    setLoading(true);
    setError("");
    try {
      const updated = await api.assignClaim(selected.id, assignee, selected.version);
      setCases((current) => current.map((item) =>
        item.id === selected.id
          ? { ...item, assignee, version: updated.version ?? item.version }
          : item,
      ));
      setAssignee("");
      notify("Responsable asignado. El expediente aparecerá en su bandeja.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {loading && <p role="status">Cargando asignaciones…</p>}
      {error && <p role="alert">{error}</p>}
      <form className="inline-form" onSubmit={assign}>
        <Field label="Expediente">
          <select required value={id} disabled={loading || !cases.length} onChange={(e) => {
            setId(e.target.value);
            setAssignee("");
          }}>
            <option value="">Selecciona un expediente</option>
            {cases.map((item) => (
              <option key={item.id} value={item.id}>
                {shortId(item.id)} · {item.status} · {date(item.createdAt)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Nuevo responsable">
          <select required value={assignee} disabled={loading || !selected || !staff.length} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">Selecciona un analista o aprobador</option>
            {staff.filter((member) => member.id !== selected?.assignee).map((member) => (
              <option key={member.id} value={member.id}>{memberLabel(member)}</option>
            ))}
          </select>
        </Field>
        <button className="primary" disabled={loading || !selected || !assignee}>Asignar</button>
      </form>
      {selected && (
        <p>Responsable actual: {selected.assignee
          ? staff.find((member) => member.id === selected.assignee)?.displayName || selected.assignee
          : "Sin asignar"}</p>
      )}
      {!loading && !error && !staff.length && <p>Registra un analista o aprobador de la organización para asignar expedientes.</p>}
      <div className="actions">
        <button className="secondary" disabled={loading} onClick={() => setReload((value) => value + 1)}>Actualizar lista</button>
        {cursor && <button className="secondary" disabled={loading} onClick={() => void more()}>Cargar más expedientes</button>}
      </div>
      <details>
        <summary>Asignar por identificador</summary>
        <AssignForm notify={notify} />
      </details>
    </>
  );
}

function AssignForm({ notify }: { notify: (s: string) => void }) {
  const [id, setId] = useState(""),
    [assignee, setAssignee] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="inline-form"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        api
          .assignClaim(id, assignee)
          .then(() =>
            notify(
              api.demo
                ? "Demostración: asignación simulada"
                : "Responsable asignado",
            ),
          )
          .catch((e) => notify(e.message))
          .finally(() => setBusy(false));
      }}
    >
      <Field label="ID completo del expediente">
        <input required value={id} onChange={(e) => setId(e.target.value)} />
      </Field>
      <Field label="Identificador de usuario responsable">
        <input
          required
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
        />
      </Field>
      <button className="primary" disabled={busy}>
        Asignar
      </button>
      <small>
        El responsable debe estar registrado en la organización y tener
        facultades de analista o aprobador.
      </small>
    </form>
  );
}
function Login({
  onLogin,
  notify,
  toast,
}: {
  onLogin: () => Promise<void>;
  notify: (s: string) => void;
  toast: string;
}) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [code, setCode] = useState(""),
    [mode, setMode] = useState("login"),
    [step, setStep] = useState(""),
    [totp, setTotp] = useState(""),
    [busy, setBusy] = useState(false);
  function returnToSignIn() {
    setMode("login");
    setStep("");
    setTotp("");
    setCode("");
    setPassword("");
    notify("");
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "forgot") {
        await api.forgotPassword({ username: email });
        setMode("reset");
        notify(
          "Si la cuenta está habilitada, recibirás instrucciones para recuperar el acceso.",
        );
        return;
      }
      if (mode === "reset") {
        await api.resetForgottenPassword({
          username: email,
          confirmationCode: code,
          newPassword: password,
        });
        setMode("login");
        notify("Contraseña actualizada");
        return;
      }
      const result = step
        ? await api.confirmLogin({
            challengeResponse:
              step === "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED"
                ? password
                : code,
          })
        : await api.login(email, password);
      if (result.isSignedIn) {
        await onLogin();
        return;
      }
      setStep(result.nextStep.signInStep);
      setCode("");
      setTotp(result.nextStep.signInStep === "CONTINUE_SIGN_IN_WITH_TOTP_SETUP"
        ? result.nextStep.totpSetupDetails.getSetupUri("Paramita").toString()
        : "");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-shell">
      <section className="login-story">
        <Brand />
        <div>
          <span className="eyebrow">ESTAMOS CONTIGO</span>
          <h1>
            Tu tranquilidad.
            <br />
            Nuestro compromiso.
          </h1>
          <p>
            Un solo lugar para registrar, consultar y dar seguimiento a tus
            siniestros.
          </p>
          <div className="login-emblem">
            <ShieldCheck size={150} strokeWidth={0.8} />
            <Flower size={250} strokeWidth={0.35} />
          </div>
          <div className="login-promise">
            <span>
              <CheckCircle2 size={18} />
              Seguimiento claro
            </span>
            <span>
              <LockKeyhole size={18} />
              Acceso seguro
            </span>
          </div>
        </div>
        <small>Paramita · Portal de Siniestros</small>
      </section>
      <section className="login-form">
        <span className="partner">
          <BrandLogo partner />
        </span>
        <form onSubmit={submit}>
          <span className="stat-icon blue">
            <ShieldCheck size={26} />
          </span>
          <h1>
            {mode === "login" ? "Bienvenido a tu portal" : "Recupera tu acceso"}
          </h1>
          <p>Gestiona tus trámites con confianza y seguridad.</p>
          {!step && (
            <Field label="Correo electrónico">
              <div className="input-icon">
                <Mail size={17} />
                <input
                  type="email"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu.correo@ejemplo.com"
                />
              </div>
            </Field>
          )}
          {((mode === "login" && !step) ||
            mode === "reset" ||
            step === "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED") && (
            <Field
              label={
                mode === "reset" || step ? "Nueva contraseña" : "Contraseña"
              }
            >
              <div className="input-icon">
                <LockKeyhole size={17} />
                <input
                  type="password"
                  required
                  autoComplete={
                    step || mode === "reset"
                      ? "new-password"
                      : "current-password"
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Ingresa tu contraseña"
                />
              </div>
            </Field>
          )}
          {totp && (
            <div className="info-banner">
              <span>
                Configura tu aplicación de autenticación con este enlace:
                <br />
                <a href={totp}>Abrir configuración TOTP</a>
              </span>
            </div>
          )}
          {(mode === "reset" ||
            (step &&
              step !== "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED")) && (
            <Field label="Código de verificación">
              <input
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </Field>
          )}
          {mode === "login" && !step && (
            <button
              type="button"
              className="text-button forgot"
              onClick={() => setMode("forgot")}
            >
              ¿Olvidaste tu contraseña?
            </button>
          )}
          <button className="primary login-submit" disabled={busy}>
            {busy ? (
              <LoaderCircle className="spin" size={18} />
            ) : mode === "forgot" ? (
              "Enviar instrucciones"
            ) : mode === "reset" ? (
              "Actualizar contraseña"
            ) : step ? (
              "Verificar"
            ) : (
              "Iniciar sesión"
            )}
            <ArrowRight size={17} />
          </button>
          {(mode !== "login" || step) && (
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={returnToSignIn}
            >
              Volver al inicio de sesión
            </button>
          )}
          <p className="login-support">
            ¿Necesitas una cuenta? Solicita tu acceso a Paramita.
          </p>
          <div className="bottom-note">
            <LockKeyhole size={14} />
            Acceso protegido
          </div>
          {toast && (
            <div className="info-banner" role="status">
              {toast}
            </div>
          )}
        </form>
        <small className="login-copyright">
          Tus pólizas, en un solo lugar.
        </small>
      </section>
    </div>
  );
}

function DocumentReview({
  c,
  documentId,
  notify,
  onUpdate,
}: {
  c: Claim;
  documentId: string;
  notify: (s: string) => void;
  onUpdate: (c: Claim) => void;
}) {
  const [open, setOpen] = useState(false),
    [status, setStatus] = useState<"ACCEPTED" | "OBSERVED">("ACCEPTED"),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false);
  if (!open)
    return (
      <button className="text-button" onClick={() => setOpen(true)}>
        Revisar documento
      </button>
    );
  return (
    <span className="document-review-form">
      <select
        aria-label="Resultado de revisión"
        value={status}
        onChange={(e) => setStatus(e.target.value as "ACCEPTED" | "OBSERVED")}
      >
        <option value="ACCEPTED">Revisado conforme</option>
        <option value="OBSERVED">Solicitar corrección</option>
      </select>
      <input
        aria-label="Motivo de revisión documental"
        placeholder="Motivo visible para el asegurado"
        maxLength={1000}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <button
        className="secondary"
        disabled={busy || reason.trim().length < 5}
        onClick={async () => {
          setBusy(true);
          try {
            onUpdate(await api.reviewDocument(c, documentId, status, reason));
            setOpen(false);
            notify("Revisión documental registrada");
          } catch (e) {
            notify((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Guardar
      </button>
      <button className="text-button" onClick={() => setOpen(false)}>
        Cancelar
      </button>
    </span>
  );
}
function ResolutionForm({
  c,
  notify,
  onUpdate,
}: {
  c: Claim;
  notify: (s: string) => void;
  onUpdate: (c: Claim) => void;
}) {
  const [result, setResult] = useState("Respuesta favorable"),
    [detail, setDetail] = useState(""),
    [evidence, setEvidence] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="resolution-section">
      <h2>Resolución externa y cierre</h2>
      <p>
        Registra la respuesta confirmada de la aseguradora y su respaldo
        específico antes de finalizar el expediente.
      </p>
      {c.resolution && (
        <div className="info-banner">
          {c.resolution.result}: {c.resolution.detail}
        </div>
      )}
      <form
        className="form-fields"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            onUpdate(
              await api.saveResolution(c, {
                result,
                detail,
                evidenceId: evidence,
                date: new Date().toISOString(),
              }),
            );
            notify("Resolución externa registrada");
          } catch (e) {
            notify((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label={`Resultado informado por ${insurerName(c)}`}>
          <select value={result} onChange={(e) => setResult(e.target.value)}>
            {[
              "Respuesta favorable",
              "Respuesta no favorable",
              "Otro resultado informado",
            ].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </Field>
        <Field label="Detalle confirmado">
          <textarea
            required
            minLength={5}
            maxLength={1000}
            rows={3}
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
          />
        </Field>
        <Field label="Respaldo de la resolución">
          <select
            required
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
          >
            <option value="">Selecciona la resolución adjunta</option>
            {c.documents
              .filter((d) => isResolution(d.type) && d.state === "UPLOADED")
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
          </select>
        </Field>
        <button className="primary" disabled={busy}>
          Registrar resolución <Check size={16} />
        </button>
      </form>
    </div>
  );
}
