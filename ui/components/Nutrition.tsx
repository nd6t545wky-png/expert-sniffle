import { useState } from "react";
import { IsoDate } from "../../src/domain/state";
import { FoodProduct, NutritionEstimate, PitchingOsApi } from "../../src/domain/api";

/**
 * Meals, hydration and food lookup.
 *
 * Every AI estimate is presented as editable, and the server's notice about
 * whether an official source was verified is shown rather than dropped — the
 * difference between "matched an official menu" and "guessed from a photo"
 * matters and should not be flattened.
 */

export interface Meal {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  source: string;
  createdAt: string;
}

export interface NutritionTargets {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fluid: number;
}

export interface NutritionProps {
  api: PitchingOsApi;
  date: IsoDate;
  meals: Meal[];
  hydrationLitres: number;
  targets: NutritionTargets;
  onAddMeal: (meal: Meal) => void;
  onRemoveMeal: (id: string) => void;
  onHydration: (litres: number) => void;
}

const HYDRATION_PRESETS = [0.25, 0.5, 0.75, 1];

function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function Nutrition({
  api,
  date,
  meals,
  hydrationLitres,
  targets,
  onAddMeal,
  onRemoveMeal,
  onHydration,
}: NutritionProps) {
  const [description, setDescription] = useState("");
  const [barcode, setBarcode] = useState("");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<FoodProduct[]>([]);
  const [estimate, setEstimate] = useState<(NutritionEstimate & { notice?: string; sourceUrl?: string }) | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const totals = meals.reduce(
    (sum, meal) => ({
      calories: sum.calories + meal.calories,
      protein: sum.protein + meal.protein,
      carbs: sum.carbs + meal.carbs,
      fat: sum.fat + meal.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    setError("");
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy("");
    }
  }

  function acceptEstimate(source: string) {
    if (!estimate) return;
    onAddMeal({
      id: newId(),
      name: estimate.name,
      calories: estimate.calories,
      protein: estimate.protein,
      carbs: estimate.carbs,
      fat: estimate.fat,
      source,
      createdAt: new Date().toISOString(),
    });
    setEstimate(null);
    setDescription("");
  }

  function addProduct(product: FoodProduct) {
    const per = product.perServing ?? product.per100g;
    onAddMeal({
      id: newId(),
      name: `${product.brand ? `${product.brand} ` : ""}${product.name}`.trim(),
      calories: Math.round(Number(per.calories ?? 0)),
      protein: Math.round(Number(per.protein ?? 0)),
      carbs: Math.round(Number(per.carbs ?? 0)),
      fat: Math.round(Number(per.fat ?? 0)),
      source: "openfoodfacts",
      createdAt: new Date().toISOString(),
    });
    setResults([]);
    setSearch("");
    setBarcode("");
  }

  return (
    <section className="card" aria-labelledby="nutrition-heading">
      <h2 id="nutrition-heading">Nutrition</h2>
      <p className="muted">{date}</p>

      <dl className="stat-row">
        <div>
          <dt>Calories</dt>
          <dd>
            {totals.calories}
            {targets.calories ? ` / ${targets.calories}` : ""}
          </dd>
        </div>
        <div>
          <dt>Protein</dt>
          <dd>
            {totals.protein}g{targets.protein ? ` / ${targets.protein}g` : ""}
          </dd>
        </div>
        <div>
          <dt>Carbs</dt>
          <dd>{totals.carbs}g</dd>
        </div>
        <div>
          <dt>Fat</dt>
          <dd>{totals.fat}g</dd>
        </div>
      </dl>

      <h3>Hydration</h3>
      <p className="muted">
        {hydrationLitres.toFixed(2)} L{targets.fluid ? ` / ${targets.fluid} L` : ""}
      </p>
      <div className="phase-legend">
        {HYDRATION_PRESETS.map((litres) => (
          <button key={litres} type="button" className="btn btn-outline" onClick={() => onHydration(litres)}>
            +{litres} L
          </button>
        ))}
      </div>

      <h3>Describe a meal</h3>
      <textarea
        value={description}
        aria-label="Meal description"
        placeholder="e.g. two eggs on toast with avocado"
        onChange={(event) => setDescription(event.target.value)}
      />
      <button
        type="button"
        className="btn"
        disabled={busy !== "" || description.trim().length < 3}
        onClick={() =>
          run("text", async () => {
            const result = await api.analyzeMealText(description.trim(), date);
            setEstimate({ ...result.estimate, notice: result.notice, sourceUrl: result.sourceUrl });
          })
        }
      >
        {busy === "text" ? "Analysing…" : "Estimate from description"}
      </button>

      <h3>Meal photo</h3>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        aria-label="Meal photo"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          run("photo", async () => {
            const result = await api.analyzeMealPhoto(file, date);
            setEstimate({ ...result.estimate, notice: result.notice });
          });
        }}
      />
      {busy === "photo" && <p className="muted">Analysing photo…</p>}

      {estimate && (
        <div className="alert" role="status">
          <strong>
            {estimate.name} — {estimate.calories} kcal
          </strong>
          <p className="muted">
            P {estimate.protein}g · C {estimate.carbs}g · F {estimate.fat}g · confidence {estimate.confidence}
          </p>
          {estimate.notice && <p>{estimate.notice}</p>}
          {estimate.assumptions?.length > 0 && (
            <ul>
              {estimate.assumptions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
          <button type="button" className="btn" onClick={() => acceptEstimate("ai")}>
            Add to today
          </button>{" "}
          <button type="button" className="btn btn-outline" onClick={() => setEstimate(null)}>
            Discard
          </button>
        </div>
      )}

      <h3>Barcode</h3>
      <input
        type="text"
        inputMode="numeric"
        value={barcode}
        aria-label="Barcode"
        placeholder="8–14 digits"
        onChange={(event) => setBarcode(event.target.value)}
      />
      <button
        type="button"
        className="btn btn-outline"
        disabled={busy !== ""}
        onClick={() =>
          run("barcode", async () => {
            const result = await api.lookupBarcode(barcode.replace(/\D/g, ""));
            if (result.found && result.product) setResults([result.product]);
            else {
              setResults([]);
              setError("No product found for that barcode.");
            }
          })
        }
      >
        {busy === "barcode" ? "Looking up…" : "Look up barcode"}
      </button>

      <h3>Search food</h3>
      <input
        type="text"
        value={search}
        aria-label="Food search"
        onChange={(event) => setSearch(event.target.value)}
      />
      <button
        type="button"
        className="btn btn-outline"
        disabled={busy !== "" || search.trim().length < 2}
        onClick={() =>
          run("search", async () => {
            setResults((await api.searchFood(search.trim())).results);
          })
        }
      >
        {busy === "search" ? "Searching…" : "Search"}
      </button>

      {results.length > 0 && (
        <ul className="task-list">
          {results.map((product) => (
            <li key={product.code} className="task">
              <div>
                <strong>{product.name}</strong>
                <span className="muted"> {product.brand}</span>
              </div>
              <button type="button" className="btn btn-outline" onClick={() => addProduct(product)}>
                Add
              </button>
            </li>
          ))}
        </ul>
      )}

      <h3>Today's meals</h3>
      {meals.length === 0 ? (
        <p className="muted">Nothing logged yet.</p>
      ) : (
        <ul className="task-list">
          {meals.map((meal) => (
            <li key={meal.id} className="task">
              <div>
                <strong>{meal.name}</strong>
                <span className="muted">
                  {" "}
                  {meal.calories} kcal · P {meal.protein}g
                </span>
              </div>
              <button type="button" className="btn btn-outline" onClick={() => onRemoveMeal(meal.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <div className="alert danger" role="alert">
          {error}
        </div>
      )}
    </section>
  );
}
