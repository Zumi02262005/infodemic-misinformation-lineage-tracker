import { useId, useMemo, useState } from 'react';
import { stratify, tree } from 'd3-hierarchy';
import { area, curveBasis, curveMonotoneX, line, linkRadial, stack, stackOffsetWiggle, stackOrderInsideOut } from 'd3-shape';
import { formatYear, truncate } from '../lib/format.js';
import { mutationOf, narrativeColor, rgba } from '../lib/theme.js';

/** Thumbnail of a narrative's lineage as a radial tree. */
export function Constellation({ claims, size = 88, color }) {
  const data = useMemo(() => {
    if (!claims?.length) return null;
    try {
      const root = stratify()
        .id((d) => String(d.id))
        .parentId((d) => (d.parent_id == null ? null : String(d.parent_id)))(claims);
      const radius = size / 2 - 7;
      tree()
        .size([2 * Math.PI, radius])
        .separation((a, b) => (a.parent === b.parent ? 1 : 2) / Math.max(1, a.depth))(root);
      return root;
    } catch {
      return null;
    }
  }, [claims, size]);
  if (!data) return <svg width={size} height={size} aria-hidden="true" />;
  const c = size / 2;
  const radial = linkRadial()
    .angle((d) => d.x)
    .radius((d) => d.y);
  const point = (d) => [c + d.y * Math.cos(d.x - Math.PI / 2), c + d.y * Math.sin(d.x - Math.PI / 2)];
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="constellation" aria-hidden="true">
      <circle cx={c} cy={c} r={c - 2} fill="none" stroke="rgba(150,170,255,0.08)" />
      <g transform={`translate(${c},${c})`}>
        {data.links().map((l, i) => (
          <path key={i} d={radial(l)} fill="none" stroke={rgba(color || mutationOf(l.target.data.mutation_type).color, 0.7)} strokeWidth={1.2} />
        ))}
      </g>
      {data.descendants().map((d) => {
        const [x, y] = point(d);
        const col = d.depth === 0 ? '#FFF1C2' : color || mutationOf(d.data.mutation_type).color;
        return <circle key={d.id} cx={x} cy={y} r={d.depth === 0 ? 3.6 : 2.2} fill={col} style={{ filter: `drop-shadow(0 0 3px ${rgba(col, 0.8)})` }} />;
      })}
    </svg>
  );
}

