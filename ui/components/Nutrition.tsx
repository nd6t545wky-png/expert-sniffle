import { useState } from "react";
import { IsoDate } from "../../src/domain/state";
import { FoodProduct, NutritionEstimate, PitchingOsApi } from "../../src/domain/api";
import { DEMAND_NOTE, FuelTargets } from "../../src/domain/fuelling";
import { Alert, Card, EmptyState, Field, Metric, PageHead, TaskRow } from "./Page";
import { WaterTracker } from "./WaterTracker";
import { Micronutrients } from "./Micronutrients";
import { ConfirmButton } from "./ConfirmButton";

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
  /**
   * What this food's label declared beyond the macros, keyed by nutrient id.
   *
   * Absent entirely when nothing was declared, and individual nutrients are
   * absent when that one was not — the distinction between "zero" and "the
   * label did not say" is the whole point of the micronutrient card.
   */
  micronutrients?: Record<string, number>;
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
  onHydration: (litres: number | "reset") => void;
  /** Targets derived from today's session, when a bodyweight is known. */
  fuel?: FuelTargets | null;
  /** Active energy the ring reported today. Context only — see FuelCard. */
  activeCalories?: number | null;
  onAdoptFuel?: (targets: FuelTargets) => void;
}

/**
 * What today's session says to eat.
 *
 * No general nutrition app can do this — none of them know what training is
 * scheduled. Carbohydrate moves with the day's demand; protein does not,
 * because recovery is when it is used.
 */
