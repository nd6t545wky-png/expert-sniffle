import { Fragment, ReactNode, useState } from "react";

/**
 * App shell.
 *
 * The markup here mirrors the prototype's exactly — `app-shell` + theme class,
 * `main.main` containing `header.topbar` and `div.content`, and `nav.bottom-nav`.
 * The prototype's stylesheet is written against those selectors, so the
 * structure is the contract: change a class name and the design falls apart.
 *
 * Nothing in styles.css is edited to accommodate the rebuild. The rebuild
 * matches the stylesheet, not the other way round.
 */

export type PageId =
  | "dashboard"
  | "session"
  | "readiness"
  | "workload"
  | "tracking"
  | "annual"
  | "nutrition"
  | "mechanics"
  | "bloods"
  | "integrations"
  | "profile";

export interface BottomNavItem {
  id: PageId;
  label: string;
  icon: ReactNode;
}

/**
 * Nav icons, path-for-path from the prototype's `navIcon`. They are not
 * decoration: an empty `.nav-icon` span is what makes a nav list look
 * half-built.
 */
const ICON_PATHS: Record<PageId, ReactNode> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="2" />
      <rect x="14" y="3" width="7" height="7" rx="2" />
      <rect x="3" y="14" width="7" height="7" rx="2" />
      <rect x="14" y="14" width="7" height="7" rx="2" />
    </>
  ),
  session: (
    <>
      <path d="M7 3h10a2 2 0 0 1 2 2v16H5V5a2 2 0 0 1 2-2Z" />
      <path d="m8 12 2.2 2.2L16 8.5" />
    </>
  ),
  annual: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M8 3v4M16 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
    </>
  ),
  tracking: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  nutrition: <path d="M12 3v18M7 5v6a3 3 0 0 0 3 3h2M17 4v7M14 4v7a3 3 0 0 0 6 0V4" />,
  mechanics: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M22 12h-3M12 22v-3M2 12h3" />
    </>
  ),
  // A droplet, for the blood panel.
  bloods: (
    <>
      <path d="M12 3c3 4 5.5 6.6 5.5 9.5a5.5 5.5 0 0 1-11 0C6.5 9.6 9 7 12 3Z" />
    </>
  ),
  profile: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  integrations: (
    <>
      <path d="M8 12a4 4 0 0 1 4-4h3M16 12a4 4 0 0 1-4 4H9" />
      <path d="m14 5 3 3-3 3M10 19l-3-3 3-3" />
    </>
  ),
  // Readiness has no nav entry of its own; it borrows the section it belongs
  // to. Workload now has one, in both the sidebar and the phone's More sheet.
  readiness: (
    <>
      <path d="M7 3h10a2 2 0 0 1 2 2v16H5V5a2 2 0 0 1 2-2Z" />
      <path d="m8 12 2.2 2.2L16 8.5" />
    </>
  ),
  workload: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
};

function NavIcon({ id }: { id: PageId }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICON_PATHS[id]}
    </svg>
  );
}

export const BOTTOM_NAV: BottomNavItem[] = [
  { id: "dashboard", label: "Today", icon: <NavIcon id="dashboard" /> },
  { id: "session", label: "Plan", icon: <NavIcon id="session" /> },
  { id: "tracking", label: "Progress", icon: <NavIcon id="tracking" /> },
  { id: "nutrition", label: "Nutrition", icon: <NavIcon id="nutrition" /> },
  { id: "profile", label: "More", icon: <NavIcon id="profile" /> },
];

/** Sidebar groups, mirroring the prototype's Plan / Track / Settings. */
export const SIDEBAR_GROUPS: { label: string; items: { id: PageId; label: string }[] }[] = [
  {
    label: "Plan",
    items: [
      { id: "dashboard", label: "Today" },
      { id: "session", label: "Plan" },
      { id: "annual", label: "Year" },
    ],
  },
  {
    label: "Track",
    items: [
      // Throwing was reachable only from a dashboard tile, which made the
      // pitch log effectively undiscoverable. It is a page; it gets a link.
      { id: "workload", label: "Throwing" },
      { id: "tracking", label: "Progress" },
      { id: "nutrition", label: "Nutrition" },
      { id: "mechanics", label: "Biomechanics" },
      { id: "bloods", label: "Bloods" },
    ],
  },
  {
    label: "Settings",
    items: [
      { id: "profile", label: "Athlete" },
      { id: "integrations", label: "Connections" },
    ],
  },
];

/** What the phone's "More" button opens, as in the prototype. */
const MORE_ITEMS: { id: PageId; label: string }[] = [
  { id: "workload", label: "Throwing" },
  { id: "annual", label: "Year" },
  { id: "mechanics", label: "Biomechanics" },
  { id: "bloods", label: "Bloods" },
  { id: "profile", label: "Athlete" },
  { id: "integrations", label: "Connections" },
];

