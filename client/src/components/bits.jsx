import { LuCircleAlert, LuRefreshCw } from 'react-icons/lu';
import { mutationOf, rgba, verdictOf } from '../lib/theme.js';

export function MutationBadge({ type, size = 'md' }) {
  const m = mutationOf(type);
  return (
    <span className={`mbadge mbadge--${size}`} style={{ '--c': m.color, '--cbg': rgba(m.color, 0.12), '--cline': rgba(m.color, 0.32) }} title={m.description}>
      <span className="mbadge-dot" aria-hidden="true" />
      {m.label}
    </span>
  );
}

export function VerdictTag({ verdict }) {
  const v = verdictOf(verdict);
  return (
    <span className="verdict" style={{ '--c': v.color, '--cbg': rgba(v.color, 0.1) }}>
      Fact-check: {v.label}
    </span>
  );
}

/** Inline word diff: removed words struck through, inserted words highlighted. */
export function DiffText({ ops, className = '' }) {
  if (!ops?.length) return null;
  return (
    <p className={`diff ${className}`}>
      {ops.map((o, i) => (
        <span key={i}>
          {i > 0 && ' '}
          {o.op === 'eq' && <span className="diff-eq">{o.text}</span>}
          {o.op === 'add' && (
            <ins className="diff-add">
              <span className="sr-only">added: </span>
              {o.text}
            </ins>
          )}
          {o.op === 'del' && (
            <del className="diff-del">
              <span className="sr-only">removed: </span>
              {o.text}
            </del>
          )}
        </span>
      ))}
    </p>
  );
}

export function Spinner({ label = 'Loading' }) {
  return (
    <span className="spinner" role="status">
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function LoadingState({ label = 'Loading…' }) {
  return (
    <div className="state">
      <Spinner label={label} />
      <p className="state-text">{label}</p>
    </div>
  );
}

export function ErrorState({ error, onRetry, title = 'This view could not load' }) {
  const hint = error?.data?.hint;
  return (
    <div className="state state--error" role="alert">
      <LuCircleAlert className="state-icon" aria-hidden="true" />
      <p className="state-title">{title}</p>
      <p className="state-text">{error?.message || String(error)}</p>
      {hint && <p className="state-hint">{hint}</p>}
      {onRetry && (
        <button type="button" className="btn btn--ghost" onClick={onRetry}>
          <LuRefreshCw aria-hidden="true" /> Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="state">
      <p className="state-title">{title}</p>
      {children && <div className="state-text">{children}</div>}
      {action}
    </div>
  );
}

/** Circular similarity gauge. */
export function ScoreRing({ value, size = 120, stroke = 9, color = '#56D8FF', label }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.min(1, Math.max(0, value ?? 0));
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(150,170,255,0.12)" strokeWidth={stroke} />
        <circle
          className="ring-arc"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * v} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ filter: `drop-shadow(0 0 6px ${rgba(color, 0.55)})` }}
        />
      </svg>
      <div className="ring-center">
        <span className="ring-value">{Math.round(v * 100)}%</span>
        {label && <span className="ring-label">{label}</span>}
      </div>
    </div>
  );
}

/** A horizontal bar for a 0–1 value. */
export function Meter({ value, color = '#56D8FF', label, valueLabel }) {
  const v = Math.min(1, Math.max(0, value ?? 0));
  return (
    <div className="meter">
      <div className="meter-head">
        <span>{label}</span>
        <span className="meter-value">{valueLabel ?? `${Math.round(v * 100)}%`}</span>
      </div>
      <div className="meter-track">
        <div className="meter-fill" style={{ width: `${v * 100}%`, background: color, boxShadow: `0 0 10px ${rgba(color, 0.5)}` }} />
      </div>
    </div>
  );
}
