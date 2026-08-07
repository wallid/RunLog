import type { ReactNode } from "react";
import styles from "./primitives.module.css";

/**
 * Small shared display pieces.
 *
 * These carry the visual grammar the product asks for: proportional bubbles for
 * categories, blocks for intensity over time, cards for comparisons, dots for
 * distributions. Keeping them here means a widget picks a form rather than
 * inventing one.
 */

/**
 * A row of labelled figures.
 *
 * The number carries the weight and the unit sits back from it, so a row of
 * these scans as a set of values rather than a set of strings.
 */
export function StatRow({ stats }: { stats: { label: string; value: string; note?: string }[] }) {
  return (
    <dl className={styles.statRow}>
      {stats.map((stat) => {
        const [figure, unit] = splitUnit(stat.value);
        return (
          <div key={stat.label} className={styles.stat}>
            <dt className={styles.statLabel}>{stat.label}</dt>
            <dd className={styles.statValue}>
              <span className="numeric">{figure}</span>
              {unit && <span className={styles.statUnit}>{unit}</span>}
            </dd>
            {stat.note && <p className={styles.statNote}>{stat.note}</p>}
          </div>
        );
      })}
    </dl>
  );
}

/**
 * Separates a figure from its unit so the two can be weighted differently.
 *
 * The split only happens when what follows the number really is a unit: a short
 * run of non-digits. That keeps "3.02 km", "6:53/km" and "20:46" working while
 * leaving values that merely start with a number — a range like
 * "111 m – 119 m", or a phrase like "34 s/km slower" — intact.
 */
function splitUnit(value: string): [string, string] {
  const match = /^([\d.,:+−-]+)\s*([^\d]{0,4})$/.exec(value.trim());
  if (!match || match[1].length === 0) return [value, ""];
  return [match[1], match[2]];
}

/**
 * A list of label-and-value rows separated by hairlines.
 *
 * This is the shape a runner already reads totals in, and it holds far more
 * values legibly than a row of figures does.
 */
