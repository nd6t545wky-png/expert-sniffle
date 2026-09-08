import { useState } from "react";
import { IsoDate } from "../../src/domain/state";
import {
  CalendarDay,
  CalendarMonth,
  PROGRAMME_WEEK_COUNT,
  monthContaining,
  phaseSpans,
  programmeMonths,
  weekStart,
  phaseForWeek,
} from "../../src/domain/calendar";
import { programmeWeekFor } from "../../src/domain/calendar";
import { Card, CardHead, PageHead } from "./Page";

/**
 * The training year as a calendar.
 *
 * A 52-cell grid of week numbers told you nothing about when a week actually
 * was. This is the shape a calendar app uses: a year of month grids, a month
 * view for detail, and one colour per cycle so the shape of the season is
 * visible at a glance rather than needing to be read.
 *
 * Colour comes from `CYCLE_COLOUR` below, so the legend, the year view and the
 * month view cannot drift apart.
 */

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

/**
 * What colour a cycle wears on the calendar.
 *
 * `LEGACY_PHASES` carries hex values lifted verbatim out of the prototype, and
 * they were the last colours in the product that were not on the palette: a
 * red, a purple and a teal for the gaps between seasons. The red and the purple
 * are already tokens — they are the two club themes — so the calendar reads
 * them from there rather than restating them, and a block belonging to no
 * season is drawn in slate instead of being given a fourth hue of its own.
 *
 * The year then reads as "Norths season / Cubs season / neither", which is what
 * the colour was always trying to say. Keyed by phase id, and the phase table
 * is frozen; an id this does not know falls through to slate rather than to
 * nothing.
 */
const CYCLE_COLOUR: Record<string, string> = {
  winter: "var(--season-winter)",
  winter_next: "var(--season-winter)",
  preseason: "var(--season-summer)",
  summer_first: "var(--season-summer)",
  summer_second: "var(--season-summer)",
  transition: "var(--muted)",
  transition_summer: "var(--muted)",
  summer_break: "var(--muted)",
};

const cycleColour = (id: string): string => CYCLE_COLOUR[id] ?? "var(--muted)";

export interface AnnualPlanProps {
  selectedWeek: number;
  onSelectWeek: (week: number) => void;
  /** Today, so the calendar can mark it. */
  today?: IsoDate;
}

/*
 * The season's fixtures used to be listed here as well, read straight off
 * `FIXTURES` — which meant a game entered in the app never appeared on the page
 * the athlete goes to to look at their season, and the same heading appeared
 * twice once the entry form moved onto this page. `FixtureSettings` renders
 * below this component and does both jobs from one list.
 */

type View = "year" | "month";

