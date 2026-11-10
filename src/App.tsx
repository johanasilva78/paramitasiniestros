import { MockWorkspace } from "./MockWorkspace";
import * as mock from "./mock";
import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
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
  Plus,
  Search,
  Settings,
  ShieldCheck,
  UploadCloud,
  Users,
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
  checklist,
  checklistVersion,
  publicStatus,
  statuses,
  type Claim,
  type Actor,
  type Modality,
  type Status,
} from "../shared/domain";
const labels: Record<Actor["role"], string> = {
  insured: "Asegurado individual",
  employee: "Empleado",
  hr: "Administración de empresa",
  analyst: "Analista Paramita",
  approver: "Aprobador Paramita",
  viewer: "Monitoreo",
  admin: "Administrador",
  support: "Soporte DANAconnect",
};
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
function Brand() {
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
    [loading, setLoading] = useState(false),
    [notifications, setNotifications] = useState(false);
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
    if (toast) {
      const t = setTimeout(() => setToast(""), 6500);
      return () => clearTimeout(t);
    }
  }, [toast]);
  function go(p: string) {
    setPage(p);
    setSelected(null);
  }
  async function open(c: Claim) {
    try {
      setSelected(await api.getClaim(c.id));
      setPage("Expediente");
    } catch (e) {
      notify((e as Error).message);
    }
  }
  const operator = !!actor && ["analyst", "approver"].includes(actor.role);
  const administrative =
    !!actor && ["hr", "viewer", "admin", "support"].includes(actor.role);
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
    ["Mis siniestros", ClipboardList],
    ["Documentos", FileText],
    ...(api.demo
      ? [
          ["Mis pólizas", ShieldCheck] as [string, LucideIcon],
          ["Notificaciones", Bell] as [string, LucideIcon],
        ]
      : []),
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
        <Brand />
        <div className="header-right">
          <span className="partner">
            <BrandLogo partner />
          </span>
          <div className="header-divider" />
          <button
            className="icon-button notification-button"
            aria-label="Notificaciones"
            onClick={() => setNotifications(!notifications)}
          >
            <Bell size={20} />
            {claims.some((c) => c.status === "Pendiente de documentos") && (
              <i />
            )}
          </button>
          <div className="user">
            <span className="avatar">{operator ? "AP" : "ML"}</span>
            <div>
              <strong>{operator ? "Equipo Paramita" : "Mi cuenta"}</strong>
              <small>{labels[actor.role]}</small>
            </div>
          </div>
          <button
            className="icon-button"
            aria-label="Cerrar sesión"
            onClick={async () => {
              await api.logout();
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
            onClick={() => go(n)}
          >
            <Icon size={17} />
            {n}
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
                    {shortId(c.id)} · {modalities[c.modality]}
                  </small>
                </span>
                <ChevronRight size={16} />
              </button>
            ))}
          {!claims.some((c) => c.status === "Pendiente de documentos") && (
            <p>No tienes avisos pendientes.</p>
          )}
        </aside>
      )}
      <main>
        {api.demo &&
          ([
            "Mis pólizas",
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
                    ? "Tu operación, en un solo lugar."
                    : "Tu tranquilidad empieza aquí."}
                </h1>
                <p>
                  {operator
                    ? "Organiza, revisa y da seguimiento a los expedientes asignados."
                    : "Registra y consulta tus trámites de forma fácil, clara y segura."}
                </p>
                {!operator && !administrative && (
                  <button
                    className="primary"
                    onClick={() => go("Nuevo siniestro")}
                  >
                    <Plus size={18} /> Registrar nuevo siniestro
                  </button>
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
                      "Ingresado en GNP",
                      "En espera",
                      "En trámite con aseguradora",
                    ].includes(c.status),
                  ).length,
                  icon: ShieldCheck,
                  color: "purple",
                  text: "Gestión con GNP",
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
                  onClick={() => go("Mis siniestros")}
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
                  <button
                    className="text-button"
                    onClick={() => go("Mis siniestros")}
                  >
                    Ver todos <ArrowRight size={15} />
                  </button>
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
                <p>
                  Ten a la mano tu número de póliza y los documentos de tu
                  reclamación.
                </p>
                <div className="help-divider" />
                <h4>¿Qué documentos necesito?</h4>
                <p>
                  Cada trámite tiene su propia lista. Consúltala antes de
                  iniciar.
                </p>
                <button className="secondary" onClick={() => go("Documentos")}>
                  Consultar documentos <ArrowRight size={15} />
                </button>
                <span className="gnp-logo">
                  ✳ GNP <small>SEGUROS</small>
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
        {page === "Mis siniestros" && (
          <ClaimsPage
            claims={claims}
            onOpen={open}
            viewStatus={viewStatus}
            onNew={() => go("Nuevo siniestro")}
            canCreate={!operator && !administrative}
          />
        )}
        {page === "Nuevo siniestro" && (
          <NewClaim
            onCancel={() => go("Inicio")}
            onCreate={async (c) => {
              await refresh();
              await open(c);
              notify(
                "Tu solicitud fue registrada. Ya puedes adjuntar los documentos.",
              );
            }}
            notify={notify}
          />
        )}
        {page === "Expediente" && selected && (
          <ClaimDetail
            c={selected}
            actor={actor}
            notify={notify}
            onBack={() => go("Mis siniestros")}
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
              text="Consulta los formatos y soportes de cada modalidad GNP."
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
                {Object.entries(modalities).map(([id, label]) => (
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
              <AssignForm notify={notify} />
            </section>
            <DocumentCatalog />
          </>
        )}
      </main>
      <footer>
        <Brand />
        <span>Portal de Siniestros · GNP</span>
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
function ClaimTable({
  claims,
  onOpen,
  viewStatus,
}: {
  claims: Claim[];
  onOpen: (c: Claim) => void;
  viewStatus: (c: Claim) => string;
}) {
  return claims.length ? (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Folio</th>
            <th>Asegurado</th>
            <th>Trámite</th>
            <th>Registro</th>
            <th>Estado</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {claims.map((c) => (
            <tr key={c.id}>
              <td>
                <button className="folio" onClick={() => onOpen(c)}>
                  {shortId(c.id)}
                </button>
              </td>
              <td>{c.insured}</td>
              <td>{modalities[c.modality]}</td>
              <td className="nowrap">{date(c.createdAt)}</td>
              <td>
                <Badge status={viewStatus(c)} />
              </td>
              <td>
                <button
                  className="table-button"
                  onClick={() => onOpen(c)}
                  aria-label={`Ver ${shortId(c.id)}`}
                >
                  Ver <ChevronRight size={13} />
                </button>
              </td>
            </tr>
          ))}
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
  onOpen: (c: Claim) => void;
  viewStatus: (c: Claim) => string;
  onNew: () => void;
  canCreate: boolean;
}) {
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState("Todos"),
    [modality, setModality] = useState(""),
    [current, setCurrent] = useState(1);
  const filtered = claims.filter(
    (c) =>
      (filter === "Todos" || viewStatus(c) === filter) &&
      (!modality || c.modality === modality) &&
      `${shortId(c.id)} ${c.insured} ${c.policy}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  function exportCsv() {
    const escape = (s: string) =>
      `"${s.replace(/"/g, '""').replace(/^[=+@-]/, "'$&")}"`;
    const rows = [
      ["Folio", "Asegurado", "Trámite", "Registro", "Estado"],
      ...filtered.map((c) => [
        shortId(c.id),
        c.insured,
        modalities[c.modality],
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
        title={canCreate ? "Mis siniestros" : "Bandeja de siniestros"}
        text="Todos tus trámites y movimientos, en un solo lugar."
        action={
          <div className="actions">
            <button className="secondary" onClick={exportCsv}>
              <ArrowDownToLine size={16} />
              Exportar
            </button>
            {canCreate && (
              <button className="primary" onClick={onNew}>
                <Plus size={17} />
                Nuevo siniestro
              </button>
            )}
          </div>
        }
      />
      <section className="panel">
        <div className="tabs">
          {["Todos", ...new Set(claims.map(viewStatus))].map((t) => (
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
          <span className="insurer-tag">✳ GNP Seguros</span>
        </div>
        <ClaimTable
          claims={filtered.slice((current - 1) * 8, current * 8)}
          onOpen={onOpen}
          viewStatus={viewStatus}
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
                !api.demo || mock.settings().enabled.includes(id as Modality),
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
function NewClaim({
  onCancel,
  onCreate,
  notify,
}: {
  onCancel: () => void;
  onCreate: (c: Claim) => Promise<void>;
  notify: (s: string) => void;
}) {
  const [step, setStep] = useState(0),
    [busy, setBusy] = useState(false),
    [idempotency] = useState(() => crypto.randomUUID());
  const [data, setData] = useState({
    modality: (api.demo
      ? mock.settings().enabled[0] || "reimbursement"
      : "reimbursement") as Modality,
    insured: "",
    policy: "",
    eventDate: "",
    description: "",
    subsequent: false,
    previousReference: "",
    consent: false,
  });
  const update = (key: string, value: unknown) =>
    setData((d) => ({ ...d, [key]: value }));
  async function next(e: FormEvent) {
    e.preventDefault();
    if (step < 3) {
      setStep(step + 1);
      return;
    }
    setBusy(true);
    try {
      await onCreate(await api.createClaim(data, idempotency));
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        title="Nuevo siniestro"
        text="Completa la información para registrar tu solicitud."
      />
      <div className="steps">
        {[
          "Información general",
          "Persona asegurada",
          "Detalle del siniestro",
          "Revisión y envío",
        ].map((s, i) => (
          <div className={i <= step ? "done" : ""} key={s}>
            <span>{i < step ? <Check size={16} /> : i + 1}</span>
            <b>{s}</b>
          </div>
        ))}
      </div>
      <div className="form-layout">
        <form className="panel form-panel" onSubmit={next}>
          <h2>
            {
              [
                "Información general",
                "Datos de la persona asegurada",
                "Detalle del siniestro",
                "Revisa tu solicitud",
              ][step]
            }
          </h2>
          <p className="muted">
            Los campos marcados con * son necesarios para continuar.
          </p>
          {step === 0 && (
            <div className="form-fields">
              <Field label="Aseguradora *">
                <select disabled>
                  <option>GNP Seguros</option>
                </select>
              </Field>
              <Field label="Producto *">
                <select disabled>
                  <option>Gastos Médicos Mayores</option>
                </select>
              </Field>
              <Field label="Tipo de trámite *">
                <select
                  value={data.modality}
                  onChange={(e) => update("modality", e.target.value)}
                >
                  {Object.entries(modalities)
                    .filter(
                      ([id]) =>
                        !api.demo ||
                        mock.settings().enabled.includes(id as Modality),
                    )
                    .map(([id, n]) => (
                      <option value={id} key={id}>
                        {n}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Tipo de reclamación">
                <select
                  value={data.subsequent ? "subsequent" : "initial"}
                  onChange={(e) =>
                    update("subsequent", e.target.value === "subsequent")
                  }
                >
                  <option value="initial">Inicial</option>
                  <option value="subsequent">Subsecuente</option>
                </select>
              </Field>
              {data.subsequent && (
                <Field
                  label="Referencia del caso anterior *"
                  hint="La asociación se verificará por Paramita; no se fusionarán expedientes automáticamente."
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
            </div>
          )}
          {step === 1 && (
            <div className="form-fields">
              <Field label="Nombre completo de la persona asegurada *">
                <input
                  required
                  minLength={3}
                  maxLength={150}
                  autoComplete="name"
                  value={data.insured}
                  onChange={(e) => update("insured", e.target.value)}
                  placeholder="Nombre(s) y apellidos"
                />
              </Field>
              <Field
                label="Número de póliza *"
                hint="Paramita verificará la información de tu póliza."
              >
                <input
                  required
                  minLength={3}
                  maxLength={80}
                  value={data.policy}
                  onChange={(e) => update("policy", e.target.value)}
                  placeholder="Ingresa el número de tu póliza"
                />
              </Field>
            </div>
          )}
          {step === 2 && (
            <div className="form-fields">
              <Field label="Fecha del evento *">
                <input
                  type="date"
                  required
                  max={new Date().toISOString().slice(0, 10)}
                  value={data.eventDate}
                  onChange={(e) => update("eventDate", e.target.value)}
                />
              </Field>
              <Field
                label="Descripción de la solicitud *"
                hint="Describe brevemente tu trámite. La valoración y resolución corresponden a la aseguradora."
              >
                <textarea
                  required
                  minLength={10}
                  maxLength={2000}
                  rows={5}
                  value={data.description}
                  onChange={(e) => update("description", e.target.value)}
                  placeholder="Cuéntanos qué trámite necesitas gestionar…"
                />
              </Field>
              <div className="info-banner">
                <FileText size={19} />
                Podrás adjuntar tus documentos después de obtener el folio,
                conservando todas las versiones en el mismo expediente.
              </div>
            </div>
          )}
          {step === 3 && (
            <>
              <dl className="summary-grid">
                <div>
                  <dt>Aseguradora y producto</dt>
                  <dd>GNP · Gastos Médicos Mayores</dd>
                </div>
                <div>
                  <dt>Trámite</dt>
                  <dd>{modalities[data.modality]}</dd>
                </div>
                <div>
                  <dt>Persona asegurada</dt>
                  <dd>{data.insured}</dd>
                </div>
                <div>
                  <dt>Póliza</dt>
                  <dd>{data.policy}</dd>
                </div>
                <div>
                  <dt>Fecha del evento</dt>
                  <dd>{data.eventDate}</dd>
                </div>
                <div>
                  <dt>Reclamación</dt>
                  <dd>
                    {data.subsequent
                      ? `Subsecuente · ${data.previousReference}`
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
                El registro genera un acuse de recepción; la resolución del
                siniestro corresponde a GNP.
              </p>
            </>
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
            <button className="primary" disabled={busy}>
              {busy ? (
                <LoaderCircle className="spin" size={17} />
              ) : step === 3 ? (
                "Registrar solicitud"
              ) : (
                "Continuar"
              )}
              <ArrowRight size={16} />
            </button>
          </div>
        </form>
        <aside className="panel guide-panel">
          <span className="gnp-logo">
            ✳ GNP<small>SEGUROS</small>
          </span>
          <h3>Un paso más cerca de resolver tu trámite</h3>
          <p>Ten a la mano tu póliza y los soportes de tu reclamación.</p>
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
                Un checklist específico para{" "}
                {modalities[data.modality].toLowerCase()}.
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
  onBack,
  onUpdate,
  notify,
}: {
  c: Claim;
  actor: Actor;
  onBack: () => void;
  onUpdate: (c: Claim) => void;
  notify: (s: string) => void;
}) {
  const [tab, setTab] = useState("Resumen"),
    [busy, setBusy] = useState(false),
    [next, setNext] = useState<Status>("En validación"),
    [reason, setReason] = useState(""),
    [folio, setFolio] = useState(""),
    [channel, setChannel] = useState("Portal GNP"),
    [evidence, setEvidence] = useState("");
  const operator = ["analyst", "approver"].includes(actor.role);
  const rows = documentsFor(c.modality).filter((r) =>
    ["M", "C"].includes(r.mark),
  );
  const uploaded = new Set(
    c.documents.filter((d) => d.state === "UPLOADED").map((d) => d.type),
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
          : "Archivo recibido y pendiente de análisis de seguridad",
      );
    });
  }
  return (
    <>
      <button className="back-button" onClick={onBack}>
        <ArrowLeft size={16} />
        Volver a mis siniestros
      </button>
      <section className="panel detail-head">
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
              Gastos Médicos Mayores <span>·</span> {modalities[c.modality]}
            </p>
          </div>
          <span className="gnp-logo">
            ✳ GNP<small>SEGUROS</small>
          </span>
        </div>
        <div className="timeline">
          {[
            { label: "Registro", done: true },
            {
              label: "Documentación",
              done: uploaded.size >= rows.filter((r) => r.mark === "M").length,
            },
            {
              label: "Revisión Paramita",
              done: [
                "En validación",
                "En revisión",
                "Aprobado internamente",
                "Ingresado en GNP",
                "Finalizado",
              ].includes(c.status),
            },
            { label: "Gestión GNP", done: !!c.gnp },
            {
              label: "Resultado informado",
              done: ["Finalizado", "Resultado informado"].includes(c.status),
            },
          ].map((s, i) => (
            <div className={s.done ? "complete" : ""} key={s.label}>
              <span>{s.done ? <Check size={14} /> : i + 1}</span>
              <b>{s.label}</b>
              <small>
                {i === 0
                  ? date(c.createdAt)
                  : s.done
                    ? "Registrado"
                    : "Pendiente"}
              </small>
            </div>
          ))}
        </div>
      </section>
      <section className="panel detail-body">
        <div className="tabs">
          {[
            "Resumen",
            "Documentos",
            "Historial",
            ...(operator ? ["Revisión", "Gestión GNP", "SICAS"] : []),
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
        </div>
        {tab === "Resumen" && (
          <div className="detail-grid">
            <div>
              <h2>Información del siniestro</h2>
              <dl className="summary-grid">
                <div>
                  <dt>Persona asegurada</dt>
                  <dd>{c.insured}</dd>
                </div>
                <div>
                  <dt>Póliza</dt>
                  <dd>{c.policy}</dd>
                </div>
                <div>
                  <dt>Trámite</dt>
                  <dd>{modalities[c.modality]}</dd>
                </div>
                <div>
                  <dt>Fecha de registro</dt>
                  <dd>{date(c.createdAt)}</dd>
                </div>
                <div>
                  <dt>Fecha del evento</dt>
                  <dd>{c.eventDate}</dd>
                </div>
                <div>
                  <dt>Última actualización</dt>
                  <dd>{date(c.updatedAt)}</dd>
                </div>
              </dl>
              <h3>Solicitud</h3>
              <p>{c.description}</p>
              {c.resolution && (
                <div className="info-banner">
                  <ShieldCheck size={20} />
                  <div>
                    <b>Resultado informado por GNP: {c.resolution.result}</b>
                    <p>{c.resolution.detail}</p>
                    <small>{date(c.resolution.date)}</small>
                  </div>
                </div>
              )}
              {c.subsequent && (
                <p className="info-banner">
                  Referencia previa: {c.previousReference}. Asociación sujeta a
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
                    {uploaded.size} tipos documentales recibidos. Puedes
                    adjuntar y actualizar tus archivos.
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
            <div className="section-heading">
              <div>
                <h2>Documentos de tu expediente</h2>
                <p>
                  PDF, JPG, PNG y XML para facturas · Máximo provisional 10 MB
                  por archivo
                </p>
              </div>
              <span className="badge blue">
                {uploaded.size} tipos recibidos
              </span>
            </div>
            <div className="info-banner">
              <CircleAlert size={19} />
              <span>
                Checklist preliminar: los requisitos condicionales no bloquean
                la recepción. Se conserva cada versión que adjuntes.
              </span>
            </div>
            <div className="upload-list">
              {[
                ...rows,
                ...(operator
                  ? [
                      {
                        id: "GNP-RECEIPT",
                        label: "Acuse de ingreso GNP",
                        mark: "C",
                      },
                      {
                        id: "GNP-RESULT",
                        label: "Resolución externa GNP",
                        mark: "C",
                      },
                    ]
                  : []),
              ].map((r) => (
                <div className="upload-row" key={r.id}>
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
                      {r.mark === "C"
                        ? "Condicional · sólo si aplica"
                        : "Marca base · pendiente de aprobación"}
                      {c.documents
                        .filter((d) => d.type === r.id)
                        .map((d) => (
                          <span key={d.id}>
                            <button
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
                            </button>
                            {d.reviewStatus && (
                              <span className="document-review-state">
                                {d.reviewStatus === "ACCEPTED"
                                  ? "Revisado"
                                  : "Observado"}
                                : {d.reviewReason}
                              </span>
                            )}
                            {operator && (
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
                  <label className={`upload-button ${busy ? "disabled" : ""}`}>
                    <UploadCloud size={17} />
                    {uploaded.has(r.id) ? "Nueva versión" : "Adjuntar"}
                    <input
                      type="file"
                      disabled={busy || c.status === "Finalizado"}
                      accept={
                        r.id === "GNP-18" ? ".pdf,.xml" : ".pdf,.png,.jpg,.jpeg"
                      }
                      onChange={(e) => {
                        if (e.target.files?.[0])
                          void upload(r.id, e.target.files[0]);
                        e.target.value = "";
                      }}
                    />
                  </label>
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
        {tab === "Revisión" && (
          <>
            <h2>Revisión y control interno</h2>
            <p>
              Los cambios internos se registran con actor, fecha y motivo. Una
              aprobación interna permite preparar la gestión ante GNP.
            </p>
            <div className="form-fields">
              <Field label="Nuevo estado">
                <select
                  value={next}
                  onChange={(e) => setNext(e.target.value as Status)}
                >
                  {statuses
                    .filter((s) => s !== "Borrador")
                    .map((s) => (
                      <option key={s}>{s}</option>
                    ))}
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
                    onUpdate(await api.changeStatus(c, next, reason));
                    setReason("");
                    notify("Transición registrada");
                  })
                }
              >
                <ShieldCheck size={17} />
                Registrar revisión
              </button>
            </div>
            {c.internalNotes && (
              <div className="info-banner">
                Último hallazgo interno: {c.internalNotes}
              </div>
            )}
          </>
        )}
        {tab === "Gestión GNP" && (
          <>
            <h2>Registro de gestión con GNP</h2>
            <p>
              Registra el canal autorizado, el folio externo y el acuse. Puedes
              adjuntar el respaldo en Documentos.
            </p>
            {c.gnp && (
              <div className="info-banner">
                <CheckCircle2 size={20} />
                Folio registrado: {c.gnp.folio} · {c.gnp.channel} ·{" "}
                {date(c.gnp.date)}
              </div>
            )}
            <form
              className="form-fields"
              onSubmit={(e) => {
                e.preventDefault();
                void perform(async () => {
                  onUpdate(
                    await api.saveGnp(c, {
                      folio,
                      channel,
                      evidenceId: evidence,
                      date: new Date().toISOString(),
                    }),
                  );
                  notify("Acuse GNP registrado");
                });
              }}
            >
              <Field label="Folio externo GNP *">
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
                    .filter(
                      (d) => d.type === "GNP-RECEIPT" && d.state === "UPLOADED",
                    )
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
      if (result.nextStep.signInStep === "CONTINUE_SIGN_IN_WITH_TOTP_SETUP")
        setTotp(
          result.nextStep.totpSetupDetails.getSetupUri("Paramita").toString(),
        );
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
          {mode !== "login" && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setMode("login");
                setStep("");
              }}
            >
              Volver al inicio de sesión
            </button>
          )}
          <p className="login-support">
            ¿Necesitas una cuenta? Solicita tu acceso a Paramita.
          </p>
          <div className="bottom-note">
            <LockKeyhole size={14} />
            Acceso con verificación en dos pasos
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
        <Field label="Resultado informado por GNP">
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
              .filter((d) => d.type === "GNP-RESULT" && d.state === "UPLOADED")
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