export function MetricRows({
  rows,
}: {
  rows: { label: string; value: string; detail?: string; accent?: string }[];
}) {
  return (
    <dl className={styles.metricRows}>
      {rows.map((row) => {
        const [figure, unit] = splitUnit(row.value);
        return (
          <div key={row.label} className={styles.metricRow}>
            <dt className={styles.metricLabel}>
              {row.accent && (
                <span className={styles.metricDot} style={{ background: row.accent }} />
              )}
              <span>
                {row.label}
                {row.detail && <span className={styles.metricDetail}>{row.detail}</span>}
              </span>
            </dt>
            <dd className={styles.metricValue}>
              <span className="numeric">{figure}</span>
              {unit && <span className={styles.metricUnit}>{unit}</span>}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

export interface Bubble {
  id: string;
  label: string;
  /** Drives the area of the bubble. */
  value: number;
  valueLabel: string;
  color: string;
  /** Shown under the bubble, e.g. a percentage. */
  subLabel?: string;
  selected?: boolean;
}

/**
 * Proportional bubbles laid out on a baseline.
 *
 * Area is proportional to value, so the reader compares sizes rather than
 * reading a number twice. Every bubble is also labelled, because area alone is
 * hard to compare precisely.
 */
export function BubbleRow({
  bubbles,
  onSelect,
  maxDiameter = 118,
  minDiameter = 34,
}: {
  bubbles: Bubble[];
  onSelect?: (id: string) => void;
  maxDiameter?: number;
  minDiameter?: number;
}) {
  const maxValue = Math.max(...bubbles.map((b) => b.value), 1);

  return (
    <ul className={styles.bubbleRow}>
      {bubbles.map((bubble) => {
        // Area, not diameter, carries the value.
        const ratio = Math.sqrt(Math.max(0, bubble.value) / maxValue);
        const diameter = Math.max(minDiameter, ratio * maxDiameter);
        const Element = onSelect ? "button" : "div";
        return (
          <li key={bubble.id} className={styles.bubbleItem}>
            <Element
              className={`${styles.bubble} ${bubble.selected ? styles.bubbleSelected : ""}`}
              style={{
                width: diameter,
                height: diameter,
                background: bubble.color,
              }}
              {...(onSelect
                ? {
                    type: "button" as const,
                    onClick: () => onSelect(bubble.id),
                    "aria-pressed": bubble.selected ?? false,
                    "aria-label": `${bubble.label}, ${bubble.valueLabel}`,
                  }
                : {})}
            >
              <span className={`${styles.bubbleValue} numeric`}>{bubble.valueLabel}</span>
            </Element>
            <span className={styles.bubbleLabel}>{bubble.label}</span>
            {bubble.subLabel && (
              <span className={`${styles.bubbleSubLabel} numeric`}>{bubble.subLabel}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export interface ComparisonPanel {
  title: string;
  primary: string;
  secondary?: string;
  detail?: string;
}

/**
 * Two panels with the direction of change between them.
 *
 * Used wherever the story is "this became that": first half against second,
 * opening against middle, uphill against flat.
 */
export function ComparisonCards({
  from,
  to,
  arrowLabel,
  direction = "neutral",
}: {
  from: ComparisonPanel;
  to: ComparisonPanel;
  arrowLabel?: string;
  direction?: "up" | "down" | "neutral";
}) {
  return (
    <div className={styles.comparison}>
      <Panel panel={from} />
      <div className={styles.comparisonArrow} aria-hidden="true">
        <span className={styles.arrowGlyph}>
          {direction === "up" ? "↗" : direction === "down" ? "↘" : "→"}
        </span>
        {arrowLabel && <span className={styles.arrowLabel}>{arrowLabel}</span>}
      </div>
      <Panel panel={to} />
    </div>
  );
}

function Panel({ panel }: { panel: ComparisonPanel }) {
  return (
    <div className={styles.panel}>
      <p className={styles.panelTitle}>{panel.title}</p>
      <p className={`${styles.panelPrimary} numeric`}>{panel.primary}</p>
      {panel.secondary && (
        <p className={`${styles.panelSecondary} numeric`}>{panel.secondary}</p>
      )}
      {panel.detail && <p className={styles.panelDetail}>{panel.detail}</p>}
    </div>
  );
}

/** A proportional horizontal bar used for category breakdowns. */
export function ProportionBars({
  rows,
  onSelect,
  selectedId,
}: {
  rows: {
    id: string;
    label: string;
    fraction: number;
    valueLabel: string;
    color: string;
    detail?: string;
  }[];
  onSelect?: (id: string) => void;
  selectedId?: string;
}) {
  return (
    <ul className={styles.barRows}>
      {rows.map((row) => {
        const content = (
          <>
            <span className={styles.barLabel}>{row.label}</span>
            <span className={styles.barTrack}>
              <span
                className={styles.barFill}
                style={{
                  width: `${Math.max(0.5, row.fraction * 100)}%`,
                  background: row.color,
                }}
              />
            </span>
            <span className={`${styles.barValue} numeric`}>{row.valueLabel}</span>
          </>
        );
        return (
          <li key={row.id} className={styles.barRow}>
            {onSelect ? (
              <button
                type="button"
                className={`${styles.barButton} ${selectedId === row.id ? styles.barSelected : ""}`}
                onClick={() => onSelect(row.id)}
                aria-pressed={selectedId === row.id}
              >
                {content}
              </button>
            ) : (
              <div className={styles.barButton}>{content}</div>
            )}
            {row.detail && <p className={styles.barDetail}>{row.detail}</p>}
          </li>
        );
      })}
    </ul>
  );
}

/** A labelled key for any widget showing more than one colour. */
export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className={styles.legend}>
      {items.map((item) => (
        <li key={item.label} className={styles.legendItem}>
          <span className={styles.legendSwatch} style={{ background: item.color }} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/** A single emphasised figure with its caption. */
export function HeroFigure({
  value,
  caption,
  tone = "neutral",
}: {
  value: string;
  caption: string;
  tone?: "neutral" | "positive" | "cautious";
}) {
  return (
    <div className={`${styles.hero} ${styles[`hero_${tone}`]}`}>
      <p className={`${styles.heroValue} numeric`}>{value}</p>
      <p className={styles.heroCaption}>{caption}</p>
    </div>
  );
}

export interface ScatterPoint {
  x: number;
  y: number;
}

/**
 * One metric against another, with the trend through it.
 *
 * The cloud is drawn faintly and the binned means over the top, because the
 * cloud shows how much scatter there is — which is the honest part — while the
 * line shows the direction, which is the part worth reading. Drawing only the
 * line would hide how loose the relationship was.
 *
 * A domain given high-to-low simply inverts that axis, which is how a pace axis
 * gets faster running on the left where a runner expects it.
 */
export function Scatter({
  points,
  xDomain,
  yDomain,
  xTicks,
  yTicks,
  formatX,
  formatY,
  xLabel,
  yLabel,
  trend,
  color,
  description,
  height = 250,
}: {
  points: ScatterPoint[];
  /** `[from, to]`; from greater than to draws the axis in reverse. */
  xDomain: [number, number];
  yDomain: [number, number];
  xTicks: number[];
  yTicks: number[];
  formatX: (value: number) => string;
  formatY: (value: number) => string;
  xLabel: string;
  yLabel: string;
  /** Binned means drawn over the cloud, in x order. */
  trend?: ScatterPoint[];
  color: string;
  description: string;
  height?: number;
}) {
  // A fixed drawing space scaled by CSS: no measurement, and identical output
  // on the server, where these are rendered in the tests.
  const width = 640;
  const padding = { top: 10, right: 12, bottom: 34, left: 52 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const toX = (value: number) =>
    padding.left +
    (xDomain[1] === xDomain[0]
      ? plotWidth / 2
      : ((value - xDomain[0]) / (xDomain[1] - xDomain[0])) * plotWidth);
  const toY = (value: number) =>
    padding.top +
    (yDomain[1] === yDomain[0]
      ? plotHeight / 2
      : plotHeight - ((value - yDomain[0]) / (yDomain[1] - yDomain[0])) * plotHeight);

  return (
    <div className={styles.scatterWrapper}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={styles.scatter}
        role="img"
        aria-label={description}
      >
        {yTicks.map((tick) => (
          <g key={`y-${tick}`}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={toY(tick)}
              y2={toY(tick)}
              stroke="var(--gridline)"
              strokeWidth={1}
            />
            <text
              x={padding.left - 8}
              y={toY(tick) + 4}
              textAnchor="end"
              className={styles.scatterTick}
            >
              {formatY(tick)}
            </text>
          </g>
        ))}

        {xTicks.map((tick) => (
          <text
            key={`x-${tick}`}
            x={toX(tick)}
            y={height - padding.bottom + 16}
            textAnchor="middle"
            className={styles.scatterTick}
          >
            {formatX(tick)}
          </text>
        ))}

        {/* Points outside the drawn range are left out rather than pinned to the
            edge: a stack of dots on the axis would read as data that was there. */}
        {points
          .filter(
            (point) =>
              point.x >= Math.min(...xDomain) &&
              point.x <= Math.max(...xDomain) &&
              point.y >= yDomain[0] &&
              point.y <= yDomain[1],
          )
          .map((point, index) => (
            <circle
              key={index}
              cx={toX(point.x)}
              cy={toY(point.y)}
              r={2.4}
              fill={color}
              fillOpacity={0.22}
            />
          ))}

        {trend && trend.length >= 2 && (
          <g>
            <polyline
              points={trend.map((p) => `${toX(p.x).toFixed(1)},${toY(p.y).toFixed(1)}`).join(" ")}
              fill="none"
              stroke={color}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {trend.map((p, index) => (
              <circle
                key={`trend-${index}`}
                cx={toX(p.x)}
                cy={toY(p.y)}
                r={4}
                fill="var(--surface-card)"
                stroke={color}
                strokeWidth={2.5}
              />
            ))}
          </g>
        )}

        <text
          x={padding.left + plotWidth / 2}
          y={height - 3}
          textAnchor="middle"
          className={styles.scatterAxisLabel}
        >
          {xLabel}
        </text>
        <text
          x={0}
          y={0}
          transform={`translate(11 ${padding.top + plotHeight / 2}) rotate(-90)`}
          textAnchor="middle"
          className={styles.scatterAxisLabel}
        >
          {yLabel}
        </text>
      </svg>
    </div>
  );
}

/** A shell for a chart with an accessible description. */
export function Figure({
  children,
  caption,
  description,
}: {
  children: ReactNode;
  caption?: string;
  description: string;
}) {
  return (
    <figure className={styles.figure}>
      <div role="img" aria-label={description}>
        {children}
      </div>
      {caption && <figcaption className={styles.figCaption}>{caption}</figcaption>}
    </figure>
  );
}
