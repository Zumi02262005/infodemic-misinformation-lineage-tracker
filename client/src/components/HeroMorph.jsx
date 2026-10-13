import { useEffect, useRef, useState } from 'react';
import { LuChevronLeft, LuChevronRight, LuPause, LuPlay } from 'react-icons/lu';
import { formatDate } from '../lib/format.js';
import { Link } from '../lib/router.jsx';
import { datasetKindOf, mutationOf, rgba } from '../lib/theme.js';
import { MutationBadge } from './bits.jsx';

const STEP_MS = 4200;

/**
 * The Overview's opening moment: one real lineage replayed generation by
 * generation, with each step's edits shown in place.
 */
export function HeroMorph({ showcase, reducedMotion }) {
  const steps = showcase?.steps || [];
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const timer = useRef(null);

  useEffect(() => setI(0), [showcase]);

  useEffect(() => {
    clearTimeout(timer.current);
    if (reducedMotion || paused || userPaused || steps.length < 2) return undefined;
    const atEnd = i === steps.length - 1;
    timer.current = setTimeout(() => setI((v) => (v + 1) % steps.length), atEnd ? STEP_MS * 1.6 : STEP_MS);
    return () => clearTimeout(timer.current);
  }, [i, paused, userPaused, reducedMotion, steps.length]);

  if (!steps.length) return null;
  const step = steps[Math.min(i, steps.length - 1)];
  const m = mutationOf(step.mutation_type);
  const kind = datasetKindOf(step.dataset_kind);
  const autoplay = !reducedMotion && steps.length > 1;

  return (
    <div
      className="specimen"
      onPointerEnter={(e) => e.pointerType === 'mouse' && setPaused(true)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      style={{ '--stain': m.color, '--stain-soft': rgba(m.color, 0.16) }}
    >
      <div className="specimen-head">
        <span className="specimen-narrative">{showcase.narrative.title}</span>
        <span className="specimen-step">
          {step.generation !== 0
            ? `Generation ${step.generation} of ${steps.length - 1}`
            : steps.length > 1
              ? `Origin of a ${steps.length - 1}-generation lineage`
              : 'Origin'}
        </span>
      </div>

      <div className="specimen-body" aria-live="polite" key={step.id}>
        {i === 0 || !step.diff ? (
          <p className="specimen-text">{step.text}</p>
        ) : (
          <p className="specimen-text">
            {step.diff.map((o, k) => (
              <span key={k}>
                {k > 0 && ' '}
                {o.op === 'eq' && o.text}
                {o.op === 'add' && <ins className="morph-add" style={{ animationDelay: `${120 + k * 40}ms` }}>{o.text}</ins>}
                {o.op === 'del' && <del className="morph-del">{o.text}</del>}
              </span>
            ))}
          </p>
        )}
        <div className="specimen-meta">
          <MutationBadge type={step.mutation_type} size="sm" />
          <span className="specimen-source">
            <span className="kind-dot" style={{ background: kind.color }} aria-hidden="true" />
            {step.dataset_name || 'Unknown source'}
          </span>
          <span className="specimen-date">{formatDate(step.published_at)}</span>
        </div>
        {step.summary && step.generation > 0 && <p className="specimen-summary">{step.summary}</p>}
        {step.generation === 0 && (
          <p className="specimen-summary">
            {steps.length > 1 ? 'The earliest version found in the data. Watch what happens to it.' : 'The only version found so far. As variants are added, their changes replay here.'}
          </p>
        )}
      </div>

      {steps.length > 1 && (
      <div className="specimen-track">
        <button type="button" className="icon-btn" aria-label="Previous generation" onClick={() => setI((v) => Math.max(0, v - 1))} disabled={i === 0}>
          <LuChevronLeft />
        </button>
        <ol className="specimen-dots" aria-label="Generations">
          {steps.map((s, k) => {
            const c = mutationOf(s.mutation_type).color;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  className={`specimen-dot${k === i ? ' is-current' : ''}${k < i ? ' is-past' : ''}`}
                  style={{ '--c': c }}
                  onClick={() => setI(k)}
                  aria-label={`${k === 0 ? 'Origin' : `Generation ${s.generation}`}: ${mutationOf(s.mutation_type).label}`}
                  aria-current={k === i ? 'step' : undefined}
                />
              </li>
            );
          })}
        </ol>
        <button type="button" className="icon-btn" aria-label="Next generation" onClick={() => setI((v) => Math.min(steps.length - 1, v + 1))} disabled={i === steps.length - 1}>
          <LuChevronRight />
        </button>
        {autoplay && (
          <button type="button" className="icon-btn" aria-label={userPaused ? 'Resume autoplay' : 'Pause autoplay'} onClick={() => setUserPaused((v) => !v)}>
            {userPaused ? <LuPlay /> : <LuPause />}
          </button>
        )}
      </div>
      )}
      <Link to={`/lineage/${showcase.narrative.id}?claim=${step.id}`} className="specimen-link">
        See this claim in its lineage
      </Link>
    </div>
  );
}
