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
import { Card, PageHead } from "./Page";

/**
 * The training year as a calendar.
 *
 * A 52-cell grid of week numbers told you nothing about when a week actually
 * was. This is the shape a calendar app uses: a year of month grids, a month
 * view for detail, and one colour per cycle so the shape of the season is
 * visible at a glance rather than needing to be read.
 *
 * Colour comes from the phase table itself, so the legend, the year view and
 * the month view cannot drift apart — and adding a phase needs no change here.
 */

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

export interface AnnualPlanProps {
  selectedWeek: number;
  onSelectWeek: (week: number) => void;
  /** Today, so the calendar can mark it. */
  today?: IsoDate;
}

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
              style={{ ["--cycle" as string]: item.color }}
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
            style={cell.phase ? { ["--cycle" as string]: cell.phase.color } : undefined}
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
