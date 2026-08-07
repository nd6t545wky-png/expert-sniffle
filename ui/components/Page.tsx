import { ReactNode } from "react";

/**
 * Shared page furniture, using the prototype's class vocabulary.
 *
 * Every screen in the original is built from the same handful of shapes:
 * a `section.page-head`, `article.card`s, `form.form-grid` with `div.field`
 * children, `details.card.disclosure-card` for collapsible detail, and
 * `.empty` / `.chart-empty` for blank states. Reproducing them once here keeps
 * the rest of the components honest — if a screen looks wrong, it is using
 * the wrong shape, not missing CSS.
 */

export function PageHead({
  eyebrow,
  title,
  intro,
  controls,
  className = "",
}: {
  eyebrow: string;
  title: string;
  intro?: string;
  controls?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`page-head ${className}`.trim()}>
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        {intro && <p>{intro}</p>}
      </div>
      {controls && <div className="annual-controls">{controls}</div>}
    </section>
  );
}

export function Card({
  children,
  className = "",
  ...rest
}: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLElement>) {
  return (
    <article className={`card ${className}`.trim()} {...rest}>
      {children}
    </article>
  );
}

/** Heading row inside a card, matching `.card-head`. */
export function CardHead({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="card-head">
      <span>
        <strong>{title}</strong>
        {detail && <small>{detail}</small>}
      </span>
    </div>
  );
}

export function Field({
  id,
  label,
  hint,
  full,
  children,
}: {
  id?: string;
  label: string;
  hint?: string;
  full?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={full ? "field full" : "field"}>
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && <small>{hint}</small>}
    </div>
  );
}

export function FormDivider({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="form-divider">
      <strong>{title}</strong>
      {detail && <span>{detail}</span>}
    </div>
  );
}

/** Collapsible detail block, matching the prototype's quiet disclosures. */
export function Disclosure({
  title,
  detail,
  children,
}: {
  title: string;
  detail?: string;
  children: ReactNode;
}) {
  return (
    <details className="card disclosure-card quiet-disclosure">
      <summary>
        <span>
          <strong>{title}</strong>
          {detail && <small>{detail}</small>}
        </span>
        <span>Show</span>
      </summary>
      <div className="disclosure-body">{children}</div>
    </details>
  );
}

export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="chart-empty">
      <div>
        <strong>{title}</strong>
        {detail && <span>{detail}</span>}
      </div>
    </div>
  );
}

export function Metric({
  label,
  value,
  detail,
  source,
  tone = "",
  onClick,
}: {
  label: string;
  value: ReactNode;
  detail?: string;
  source?: string;
  tone?: string;
  onClick?: () => void;
}) {
  const className = `card metric ${onClick ? "metric-shortcut " : ""}${tone}`.trim();

  // The shortcut variant is a button of spans; the plain variant is an article
  // whose value is a div. That difference is the prototype's, not an accident —
  // the block-level value is what makes a non-interactive tile stack instead of
  // running label and number together on one line.
  if (onClick) {
    return (
      <button className={className} type="button" onClick={onClick}>
        <span className="metric-label">{label}</span>
        <span className="metric-value">{value}</span>
        {detail && <span className="metric-detail">{detail}</span>}
        {source && (
          <span className="data-source manual" title="Entered or confirmed by the athlete">
            {source}
          </span>
        )}
        <span className="metric-arrow" aria-hidden="true">
          ›
        </span>
      </button>
    );
  }

  return (
    <article className={className}>
      <span className="metric-label">{label}</span>
      <div className="metric-value">{value}</div>
      {detail && <div className="metric-detail">{detail}</div>}
      {source && (
        <span className="data-source manual" title="Entered or confirmed by the athlete">
          {source}
        </span>
      )}
    </article>
  );
}

export function Alert({
  tone = "info",
  children,
  role = "status",
}: {
  tone?: "info" | "warn" | "danger";
  children: ReactNode;
  role?: "status" | "alert";
}) {
  return (
    <div className={`alert ${tone}`} role={role}>
      {children}
    </div>
  );
}
