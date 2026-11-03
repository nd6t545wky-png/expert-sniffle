import { CSSProperties, Fragment, ReactNode, useEffect, useRef, useState } from "react";

/**
 * App shell.
 *
 * The markup mirrors the prototype's - `app-shell` + theme class, `main.main`
 * containing `header.topbar` and `div.content`, and `nav.bottom-nav`. The
 * stylesheet is written against those selectors, so the structure is the
 * contract: change a class name and the design falls apart.
 *
 * The chrome is flush rather than floating: the rail, the bar and the phone's
 * tab strip each meet the content along a single 1px line, and that line is the
 * only thing separating them from it.
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
  | "account"
  | "hitting"
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
  // A ball, for throwing.
  workload: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M7.5 4.5c1.6 2 2.4 4.6 2.4 7.5s-.8 5.5-2.4 7.5M16.5 4.5c-1.6 2-2.4 4.6-2.4 7.5s.8 5.5 2.4 7.5" />
    </>
  ),
  // A bat and a ball, for at-bats.
  hitting: (
    <>
      <path d="M5 19.2 15.4 6.8c1.1-1.3 2.9-1.4 3.9-.3 1 1-.1 2.8-1.4 3.9L6.3 20.4Z" />
      <path d="m3.2 20.8 1.6-1.6" />
      <circle cx="6.5" cy="6.5" r="2.5" />
    </>
  ),
  // A shield with a key slot, for account and backup.
  account: (
    <>
      <path d="M12 3 5 6v5c0 4.4 3 8.3 7 10 4-1.7 7-5.6 7-10V6l-7-3Z" />
      <circle cx="12" cy="11" r="2" />
      <path d="M12 13v3" />
    </>
  ),
};

/**
 * The app's P mark, in the team's colours: the team colour behind it and the
 * second colour in the stitching. The home-screen icon is the neutral version.
 */
function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 128 128" aria-hidden="true">
      <rect width="128" height="128" rx="28" className="brand-mark-bg" />
      <path className="brand-mark-ink" d="M42 102V26h28c17 0 28 10 28 24s-11 24-28 24H60v28Z" />
      <path className="brand-mark-bg" d="M60 42h9c7 0 11 3 11 8s-4 8-11 8h-9Z" />
      <path
        className="brand-mark-seam"
        d="M40,104 C44,84 46,52 40,24 M37.0 99.3L45.3 96.0M38.0 92.5L46.2 88.9M38.9 85.2L46.9 81.2M39.5 77.4L47.4 73.2M39.9 69.2L47.6 64.8M39.9 60.9L47.6 56.1M39.7 52.4L47.1 47.3M39.1 43.9L46.3 38.4M38.1 35.4L45.0 29.6"
      />
    </svg>
  );
}

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

/**
 * The phone's five tabs, one job each.
 *
 * Today is the whole day in one place - the week strip, the check-in, the
 * workout and the check-out - rather than a summary page that sent you to
 * three others. Everything about the arm's throwing lives under Throwing, and
 * Progress is what has changed over time, not the after-session form it used
 * to open on.
 */
const TAB = {
  today: { id: "session", label: "Today" },
  throwing: { id: "workload", label: "Throwing" },
  hitting: { id: "hitting", label: "Hitting" },
  progress: { id: "tracking", label: "Progress" },
  food: { id: "nutrition", label: "Food" },
  season: { id: "annual", label: "Season" },
  settings: { id: "profile", label: "Settings" },
  connections: { id: "integrations", label: "Connections" },
  account: { id: "account", label: "Account & backup" },
} as const satisfies Record<string, { id: PageId; label: string }>;

/** Which kind of athlete the nav is for; matches the profile's player type. */
export type NavRole = "pitcher" | "two-way" | "position";

/**
 * The tabs for each kind of athlete. Pitchers keep the five they had. A
 * two-way player trades Food's tab for Hitting (Food moves under More), and a
 * position player has Hitting where Throwing was - no throwing programme.
 */
export function navFor(role: NavRole = "pitcher") {
  const main =
    role === "two-way"
      ? [TAB.today, TAB.throwing, TAB.hitting, TAB.progress]
      : role === "position"
        ? [TAB.today, TAB.hitting, TAB.progress, TAB.food]
        : [TAB.today, TAB.throwing, TAB.progress, TAB.food];
  const more = role === "two-way" ? [TAB.food, TAB.season, TAB.settings, TAB.connections, TAB.account] : [TAB.season, TAB.settings, TAB.connections, TAB.account];
  return {
    bottom: [...main, { id: "profile" as PageId, label: "More" }].map((item) => ({
      ...item,
      icon: <NavIcon id={item.id} />,
    })) as BottomNavItem[],
    sidebar: [
      { label: "Train", items: main as { id: PageId; label: string }[] },
      { label: "More", items: more as { id: PageId; label: string }[] },
    ],
    more: more as { id: PageId; label: string }[],
  };
}

/** The pitcher's nav, kept as named exports for older callers. */
export const BOTTOM_NAV: BottomNavItem[] = navFor("pitcher").bottom;
export const SIDEBAR_GROUPS = navFor("pitcher").sidebar;

/**
 * Keep the phone's bottom bar on the bottom of the screen.
 *
 * `position: fixed` pins to the layout viewport, and on iOS Safari that can
 * fall out of step with what is on screen - after a zoom, or after the
 * keyboard closes - leaving the bar stranded mid-screen. The visual viewport
 * is what the athlete actually sees, so the bar is shifted by the difference
 * between its bottom edge and the layout viewport's. While the keyboard is up
 * the bar is hidden instead of riding on top of it.
 */
