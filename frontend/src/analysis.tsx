import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  Upload,
  Camera,
  X,
  ScanLine,
  Check,
  LoaderCircle,
  Save,
  Plus,
  Trash2,
  Undo2,
  Layers,
  AlertTriangle,
  Flame,
  Drumstick,
  Wheat,
  Droplets,
} from "lucide-react";
import { motion } from "framer-motion";
import { api, post, fmt, type Meal, type FoodResult } from "./api";
import { PageHead, useData, ErrorBox, Loading, PlateView } from "./ui";
import { useApp } from "./main";
import ImageComparison from "./ImageComparison";

export function Analyze() {
  const { settings } = useApp();
  const navigate = useNavigate();
  const [before, setBefore] = useState<File | null>(null);
  const [after, setAfter] = useState<File | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [meal, setMeal] = useState("Lunch");
  const [location, setLocation] = useState("");
  const [grams, setGrams] = useState("500");
  const locations = useData("/locations");
  async function start(demo = false) {
    setError("");
    setBusy(demo ? "Preparing demo images" : "Uploading before image");
    try {
      if (demo) {
        const m = await post("/analyze/demo");
        navigate("/analysis/" + m.id);
        return;
      }
      if (!before || !after)
        throw new Error("Add both before and after photos.");
      const upload = async (file: File) => {
        const form = new FormData();
        form.append("file", file);
        return api("/analyze/upload", { method: "POST", body: form });
      };
      const b = await upload(before);
      setBusy("Uploading after image");
      const a = await upload(after);
      setBusy("Starting image analysis");
      const m = await post("/analyze/meal", {
        before_id: b.id,
        after_id: a.id,
        meal_type: meal,
        location_id: location ? Number(location) : null,
        served_grams: Number(grams),
      });
      navigate("/analysis/" + m.id);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      <PageHead
        eyebrow="A NEW PERSPECTIVE"
        title="Let’s see what’s on your plate."
        text="Two photos. A clearer picture. One step toward less waste."
      />
      <div className="workflow">
        {["Capture", "Understand", "Compare", "Reduce"].map((s, i) => (
          <div key={s} className={i === 0 ? "active" : ""}>
            <span>0{i + 1}</span>
            {s}
            {i < 3 && <ArrowRight size={16} />}
          </div>
        ))}
      </div>
      <div className="capture-heading">
        <h2>Start with the before & after.</h2>
        <p>
          Use the same plain, contrasting plate. Shoot from directly above, with
          similar lighting and framing.
        </p>
      </div>
      <ErrorBox error={error || locations.error} />
      <div className="capture-studio">
        <div className="studio-orbit">
          <span className="eyebrow">PLATE INTELLIGENCE / CAPTURE STUDIO</span>
          <PlateView settings={settings} stage="Scanning plate" />
          <div className="studio-status">
            <span className="live-dot" />
            Ready for your before & after
          </div>
          <small>
            Illustrative setup · analysis begins when you submit both images
          </small>
        </div>
        <div className="two-cols uploads">
          <UploadCard
            label="Before the first bite"
            subtitle="Your full serving, ready to enjoy."
            file={before}
            onFile={setBefore}
            number="01"
          />
          <UploadCard
            label="After the last bite"
            subtitle="What’s left, just as it is."
            file={after}
            onFile={setAfter}
            number="02"
          />
        </div>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>A little context goes a long way.</h2>
            <p>
              Portion estimates use your serving calibration, not measured image
              weight.
            </p>
          </div>
          <span className="badge">ESTIMATED QUANTITIES</span>
        </div>
        <div className="form-grid">
          <label>
            Meal time
            <select value={meal} onChange={(e) => setMeal(e.target.value)}>
              {["Breakfast", "Lunch", "Dinner", "Snacks"].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <label>
            Location
            <select
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            >
              <option value="">Personal / unassigned</option>
              {locations.data?.map((l: any) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Total initial serving (g)
            <input
              type="number"
              min="1"
              max="10000"
              value={grams}
              onChange={(e) => setGrams(e.target.value)}
              required
            />
            <small>
              Enter a weighed or known serving. Default 500 g is an assumption;
              change it to match your meal.
            </small>
          </label>
        </div>
        <div className="between analysis-start">
          <p>
            <ScanLine size={18} /> Transparent estimates. Always open to review.
          </p>
          <button
            className="button"
            onClick={() => start()}
            disabled={
              !!busy ||
              !before ||
              !after ||
              Number(grams) <= 0 ||
              Number(grams) > 10000
            }
          >
            {busy ? (
              <>
                <LoaderCircle className="spin" size={18} />
                {busy}
              </>
            ) : (
              <>
                Understand my plate <ArrowUpRight size={18} />
              </>
            )}
          </button>
        </div>
      </section>
      <section className="demo-banner">
        <div>
          <span className="badge">DEMO MODE</span>
          <h3>Just looking around? Take a sample plate for a spin.</h3>
          <p>
            Clearly labeled synthetic images run through the real pipeline. Demo
            results stay out of normal analytics.
          </p>
        </div>
        <button
          className="button secondary"
          disabled={!!busy}
          onClick={() => start(true)}
        >
          Try a demo analysis <ArrowRight size={17} />
        </button>
      </section>
    </>
  );
}

function UploadCard({ label, subtitle, file, onFile, number }: any) {
  const input = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  function accept(f?: File) {
    setError("");
    if (!f) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(f.type) ||
      f.size > 10 * 1024 * 1024
    ) {
      setError("Choose a JPEG, PNG or WebP under 10 MB.");
      return;
    }
    onFile(f);
  }
  return (
    <section
      className="upload-card"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        accept(e.dataTransfer.files[0]);
      }}
    >
      <div className="panel-heading">
        <div>
          <span className="eyebrow">{number} / CAPTURE</span>
          <h2>{label}</h2>
          <p>{subtitle}</p>
        </div>
        {file && (
          <button
            className="icon-button"
            aria-label={"Remove " + label + " image"}
            onClick={() => onFile(null)}
          >
            <X size={18} />
          </button>
        )}
      </div>
      <input
        ref={input}
        className="visually-hidden"
        aria-label={label + " upload"}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(e) => {
          accept(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={camera}
        className="visually-hidden"
        aria-label={label + " camera"}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          accept(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {preview ? (
        <button
          className="image-preview"
          onClick={() => input.current?.click()}
          aria-label={"Replace " + label + " image"}
        >
          <img src={preview} alt={label} />
          <span>Click to replace image</span>
        </button>
      ) : (
        <button className="upload-zone" onClick={() => input.current?.click()}>
          <span className="upload-icon">
            <Upload size={28} />
          </span>
          <strong>Drop your photo here</strong>
          <span>or click to browse your files</span>
          <small>JPEG, PNG, WebP · up to 10 MB</small>
        </button>
      )}
      <div className="between upload-footer">
        <small>
          {file ? file.name : "A clear plate makes a clearer picture."}
        </small>
        <button className="text-link" onClick={() => camera.current?.click()}>
          <Camera size={17} />
          Use camera
        </button>
      </div>
      <ErrorBox error={error} />
    </section>
  );
}

const stages = [
  "Scanning plate",
  "Aligning plates",
  "Detecting food",
  "Segmenting portions",
  "Identifying food",
  "Estimating portions",
  "Comparing food",
  "Calculating waste",
  "Generating insights",
];
export function Result() {
  const { id } = useParams();
  const { settings } = useApp();
  const [meal, setMeal] = useState<Meal | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState(false);
  const [selected, setSelected] = useState(0);
  const [comparison, setComparison] = useState(50);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const m = await api<Meal>("/analysis/" + id);
        if (!alive) return;
        setMeal(m);
        setError("");
        if (["queued", "processing"].includes(m.status))
          timer = setTimeout(poll, 900);
      } catch (e: any) {
        if (alive) setError(e.message);
      }
    }
    poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [id, revision]);
  if (!meal)
    return (
      <>
        <ErrorBox error={error} />
        {error ? (
          <button className="button" onClick={() => setRevision((v) => v + 1)}>
            Retry
          </button>
        ) : (
          <Loading />
        )}
      </>
    );
  if (meal.status === "failed")
    return (
      <>
        <PageHead
          eyebrow="ANALYSIS NEEDS ANOTHER LOOK"
          title="Let’s try a clearer picture."
        />
        <ErrorBox error={meal.error || "Analysis failed."} />
        <Link to="/analyze" className="button">
          Try new images <ArrowRight size={17} />
        </Link>
      </>
    );
  if (meal.status !== "complete")
    return (
      <>
        <PageHead
          eyebrow="UNDERSTANDING YOUR PLATE"
          title="A closer look is taking shape."
          text="These stages reflect the processing work reported by the server."
        />
        <ErrorBox error={error} />
        <section className="processing panel">
          <div className="processing-scene">
            <PlateView settings={settings} stage={meal.stage} />
            <span className="eyebrow">
              PROCESSING VISUALIZATION · NOT A DETECTION RESULT
            </span>
          </div>
          <span className="eyebrow">
            {meal.demo ? "DEMO ANALYSIS" : "IMAGE ANALYSIS"}
          </span>
          <h2 aria-live="polite">{meal.stage}</h2>
          <div className="progress-track">
            <div style={{ width: meal.progress + "%" }} />
          </div>
          <strong>{meal.progress}%</strong>
          <div className="stage-list">
            {stages.map((s, i) => {
              const current = stages.indexOf(meal.stage);
              return (
                <div
                  className={
                    i < current ? "done" : i === current ? "current" : ""
                  }
                  key={s}
                >
                  {i < current ? (
                    <Check size={16} />
                  ) : i === current ? (
                    <LoaderCircle className="spin" size={16} />
                  ) : (
                    <span className="stage-dot" />
                  )}
                  {s}
                </div>
              );
            })}
          </div>
        </section>
      </>
    );
  async function save() {
    setBusy(true);
    try {
      await post("/analysis/" + id + "/save");
      setRevision((v) => v + 1);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const nutrientTotal = (key: string, state: string) =>
    meal.foods.reduce(
      (sum, food) =>
        sum +
        Number(food.nutrition?.estimated?.[key]?.[state as "served"] || 0),
      0,
    );
  const hasNutrition = meal.foods.some(
    (food) => Object.keys(food.nutrition?.per_100g || {}).length,
  );
  return (
    <>
      <PageHead
        eyebrow={
          meal.demo
            ? "DEMO RESULT · SYNTHETIC IMAGES"
            : "YOUR PLATE, UNDERSTOOD"
        }
        title="Less guesswork. More perspective."
        text={`${meal.meal_type} · ${new Date(meal.created_at).toLocaleString()}`}
      >
        <div className="row">
          <button className="button secondary" onClick={() => setEdit(!edit)}>
            {edit ? "Close review" : "Review & correct"}
            <Layers size={16} />
          </button>
          <button
            className="button"
            disabled={busy || meal.saved}
            onClick={save}
          >
            {meal.saved ? <Check size={17} /> : <Save size={17} />}{" "}
            {meal.saved
              ? "Saved to history"
              : busy
                ? "Saving…"
                : "Save analysis"}
          </button>
        </div>
      </PageHead>
      <ErrorBox error={error} />
      <section className="result-hero">
        <div>
          <span className="eyebrow">ESTIMATED FOOD WASTE</span>
          <div className="waste-number">
            {fmt(meal.waste_percentage, 1)}
            <span>%</span>
          </div>
          <p>of your initial serving remains on the plate.</p>
          <span className={"status " + (meal.verified ? "verified" : "")}>
            <span className="live-dot" />
            {meal.verified
              ? "Human verified"
              : meal.confidence < settings.confidence_threshold
                ? "Low confidence — review required"
                : "Review recommended"}
          </span>
          <small>
            {fmt(meal.confidence * 100)}% heuristic quality score · not a
            calibrated probability
          </small>
        </div>
        <div className="result-plate">
          <PlateView
            foods={meal.foods}
            beforeFraction={comparison / 100}
            selected={selected}
            onSelect={setSelected}
            settings={settings}
          />
          <div className="scene-switch">
            <button
              className={comparison === 100 ? "active" : ""}
              onClick={() => setComparison(100)}
            >
              Initial portion
            </button>
            <button
              className={comparison === 0 ? "active" : ""}
              onClick={() => setComparison(0)}
            >
              Remaining
            </button>
          </div>
          <small>
            Actual portion estimates · linked to the image comparison
          </small>
        </div>
      </section>
      <div className="metrics result-metrics">
        {[
          ["Food served", meal.total_served],
          ["Inferred consumed", meal.total_consumed],
          ["Food remaining", meal.total_remaining],
          ["Potential waste", meal.total_waste],
        ].map(([label, value]) => (
          <div className="metric" key={label}>
            <span>{label}</span>
            <strong>
              {fmt(Number(value))}
              <small> g estimated</small>
            </strong>
          </div>
        ))}
      </div>
      <section
        className="nutrition-command"
        aria-label="Estimated nutrition outcome"
      >
        <div className="nutrition-command-copy">
          <span className="eyebrow">NUTRITION OUTCOME / ESTIMATED</span>
          <h2>What the plate delivered.</h2>
          <p>
            Calculated from the configured food database and the quantities
            inferred from this analysis.
          </p>
        </div>
        {hasNutrition ? (
          <div className="nutrition-command-grid">
            {[
              ["Calories", "calories_kcal", "kcal", Flame],
              ["Protein", "protein_g", "g", Drumstick],
              ["Carbohydrates", "carbs_g", "g", Wheat],
              ["Fat", "fat_g", "g", Droplets],
            ].map(([label, key, unit, Icon]: any) => (
              <article key={key}>
                <Icon size={17} />
                <span>{label}</span>
                <strong>
                  {fmt(nutrientTotal(key, "consumed"), 1)}
                  <small>{unit}</small>
                </strong>
                <em>
                  {fmt(nutrientTotal(key, "remaining"), 1)} {unit} remaining
                </em>
              </article>
            ))}
          </div>
        ) : (
          <div className="nutrition-empty">
            <strong>Nutrition is waiting for food mapping.</strong>
            <span>
              Review this analysis and assign a food from the configured library
              to calculate it.
            </span>
          </div>
        )}
      </section>
      <div className="notice">
        <AlertTriangle size={20} />
        <span>
          RGB images cannot measure exact weight. Disappearing food is not proof
          of consumption, and remaining food is not proof of disposal. Review
          these area-based estimates before using them.
        </span>
      </div>
      <Comparison
        meal={meal}
        revision={revision}
        value={comparison}
        onChange={setComparison}
      />
      {edit && (
        <CorrectionEditor
          meal={meal}
          onDone={() => {
            setEdit(false);
            setRevision((v) => v + 1);
          }}
        />
      )}
      <div className="two-cols">
        <section className="panel">
          <div className="panel-heading">
            <h2>Food-level perspective</h2>
            <span className="badge">ESTIMATED</span>
          </div>
          {meal.foods.map((f, i) => (
            <button
              className={"food-result " + (selected === i ? "selected" : "")}
              key={i}
              onClick={() => setSelected(i)}
            >
              <div>
                <strong>{f.label}</strong>
                <small>
                  {fmt(f.initial_quantity)} g served →{" "}
                  {fmt(f.remaining_quantity)} g remaining
                </small>
                {f.nutrition?.estimated && (
                  <small className="food-nutrition-line">
                    {fmt(f.nutrition.estimated.calories_kcal?.consumed || 0)}{" "}
                    kcal consumed ·{" "}
                    {fmt(f.nutrition.estimated.protein_g?.consumed || 0, 1)} g
                    protein
                  </small>
                )}
              </div>
              <div>
                <strong>{fmt(f.waste_percentage, 1)}%</strong>
                <small>{fmt(f.confidence * 100)}% quality</small>
              </div>
            </button>
          ))}
          <p className="muted">
            Select a region to inspect its estimate. Correct unidentified labels
            in the review panel.
          </p>
        </section>
        <section className="panel">
          <span className="eyebrow">THE EVIDENCE BEHIND THE ESTIMATE</span>
          <h2>Transparent by design.</h2>
          <p>
            <strong>Method:</strong> {meal.details.method}
          </p>
          <p>
            <strong>Alignment:</strong> {meal.details.alignment}
          </p>
          <p>
            <strong>Calibration:</strong> {meal.details.calibration}
          </p>
          {meal.details.notes?.map((n: string) => (
            <p className="method-note" key={n}>
              {n}
            </p>
          ))}
          <p>
            <strong>Estimated food value:</strong> ₹{fmt(meal.cost_wasted, 2)}.
            Unconfigured costs count as zero.
          </p>
        </section>
      </div>
      {meal.corrections?.length ? (
        <section className="panel">
          <h2>Review trail</h2>
          {meal.corrections.map((c: any) => (
            <div className="stat-row" key={c.id}>
              <strong>{c.reason}</strong>
              <small>{new Date(c.created_at).toLocaleString()}</small>
            </div>
          ))}
        </section>
      ) : null}
      <div className="between">
        <Link className="text-link" to="/history">
          ← Back to meal history
        </Link>
        <Link className="button secondary" to="/analytics">
          Explore your recorded patterns <ArrowUpRight size={16} />
        </Link>
      </div>
    </>
  );
}

function Comparison({
  meal,
  revision,
  value,
  onChange,
}: {
  meal: Meal;
  revision: number;
  value: number;
  onChange: (v: number) => void;
}) {
  const [mode, setMode] = useState("Before / After");
  const image = (key: string) => meal.images[key] + "?v=" + revision;
  return (
    <section className="panel comparison">
      <div className="panel-heading">
        <div>
          <h2>The story, side by side.</h2>
          <p>
            Drag the button on the image to reveal what changed. The 3D plate
            follows your perspective.
          </p>
        </div>
        <span className="badge">DRAG TO EXPLORE</span>
      </div>
      <div className="tabs" role="tablist" aria-label="Image comparison mode">
        {[
          "Before / After",
          "Side by side",
          "Detection",
          "Segmentation",
          "Waste",
          "Difference",
        ].map((m) => (
          <button
            role="tab"
            aria-selected={m === mode}
            key={m}
            className={mode === m ? "active" : ""}
            onClick={() => setMode(m)}
          >
            {m}
          </button>
        ))}
      </div>
      {mode === "Before / After" ? (
        <ImageComparison
          before={image("before")}
          after={image("after")}
          value={value}
          onChange={onChange}
        />
      ) : mode === "Side by side" ? (
        <div className="comparison-pair">
          {["before", "after"].map((k) => (
            <figure key={k}>
              <img src={image(k)} alt={k + " normalized plate"} />
              <figcaption>
                {k === "before"
                  ? "Before the first bite"
                  : "After the last bite"}
              </figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <figure className="single-image">
          <img
            src={image(mode.toLowerCase())}
            alt={mode + " plate visualization"}
          />
          <figcaption>
            {mode === "Difference"
              ? "Difference between observed segmentation masks, not a raw photo difference."
              : mode === "Waste"
                ? "Highlighted regions show matched remaining food."
                : mode === "Segmentation"
                  ? "Visible region boundaries. Verify these masks in the correction panel."
                  : mode}
          </figcaption>
        </figure>
      )}
    </section>
  );
}

function CorrectionEditor({
  meal,
  onDone,
}: {
  meal: Meal;
  onDone: () => void;
}) {
  const foods = useData("/foods");
  const [rows, setRows] = useState<FoodResult[]>(structuredClone(meal.foods));
  const [reason, setReason] = useState("");
  const [verified, setVerified] = useState(meal.verified);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [maskIndex, setMaskIndex] = useState<number | null>(null);
  const [maskSide, setMaskSide] = useState<"polygons" | "after_polygons">(
    "polygons",
  );
  function change(i: number, k: string, v: any) {
    setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await post("/feedback/correction", {
        analysis_id: meal.id,
        foods: rows.map((r) => ({
          food_id: r.food_id,
          label: r.label,
          initial_quantity: r.initial_quantity,
          remaining_quantity: r.remaining_quantity,
          confidence: r.confidence,
          geometry: r.geometry,
        })),
        reason,
        verified,
      });
      onDone();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel correction-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">HUMAN PERSPECTIVE MATTERS</span>
          <h2>Review the evidence. Refine the estimate.</h2>
          <p>
            Remove false detections, add missed food, relabel portions, and
            redraw region masks.
          </p>
        </div>
      </div>
      <form onSubmit={submit}>
        <ErrorBox error={error || foods.error} />
        {rows.map((r, i) => (
          <div className="correction-row" key={i}>
            <div className="form-grid">
              <label>
                Food category
                <select
                  value={r.food_id || ""}
                  onChange={(e) => {
                    const f = foods.data?.find(
                      (f: any) => f.id === Number(e.target.value),
                    );
                    setRows(
                      rows.map((row, j) =>
                        j === i
                          ? {
                              ...row,
                              food_id: f?.id || null,
                              label: f?.name || r.label,
                            }
                          : row,
                      ),
                    );
                  }}
                >
                  <option value="">Unclassified / custom</option>
                  {foods.data?.map((f: any) => (
                    <option value={f.id} key={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Region label
                <input
                  value={r.label}
                  maxLength={100}
                  required
                  onChange={(e) => change(i, "label", e.target.value)}
                />
              </label>
              <label>
                Initial estimate (g)
                <input
                  type="number"
                  min="0"
                  max="10000"
                  step=".01"
                  required
                  value={r.initial_quantity}
                  onChange={(e) =>
                    change(i, "initial_quantity", Number(e.target.value))
                  }
                />
              </label>
              <label>
                Remaining estimate (g)
                <input
                  type="number"
                  min="0"
                  max={r.initial_quantity}
                  step=".01"
                  required
                  value={r.remaining_quantity}
                  onChange={(e) =>
                    change(i, "remaining_quantity", Number(e.target.value))
                  }
                />
              </label>
              <label>
                Reviewer confidence (0–1)
                <input
                  type="number"
                  min="0"
                  max="1"
                  step=".01"
                  required
                  value={r.confidence}
                  onChange={(e) =>
                    change(i, "confidence", Number(e.target.value))
                  }
                />
              </label>
            </div>
            <div className="row">
              <button
                type="button"
                className="text-link"
                onClick={() => {
                  setMaskIndex(i);
                  setMaskSide("polygons");
                }}
              >
                <Layers size={15} />
                Edit initial mask
              </button>
              <button
                type="button"
                className="text-link"
                onClick={() => {
                  setMaskIndex(i);
                  setMaskSide("after_polygons");
                }}
              >
                <Layers size={15} />
                Edit remaining mask
              </button>
              {r.food_id && (
                <button
                  type="button"
                  className="text-link"
                  onClick={() => {
                    const f = foods.data?.find((f: any) => f.id === r.food_id);
                    if (f) change(i, "initial_quantity", f.standard_portion);
                  }}
                >
                  Use standard portion
                </button>
              )}
              <button
                type="button"
                className="text-link danger"
                disabled={rows.length <= 1}
                onClick={() => setRows(rows.filter((_, j) => j !== i))}
              >
                <Trash2 size={15} />
                Remove region
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          className="button secondary small"
          onClick={() =>
            setRows([
              ...rows,
              {
                food_id: null,
                label: "Manually added food",
                initial_quantity: 100,
                remaining_quantity: 0,
                confidence: 0.5,
                geometry: {},
              },
            ])
          }
        >
          <Plus size={16} />
          Add missed food
        </button>
        {maskIndex !== null && (
          <MaskEditor
            key={maskIndex + maskSide}
            image={meal.images[maskSide === "polygons" ? "before" : "after"]}
            polygons={rows[maskIndex].geometry[maskSide] || []}
            onApply={(polygons) => {
              change(maskIndex, "geometry", {
                ...rows[maskIndex].geometry,
                [maskSide]: polygons,
              });
              setMaskIndex(null);
            }}
            onClose={() => setMaskIndex(null)}
          />
        )}
        <label className="review-reason">
          What did you change?
          <textarea
            required
            minLength={3}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="For example: corrected rice label and weighed the remaining portion."
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={verified}
            onChange={(e) => setVerified(e.target.checked)}
          />
          I reviewed the food labels, masks, and estimates. Mark this result
          human verified.
        </label>
        <p className="muted">
          Mask edits update the recorded geometry and overlays. Quantity fields
          remain your explicit estimates; adjust them to match your correction.
        </p>
        <button className="button" disabled={busy}>
          {busy ? "Saving corrections…" : "Save review & corrections"}
          <Check size={17} />
        </button>
      </form>
    </section>
  );
}

function MaskEditor({
  image,
  polygons,
  onApply,
  onClose,
}: {
  image: string;
  polygons: number[][][];
  onApply: (p: number[][][]) => void;
  onClose: () => void;
}) {
  const [points, setPoints] = useState<number[][]>([]);
  const [saved, setSaved] = useState(polygons);
  const [x, setX] = useState(50);
  const [y, setY] = useState(50);
  const add = () => setPoints([...points, [x / 100, y / 100]]);
  return (
    <div className="mask-editor">
      <div className="panel-heading">
        <h3>Draw the food boundary</h3>
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label="Close mask editor"
        >
          <X />
        </button>
      </div>
      <p>
        Click around the food to add boundary points. You can also enter
        coordinates (0–100%) with the keyboard.
      </p>
      <div
        className="mask-canvas"
        onClick={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          setPoints([
            ...points,
            [
              (e.clientX - box.left) / box.width,
              (e.clientY - box.top) / box.height,
            ],
          ]);
        }}
      >
        <img src={image} alt="Plate for manual boundary correction" />
        <svg viewBox="0 0 100 100" aria-label="Manual segmentation polygons">
          {saved.map((p, i) => (
            <polygon
              key={i}
              points={p.map(([x, y]) => `${x * 100},${y * 100}`).join(" ")}
              className="saved-polygon"
            />
          ))}
          <polyline
            points={points.map(([x, y]) => `${x * 100},${y * 100}`).join(" ")}
          />
          {points.map(([x, y], i) => (
            <circle key={i} cx={x * 100} cy={y * 100} r="1" />
          ))}
        </svg>
      </div>
      <div className="filters">
        <label>
          X %
          <input
            type="number"
            min="0"
            max="100"
            value={x}
            onChange={(e) =>
              setX(Math.max(0, Math.min(100, Number(e.target.value))))
            }
          />
        </label>
        <label>
          Y %
          <input
            type="number"
            min="0"
            max="100"
            value={y}
            onChange={(e) =>
              setY(Math.max(0, Math.min(100, Number(e.target.value))))
            }
          />
        </label>
        <button type="button" className="button secondary small" onClick={add}>
          Add point
        </button>
        <button
          type="button"
          className="button secondary small"
          disabled={!points.length}
          onClick={() => setPoints(points.slice(0, -1))}
        >
          <Undo2 size={15} />
          Undo point
        </button>
      </div>
      <div className="row wrap">
        <button
          type="button"
          className="button secondary small"
          onClick={() => {
            setSaved([]);
            setPoints([]);
          }}
        >
          Clear masks
        </button>
        <button
          type="button"
          className="button secondary small"
          disabled={points.length < 3}
          onClick={() => {
            setSaved([...saved, points]);
            setPoints([]);
          }}
        >
          Close polygon
        </button>
        <button
          type="button"
          className="button small"
          disabled={points.length > 0 && points.length < 3}
          onClick={() =>
            onApply(points.length >= 3 ? [...saved, points] : saved)
          }
        >
          Apply mask correction
        </button>
      </div>
    </div>
  );
}
