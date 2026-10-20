import { useEffect, useState } from "react";
import { Activity, Save } from "lucide-react";
import { api, put, fmt } from "./api";
import { ErrorBox, Loading, PageHead, useData } from "./ui";

const nutrient = (data: any, key: string, state = "consumed") =>
  data?.nutrition?.totals?.[key]?.[state] || 0;

export function FitPage() {
  const overview = useData("/fit/overview?days=30");
  const bmi = useData("/fit/bmi");
  const profile = useData("/fit/profile");
  const [form, setForm] = useState<any>(null),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  useEffect(() => {
    if (profile.data) setForm(profile.data);
  }, [profile.data]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await put("/fit/profile", form);
      setSaved(true);
      profile.reload();
      bmi.reload();
    } catch (e: any) {
      setError(e.message);
    }
  }
  if (!overview.data || !profile.data) return <Loading />;
  const data = overview.data;
  return (
    <>
      <PageHead
        eyebrow="SECOND SERVE FIT"
        title="Nourish what matters."
        text="Estimated nutrition from your analyzed meals, paired with your fitness context."
      />
      <ErrorBox error={error || overview.error || bmi.error} />
      <div className="notice">{data?.disclaimer}</div>
      <section className="metric-grid fit-metrics">
        <article>
          <small>CONSUMED PROTEIN</small>
          <strong>{fmt(nutrient(data, "protein_g"), 1)} g</strong>
          <span>Estimated from configured foods</span>
        </article>
        <article>
          <small>CONSUMED ENERGY</small>
          <strong>{fmt(nutrient(data, "calories_kcal"))} kcal</strong>
          <span>Across {data?.meal_count || 0} recorded meals</span>
        </article>
        <article>
          <small>FOOD WASTE SCORE</small>
          <strong>
            {data?.food_waste_score == null ? "—" : `${data.food_waste_score}%`}
          </strong>
          <span>{data?.score_method}</span>
        </article>
        <article>
          <small>BMI</small>
          <strong>{bmi.data?.value ?? "—"}</strong>
          <span>{bmi.data?.category || "Add a profile to calculate"}</span>
        </article>
      </section>
      <div className="two-cols">
        <section className="panel">
          <h2>Estimated nutrition balance</h2>
          {[
            ["Protein", "protein_g", "g"],
            ["Carbohydrates", "carbs_g", "g"],
            ["Fat", "fat_g", "g"],
            ["Fiber", "fiber_g", "g"],
          ].map(([label, key, unit]) => (
            <div className="fit-row" key={key}>
              <span>{label}</span>
              <strong>
                {fmt(nutrient(data, key), 1)} {unit}
              </strong>
              <small>
                {fmt(nutrient(data, key, "wasted"), 1)} {unit} remaining
              </small>
            </div>
          ))}
          <p className="muted">
            Nutrition sources:{" "}
            {data?.nutrition?.sources?.join(" · ") ||
              "No configured food nutrition in these meals."}
          </p>
        </section>
        <form className="panel" onSubmit={save}>
          <h2>Your Fit profile</h2>
          <p className="muted">
            Optional context used only to show BMI and label your dashboard.
          </p>
          {form && (
            <div className="form-grid">
              <label>
                Age
                <input
                  type="number"
                  min="13"
                  max="120"
                  value={form.age || ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      age: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                />
              </label>
              <label>
                Height (cm)
                <input
                  type="number"
                  min="80"
                  max="260"
                  value={form.height_cm || ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      height_cm: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                />
              </label>
              <label>
                Weight (kg)
                <input
                  type="number"
                  min="20"
                  max="400"
                  value={form.weight_kg || ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      weight_kg: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                />
              </label>
              <label>
                Goal
                <select
                  value={form.fitness_goal || ""}
                  onChange={(e) =>
                    setForm({ ...form, fitness_goal: e.target.value || null })
                  }
                >
                  <option value="">Choose a goal</option>
                  <option value="MAINTAIN">Maintain</option>
                  <option value="BUILD_MUSCLE">Build muscle</option>
                  <option value="GENERAL_FITNESS">General fitness</option>
                  <option value="REDUCE_WASTE">Reduce waste</option>
                </select>
              </label>
            </div>
          )}
          <button className="button small">
            <Save size={15} />
            {saved ? "Saved" : "Save profile"}
          </button>
          <p className="muted">{bmi.data?.disclaimer}</p>
        </form>
      </div>
      <section className="panel">
        <h2>Food nutrition breakdown</h2>
        {data?.nutrition?.foods?.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Food</th>
                  <th>Protein consumed</th>
                  <th>Calories consumed</th>
                  <th>Protein remaining</th>
                </tr>
              </thead>
              <tbody>
                {data.nutrition.foods.map((f: any) => (
                  <tr key={f.name}>
                    <td>{f.name}</td>
                    <td>{fmt(f.nutrition.protein_g.consumed, 1)} g</td>
                    <td>{fmt(f.nutrition.calories_kcal.consumed)} kcal</td>
                    <td>{fmt(f.nutrition.protein_g.wasted, 1)} g</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">
            Correct an analysis with a configured food to see a nutrition
            breakdown.
          </p>
        )}
      </section>
    </>
  );
}
