import { useEffect, useRef } from "react";
import { IsoDate } from "../../src/domain/state";

/**
 * The week's seven days across the top of the session page — v60's
 * `renderDayTabs`.
 *
 * Each tab shows the day's real date and its status, which is the whole point:
 * once you can look at a day other than today, the interface has to say which
 * day you are looking at everywhere it matters. The date under each tab and
 * the date in the page head come from the same derivation, so they cannot
 * disagree.
 */

export type DayStatus = "done" | "open" | "locked";

export interface DayTab {
  day: number;
  date: IsoDate;
  name: string;
  status: DayStatus;
}

/**
 * v60's rule, unchanged: a day with a check-out is done, a day with a
 * check-in is open, anything else is locked.
 */
export function dayStatus(
  date: IsoDate,
  pre: Record<IsoDate, unknown>,
  post: Record<IsoDate, unknown>
): DayStatus {
  if (post[date]) return "done";
  if (pre[date]) return "open";
  return "locked";
}

export function DayTabs({
  tabs,
  selectedDay,
  today,
  onSelectDay,
}: {
  tabs: DayTab[];
  selectedDay: number;
  /** Today's date, so the tab for it can be marked. */
  today: IsoDate;
  onSelectDay: (day: number) => void;
}) {
  const strip = useRef<HTMLDivElement>(null);

  /**
   * Bring the selected day into view.
   *
   * The strip scrolls horizontally and always started at Monday, so on a
   * Thursday the day you were actually looking at sat off-screen and the row
   * read as the wrong week. Scrolls the element, not the page: `scrollIntoView`
   * on the button would drag the whole document sideways and, on some browsers,
   * vertically too.
   */
  useEffect(() => {
    const container = strip.current;
    const tab = container?.querySelector<HTMLElement>(`[data-day="${selectedDay}"]`);
    if (!container || !tab) return;
    const offset = Math.max(0, tab.offsetLeft - (container.clientWidth - tab.offsetWidth) / 2);
    // `Element.scrollTo` is not everywhere — assigning `scrollLeft` is, and it
    // still animates because the strip sets `scroll-behavior: smooth`. Falling
    // back rather than assuming is the difference between a tab that does not
    // centre and a plan page that does not render.
    if (typeof container.scrollTo === "function") {
      container.scrollTo({ left: offset, behavior: "smooth" });
    } else {
      container.scrollLeft = offset;
    }
  }, [selectedDay, tabs]);

  return (
    <div className="day-tabs" ref={strip}>
      {tabs.map((tab) => {
        const label = new Intl.DateTimeFormat("en-AU", {
          timeZone: "Australia/Brisbane",
          day: "numeric",
          month: "short",
        }).format(new Date(`${tab.date}T00:00:00+10:00`));

        return (
          <button
            key={tab.day}
            data-day={tab.day}
            className={`day-tab ${selectedDay === tab.day ? "active" : ""} ${tab.status === "done" ? "done" : ""}`
              .replace(/\s+/g, " ")
              .trim()}
            type="button"
            aria-current={selectedDay === tab.day ? "date" : undefined}
            aria-label={`${tab.name} ${label}, ${tab.status}${tab.date === today ? ", today" : ""}`}
            onClick={() => onSelectDay(tab.day)}
          >
            <span>
              {label} · {tab.status}
            </span>
            <strong>{tab.name}</strong>
          </button>
        );
      })}
    </div>
  );
}