export function AnnualPlan({ selectedWeek, onSelectWeek, today }: AnnualPlanProps) {
  const [view, setView] = useState<View>("year");
  const [monthKey, setMonthKey] = useState(() => monthContaining(weekStart(selectedWeek)).key);

  const months = programmeMonths();
  const spans = phaseSpans();
  const phase = phaseForWeek(selectedWeek);
  const month = months.find((m) => m.key === monthKey) ?? months[0];
  const monthIndex = months.findIndex((m) => m.key === month.key);

  function selectDay(cell: CalendarDay) {
    if (cell.week === null) return;
    onSelectWeek(cell.week);
  }

  function openMonth(target: CalendarMonth) {
    setMonthKey(target.key);
    setView("month");
  }

  return (
    <>
      <PageHead
        eyebrow="Annual plan"
        title="The training year."
        intro={
          phase
            ? `Week ${selectedWeek} of ${PROGRAMME_WEEK_COUNT} — ${phase.name}.`
            : `Week ${selectedWeek} of ${PROGRAMME_WEEK_COUNT}.`
        }
        controls={
          <div className="cal-views" role="tablist" aria-label="Calendar view">
            {(["year", "month"] as View[]).map((option) => (
              <button
                key={option}
                type="button"
                role="tab"
                aria-selected={view === option}
                className={`btn ${view === option ? "btn-dark" : "btn-outline"}`}
                onClick={() => setView(option)}
              >
                {option === "year" ? "Year" : "Month"}
              </button>
            ))}
          </div>
        }
      />

      {/* One tab per cycle. Selecting one jumps to its first week, which is
          how you navigate a season rather than a date. */}
      <div className="cal-legend" role="tablist" aria-label="Training cycles">
        {spans.map(({ phase: item, weeks }) => {
          const active = phase?.id === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={`cal-cycle${active ? " active" : ""}`}
              style={{ ["--cycle" as string]: cycleColour(item.id) }}
              onClick={() => {
                onSelectWeek(item.startWeek);
                setMonthKey(monthContaining(weekStart(item.startWeek)).key);
              }}
            >
              <span className="cal-swatch" aria-hidden="true" />
              <span>
                <strong>{item.name}</strong>
                <small>
                  Weeks {item.startWeek}–{item.endWeek} · {weeks} week{weeks === 1 ? "" : "s"}
                </small>
              </span>
            </button>
          );
        })}
      </div>

      {view === "year" ? (
        <div className="cal-year">
          {months.map((item) => (
            <Card key={item.key} className="cal-month-card">
              <button type="button" className="cal-month-open" onClick={() => openMonth(item)}>
                {item.label}
              </button>
              <MonthGrid
                month={item}
                compact
                selectedWeek={selectedWeek}
                today={today}
                onSelect={selectDay}
              />
            </Card>
          ))}
        </div>
      ) : (
        <Card className="cal-month-card">
          <div className="cal-month-head">
            <button
              type="button"
              className="btn btn-outline"
              disabled={monthIndex <= 0}
              onClick={() => setMonthKey(months[monthIndex - 1].key)}
            >
              ←
            </button>
            <strong>{month.label}</strong>
            <button
              type="button"
              className="btn btn-outline"
              disabled={monthIndex >= months.length - 1}
              onClick={() => setMonthKey(months[monthIndex + 1].key)}
            >
              →
            </button>
          </div>
          <MonthGrid month={month} selectedWeek={selectedWeek} today={today} onSelect={selectDay} />
        </Card>
      )}

    </>
  );
}

function MonthGrid({
  month,
  compact = false,
  selectedWeek,
  today,
  onSelect,
}: {
  month: CalendarMonth;
  compact?: boolean;
  selectedWeek: number;
  today?: IsoDate;
  onSelect: (cell: CalendarDay) => void;
}) {
  return (
    <div className={`cal-grid${compact ? " compact" : ""}`}>
      {WEEKDAYS.map((label, index) => (
        <span className="cal-weekday" key={`${label}-${index}`} aria-hidden="true">
          {label}
        </span>
      ))}

      {month.weeks.flat().map((cell) => {
        if (!cell.inMonth) return <span className="cal-day empty" key={cell.date} aria-hidden="true" />;

        const selected = cell.week === selectedWeek;
        const isToday = cell.date === today;
        const outside = cell.week === null;

        return (
          <button
            key={cell.date}
            type="button"
            className={`cal-day${selected ? " selected" : ""}${isToday ? " today" : ""}${outside ? " outside" : ""}`}
            style={cell.phase ? { ["--cycle" as string]: cycleColour(cell.phase.id) } : undefined}
            disabled={outside}
            aria-current={isToday ? "date" : undefined}
            aria-label={
              outside
                ? `${cell.dayOfMonth} ${month.shortLabel}, outside the programme`
                : `${cell.dayOfMonth} ${month.shortLabel}, week ${cell.week}, ${cell.phase?.name ?? "unassigned"}${
                    isToday ? ", today" : ""
                  }`
            }
            onClick={() => onSelect(cell)}
          >
            {cell.dayOfMonth}
          </button>
        );
      })}
    </div>
  );
}