/** Cumulative count of variants over the narrative's active period. */
export function Sparkline({ claims, width = 140, height = 36, color = '#56D8FF' }) {
  const id = useId();
  const d = useMemo(() => {
    const times = (claims || []).map((c) => Date.parse(c.published_at)).filter(Number.isFinite).sort((a, b) => a - b);
    if (times.length < 2) return null;
    const t0 = times[0];
    const t1 = times[times.length - 1] || t0 + 1;
    const pts = times.map((t, i) => [((t - t0) / (t1 - t0 || 1)) * (width - 4) + 2, height - 3 - ((i + 1) / times.length) * (height - 8)]);
    pts.unshift([2, height - 3]);
    const ln = line().curve(curveMonotoneX)(pts);
    const ar = area()
      .x((p) => p[0])
      .y0(height)
      .y1((p) => p[1])
      .curve(curveMonotoneX)(pts);
    return { ln, ar };
  }, [claims, width, height]);
  if (!d) return <svg width={width} height={height} aria-hidden="true" />;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="sparkline">
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.35" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={d.ar} fill={`url(#${id})`} />
      <path d={d.ln} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

/**
 * Streamgraph of when each narrative's variants appeared, smoothed with a
 * Gaussian kernel so sparse data still reads as a flow.
 */
export function Streamgraph({ narratives, height = 260, onPick }) {
  const [hover, setHover] = useState(null);
  const width = 960;
  const model = useMemo(() => {
    const series = (narratives || []).filter((n) => n.claims?.length);
    const all = series.flatMap((n) => n.claims.map((c) => Date.parse(c.published_at))).filter(Number.isFinite);
    if (all.length < 2) return null;
    const t0 = Math.min(...all);
    const t1 = Math.max(...all);
    const span = Math.max(t1 - t0, 86400000 * 30);
    const pad = span * 0.04;
    const a = t0 - pad;
    const b = t1 + pad;
    const sigma = Math.max(span / 70, 86400000 * 12);
    const N = 160;
    const samples = Array.from({ length: N }, (_, i) => a + ((b - a) * i) / (N - 1));
    const rows = samples.map((t) => {
      const row = { t };
      for (const n of series) {
        let v = 0;
        for (const c of n.claims) {
          const dt = (t - Date.parse(c.published_at)) / sigma;
          v += Math.exp(-0.5 * dt * dt);
        }
        row[n.id] = v;
      }
      return row;
    });
    const keys = series.map((n) => n.id);
    const layers = stack().keys(keys).offset(stackOffsetWiggle).order(stackOrderInsideOut)(rows);
    let lo = Infinity;
    let hi = -Infinity;
    for (const L of layers) for (const p of L) {
      lo = Math.min(lo, p[0]);
      hi = Math.max(hi, p[1]);
    }
    const x = (t) => ((t - a) / (b - a)) * width;
    const y = (v) => 12 + ((hi - v) / (hi - lo || 1)) * (height - 40);
    const shape = area()
      .x((p) => x(p.data.t))
      .y0((p) => y(p[0]))
      .y1((p) => y(p[1]))
      .curve(curveBasis);
    // Peak period across all narratives, for the caption.
    let peak = rows[0];
    let peakV = -1;
    for (const r of rows) {
      const v = keys.reduce((s, k) => s + r[k], 0);
      if (v > peakV) {
        peakV = v;
        peak = r;
      }
    }
    const years = [];
    const y0 = new Date(a).getUTCFullYear();
    const y1 = new Date(b).getUTCFullYear();
    const step = Math.max(1, Math.ceil((y1 - y0) / 8));
    for (let yr = y0; yr <= y1 + 1; yr += step) {
      const t = Date.UTC(yr, 0, 1);
      if (t >= a && t <= b) years.push({ t, x: x(t), label: String(yr) });
    }
    return {
      paths: layers.map((L) => ({ id: L.key, d: shape(L), title: series.find((n) => String(n.id) === String(L.key))?.title })),
      years,
      peak: peak.t,
    };
  }, [narratives, height]);

  if (!model) return null;
  return (
    <figure className="stream">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="stream-svg" role="img" aria-label="Variants over time for each narrative">
        {model.years.map((yr) => (
          <line key={yr.t} x1={yr.x} x2={yr.x} y1={0} y2={height - 24} className="stream-grid" vectorEffect="non-scaling-stroke" />
        ))}
        {model.paths.map((p) => {
          const col = narrativeColor(p.id);
          const dim = hover != null && hover !== p.id;
          return (
            <path
              key={p.id}
              d={p.d}
              fill={rgba(col, dim ? 0.12 : 0.72)}
              stroke={rgba(col, dim ? 0.2 : 1)}
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
              className="stream-layer"
              onPointerEnter={() => setHover(p.id)}
              onPointerLeave={() => setHover(null)}
              onClick={() => onPick?.(Number(p.id))}
            >
              <title>{p.title}</title>
            </path>
          );
        })}
      </svg>
      <div className="stream-axis" aria-hidden="true">
        {model.years.map((yr) => (
          <span key={yr.t} style={{ left: `${(yr.x / width) * 100}%` }}>
            {yr.label}
          </span>
        ))}
      </div>
      <figcaption className="stream-caption">
        {hover != null ? (
          <>
            <span className="kind-dot" style={{ background: narrativeColor(hover) }} />
            {truncate(model.paths.find((p) => p.id === hover)?.title, 80)}
          </>
        ) : (
          <>Busiest period: {formatYear(model.peak)}. Hover a stream to see its narrative; click to open its lineage.</>
        )}
      </figcaption>
    </figure>
  );
}
