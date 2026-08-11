import {
  CHART,
  ChartGeometry,
  OuraTrendDay,
  chartGeometry,
} from "../../src/domain/healthTrends";
import { ChartEmpty } from "./Page";
import { formatIsoDate } from "../state/formatDate";

/**
 * v60's `lineChart`, as a component.
 *
 * All the arithmetic lives in `chartGeometry` — this is only the SVG. The
 * class names are the stylesheet's: `.chart` fixes the 190px height, and
 * `.chart-axis` / `.chart-point` are what make the line legible against both
 * themes without any colour being written here.
 *
 * Stroke colour comes in as a CSS custom property so the chart follows the
 * theme rather than pinning a hex that only works on one background.
 */

export interface LineChartProps {
  days: OuraTrendDay[];
  getter: (day: OuraTrendDay) => number | null;
  /** A token such as `var(--blue)`, never a literal colour. */
  color: string;
  /** Used in the accessible name and in the empty state's sentence. */
  label: string;
  /** True for series where zero is a real reading, e.g. high-stress minutes. */
  allowZero?: boolean;
  unit?: string;
}

function label(date: string): string {
  return formatIsoDate(date, { day: "numeric", month: "short" });
}

export function LineChart({ days, getter, color, label: name, allowZero, unit }: LineChartProps) {
  const geometry: ChartGeometry | null = chartGeometry(days, getter, { allowZero });

  if (!geometry) {
    return (
      <ChartEmpty
        title={`No ${name.toLowerCase()} data yet`}
        detail="Values appear once the ring has synced a day."
      />
    );
  }

  const { points, path, axisY } = geometry;
  const first = points[0];
  const last = points[points.length - 1];

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${CHART.width} ${CHART.height}`} role="img" aria-label={`${name} trend`}>
        <line className="chart-axis" x1={CHART.left} y1={axisY} x2={CHART.width - CHART.right} y2={axisY} />
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((point) => (
          <circle
            key={point.date}
            className="chart-point"
            cx={point.x}
            cy={point.y}
            r={4}
            stroke={color}
            strokeWidth={3}
          >
            <title>{`${label(point.date)}: ${point.value}${unit ? ` ${unit}` : ""}`}</title>
          </circle>
        ))}
        <text x={CHART.left} y={CHART.height - 8} fontSize={10}>
          {label(first.date)}
        </text>
        {points.length > 1 && (
          <text x={CHART.width - CHART.right} y={CHART.height - 8} textAnchor="end" fontSize={10}>
            {label(last.date)}
          </text>
        )}
      </svg>
    </div>
  );
}
