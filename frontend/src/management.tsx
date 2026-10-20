import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Plus, Save, Check, Trash2, Edit3, Download } from "lucide-react";
import { PageHead, ErrorBox, Loading, useData, Empty } from "./ui";
import { api, post, put, fmt } from "./api";
import { useApp } from "./main";

export function SettingsPage() {
  const { user, settings, setSettings, setUser } = useApp();
  const navigate = useNavigate();
  const [form, setForm] = useState<any>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const isAdmin = ["ORGANIZATION_ADMIN", "SUPER_ADMIN"].includes(user.role);
  useEffect(() => {
    api("/settings")
      .then(setForm)
      .catch((e) => setError(e.message));
  }, []);
  const change = (key: string, value: any) => {
    setForm({ ...form, [key]: value });
    setSaved(false);
  };
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { organization_name, model, demo_workspace, ...body } = form;
      const r = await put("/settings", body);
      setSettings(r);
      setUser({ ...user, name: r.name });
      setSaved(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHead
        eyebrow="SETTINGS"
        title="Make yourself at home."
        text="A workspace that fits the way you work."
      />
      <ErrorBox error={error} />
      {!form ? (
        <Loading />
      ) : (
        <form onSubmit={submit}>
          <div className="two-cols">
            <section className="panel">
              <h2>Your profile</h2>
              <label>
                Name
                <input
                  value={form.name}
                  required
                  minLength={2}
                  maxLength={100}
                  onChange={(e) => change("name", e.target.value)}
                />
              </label>
              <label>
                Email
                <input disabled value={user.email} />
              </label>
              <label>
                Workspace
                <input disabled value={form.organization_name} />
              </label>
              <p className="muted">
                Role: {user.role.replaceAll("_", " ").toLowerCase()}
              </p>
            </section>
            <section className="panel">
              <h2>Your experience</h2>
              <label>
                Color theme
                <select
                  value={form.theme}
                  onChange={(e) => change("theme", e.target.value)}
                >
                  <option value="dark">Dark · forest at dusk</option>
                  <option value="light">Light · a fresh morning</option>
                </select>
              </label>
              {[
                [
                  "performance",
                  "Performance mode",
                  "Use a lightweight plate illustration instead of WebGL.",
                ],
                [
                  "reduce_motion",
                  "Reduce motion",
                  "Keep transitions and the 3D scene still.",
                ],
                [
                  "notifications",
                  "Dashboard notifications",
                  "Show an alert indicator when unread alerts are available.",
                ],
              ].map(([key, label, text]) => (
                <label className="toggle-row" key={key}>
                  <span>
                    <strong>{label}</strong>
                    <small>{text}</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={form[key]}
                    onChange={(e) => change(key, e.target.checked)}
                  />
                </label>
              ))}
            </section>
          </div>
          <section className="panel">
            <h2>Workspace intelligence</h2>
            <p>
              {isAdmin
                ? "These thresholds apply to your organization."
                : "Your administrator manages these workspace thresholds."}
            </p>
            <div className="form-grid">
              <label>
                Review confidence threshold (0–1)
                <input
                  type="number"
                  min=".1"
                  max="1"
                  step=".05"
                  disabled={!isAdmin}
                  value={form.confidence_threshold}
                  onChange={(e) =>
                    change("confidence_threshold", Number(e.target.value))
                  }
                />
              </label>
              <label>
                High waste alert threshold (%)
                <input
                  type="number"
                  min="1"
                  max="100"
                  disabled={!isAdmin}
                  value={form.waste_threshold}
                  onChange={(e) =>
                    change("waste_threshold", Number(e.target.value))
                  }
                />
              </label>
            </div>
            <div className="notice">
              Vision mode: {form.model}. Confidence is a heuristic quality
              score. Trained model configuration is managed on the server.
            </div>
          </section>
          <button className="button" disabled={busy}>
            {saved ? <Check size={17} /> : <Save size={17} />}{" "}
            {busy ? "Saving…" : saved ? "Settings saved" : "Save settings"}
          </button>
          <button
            type="button"
            className="button secondary settings-logout"
            onClick={async () => {
              try {
                await post("/auth/logout");
                setUser(null);
                navigate("/login", { replace: true });
              } catch (e: any) {
                setError(e.message);
              }
            }}
          >
            Logout
          </button>
        </form>
      )}
    </>
  );
}

