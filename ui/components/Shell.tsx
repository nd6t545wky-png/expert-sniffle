import { ReactNode } from "react";

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
  | "integrations"
  | "profile";

export interface BottomNavItem {
  id: PageId;
  label: string;
  icon: ReactNode;
}

/** Icons traced from the prototype's inline SVGs. */
const svg = (children: ReactNode) => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {children}
  </svg>
);

export const BOTTOM_NAV: BottomNavItem[] = [
  {
    id: "dashboard",
    label: "Today",
    icon: svg(
      <>
        <rect x="3" y="3" width="7" height="7" rx="2" />
        <rect x="14" y="3" width="7" height="7" rx="2" />
        <rect x="3" y="14" width="7" height="7" rx="2" />
        <rect x="14" y="14" width="7" height="7" rx="2" />
      </>
    ),
  },
  {
    id: "session",
    label: "Plan",
    icon: svg(
      <>
        <rect x="4" y="3" width="16" height="18" rx="3" />
        <path d="m8.5 12 2.5 2.5 4.5-5" />
      </>
    ),
  },
  {
    id: "tracking",
    label: "Progress",
    icon: svg(
      <>
        <path d="M4 20V10" />
        <path d="M10 20V4" />
        <path d="M16 20v-7" />
        <path d="M22 20H2" />
      </>
    ),
  },
  {
    id: "nutrition",
    label: "Nutrition",
    icon: svg(
      <>
        <path d="M6 3v8a2 2 0 0 0 4 0V3" />
        <path d="M8 11v10" />
        <path d="M16 3c-1.5 2-2 4-2 6s.5 3 2 3 2-1 2-3-.5-4-2-6Z" />
        <path d="M16 12v9" />
      </>
    ),
  },
  {
    id: "profile",
    label: "More",
    icon: svg(
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
  },
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
      { id: "tracking", label: "Progress" },
      { id: "nutrition", label: "Nutrition" },
      { id: "mechanics", label: "Biomechanics" },
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
  page,
  onNavigate,
  onOpenPlan,
  children,
}: ShellProps) {
  // The prototype maps several pages onto one bottom-nav entry.
  const activeNav: PageId =
    page === "readiness" || page === "workload"
      ? "session"
      : page === "annual"
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
        {SIDEBAR_GROUPS.map((group) => (
          <div key={group.label}>
            <div className="nav-label">{group.label}</div>
            <nav className="nav-list">
              {group.items.map((item) => (
                <button
                  key={item.id}
                  className={`nav-item ${page === item.id ? "active" : ""}`}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                >
                  <span className="nav-icon" aria-hidden="true" />
                  {item.label}
                </button>
              ))}
            </nav>
          </div>
        ))}
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
        {BOTTOM_NAV.map((item) => (
          <button
            key={item.id}
            className={activeNav === item.id ? "active" : ""}
            type="button"
            aria-current={activeNav === item.id ? "page" : undefined}
            onClick={() => onNavigate(item.id)}
          >
            <span>{item.icon}</span>
            <small>{item.label}</small>
          </button>
        ))}
      </nav>
    </div>
  );
}