export interface ShellProps {
  /** Theme class the prototype puts on the shell, e.g. `theme-norths`. */
  theme: string;
  /** Long context line, shown on wide screens. */
  desktopContext: string;
  /** Short context line, shown on phones. */
  mobileContext: string;
  /** Date range under the context line. */
  contextRange: string;
  syncLabel: string;
  /** Drives the dot colour in styles.css. */
  syncStatus: string;
  appearance: string;
  onCycleAppearance: () => void;
  athleteName: string;
  /** Second line of the sidebar's athlete chip, e.g. "RHP · 84 kg". */
  athleteDetail?: string;
  page: PageId;
  onNavigate: (page: PageId) => void;
  onOpenPlan: () => void;
  children: ReactNode;
}

export function Shell({
  theme,
  desktopContext,
  mobileContext,
  contextRange,
  syncLabel,
  syncStatus,
  appearance,
  onCycleAppearance,
  athleteName,
  athleteDetail = "",
  page,
  onNavigate,
  onOpenPlan,
  children,
}: ShellProps) {
  const [moreOpen, setMoreOpen] = useState(false);

  // The prototype maps several pages onto one bottom-nav entry.
  const activeNav: PageId =
    page === "readiness" || page === "workload"
      ? "session"
      : page === "annual" || page === "bloods"
        ? "tracking"
        : page === "mechanics" || page === "integrations"
          ? "profile"
          : page;

  return (
    <div className={`app-shell ${theme}`}>
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-mark" src="/mark.svg" alt="" />
          <div>
            <strong>Pitching OS</strong>
            <span>{athleteName}</span>
          </div>
        </div>
        {/* Label and list are direct children of the sidebar, as in the
            prototype — it is a flex column, and wrapping each group in a div
            collapses six flex children into three and changes the spacing. */}
        {SIDEBAR_GROUPS.map((group) => (
          <Fragment key={group.label}>
            <div className="nav-label">{group.label}</div>
            <nav className="nav-list">
              {group.items.map((item) => (
                <button
                  key={item.id}
                  className={`nav-item ${page === item.id ? "active" : ""}`}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                >
                  <span className="nav-icon">
                    <NavIcon id={item.id} />
                  </span>
                  {item.label}
                </button>
              ))}
            </nav>
          </Fragment>
        ))}

        {/* `.athlete-chip` carries `margin-top: auto`: it is what pins the nav
            to the top of the rail and itself to the bottom. */}
        <button className="athlete-chip" type="button" onClick={() => onNavigate("profile")}>
          <span className="avatar">{(athleteName || "A").slice(0, 1).toUpperCase()}</span>
          <div>
            <strong>{athleteName || "Athlete"}</strong>
            <small>{athleteDetail}</small>
          </div>
        </button>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="top-context">
            <span className="context-mark" />
            <div>
              <strong className="desktop-context">{desktopContext}</strong>
              <strong className="mobile-context">{mobileContext}</strong>
              <small>{contextRange}</small>
            </div>
          </div>
          <div className="top-actions">
            <button
              className="sync-pill"
              type="button"
              aria-label="Open cloud autosave settings"
              onClick={() => onNavigate("profile")}
            >
              {/* Both attributes are required: styles.css keys the flex layout
                  and the status dot off [data-sync-status]. */}
              <span className="sync-dot" data-sync-status="" data-status={syncStatus}>
                {syncLabel}
              </span>
            </button>
            <button
              className="appearance-pill"
              type="button"
              aria-label={`Change appearance. Current setting: ${appearance}`}
              title={`Appearance: ${appearance}`}
              onClick={onCycleAppearance}
            >
              <span>A</span>
            </button>
            <button className="today-button" type="button" onClick={onOpenPlan}>
              Open plan
            </button>
          </div>
        </header>

        <div className="content">{children}</div>
      </main>

      <nav className="bottom-nav" aria-label="Primary navigation">
        {BOTTOM_NAV.map((item) => {
          // "More" opens the sheet rather than navigating, as in the prototype.
          const isMore = item.id === "profile";
          const active = activeNav === item.id;
          return (
            <button
              key={item.id}
              className={active ? "active" : ""}
              type="button"
              aria-current={active && !isMore ? "page" : undefined}
              aria-expanded={isMore ? moreOpen : undefined}
              onClick={() => {
                if (isMore) setMoreOpen((open) => !open);
                else {
                  setMoreOpen(false);
                  onNavigate(item.id);
                }
              }}
            >
              <span>{item.icon}</span>
              <small>{item.label}</small>
            </button>
          );
        })}
      </nav>

      {moreOpen && (
        <>
          <div className="mobile-sheet-backdrop" onClick={() => setMoreOpen(false)} />
          <aside className="mobile-sheet">
            <div className="mobile-sheet-head">
              <strong>More</strong>
              <button type="button" aria-label="Close" onClick={() => setMoreOpen(false)}>
                ×
              </button>
            </div>
            {MORE_ITEMS.map((item) => (
              <button
                key={item.id}
                className={`nav-item ${page === item.id ? "active" : ""}`}
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  onNavigate(item.id);
                }}
              >
                <span className="nav-icon">
                  <NavIcon id={item.id} />
                </span>
                {item.label}
              </button>
            ))}
          </aside>
        </>
      )}
    </div>
  );
}