export function AdminPage() {
  const { user } = useApp();
  const [tab, setTab] = useState("System Overview");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [food, setFood] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const foods = useData("/foods");
  const locations = useData("/locations");
  const cafes = useData("/cafeterias");
  const users = useData("/admin/users");
  const organizations = useData(
    user.role === "SUPER_ADMIN" ? "/admin/organizations" : "/cafeterias",
  );
  const tabs = [
    "System Overview",
    "Foods",
    "Locations",
    "People",
    ...(user.role === "SUPER_ADMIN"
      ? ["Organizations", "Model & dataset", "Audit log"]
      : []),
  ];
  async function act(fn: () => Promise<any>, reload?: () => void) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      reload?.();
      setMessage("Changes saved.");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHead
        eyebrow="ADMINISTRATION"
        title="Thoughtful systems. Better outcomes."
        text="Manage the people, places and assumptions behind your insights."
      />
      <div className="tabs">
        {tabs.map((t) => (
          <button
            className={tab === t ? "active" : ""}
            onClick={() => {
              setTab(t);
              setMessage("");
              setError("");
            }}
            key={t}
          >
            {t}
          </button>
        ))}
      </div>
      <ErrorBox
        error={
          error || foods.error || locations.error || cafes.error || users.error
        }
      />
      {message && (
        <div className="success" role="status">
          {message}
        </div>
      )}
      {tab === "System Overview" && (
        <section className="admin-overview">
          <div>
            <span className="eyebrow">
              CONTROL CENTER / {user.role.replaceAll("_", " ")}
            </span>
            <h2>
              Keep the system
              <br />
              <em>working thoughtfully.</em>
            </h2>
            <p>
              People, places, models, and the assumptions behind every estimate.
            </p>
            <Link className="button secondary small" to="/settings">
              System preferences
            </Link>
          </div>
          <div className="admin-counts">
            {[
              [users.data?.length || 0, "Accessible users"],
              [cafes.data?.length || 0, "Workspace cafeterias"],
              [locations.data?.length || 0, "Workspace locations"],
              [foods.data?.length || 0, "Active food categories"],
            ].map(([value, label]) => (
              <article key={label}>
                <strong>{value}</strong>
                <span>{label}</span>
              </article>
            ))}
          </div>
        </section>
      )}
      {tab === "Foods" && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Food & portion library</h2>
              <p>
                Costs are per kg in INR. Archived foods remain in historical
                records.
              </p>
            </div>
            <button
              className="button small"
              onClick={() =>
                setFood({
                  name: "",
                  category: "Other",
                  standard_portion: 200,
                  cost_per_kg: 0,
                  impact_factor: {},
                })
              }
            >
              <Plus size={16} />
              Add food
            </button>
          </div>
          {food && (
            <FoodForm
              food={food}
              onCancel={() => setFood(null)}
              onSave={async (data: any) => {
                await act(async () => {
                  if (food.id) await put("/foods/" + food.id, data);
                  else await post("/foods", data);
                  setFood(null);
                }, foods.reload);
              }}
            />
          )}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Food</th>
                  <th>Category</th>
                  <th>Standard portion</th>
                  <th>Cost / kg</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {foods.data?.map((f: any) => (
                  <tr key={f.id}>
                    <td>
                      <strong>{f.name}</strong>
                    </td>
                    <td>{f.category}</td>
                    <td>{fmt(f.standard_portion)} g</td>
                    <td>₹{fmt(f.cost_per_kg, 2)}</td>
                    <td>
                      <div className="row">
                        <button
                          className="icon-button"
                          aria-label={"Edit " + f.name}
                          onClick={() => setFood(f)}
                        >
                          <Edit3 size={16} />
                        </button>
                        <button
                          className="icon-button"
                          disabled={busy}
                          aria-label={"Archive " + f.name}
                          onClick={() =>
                            act(
                              () => api("/foods/" + f.id, { method: "DELETE" }),
                              foods.reload,
                            )
                          }
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {tab === "Locations" && (
        <div className="two-cols">
          <section className="panel">
            <h2>Cafeterias</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const name = new FormData(form).get("name");
                act(async () => {
                  await post("/cafeterias", { name });
                  form.reset();
                }, cafes.reload);
              }}
            >
              <label>
                New cafeteria
                <input name="name" required minLength={2} maxLength={120} />
              </label>
              <button className="button small" disabled={busy}>
                <Plus size={16} />
                Add cafeteria
              </button>
            </form>
            {cafes.data?.map((c: any) => (
              <div className="stat-row" key={c.id}>
                <strong>{c.name}</strong>
                <small>#{c.id}</small>
              </div>
            ))}
          </section>
          <section className="panel">
            <h2>Dining locations</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const d = Object.fromEntries(new FormData(form));
                act(async () => {
                  await post("/locations", {
                    name: d.name,
                    cafeteria_id: d.cafeteria_id
                      ? Number(d.cafeteria_id)
                      : null,
                  });
                  form.reset();
                }, locations.reload);
              }}
            >
              <label>
                Location name
                <input name="name" required minLength={2} maxLength={120} />
              </label>
              <label>
                Cafeteria
                <select name="cafeteria_id">
                  <option value="">Unassigned</option>
                  {cafes.data?.map((c: any) => (
                    <option value={c.id} key={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <button className="button small" disabled={busy}>
                <Plus size={16} />
                Add location
              </button>
            </form>
            {locations.data?.map((l: any) => (
              <div className="stat-row" key={l.id}>
                <strong>{l.name}</strong>
                <small>
                  {cafes.data?.find((c: any) => c.id === l.cafeteria_id)
                    ?.name || "Unassigned"}
                </small>
              </div>
            ))}
          </section>
        </div>
      )}
      {tab === "People" && (
        <section className="panel">
          <h2>Your workspace team</h2>
          <p>
            Create a member account with an initial password. They can reset it
            through the password recovery flow.
          </p>
          <form
            className="member-form"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const d = Object.fromEntries(new FormData(form));
              act(async () => {
                await post("/admin/users", {
                  ...d,
                  organization_id: d.organization_id
                    ? Number(d.organization_id)
                    : null,
                  cafeteria_id: d.cafeteria_id ? Number(d.cafeteria_id) : null,
                });
                form.reset();
              }, users.reload);
            }}
          >
            <div className="form-grid">
              <label>
                Name
                <input name="name" required minLength={2} />
              </label>
              <label>
                Email
                <input name="email" type="email" required />
              </label>
              {user.role === "SUPER_ADMIN" && (
                <label>
                  Organization
                  <select
                    name="organization_id"
                    defaultValue={user.organization_id}
                  >
                    {organizations.data?.map((o: any) => (
                      <option value={o.id} key={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Initial password
                <input
                  name="password"
                  type="password"
                  required
                  minLength={10}
                  maxLength={128}
                />
              </label>
              <label>
                Role
                <select name="role">
                  <option value="USER">User</option>
                  <option value="CAFETERIA_MANAGER">Cafeteria manager</option>
                  <option value="ORGANIZATION_ADMIN">
                    Organization administrator
                  </option>
                </select>
              </label>
              <label>
                Assigned cafeteria
                <select name="cafeteria_id">
                  <option value="">Unassigned</option>
                  {cafes.data?.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button className="button small" disabled={busy}>
              <Plus size={16} />
              Create member
            </button>
          </form>
          {users.data?.map((u: any) => (
            <div className="member-row" key={u.id}>
              <div>
                <strong>{u.name}</strong>
                <small>
                  {u.email} · organization #{u.organization_id}
                </small>
              </div>
              <label className="visually-labeled">
                Role
                <select
                  aria-label={"Role for " + u.name}
                  disabled={u.id === user.id || busy}
                  value={u.role}
                  onChange={(e) =>
                    act(
                      () =>
                        put("/admin/users/" + u.id, {
                          role: e.target.value,
                          cafeteria_id: u.cafeteria_id,
                        }),
                      users.reload,
                    )
                  }
                >
                  {[
                    "USER",
                    "CAFETERIA_MANAGER",
                    "ORGANIZATION_ADMIN",
                    ...(user.role === "SUPER_ADMIN" ? ["SUPER_ADMIN"] : []),
                  ].map((role) => (
                    <option value={role} key={role}>
                      {role.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
              <select
                aria-label={"Cafeteria for " + u.name}
                disabled={u.id === user.id || busy}
                value={u.cafeteria_id || ""}
                onChange={(e) =>
                  act(
                    () =>
                      put("/admin/users/" + u.id, {
                        role: u.role,
                        cafeteria_id: e.target.value
                          ? Number(e.target.value)
                          : null,
                      }),
                    users.reload,
                  )
                }
              >
                <option value="">No cafeteria</option>
                {cafes.data?.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </section>
      )}
      {tab === "Organizations" && <Organizations act={act} busy={busy} />}{" "}
      {tab === "Model & dataset" && <SystemData kind="model" />}
      {tab === "Audit log" && <SystemData kind="audit" />}
    </>
  );
}

function FoodForm({ food, onSave, onCancel }: any) {
  const [form, setForm] = useState(food);
  const [impact, setImpact] = useState(
    JSON.stringify(food.impact_factor || {}, null, 2),
  );
  const [error, setError] = useState("");
  useEffect(() => {
    setForm(food);
    setImpact(JSON.stringify(food.impact_factor || {}, null, 2));
  }, [food]);
  return (
    <form
      className="food-form"
      onSubmit={(e) => {
        e.preventDefault();
        try {
          const impact_factor = JSON.parse(impact);
          setError("");
          onSave({
            name: form.name,
            category: form.category,
            standard_portion: Number(form.standard_portion),
            cost_per_kg: Number(form.cost_per_kg),
            impact_factor,
          });
        } catch {
          setError("Impact factors must be valid JSON.");
        }
      }}
    >
      <div className="form-grid">
        {[
          ["name", "Food name", "text"],
          ["category", "Category", "text"],
          ["standard_portion", "Standard portion (g)", "number"],
          ["cost_per_kg", "Cost per kg (INR)", "number"],
        ].map(([key, label, type]) => (
          <label key={key}>
            {label}
            <input
              required
              type={type}
              min={key === "standard_portion" ? 1 : 0}
              max={type === "number" ? 1000000 : undefined}
              step={type === "number" ? ".01" : undefined}
              value={form[key]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
            />
          </label>
        ))}
      </div>
      <label>
        Environmental factors (JSON)
        <textarea
          value={impact}
          onChange={(e) => setImpact(e.target.value)}
          rows={4}
        />
        <small>
          Optional co2e, water, economic keys. Each requires value, unit, source
          and version. Example structure:{" "}
          {
            '{"co2e":{"value":0,"unit":"kg CO2e/kg food","source":"your verified source","version":"YYYY-MM-DD"}}'
          }
          . Leave empty {"{}"} until sourced.
        </small>
      </label>
      <ErrorBox error={error} />
      <div className="row">
        <button className="button small">
          <Save size={16} />
          Save food
        </button>
        <button
          type="button"
          className="button secondary small"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
function Organizations({ act, busy }: any) {
  const { data, error, reload } = useData("/admin/organizations");
  return (
    <section className="panel">
      <h2>Organizations</h2>
      <ErrorBox error={error} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const name = new FormData(form).get("name");
          act(async () => {
            await post("/admin/organizations", { name });
            form.reset();
          }, reload);
        }}
      >
        <label>
          Organization name
          <input name="name" required minLength={2} maxLength={120} />
        </label>
        <button className="button small" disabled={busy}>
          <Plus size={16} />
          Create organization
        </button>
      </form>
      {data?.map((o: any) => (
        <div className="stat-row" key={o.id}>
          <strong>{o.name}</strong>
          <small>
            #{o.id} · {new Date(o.created_at).toLocaleDateString()}
          </small>
        </div>
      ))}
    </section>
  );
}
function SystemData({ kind }: { kind: string }) {
  const { data, error } = useData("/admin/" + kind);
  const corrections = useData("/admin/corrections");
  function download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(corrections.data, null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "second-serve-correction-dataset.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="panel">
      <ErrorBox error={error || corrections.error} />
      {kind === "model" ? (
        <>
          <h2>Vision model & review dataset</h2>
          {data && (
            <>
              <p>
                <strong>Active method:</strong> {data.method}
              </p>
              <p>{data.configuration}</p>
            </>
          )}
          <p>
            Correction exports contain original predictions, corrected labels,
            quantities, polygon masks, reviewer IDs and timestamps.
          </p>
          <button
            className="button secondary"
            disabled={!corrections.data}
            onClick={download}
          >
            <Download size={16} />
            Export correction dataset ({corrections.data?.length || 0})
          </button>
          <p className="muted">
            Train and validate a food segmentation model on licensed,
            representative images before configuring YOLO_MODEL_PATH.
          </p>
          <p className="muted">{data?.evaluation_note}</p>
          {data?.runs?.length > 0 && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Model</th>
                    <th>Dataset</th>
                    <th>Stage</th>
                    <th>Observed metrics</th>
                  </tr>
                </thead>
                <tbody>
                  {data.runs.map((run: any) => (
                    <tr key={run.id}>
                      <td>
                        {run.name} · {run.version}
                      </td>
                      <td>{run.dataset_version}</td>
                      <td>
                        {run.stage} / {run.status}
                      </td>
                      <td>
                        <code>{JSON.stringify(run.metrics)}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <>
          <h2>Audit trail</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {data?.map((a: any) => (
                  <tr key={a.id}>
                    <td>{new Date(a.created_at).toLocaleString()}</td>
                    <td>#{a.user_id}</td>
                    <td>{a.action}</td>
                    <td>
                      <code>{JSON.stringify(a.detail)}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