function useBottomNavPinned() {
  const navRef = useRef<HTMLElement | null>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const shift = viewport.offsetTop + viewport.height - window.innerHeight;
        navRef.current?.style.setProperty("--nav-shift", `${Math.round(shift)}px`);
        // A keyboard takes well over a hundred pixels; a toolbar sliding in
        // and out does not.
        setKeyboardOpen(window.innerHeight - viewport.height > 150 && isTyping());
      });
    };
    const settle = () => {
      // Safari sometimes reports the old size for a beat after the keyboard
      // closes; check again once it has finished animating.
      update();
      window.setTimeout(update, 350);
    };
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    window.addEventListener("focusout", settle);
    window.addEventListener("orientationchange", settle);
    update();
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      window.removeEventListener("focusout", settle);
      window.removeEventListener("orientationchange", settle);
    };
  }, []);

  return { navRef, keyboardOpen };
}

/**
 * True while the athlete is scrolling down the page, false when they scroll
 * back up or are near the top. Drives `nav-condensed`, which shrinks the tab
 * bar to its icons and the top bar to its title so the workout gets the room.
 */
function useCondensedOnScroll(): boolean {
  const [condensed, setCondensed] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const y = window.scrollY;
        // A few pixels of slack so a finger resting on the glass does not
        // make the bar flicker between states.
        if (y < 48) setCondensed(false);
        else if (y > last + 6) setCondensed(true);
        else if (y < last - 6) setCondensed(false);
        last = y;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);
  return condensed;
}

function isTyping(): boolean {
  const active = document.activeElement;
  if (!active) return false;
  if (active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement) return true;
  return active instanceof HTMLInputElement && !["checkbox", "radio", "range", "button", "submit"].includes(active.type);
}

export interface ShellProps {
  /** Theme class the prototype puts on the shell, e.g. `theme-norths`. */
  theme: string;
  /** Custom properties for a team theme worked out from its colours. */
  themeVars?: Record<string, string>;
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
  /** The team's badge, shown at the left of the top bar. */
  teamLogo?: { src: string; alt: string } | null;
  /** The team's name: a club without a logo gets its initials in its colours. */
  teamName?: string;
  /** Today's session progress, shown as a bar along the top bar's foot. */
  progress?: { resolved: number; total: number; percent: number } | null;
  /** Which tabs to show. Defaults to the pitcher's. */
  role?: NavRole;
  /** No longer shown: Today is the plan. Kept so older callers still type-check. */
  onOpenPlan?: () => void;
  children: ReactNode;
}

export function Shell({
  theme,
  themeVars,
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
  role = "pitcher",
  teamLogo = null,
  teamName,
  progress = null,
  children,
}: ShellProps) {
  const nav = navFor(role);
  const [moreOpen, setMoreOpen] = useState(false);
  const { navRef, keyboardOpen } = useBottomNavPinned();
  const condensed = useCondensedOnScroll();

  // Pages without a tab of their own light up the tab they live under.
  const activeNav: PageId =
    page === "readiness" || page === "dashboard"
      ? "session"
      : page === "mechanics"
        ? "workload"
        : page === "bloods"
          ? "tracking"
          : nav.more.some((item) => item.id === page)
            ? "profile"
            : page;

  return (
    <div
      className={`app-shell ${theme}${keyboardOpen ? " keyboard-open" : ""}${condensed ? " nav-condensed" : ""}`}
      style={themeVars as CSSProperties | undefined}
    >
      <aside className="sidebar">
        <div className="brand">
          <BrandMark />
          <div>
            <strong>Pitching OS</strong>
            <span>{athleteName}</span>
          </div>
        </div>
        {/* Label and list are direct children of the sidebar, as in the
            prototype - it is a flex column, and wrapping each group in a div
            collapses six flex children into three and changes the spacing. */}
        {nav.sidebar.map((group) => (
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
        <button className="athlete-chip" type="button" onClick={() => onNavigate("account")}>
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
            {teamLogo ? (
              <img className="topbar-logo" src={teamLogo.src} alt={teamLogo.alt} />
            ) : teamName ? (
              <span className="topbar-logo topbar-monogram" role="img" aria-label={`${teamName} badge`}>
                {teamInitials(teamName)}
              </span>
            ) : (
              <span className="context-mark" />
            )}
            <div>
              <strong className="desktop-context">{desktopContext}</strong>
              <strong className="mobile-context">
                {mobileContext}
                {progress && progress.total > 0 && (
                  <span className="topbar-count">
                    {" "}
                    · {progress.resolved}/{progress.total}
                  </span>
                )}
              </strong>
              <small>{contextRange}</small>
            </div>
          </div>
          <div className="top-actions">
            <button
              className="sync-pill"
              type="button"
              aria-label="Open cloud autosave settings"
              onClick={() => onNavigate("account")}
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
          </div>
          {progress && progress.total > 0 && (
            <div
              className="session-progress topbar-progress"
              role="progressbar"
              aria-label="Today's session"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress.percent}
            >
              <span style={{ width: `${progress.percent}%` }} />
            </div>
          )}
        </header>

        <div className="content">{children}</div>
      </main>

      <nav className="bottom-nav" aria-label="Primary navigation" ref={navRef}>
        {nav.bottom.map((item) => {
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
            {nav.more.map((item) => (
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

/** A club's initials for its badge: "Redlands Rays" is RR, "Norths" is N. */
export function teamInitials(name: string): string {
  const words = name.split(/[^A-Za-z0-9]+/).filter((word) => word && !/^(the|of|and)$/i.test(word));
  return words.slice(0, 2).map((word) => word[0].toUpperCase()).join("") || "?";
}
