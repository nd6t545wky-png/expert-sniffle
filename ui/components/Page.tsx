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

/**
 * `.card` on its own sets a surface, a border and a radius — and no padding
 * at all. In the prototype it is always paired with something that supplies
 * it: `.card-pad` normally, or a variant like `.gate` / `.integration` that
 * brings its own. A card without either has its contents touching the border,
 * which is the single biggest reason a screen reads as unfinished.
 */
const SELF_PADDING = ["gate", "integration", "season-calendar-card", "metric", "card-pad"];

export function Card({
  children,
  className = "",
  ...rest
}: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLElement>) {
  const variants = className.split(/\s+/).filter(Boolean);
  const pad = variants.some((name) => SELF_PADDING.includes(name)) ? "" : "card-pad";
  return (
    <article className={["card", pad, ...variants].filter(Boolean).join(" ")} {...rest}>
      {children}
    </article>
  );
}

/**
 * Heading row inside a card.
 *
 * `.card-head` is styled for `h3` + `p` — the `strong`/`small` pair belongs to
 * a disclosure summary, where the stylesheet lays it out. Used here it runs
 * the title and the detail together on one line.
 */
export function CardHead({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="card-head">
      <div>
        <h3>{title}</h3>
        {detail && <p>{detail}</p>}
      </div>
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

/**
 * "Nothing here yet" for a list, inside its own card.
 *
 * `.empty` is the prototype's shape for this, and the reason matters: only
 * `.empty strong` is `display: block`, so only this shape puts the title on
 * its own line. `.chart-empty` is a dashed placeholder sized for a chart —
 * used for one it looks deliberate, used for a list it renders the title and
 * detail run together in a box of empty space.
 */
export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return (
    <article className="card card-pad">
      <div className="empty">
        <strong>{title}</strong>
        {detail}
      </div>
    </article>
  );
}

/** Dashed placeholder where a chart will go once there is data for it. */
export function ChartEmpty({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="chart-empty">
      <div>
        <strong>{title}</strong>
        {detail && (
          <>
            <br />
            {detail}
          </>
        )}
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
