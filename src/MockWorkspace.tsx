import { useState, type FormEvent } from "react";
import {
  Check,
  Plus,
  RefreshCw,
  ShieldCheck,
  Users,
  Activity,
  FileText,
  Mail,
  Eye,
  X,
  Save,
} from "lucide-react";
import * as mock from "./mock";
import {
  modalities,
  publicStatus,
  type Claim,
  type Role,
  type Modality,
} from "../shared/domain";
export function MockWorkspace({
  view,
  role,
  notify,
  onRefresh,
}: {
  view: string;
  role: Role;
  notify: (s: string) => void;
  onRefresh: () => void;
}) {
  const [revision, setRevision] = useState(0),
    [tab, setTab] = useState("Usuarios"),
    [config, setConfig] = useState(() => mock.settings()),
    [policy, setPolicy] = useState(""),
    [confirmReset, setConfirmReset] = useState(false);
  const [user, setUser] = useState({
      name: "",
      email: "",
      role: "insured" as Role,
    }),
    [selected, setSelected] = useState<Record<string, string>>({}),
    [reasons, setReasons] = useState<Record<string, string>>({});
  const all = mock.stored<Claim[]>(mock.mockKeys.claims, mock.seedClaims());
  function refresh() {
    setRevision(revision + 1);
    onRefresh();
  }
  function save() {
    mock.saveSettings(config);
    setConfig(mock.settings());
    notify("Configuración simulada guardada y versionada");
    refresh();
  }
  function transfer(id: string, fail: boolean) {
    try {
      const j = mock.transfer(id, fail);
      notify(
        fail
          ? "Timeout simulado: expediente conservado para reintento"
          : `Acuse simulado: ${j.receipt}`,
      );
      refresh();
    } catch (e) {
      notify((e as Error).message);
    }
  }
  function addUser(e: FormEvent) {
    e.preventDefault();
    if (
      config.users.some(
        (u) => u.email.toLowerCase() === user.email.toLowerCase(),
      )
    ) {
      notify("Ese correo ya existe en la demostración");
      return;
    }
    const next = {
      ...config,
      users: [
        ...config.users,
        { ...user, id: `mock-user-${crypto.randomUUID()}`, active: true },
      ],
    };
    mock.saveSettings(next);
    setConfig(mock.settings());
    setUser({ name: "", email: "", role: "insured" });
    notify("Usuario ficticio creado");
  }
  const summary = view === "Empresa" || view === "Monitoreo";
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">DEMOSTRACIÓN INTERACTIVA</div>
          <h1>{view}</h1>
          <p>
            {view === "Empresa"
              ? "Seguimiento administrativo con datos ficticios y sin documentos clínicos."
              : view === "Monitoreo"
                ? "Indicadores de operación en el ámbito de demostración."
                : "Todas las acciones de esta vista se simulan en tu navegador."}
          </p>
        </div>
        <span className="badge amber">SIMULADO · SIN CONEXIONES EXTERNAS</span>
      </div>
      {view === "Mis pólizas" && (
        <>
          <div className="mock-policy-grid">
            {[
              {
                id: "GNP-INDIVIDUAL-DEMO",
                name: "Protección individual",
                kind: "Individual",
                people: "Titular y dependiente",
                until: "28 oct 2027",
              },
              {
                id: "GNP-COLECTIVA-DEMO",
                name: "Bienestar empresarial",
                kind: "Colectiva",
                people: "Persona empleada",
                until: "31 dic 2027",
              },
            ].map((p) => (
              <section className="panel" key={p.id}>
                <div className="section-heading">
                  <span className="stat-icon blue">
                    <ShieldCheck size={25} />
                  </span>
                  <span className="badge green">Vigencia ficticia</span>
                </div>
                <span className="gnp-logo">✳ GNP</span>
                <h2>{p.name}</h2>
                <p>Gastos Médicos Mayores · {p.kind}</p>
                <dl className="summary-grid">
                  <div>
                    <dt>Póliza</dt>
                    <dd>{p.id}</dd>
                  </div>
                  <div>
                    <dt>Fin de vigencia de ejemplo</dt>
                    <dd>{p.until}</dd>
                  </div>
                  <div>
                    <dt>Personas aseguradas</dt>
                    <dd>{p.people}</dd>
                  </div>
                </dl>
                <button
                  className="secondary"
                  onClick={() => setPolicy(policy === p.id ? "" : p.id)}
                >
                  <Eye size={15} />
                  Ver detalle
                </button>
                {policy === p.id && (
                  <div className="info-banner">
                    Coberturas, deducibles, coaseguros, red hospitalaria y pagos
                    son datos de demostración pendientes del contrato SICAS.
                    Esta tarjeta no acredita elegibilidad ni cobertura.
                  </div>
                )}
              </section>
            ))}
          </div>
        </>
      )}
      {summary && (
        <>
          <div className="stats">
            {[
              { label: "Expedientes", n: all.length },
              {
                label: "Documentos pendientes",
                n: all.filter((c) => c.status === "Pendiente de documentos")
                  .length,
              },
              {
                label: "En GNP",
                n: all.filter((c) =>
                  ["Ingresado en GNP", "En espera"].includes(c.status),
                ).length,
              },
              {
                label: "Finalizados",
                n: all.filter((c) => c.status === "Finalizado").length,
              },
            ].map((s) => (
              <div className="stat-card" key={s.label}>
                <span className="stat-icon blue">
                  <Activity size={22} />
                </span>
                <div>
                  <span>{s.label}</span>
                  <strong>{s.n}</strong>
                  <small>Indicador simulado</small>
                </div>
              </div>
            ))}
          </div>
          <section className="panel">
            <h2>Seguimiento administrativo</h2>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Referencia</th>
                    <th>Persona ficticia</th>
                    <th>Estado público</th>
                    <th>Último movimiento</th>
                  </tr>
                </thead>
                <tbody>
                  {all.map((c) => (
                    <tr key={c.id}>
                      <td>{c.id.toUpperCase()}</td>
                      <td>{c.insured}</td>
                      <td>
                        <span className="badge blue">
                          {publicStatus(c.status)}
                        </span>
                      </td>
                      <td>{c.updatedAt.slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted">
              Vista de referencia para {role === "hr" ? "RR. HH." : "monitoreo"}
              : no muestra descripción, diagnósticos, notas ni adjuntos.
            </p>
          </section>
        </>
      )}
      {view === "Configuración" && (
        <section className="panel">
          <div className="section-heading">
            <h2>Administración de demostración</h2>
            <span className="badge blue">Versión {config.version}</span>
          </div>
          <div className="tabs">
            {["Usuarios", "Modalidades", "Plantillas", "Datos de prueba"].map(
              (t) => (
                <button
                  className={tab === t ? "active" : ""}
                  onClick={() => setTab(t)}
                  key={t}
                >
                  {t}
                </button>
              ),
            )}
          </div>
          {tab === "Usuarios" && (
            <>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Correo ficticio</th>
                      <th>Perfil</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {config.users.map((u, i) => (
                      <tr key={u.id}>
                        <td>
                          {u.name}
                          <small className="mock-user-id">{u.id}</small>
                        </td>
                        <td>{u.email}</td>
                        <td>
                          <select
                            aria-label={`Perfil de ${u.name}`}
                            value={u.role}
                            onChange={(e) =>
                              setConfig({
                                ...config,
                                users: config.users.map((x, j) =>
                                  i === j
                                    ? { ...x, role: e.target.value as Role }
                                    : x,
                                ),
                              })
                            }
                          >
                            {[
                              "insured",
                              "employee",
                              "hr",
                              "analyst",
                              "approver",
                              "viewer",
                              "admin",
                              "support",
                            ].map((r) => (
                              <option key={r}>{r}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <button
                            className="secondary"
                            onClick={() =>
                              setConfig({
                                ...config,
                                users: config.users.map((x, j) =>
                                  i === j ? { ...x, active: !x.active } : x,
                                ),
                              })
                            }
                          >
                            {u.active ? "Activo" : "Inactivo"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button className="primary" onClick={save}>
                <Save size={16} />
                Guardar cambios
              </button>
              <h3 className="mock-subheading">Asignar expediente</h3>
              <form
                className="inline-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const id = selected["assign-claim"],
                    assignee = selected["assign-user"];
                  if (!id || !assignee) {
                    notify("Selecciona expediente y responsable");
                    return;
                  }
                  mock.persist(
                    mock.mockKeys.claims,
                    all.map((c) => (c.id === id ? { ...c, assignee } : c)),
                  );
                  notify("Asignación simulada guardada");
                  refresh();
                }}
              >
                <label className="field">
                  <span>Expediente</span>
                  <select
                    required
                    value={selected["assign-claim"] || ""}
                    onChange={(e) =>
                      setSelected({
                        ...selected,
                        "assign-claim": e.target.value,
                      })
                    }
                  >
                    <option value="">Seleccionar expediente</option>
                    {all.map((c) => (
                      <option value={c.id} key={c.id}>
                        {c.id} · {c.insured}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Responsable</span>
                  <select
                    required
                    value={selected["assign-user"] || ""}
                    onChange={(e) =>
                      setSelected({
                        ...selected,
                        "assign-user": e.target.value,
                      })
                    }
                  >
                    <option value="">Seleccionar responsable</option>
                    {config.users
                      .filter(
                        (u) =>
                          u.active && ["analyst", "approver"].includes(u.role),
                      )
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                  </select>
                </label>
                <button className="primary">Guardar asignación</button>
              </form>
              <h3 className="mock-subheading">Crear usuario ficticio</h3>
              <form className="inline-form" onSubmit={addUser}>
                <label className="field">
                  <span>Nombre</span>
                  <input
                    required
                    value={user.name}
                    onChange={(e) => setUser({ ...user, name: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Correo de ejemplo</span>
                  <input
                    type="email"
                    required
                    value={user.email}
                    placeholder="persona@example.invalid"
                    onChange={(e) =>
                      setUser({ ...user, email: e.target.value })
                    }
                  />
                </label>
                <label className="field">
                  <span>Perfil</span>
                  <select
                    value={user.role}
                    onChange={(e) =>
                      setUser({ ...user, role: e.target.value as Role })
                    }
                  >
                    {[
                      "insured",
                      "employee",
                      "hr",
                      "analyst",
                      "approver",
                      "viewer",
                      "admin",
                      "support",
                    ].map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </label>
                <button className="primary">
                  <Plus size={16} />
                  Crear
                </button>
              </form>
            </>
          )}
          {tab === "Modalidades" && (
            <>
              <p>
                Habilita las modalidades que aparecerán en el formulario de alta
                de esta demostración.
              </p>
              <div className="catalog-cards">
                {Object.entries(modalities).map(([id, label]) => (
                  <label className="mock-option" key={id}>
                    <ShieldCheck size={25} />
                    <b>{label}</b>
                    <span>
                      <input
                        type="checkbox"
                        checked={config.enabled.includes(id as Modality)}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            enabled: e.target.checked
                              ? [...config.enabled, id as Modality]
                              : config.enabled.filter((x) => x !== id),
                          })
                        }
                      />{" "}
                      Habilitado
                    </span>
                  </label>
                ))}
              </div>
              <button className="primary" onClick={save}>
                <Save size={16} />
                Guardar modalidades
              </button>
              <p className="muted">
                La matriz conserva sus 18 renglones; las condiciones y vigencias
                no se convierten en reglas productivas desde esta simulación.
              </p>
            </>
          )}
          {tab === "Plantillas" && (
            <>
              <div className="form-fields">
                {config.templates.map((t, i) => (
                  <label className="field" key={t.name}>
                    <span>{t.name}</span>
                    <textarea
                      rows={3}
                      maxLength={1000}
                      value={t.body}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          templates: config.templates.map((x, j) =>
                            i === j ? { ...x, body: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <button className="primary" onClick={save}>
                <Save size={16} />
                Guardar plantillas
              </button>
              <p className="muted">
                No se envían mensajes reales. Los eventos de ejemplo se
                consultan en Notificaciones.
              </p>
            </>
          )}
          {tab === "Datos de prueba" && (
            <>
              <h3>Reiniciar demostración</h3>
              <p>
                Restablece expedientes, archivos locales, usuarios, modalidades,
                mensajes y operaciones simuladas de este navegador.
              </p>
              {!confirmReset ? (
                <button
                  className="secondary"
                  onClick={() => setConfirmReset(true)}
                >
                  <RefreshCw size={16} />
                  Reiniciar datos ficticios
                </button>
              ) : (
                <div className="info-banner">
                  <span>
                    Se borrarán los cambios locales de la demostración.
                  </span>
                  <button
                    className="secondary"
                    onClick={async () => {
                      try {
                        await mock.resetMock();
                        setConfig(mock.settings());
                        setConfirmReset(false);
                        refresh();
                        notify("Datos ficticios restablecidos");
                      } catch (e) {
                        notify((e as Error).message);
                      }
                    }}
                  >
                    Confirmar reinicio
                  </button>
                  <button
                    className="text-button"
                    onClick={() => setConfirmReset(false)}
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      )}
      {view === "Notificaciones" && (
        <section className="panel">
          <div className="section-heading">
            <h2>Centro de notificaciones</h2>
            <button
              className="secondary"
              onClick={() => {
                mock.addNotice(
                  "demo-0018",
                  "Entrega de ejemplo con fallo simulado",
                  true,
                );
                refresh();
              }}
            >
              Simular fallo de entrega
            </button>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Mensaje</th>
                  <th>Referencia</th>
                  <th>Canal</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {mock.notices().map((n) => (
                  <tr key={n.id}>
                    <td>
                      {n.subject}
                      <small className="mock-user-id">
                        {new Date(n.at).toLocaleString("es-MX")}
                      </small>
                    </td>
                    <td>{n.claimId}</td>
                    <td>{n.channel}</td>
                    <td>
                      <span
                        className={`badge ${n.state === "FAILED" ? "amber" : "green"}`}
                      >
                        {n.state === "FAILED"
                          ? "Falló (simulado)"
                          : n.state === "READ"
                            ? "Leído"
                            : "Entregado (simulado)"}
                      </span>
                    </td>
                    <td>
                      <button
                        className="secondary"
                        onClick={() => {
                          mock.persist(
                            mock.mockKeys.notifications,
                            mock.notices().map((x) =>
                              x.id === n.id
                                ? {
                                    ...x,
                                    state:
                                      n.state === "FAILED"
                                        ? "DELIVERED"
                                        : "READ",
                                  }
                                : x,
                            ),
                          );
                          refresh();
                        }}
                      >
                        {n.state === "FAILED" ? "Reintentar" : "Marcar leído"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {(view === "Integraciones" || view === "Soporte") && (
        <>
          <section className="panel">
            <div className="section-heading">
              <h2>SICAS · Operaciones simuladas</h2>
              <span className="badge green">Adaptador mock disponible</span>
            </div>
            <p>
              Simula una entrega o un timeout sin enviar información a terceros.
              Los reintentos conservan el expediente.
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Expediente</th>
                    <th>Archivos</th>
                    <th>Estado</th>
                    <th>Simulación</th>
                  </tr>
                </thead>
                <tbody>
                  {all.map((c) => (
                    <tr key={c.id}>
                      <td>{c.id}</td>
                      <td>{c.documents.length}</td>
                      <td>
                        {c.integration === "DELIVERED"
                          ? "Entregado (simulado)"
                          : c.integration === "BLOCKED"
                            ? "Requiere reintento"
                            : "Sin solicitud"}
                      </td>
                      <td>
                        <div className="actions">
                          <button
                            className="secondary"
                            onClick={() => transfer(c.id, false)}
                          >
                            Entrega correcta
                          </button>
                          <button
                            className="secondary"
                            onClick={() => transfer(c.id, true)}
                          >
                            Timeout
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel">
            <h2>Historial de operaciones y acuses</h2>
            {!mock.jobs().length ? (
              <p>
                Aún no hay operaciones. Ejecuta una simulación para consultar su
                resultado.
              </p>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Operación</th>
                      <th>Expediente</th>
                      <th>Intento</th>
                      <th>Acuse / error</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {mock.jobs().map((j) => (
                      <tr key={j.id}>
                        <td>{j.id.slice(0, 8)}</td>
                        <td>{j.claimId}</td>
                        <td>{j.attempt}</td>
                        <td>{j.receipt || j.error}</td>
                        <td>
                          {j.state === "FAILED" && (
                            <button
                              className="secondary"
                              onClick={() => transfer(j.claimId, false)}
                            >
                              <RefreshCw size={14} />
                              Reintentar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="muted">
              La vista de soporte muestra referencias y telemetría ficticias; no
              incluye contenido médico.
            </p>
          </section>
        </>
      )}
      {view === "Conciliación" && (
        <section className="panel">
          <h2>Bandeja de recepción multicanal</h2>
          <p>
            Entradas de correo ficticias. La vinculación exige seleccionar el
            expediente y registrar una justificación.
          </p>
          {mock.inbox().map((entry) => (
            <div className="mock-inbox" key={entry.id}>
              <div className="section-heading">
                <div>
                  <h3>{entry.subject}</h3>
                  <p>
                    {entry.id} · {entry.reference}
                  </p>
                </div>
                <span
                  className={`badge ${entry.state === "PENDING" ? "amber" : "green"}`}
                >
                  {entry.state === "PENDING"
                    ? "Por conciliar"
                    : entry.state === "LINKED"
                      ? "Vinculado"
                      : "Descartado"}
                </span>
              </div>
              {entry.state === "PENDING" ? (
                <form
                  className="inline-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const claimId = selected[entry.id];
                    if (!claimId || !reasons[entry.id]?.trim()) {
                      notify(
                        "Selecciona un expediente e indica la evidencia de vinculación",
                      );
                      return;
                    }
                    mock.persist(
                      mock.mockKeys.inbox,
                      mock.inbox().map((x) =>
                        x.id === entry.id
                          ? {
                              ...x,
                              state: "LINKED",
                              claimId,
                              reason: reasons[entry.id],
                              at: new Date().toISOString(),
                            }
                          : x,
                      ),
                    );
                    notify("Vinculación manual simulada registrada");
                    refresh();
                  }}
                >
                  <label className="field">
                    <span>Expediente verificado</span>
                    <select
                      required
                      value={selected[entry.id] || ""}
                      onChange={(e) =>
                        setSelected({ ...selected, [entry.id]: e.target.value })
                      }
                    >
                      <option value="">Selecciona un expediente</option>
                      {all.map((c) => (
                        <option value={c.id} key={c.id}>
                          {c.id} · {c.insured}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Evidencia / justificación</span>
                    <input
                      required
                      minLength={5}
                      maxLength={500}
                      value={reasons[entry.id] || ""}
                      onChange={(e) =>
                        setReasons({ ...reasons, [entry.id]: e.target.value })
                      }
                    />
                  </label>
                  <button className="primary">Vincular</button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      if (!reasons[entry.id]?.trim()) {
                        notify("Indica el motivo para descartar");
                        return;
                      }
                      mock.persist(
                        mock.mockKeys.inbox,
                        mock.inbox().map((x) =>
                          x.id === entry.id
                            ? {
                                ...x,
                                state: "DISCARDED",
                                reason: reasons[entry.id],
                                at: new Date().toISOString(),
                              }
                            : x,
                        ),
                      );
                      refresh();
                    }}
                  >
                    Descartar con motivo
                  </button>
                </form>
              ) : (
                <p>
                  Expediente: {entry.claimId || "Sin asociación"} · Evidencia:{" "}
                  {entry.reason}
                </p>
              )}
            </div>
          ))}
        </section>
      )}
    </>
  );
}
