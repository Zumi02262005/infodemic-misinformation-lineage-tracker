import { useEffect, useMemo, useRef, useState } from 'react';
import { LuPause, LuPlay, LuRotateCcw } from 'react-icons/lu';
import { formatDate, formatYear } from '../lib/format.js';

const REPLAY_MS = 9000;

/**
 * Histogram of when variants appeared, with a scrubber. Dragging or playing it
 * hides every claim published after the cursor, replaying how the lineage grew.
 */
export function Timeline({ nodes, value, onChange, selectedTime }) {
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(600);
  const [playing, setPlaying] = useState(false);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(200, e.contentRect.width)));
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const { t0, t1, bins, max } = useMemo(() => {
    const times = nodes.map((n) => Date.parse(n.published_at)).filter(Number.isFinite);
    if (!times.length) return { t0: 0, t1: 1, bins: [], max: 1 };
    let a = Math.min(...times);
    let b = Math.max(...times);
    if (b - a < 86400000) {
      a -= 43200000;
      b += 43200000;
    }
    const count = Math.max(12, Math.min(80, Math.floor(width / 9)));
    const arr = new Array(count).fill(0);
    for (const t of times) arr[Math.min(count - 1, Math.floor(((t - a) / (b - a)) * count))] += 1;
    return { t0: a, t1: b, bins: arr, max: Math.max(1, ...arr) };
  }, [nodes, width]);

  // Replay animation
  useEffect(() => {
    if (!playing) return undefined;
    let raf;
    let last = performance.now();
    const step = (now) => {
      const dt = now - last;
      last = now;
      const cur = valueRef.current ?? t0;
      const next = cur + ((t1 - t0) * dt) / REPLAY_MS;
      if (next >= t1) {
        onChange(null);
        setPlaying(false);
        return;
      }
      onChange(next);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, t0, t1, onChange]);

  // Stop playing when the data set changes.
  useEffect(() => setPlaying(false), [t0, t1]);

  const H = 46;
  const barW = bins.length ? width / bins.length : 0;
  const pos = value == null ? width : ((value - t0) / (t1 - t0)) * width;
  const selX = selectedTime != null ? ((selectedTime - t0) / (t1 - t0)) * width : null;

  const fromPointer = (e) => {
    const rect = wrapRef.current.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    setPlaying(false);
    onChange(f >= 0.999 ? null : t0 + f * (t1 - t0));
  };

  const onKey = (e) => {
    const stepMs = (t1 - t0) / Math.max(1, bins.length);
    const cur = value ?? t1;
    let next = null;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = Math.max(t0, cur - stepMs);
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = cur + stepMs;
    else if (e.key === 'Home') next = t0;
    else if (e.key === 'End') next = t1;
    else return;
    e.preventDefault();
    setPlaying(false);
    onChange(next >= t1 ? null : next);
  };

  const togglePlay = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (value == null || value >= t1) onChange(t0);
    setPlaying(true);
  };

  const visibleCount = value == null ? nodes.length : nodes.filter((n) => Date.parse(n.published_at) <= value).length;

  return (
    <div className="timeline">
      <div className="timeline-controls">
        <button type="button" className="icon-btn icon-btn--solid" onClick={togglePlay} aria-label={playing ? 'Pause replay' : 'Replay how this lineage grew'} disabled={!nodes.length}>
          {playing ? <LuPause /> : <LuPlay />}
        </button>
        <div className="timeline-readout" aria-live="polite">
          <span className="timeline-date">{value == null ? 'All time' : formatDate(value)}</span>
          <span className="timeline-count">
            {visibleCount} of {nodes.length} variants
          </span>
        </div>
        {value != null && (
          <button type="button" className="icon-btn" onClick={() => { setPlaying(false); onChange(null); }} aria-label="Show all variants">
            <LuRotateCcw />
          </button>
        )}
      </div>
      <div className="timeline-track-wrap">
        <div
          ref={wrapRef}
          className="timeline-track"
          role="slider"
          tabIndex={0}
          aria-label="Show variants published up to"
          aria-valuemin={t0}
          aria-valuemax={t1}
          aria-valuenow={value ?? t1}
          aria-valuetext={value == null ? 'All time' : formatDate(value)}
          onKeyDown={onKey}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture?.(e.pointerId);
            fromPointer(e);
          }}
          onPointerMove={(e) => {
            if (e.buttons === 1) fromPointer(e);
          }}
        >
          <svg width={width} height={H} aria-hidden="true">
            {bins.map((c, i) => {
              if (!c) return null;
              const h = 4 + (c / max) * (H - 10);
              const x = i * barW;
              const lit = x + barW / 2 <= pos;
              return <rect key={i} x={x + 1} y={H - h} width={Math.max(1.5, barW - 2)} height={h} rx={1.5} className={lit ? 'tl-bar is-lit' : 'tl-bar'} />;
            })}
            {selX != null && <line x1={selX} x2={selX} y1={0} y2={H} className="tl-selected" />}
            {value != null && (
              <g transform={`translate(${pos},0)`}>
                <line y1={0} y2={H} className="tl-cursor" />
                <circle cy={4} r={4} className="tl-knob" />
              </g>
            )}
          </svg>
        </div>
        <div className="timeline-scale" aria-hidden="true">
          <span>{formatYear(t0)}</span>
          <span>{formatYear(t1)}</span>
        </div>
      </div>
    </div>
  );
}