function FuelCard({
  fuel,
  activeCalories,
  onAdopt,
}: {
  fuel: FuelTargets;
  activeCalories?: number | null;
  onAdopt?: () => void;
}) {
  return (
    <article className="card card-pad fuel">
      <div className="card-head">
        <div>
          <h3>Today&rsquo;s fuelling</h3>
          <p>{fuel.reason} · {DEMAND_NOTE[fuel.demand]}</p>
        </div>
      </div>
      <ul className="fuel-grid">
        {[
          ["Calories", `${fuel.calories}`, "kcal"],
          ["Carbohydrate", `${fuel.carbs}`, "g"],
          ["Protein", `${fuel.protein}`, "g"],
          ["Fat", `${fuel.fat}`, "g"],
          ["Fluid", `${fuel.fluid}`, "L"],
        ].map(([label, value, unit]) => (
          <li key={label}>
            <span>{label}</span>
            <strong>
              {value}
              <small>{unit}</small>
            </strong>
          </li>
        ))}
      </ul>
      {onAdopt && (
        <div className="form-actions">
          <button className="btn btn-outline" type="button" onClick={onAdopt}>
            Use these as today&rsquo;s targets
          </button>
        </div>
      )}
      {/* The ring reports an active-energy figure every day, the app stores it,
          and nothing has ever shown it — which reads as data going missing. It
          is shown here, next to the target it looks like it should change, with
          the reason it does not. */}
      {typeof activeCalories === "number" && activeCalories > 0 && (
        <p className="fineprint">
          <strong>Your watch says {Math.round(activeCalories)} kcal active today.</strong> That is
          not added to the target above, and deliberately. The activity factor already covers the
          day&rsquo;s training, so adding it would count the session twice — and wrist-worn
          estimates of energy expenditure carry error in the tens of percent, which is far too wide
          to move a daily intake by. It is here as context: a day far above or below your usual is
          worth noticing, the absolute number is not worth eating to.
        </p>
      )}
      <p className="fineprint">
        {fuel.energyFromMeasuredBmr
          ? "Energy is your measured basal rate from the DEXA scan, times an activity factor for the day. "
          : "Energy is built up from the macros, since no measured basal rate is on file. "}
        {fuel.proteinFromLeanMass
          ? "Protein is 2.4 g per kg of your measured lean mass — not total mass, so the target holds as fat comes off. "
          : "Protein is 1.8 g per kg of bodyweight, pending a body-composition scan. "}
        Carbohydrate is 3&ndash;6 g/kg of bodyweight by the day&rsquo;s demand; fat takes what is left,
        never below 0.8 g/kg. Guidance for a healthy training day, not clinical advice.
      </p>
    </article>
  );
}


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
  fuel,
  activeCalories,
  onAdoptFuel,
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
    const usingServing = product.perServing !== null && product.perServing !== undefined;
    const per = usingServing ? product.perServing! : product.per100g;
    const micros = usingServing ? product.micronutrientsPerServing : product.micronutrientsPer100g;
    onAddMeal({
      id: newId(),
      name: `${product.brand ? `${product.brand} ` : ""}${product.name}`.trim(),
      calories: Math.round(Number(per.calories ?? 0)),
      protein: Math.round(Number(per.protein ?? 0)),
      carbs: Math.round(Number(per.carbs ?? 0)),
      fat: Math.round(Number(per.fat ?? 0)),
      // Whichever column the macros came from, take the micronutrients from
      // the same one — mixing a per-serving macro with a per-100 g iron would
      // silently rescale one nutrient against another.
      ...(micros && Object.keys(micros).length ? { micronutrients: micros } : {}),
      source: "openfoodfacts",
      createdAt: new Date().toISOString(),
    });
    setResults([]);
    setSearch("");
    setBarcode("");
  }

  return (
    <>
      <PageHead
        eyebrow="Nutrition"
        title="Log a meal."
        intro="Photo or plain language first. Review once, then it is added to your day."
        className="nutrition-page-head"
      />

      {fuel && (
        <FuelCard
          fuel={fuel}
          activeCalories={activeCalories}
          onAdopt={onAdoptFuel ? () => onAdoptFuel(fuel) : undefined}
        />
      )}

      <section className="grid metrics">
        <Metric
          label="Calories"
          value={totals.calories || "—"}
          detail={targets.calories ? `of ${targets.calories} target` : "No target set"}
        />
        <Metric
          label="Protein"
          value={`${totals.protein}g`}
          detail={targets.protein ? `of ${targets.protein}g target` : "No target set"}
        />
        <Metric label="Carbs" value={`${totals.carbs}g`} />
        <Metric label="Fat" value={`${totals.fat}g`} />
      </section>

      <WaterTracker
        date={date}
        logged={hydrationLitres}
        goal={targets.fluid}
        onChange={onHydration}
      />

      <Micronutrients
        foods={meals.map((meal) => meal.micronutrients ?? {})}
        calorieTarget={targets.calories || fuel?.calories || null}
      />

      <Card>
        <div className="form-grid">
          <Field id="description" label="Describe a meal" full>
            <textarea
              id="description"
              value={description}
              aria-label="Meal description"
              placeholder="e.g. two eggs on toast with avocado"
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
          <div className="form-actions">
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
          </div>

          <Field id="photo" label="Meal photo" hint={busy === "photo" ? "Analysing photo…" : "JPEG, PNG, WebP or HEIC"} full>
            {/* The prototype never shows a bare file control — the browser's
                own "Choose File / No file chosen" is the one widget on the
                page that cannot be styled. A label acting as the button, with
                the input hidden behind it, is its pattern. */}
            <label className="btn btn-outline" htmlFor="photo">
              {busy === "photo" ? "Analysing photo…" : "Choose photo"}
            </label>
            <input
              id="photo"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              aria-label="Meal photo"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                run("photo", async () => {
                  const result = await api.analyzeMealPhoto(file, date);
                  setEstimate({ ...result.estimate, notice: result.notice });
                });
              }}
            />
          </Field>
        </div>
      </Card>

      {estimate && (
        <Alert>
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
        </Alert>
      )}

      <Card>
        <div className="form-grid">
          <Field id="barcode" label="Barcode" hint="8–14 digits">
            <input
              id="barcode"
              type="text"
              inputMode="numeric"
              value={barcode}
              aria-label="Barcode"
              onChange={(event) => setBarcode(event.target.value)}
            />
          </Field>
          <Field id="search" label="Search food">
            <input id="search" type="text" value={search} aria-label="Food search" onChange={(event) => setSearch(event.target.value)} />
          </Field>
          <div className="form-actions">
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
          </div>
        </div>
      </Card>

      {results.length > 0 && (
        <ul className="task-list">
          {results.map((product) => (
            <TaskRow
              key={product.code}
              title={product.name}
              detail={product.brand}
              actions={
                <button type="button" className="btn btn-outline" onClick={() => addProduct(product)}>
                  Add
                </button>
              }
            />
          ))}
        </ul>
      )}

      {meals.length === 0 ? (
        <EmptyState title="Nothing logged yet" detail="Meals you add appear here." />
      ) : (
        <ul className="task-list">
          {meals.map((meal) => (
            <TaskRow
              key={meal.id}
              title={meal.name}
              detail={`${meal.calories} kcal · P ${meal.protein}g`}
              actions={
                <ConfirmButton
                  label="Remove"
                  describe={meal.name}
                  onConfirm={() => onRemoveMeal(meal.id)}
                  className="btn btn-outline"
                />
              }
            />
          ))}
        </ul>
      )}

      {error && (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      )}
    </>
  );
}
