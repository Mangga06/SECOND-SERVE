import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
} from "recharts";
import {
  ArrowUpRight,
  ArrowDownToLine,
  ScanLine,
  Leaf,
  Utensils,
  Scale,
  Coins,
  Bell,
  Check,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
} from "lucide-react";
import { motion } from "framer-motion";
import { PageHead, useData, Empty, Loading, ErrorBox, PlateView } from "./ui";
import { fmt, put } from "./api";
import { useApp } from "./main";

export function Metrics({ data }: any) {
  return (
    <div className="metrics">
      {[
        [Utensils, "Meals analyzed", fmt(data.meals), "recorded & saved"],
        [
          Scale,
          "Estimated food waste",
          fmt(data.wasted / 1000, 2) + " kg",
          "remaining on recorded plates",
        ],
        [
          Leaf,
          "Overall waste",
          fmt(data.waste_percentage, 1) + "%",
          "weighted by estimated serving",
        ],
        [
          Coins,
          "Estimated value wasted",
          "₹" + fmt(data.cost, 2),
          data.uncalibrated_cost_items
            ? "Some food costs are unconfigured"
            : "at configured food costs",
        ],
      ].map(([Icon, label, value, note]: any, i) => (
        <motion.article
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.06 }}
          className="metric"
          key={label}
        >
          <div>
            <span>{label}</span>
            <Icon size={18} />
          </div>
          <strong>{value}</strong>
          <small>{note}</small>
        </motion.article>
      ))}
    </div>
  );
}
export function TrendChart({ data, compare = false }: any) {
  return data.length ? (
    <div className="chart">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#bce391" stopOpacity={0.28} />
              <stop offset="100%" stopColor="#bce391" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fill: "var(--muted)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            unit="%"
            tick={{ fill: "var(--muted)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            domain={[0, 100]}
          />
          <Tooltip
            contentStyle={{
              background: "var(--panel)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              color: "var(--text)",
            }}
          />
          {compare && (
            <Area
              dataKey="previous_waste_percentage"
              name="Previous period waste %"
              stroke="#d2ab73"
              fill="none"
              strokeDasharray="5 5"
              strokeWidth={1.5}
            />
          )}
          <Area
            dataKey="waste_percentage"
            name="Estimated waste %"
            stroke="#a2cb75"
            strokeWidth={2.5}
            fill="url(#chartFill)"
            type="monotone"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  ) : (
    <Empty
      title="Your trend starts with a plate."
      text="Save a non-demo analysis to see your waste trend."
    />
  );
}
function FoodBars({ foods }: any) {
  const sorted = [...foods].sort((a, b) => b.wasted - a.wasted).slice(0, 6);
  return sorted.length ? (
    <div className="food-bars">
      {sorted.map((f: any, i: number) => (
        <div key={f.name}>
          <div className="between">
            <Link to={"/history?food=" + encodeURIComponent(f.name)}>
              <i className={"food-dot dot-" + i} />
              {f.name} <ArrowUpRight size={12} />
            </Link>
            <strong>{fmt(f.wasted)} g</strong>
          </div>
          <div className="bar-track">
            <div
              style={{
                width: `${(f.wasted / Math.max(1, sorted[0].wasted)) * 100}%`,
              }}
            />
          </div>
          <small>
            {fmt(f.waste_percentage, 1)}% of recorded serving remains
          </small>
        </div>
      ))}
    </div>
  ) : (
    <Empty
      title="Nothing recorded yet."
      text="Food breakdowns appear after you save an analysis."
      action={false}
    />
  );
}
export function MealList({ items }: any) {
  return items.length ? (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Meal</th>
            <th>Recorded</th>
            <th>Est. served</th>
            <th>Est. waste</th>
            <th>Review</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((m: any) => (
            <tr key={m.id}>
              <td>
                <strong>{m.meal_type}</strong>
                {m.demo && <span className="badge">Demo</span>}
              </td>
              <td>{new Date(m.created_at).toLocaleDateString()}</td>
              <td>{fmt(m.total_served)} g</td>
              <td>
                <span className={m.waste_percentage > 30 ? "amber" : "green"}>
                  {fmt(m.waste_percentage, 1)}%
                </span>
              </td>
              <td>
                <span className={"status " + (m.verified ? "verified" : "")}>
                  {m.status === "failed"
                    ? "Failed"
                    : m.status !== "complete"
                      ? "Processing"
                      : m.verified
                        ? "Verified"
                        : "Needs review"}
                </span>
                {!m.saved && <small className="muted"> Unsaved</small>}
              </td>
              <td>
                <Link
                  className="icon-button"
                  to={"/analysis/" + m.id}
                  aria-label={"Open " + m.meal_type + " analysis"}
                >
                  <ArrowUpRight size={18} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty />
  );
}

export function Dashboard() {
  const { user, settings } = useApp();
  const [days, setDays] = useState("30");
  const [demoOverride, setDemoOverride] = useState<boolean | undefined>(
    undefined,
  );
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [compare, setCompare] = useState(false);
  const demo = demoOverride ?? !!settings.demo_workspace;
  const end =
    days === "custom"
      ? customEnd || new Date().toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
  const from = new Date();
  from.setDate(from.getDate() - Number(days === "custom" ? 30 : days) + 1);
  const start =
    days === "custom"
      ? customStart || from.toISOString().slice(0, 10)
      : from.toISOString().slice(0, 10);
  const { data, error } = useData(
    `/analytics/all?start=${start}&end=${end}&include_demo=${demo}`,
  );
  const history = useData("/history");
  const alerts = useData("/alerts");
  const nutrition = useData(
    `/fit/overview?days=${days === "custom" ? 30 : days}&include_demo=${demo}`,
  );
  const role =
    user.role === "USER"
      ? "YOUR SECOND SERVE JOURNEY"
      : user.role === "CAFETERIA_MANAGER"
        ? "CAFETERIA OPERATIONS"
        : user.role === "SUPER_ADMIN"
          ? "PLATFORM INTELLIGENCE"
          : "ORGANIZATION INTELLIGENCE";
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const portions = data?.foods.map((f: any, i: number) => ({
    label: f.name,
    initial_quantity: f.served,
    remaining_quantity: f.wasted,
    confidence: 0,
    geometry: {
      centroid: [
        0.5 + Math.cos(i * 2.4) * 0.25,
        0.5 + Math.sin(i * 2.4) * 0.25,
      ],
    },
  }));
  const [foodIndex, setFoodIndex] = useState(0);
  const selected = data?.foods[foodIndex];
  return (
    <>
      <div className="workspace-context">
        <span>
          <span className="live-dot" />
          {settings.organization_name || "Your workspace"}
        </span>
        <span>
          {new Date().toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </span>
      </div>
      <section className="dashboard-spatial-hero">
        <div className="dashboard-greeting">
          <span className="eyebrow">{role}</span>
          <h1>
            {greeting},<br />
            <em>{user.name.split(" ")[0]}.</em>
          </h1>
          <p>
            Let’s give today’s plates
            <br />a second chance.
          </p>
          <Link className="button" to="/analyze">
            <ScanLine size={17} />
            Analyze a new meal <ArrowUpRight size={17} />
          </Link>
          <span className="hero-data-note">
            {demo
              ? "DEMO WORKSPACE · SYNTHETIC MEAL RECORDS"
              : "YOUR RECORDED MEALS · TRANSPARENT ESTIMATES"}
          </span>
        </div>
        <div className="dashboard-data-scene">
          <div className="scene-crosshair crosshair-tl" />
          <div className="scene-crosshair crosshair-br" />
          <div className="scene-heading">
            <span>PLATE INTELLIGENCE</span>
            <span className="live-dot" />
          </div>
          <PlateView
            foods={portions || []}
            remaining
            settings={settings}
            selected={foodIndex}
            onSelect={setFoodIndex}
            stage="Waste"
          />
          {selected ? (
            <div className="scene-data-label">
              <span>{selected.name}</span>
              <strong>
                {fmt(selected.wasted)}
                <small>g estimated remaining</small>
              </strong>
            </div>
          ) : (
            <div className="scene-data-label">
              <span>Your data belongs here</span>
              <small>
                Analyze your first plate to bring this scene to life.
              </small>
            </div>
          )}
          <div className="scene-bottom-label">
            <span>3D AGGREGATE PORTIONS</span>
            <span>DRAG TO ROTATE · SELECT A REGION</span>
          </div>
        </div>
        <div className="hero-side-stat">
          <span className="eyebrow">THE BIGGER PICTURE</span>
          <strong>
            {fmt(data?.overview.waste_percentage, 1)}
            <i>%</i>
          </strong>
          <p>
            of recorded serving
            <br />
            remains on the plate.
          </p>
          <div className="mini-stat">
            <span>Inferred consumed</span>
            <b>{fmt((data?.overview.consumed || 0) / 1000, 2)} kg</b>
          </div>
          <small>
            Estimated from image regions.
            <br />
            Not proof of consumption or savings.
          </small>
        </div>
      </section>
      <div className="dashboard-controls">
        <div className="segmented-control">
          {[
            ["7", "7 days"],
            ["30", "30 days"],
            ["90", "90 days"],
            ["custom", "Custom"],
          ].map(([v, label]) => (
            <button
              className={v === days ? "active" : ""}
              key={v}
              onClick={() => setDays(v)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={demo}
            onChange={(e) => setDemoOverride(e.target.checked)}
          />
          Include labeled demo data
        </label>
      </div>
      {days === "custom" && (
        <div className="filters">
          <label>
            From
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
            />
          </label>
        </div>
      )}
      <ErrorBox error={error} />
      {!data ? (
        <Loading />
      ) : (
        <>
          <Metrics data={data.overview} />
          <section className="nutrition-ledger panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">MEAL NUTRITION / ESTIMATED</span>
                <h2>From portions to nourishment.</h2>
                <p>
                  Only foods mapped to your configured nutrition database
                  contribute to these totals.
                </p>
              </div>
              <Link className="text-link" to="/fit">
                Open nutrition intelligence <ArrowUpRight size={15} />
              </Link>
            </div>
            <div className="ledger-values">
              {[
                ["Calories", "calories_kcal", "kcal"],
                ["Protein", "protein_g", "g"],
                ["Carbohydrates", "carbs_g", "g"],
                ["Fat", "fat_g", "g"],
              ].map(([label, key, unit]) => {
                const item = nutrition.data?.nutrition?.totals?.[key];
                return (
                  <article key={key}>
                    <span>{label}</span>
                    <strong>
                      {fmt(item?.consumed || 0, 1)} <small>{unit}</small>
                    </strong>
                    <em>
                      {fmt(item?.remaining || 0, 1)} {unit} remaining
                    </em>
                  </article>
                );
              })}
            </div>
          </section>
          <div className="intelligence-grid">
            <section className="panel trend-panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">01 / FOLLOW THE PATTERN</span>
                  <h2>A clearer picture over time.</h2>
                  <p>Estimated plate waste for the selected period</p>
                </div>
                <label className="check chart-compare">
                  <input
                    type="checkbox"
                    checked={compare}
                    onChange={(e) => setCompare(e.target.checked)}
                  />
                  Previous period
                </label>
              </div>
              <TrendChart data={data.trends} compare={compare} />
              <div className="chart-foot">
                <span className="live-dot" />
                Current period
                {compare && (
                  <>
                    <span className="legend-amber" />
                    Previous period, aligned by interval
                  </>
                )}
                <Link className="text-link" to="/analytics">
                  Explore analytics <ArrowUpRight size={14} />
                </Link>
              </div>
            </section>
            <section className="panel insight-panel">
              <span className="eyebrow">
                <Leaf size={14} /> FROM PATTERN TO POSSIBILITY
              </span>
              <h2>
                A little food
                <br />
                <em>for thought.</em>
              </h2>
              {data.insights.slice(0, 2).map((s: string) => (
                <p className="insight-text" key={s}>
                  {s}
                </p>
              ))}
              <Link className="text-link green" to="/insights">
                Your personal insights <ArrowUpRight size={16} />
              </Link>
            </section>
          </div>
          <div className="two-cols">
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">02 / UNDERSTAND THE PORTIONS</span>
                  <h2>What’s left behind.</h2>
                </div>
                <span className="subtle-icon">
                  <Utensils size={19} />
                </span>
              </div>
              <FoodBars foods={data.foods} />
            </section>
            <section className="panel">
              <span className="eyebrow">03 / YOUR NEXT SMALL CHANGE</span>
              <h2>From insight to intention.</h2>
              {data.recommendations.length ? (
                data.recommendations.slice(0, 3).map((r: any) => (
                  <div className="recommendation" key={r.food}>
                    <strong>
                      Try {r.low}–{r.high} g of {r.food}
                    </strong>
                    <p>
                      Current average: {r.current} g · {r.sample_count} recorded
                      regions
                    </p>
                    <small>{r.label}</small>
                  </div>
                ))
              ) : (
                <Empty
                  title="A few more plates, a clearer pattern."
                  text="Recommendations need at least three recorded regions per food and a measurable waste pattern."
                  action={false}
                />
              )}
            </section>
          </div>
          {user.role !== "USER" && (
            <div className="two-cols">
              <section className="panel">
                <span className="eyebrow">OPERATIONAL PERSPECTIVE</span>
                <h2>
                  {user.role === "CAFETERIA_MANAGER"
                    ? "Dining location performance"
                    : "Cafeteria & location comparison"}
                </h2>
                {data.locations.map((l: any) => (
                  <div className="stat-row" key={l.name}>
                    <div>
                      <strong>{l.name}</strong>
                      <small>
                        {l.meals} meals · ₹{fmt(l.cost, 2)} estimated value
                        wasted
                      </small>
                    </div>
                    <strong>{fmt(l.waste_percentage, 1)}%</strong>
                  </div>
                ))}
                {!data.locations.length && <Empty action={false} />}
              </section>
              <section className="panel">
                <span className="eyebrow">ATTENTION, WHERE IT MATTERS</span>
                <h2>Recent operational alerts</h2>
                {alerts.data?.slice(0, 4).map((a: any) => (
                  <Link
                    className="operation-alert"
                    key={a.id}
                    to={"/analysis/" + a.meal_analysis_id}
                  >
                    <Bell size={16} />
                    <span>{a.message}</span>
                    <ArrowUpRight size={15} />
                  </Link>
                ))}
                {!alerts.data?.length && (
                  <Empty title="No threshold alerts." action={false} />
                )}
                <Link className="text-link green" to="/alerts">
                  Review all alerts <ArrowUpRight size={16} />
                </Link>
              </section>
            </div>
          )}
          <section className="panel recent">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">YOUR RECORD OF EVERYDAY CHOICES</span>
                <h2>Recent plates.</h2>
              </div>
              <Link className="text-link" to="/history">
                View all history <ArrowUpRight size={15} />
              </Link>
            </div>
            <ErrorBox error={history.error} />
            {history.data && (
              <MealList items={history.data.items.slice(0, 5)} />
            )}
          </section>
        </>
      )}
    </>
  );
}

export function InsightsPage() {
  const { settings } = useApp();
  const { data, error } = useData(
    "/analytics/all?include_demo=" + !!settings.demo_workspace,
  );
  return (
    <>
      <PageHead
        eyebrow="INSIGHTS / FROM OBSERVATION TO INTENTION"
        title="Make your next plate a little wiser."
        text="Patterns drawn from your saved records, with the evidence kept in view."
      />
      <ErrorBox error={error} />
      {!data ? (
        <Loading />
      ) : (
        <>
          <section className="insights-editorial">
            <span className="eyebrow">
              {settings.demo_workspace
                ? "DEMO RECORDS INCLUDED"
                : "YOUR RECORDED PERSPECTIVE"}
            </span>
            <h2>
              Small observations.
              <br />
              <em>More thoughtful choices.</em>
            </h2>
            {data.insights.map((text: string, i: number) => (
              <article key={text}>
                <span>0{i + 1}</span>
                <p>{text}</p>
              </article>
            ))}
          </section>
          <section className="panel">
            <h2>Experimental serving recommendations</h2>
            <p>
              These are operational trials based on observed waste, not
              nutritional advice.
            </p>
            <div className="role-grid">
              {data.recommendations.map((r: any) => (
                <div className="recommendation" key={r.food}>
                  <span className="eyebrow">{r.food}</span>
                  <h2>
                    {r.low}–{r.high} g
                  </h2>
                  <p>
                    Current average {r.current} g · {r.sample_count} recorded
                    regions
                  </p>
                  <small>{r.label}</small>
                  <Link
                    className="text-link green"
                    to={"/history?food=" + encodeURIComponent(r.food)}
                  >
                    Review source meals <ArrowUpRight size={14} />
                  </Link>
                </div>
              ))}
            </div>
            {!data.recommendations.length && (
              <Empty
                title="Let the evidence build."
                text="Three or more observations per food help identify a useful serving experiment."
              />
            )}
          </section>
        </>
      )}
    </>
  );
}

function DateFilters({ start, end, setStart, setEnd, demo, setDemo }: any) {
  return (
    <div className="filters">
      <label>
        From
        <input
          aria-label="From date"
          type="date"
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
      </label>
      <label>
        To
        <input
          aria-label="To date"
          type="date"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
        />
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={demo}
          onChange={(e) => setDemo(e.target.checked)}
        />
        Include labeled demo data
      </label>
    </div>
  );
}
export function Analytics() {
  const { settings } = useApp();
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [demo, setDemo] = useState(!!settings.demo_workspace);
  const [period, setPeriod] = useState("daily");
  const { data, error } = useData(
    `/analytics/all?start=${start || "2000-01-01"}&end=${end || "2100-01-01"}&include_demo=${demo}&period=${period}`,
  );
  return (
    <>
      <PageHead
        eyebrow="WASTE INTELLIGENCE"
        title="See the patterns. Shape the change."
        text="Recorded evidence for more thoughtful portions and operations."
      />
      <DateFilters {...{ start, end, setStart, setEnd, demo, setDemo }} />
      <ErrorBox error={error} />
      {!data ? (
        <Loading />
      ) : (
        <>
          <Metrics data={data.overview} />
          <section className="panel">
            <div className="panel-heading">
              <h2>Waste over time</h2>
              <select
                aria-label="Trend interval"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <TrendChart data={data.trends} />
          </section>
          <div className="two-cols">
            <section className="panel">
              <h2>Food comparison</h2>
              <FoodBars foods={data.foods} />
            </section>
            <section className="panel">
              <h2>Meal-time perspective</h2>
              {data.meal_time.length ? (
                <div className="chart">
                  <ResponsiveContainer>
                    <BarChart data={data.meal_time}>
                      <CartesianGrid stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="name" tick={{ fill: "var(--muted)" }} />
                      <YAxis
                        domain={[0, 100]}
                        unit="%"
                        tick={{ fill: "var(--muted)" }}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "var(--panel)",
                          border: "1px solid var(--border)",
                        }}
                      />
                      <Bar
                        dataKey="waste_percentage"
                        name="Estimated waste %"
                        fill="#a2cb75"
                        radius={[6, 6, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <Empty action={false} title="No meal-time data yet." />
              )}
            </section>
          </div>
          <div className="two-cols">
            {["locations", "cafeterias"].map((key) => (
              <section className="panel" key={key}>
                <h2>
                  {key === "locations"
                    ? "Location comparison"
                    : "Cafeteria comparison"}
                </h2>
                {data[key].length ? (
                  data[key].map((r: any) => (
                    <div className="stat-row" key={r.name}>
                      <div>
                        <strong>{r.name}</strong>
                        <small>
                          {r.meals} meals · ₹{fmt(r.cost, 2)} estimated value
                        </small>
                      </div>
                      <strong>{fmt(r.waste_percentage, 1)}%</strong>
                    </div>
                  ))
                ) : (
                  <Empty title="No records yet." action={false} />
                )}
              </section>
            ))}
          </div>
          <section className="panel">
            <h2>Estimated environmental impact</h2>
            <p>
              Only configured factors are used. Results inherit the source, unit
              and version of each factor.
            </p>
            {data.impacts?.length ? (
              data.impacts.map((f: any, i: number) => (
                <div className="stat-row" key={i}>
                  <div>
                    <strong>
                      {f.kind.toUpperCase()} · {fmt(f.value, 2)} {f.unit}
                    </strong>
                    <small>
                      {f.source} · {f.version}
                    </small>
                  </div>
                </div>
              ))
            ) : (
              <p>
                No sourced impact factors are configured for these food records.
              </p>
            )}
          </section>
          <section className="panel">
            <h2>Insights & experimental recommendations</h2>
            {data.insights.map((s: string) => (
              <p key={s}>{s}</p>
            ))}
            <div className="role-grid">
              {data.recommendations.map((r: any) => (
                <div className="recommendation" key={r.food}>
                  <h3>{r.food}</h3>
                  <strong>
                    {r.low}–{r.high} g
                  </strong>
                  <p>
                    Suggested trial range · current average {r.current} g ·{" "}
                    {r.sample_count} observations
                  </p>
                  <small>{r.label}</small>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </>
  );
}

export function HistoryPage() {
  const [params] = useSearchParams();
  const [filters, setFilters] = useState({
    search: "",
    meal_type: "",
    food: params.get("food") || "",
    location_id: "",
    min_waste: "0",
    confidence: "0",
    sort: "newest",
    start: "",
    end: "",
    page: "1",
  });
  const locations = useData("/locations");
  const query = new URLSearchParams(
    Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== "")),
  ).toString();
  const { data, error } = useData("/history?" + query);
  function set(k: string, v: string) {
    setFilters({ ...filters, [k]: v, page: k === "page" ? v : "1" });
  }
  return (
    <>
      <PageHead
        eyebrow="MEAL HISTORY"
        title="Every plate, a little perspective."
        text="Revisit the evidence. Review estimates. Follow your progress."
      >
        <Link className="button" to="/analyze">
          New analysis <ArrowUpRight size={17} />
        </Link>
      </PageHead>
      <div className="panel">
        <div className="filters">
          <label>
            Search food
            <input
              placeholder="Search food labels…"
              value={filters.search}
              onChange={(e) => set("search", e.target.value)}
            />
          </label>
          <label>
            Meal
            <select
              value={filters.meal_type}
              onChange={(e) => set("meal_type", e.target.value)}
            >
              <option value="">All meals</option>
              {["Breakfast", "Lunch", "Dinner", "Snacks"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Location
            <select
              value={filters.location_id}
              onChange={(e) => set("location_id", e.target.value)}
            >
              <option value="">All locations</option>
              {locations.data?.map((l: any) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Minimum waste %
            <input
              type="number"
              min="0"
              max="100"
              value={filters.min_waste}
              onChange={(e) => set("min_waste", e.target.value)}
            />
          </label>
          <label>
            Min. confidence
            <select
              value={filters.confidence}
              onChange={(e) => set("confidence", e.target.value)}
            >
              <option value="0">All scores</option>
              <option value="0.5">50% and above</option>
              <option value="0.75">75% and above</option>
            </select>
          </label>
          <label>
            From
            <input
              type="date"
              value={filters.start}
              onChange={(e) => set("start", e.target.value)}
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={filters.end}
              onChange={(e) => set("end", e.target.value)}
            />
          </label>
          <label>
            Order
            <select
              value={filters.sort}
              onChange={(e) => set("sort", e.target.value)}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="waste">Highest waste</option>
            </select>
          </label>
        </div>
        <ErrorBox error={error} />
        {data ? (
          <>
            <MealList items={data.items} />
            <div className="pagination">
              <span>
                {data.total} analyses · Page {data.page} of {data.pages}
              </span>
              <div className="row">
                <button
                  className="icon-button"
                  aria-label="Previous page"
                  disabled={data.page <= 1}
                  onClick={() => set("page", String(data.page - 1))}
                >
                  <ChevronLeft />
                </button>
                <button
                  className="icon-button"
                  aria-label="Next page"
                  disabled={data.page >= data.pages}
                  onClick={() => set("page", String(data.page + 1))}
                >
                  <ChevronRight />
                </button>
              </div>
            </div>
          </>
        ) : (
          <Loading />
        )}
      </div>
    </>
  );
}

export function Reports() {
  const { settings } = useApp();
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [demo, setDemo] = useState(!!settings.demo_workspace);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const query = new URLSearchParams({
    start: start || "2000-01-01",
    end: end || "2100-01-01",
    include_demo: String(demo),
  });
  const { data, error } = useData("/analytics/all?" + query);
  function range(days: number) {
    const today = new Date();
    setEnd(today.toISOString().slice(0, 10));
    today.setDate(today.getDate() - days + 1);
    setStart(today.toISOString().slice(0, 10));
  }
  async function download(format: string) {
    setBusy(format);
    setErr("");
    try {
      const res = await fetch(
        "/api/reports/export?" + query + "&format=" + format,
        { credentials: "include" },
      );
      if (!res.ok)
        throw new Error("Export failed. Check your session and date range.");
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = "second-serve-report." + format;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      <PageHead
        eyebrow="REPORTS"
        title="Good insights deserve to be shared."
        text="Export a clear record of your recorded food-waste estimates."
      />
      <section className="panel">
        <div className="panel-heading">
          <h2>Build your report</h2>
          <div className="row">
            {[
              [1, "Today"],
              [7, "7 days"],
              [30, "30 days"],
            ].map(([days, label]) => (
              <button
                key={days}
                className="button secondary small"
                onClick={() => range(Number(days))}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <DateFilters {...{ start, end, setStart, setEnd, demo, setDemo }} />
        <ErrorBox error={error || err} />
        <div className="export-grid">
          {[
            ["csv", "Spreadsheet-ready", "Meal records and food breakdowns"],
            [
              "json",
              "Full structured data",
              "Estimates, masks, trends and insights",
            ],
            [
              "pdf",
              "Shareable report",
              "Readable overview with recommendations",
            ],
          ].map(([format, title, desc]) => (
            <button
              key={format}
              className="export-card"
              disabled={!!busy}
              onClick={() => download(format)}
            >
              <ArrowDownToLine />
              <span className="badge">{format.toUpperCase()}</span>
              <h3>{busy === format ? "Preparing export…" : title}</h3>
              <p>{desc}</p>
            </button>
          ))}
        </div>
      </section>
      {data && (
        <>
          <Metrics data={data.overview} />
          <section className="panel">
            <h2>Report preview</h2>
            <p>
              Includes {data.overview.meals} saved analyses. All quantities,
              costs and impacts are estimates.
            </p>
            {data.insights.map((s: string) => (
              <p key={s}>{s}</p>
            ))}
            <FoodBars foods={data.foods} />
          </section>
        </>
      )}
    </>
  );
}

export function Alerts() {
  const { data, error, reload } = useData("/alerts");
  const [err, setErr] = useState("");
  return (
    <>
      <PageHead
        eyebrow="ALERTS"
        title="A timely nudge toward less waste."
        text="Signals from your saved meals and configured thresholds."
      />
      <ErrorBox error={error || err} />
      <section className="panel">
        {!data ? (
          <Loading />
        ) : !data.length ? (
          <Empty
            title="All quiet at the table."
            text="Alerts appear when recorded waste exceeds your workspace thresholds."
            action={false}
          />
        ) : (
          data.map((a: any) => (
            <article
              className={"alert-row " + (a.read ? "read" : "")}
              key={a.id}
            >
              <Bell size={20} />
              <div>
                <strong>{a.message}</strong>
                <small>{new Date(a.created_at).toLocaleString()}</small>
                <Link
                  className="text-link green"
                  to={"/analysis/" + a.meal_analysis_id}
                >
                  View analysis <ArrowUpRight size={15} />
                </Link>
              </div>
              <button
                className="button secondary small"
                disabled={a.read}
                onClick={async () => {
                  try {
                    await put("/alerts/" + a.id + "/read");
                    reload();
                  } catch (e: any) {
                    setErr(e.message);
                  }
                }}
              >
                {a.read ? (
                  <>
                    <Check size={15} />
                    Read
                  </>
                ) : (
                  "Mark read"
                )}
              </button>
            </article>
          ))
        )}
      </section>
    </>
  );
}
