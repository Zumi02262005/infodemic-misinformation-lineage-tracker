import { useEffect, useState } from 'react';
import { LuArrowLeftRight, LuExternalLink, LuTrash2, LuX } from 'react-icons/lu';
import { api } from '../lib/api.js';
import { formatCompact, formatDate, formatPercent, truncate } from '../lib/format.js';
import { useApp, useAsync } from '../lib/hooks.js';
import { Link } from '../lib/router.jsx';
import { datasetKindOf, driftColor, mutationOf, narrativeColor } from '../lib/theme.js';
import { DiffText, EmptyState, ErrorState, LoadingState, Meter, MutationBadge, ScoreRing } from './bits.jsx';

function Signals({ signals }) {
  if (!signals) return null;
  const rows = [];
  if (signals.numbersAdded?.length) {
    rows.push(['Figures', signals.numbersRemoved?.length ? `${signals.numbersRemoved.join(', ')} → ${signals.numbersAdded.join(', ')}` : `Adds ${signals.numbersAdded.join(', ')}`]);
  }
  if (signals.authority?.length) rows.push(['Authority', signals.authority.join(', ')]);
  if (signals.entities?.length) rows.push(['New context', signals.entities.join(', ')]);
  if (signals.intensifiers?.length) rows.push(['Certainty', signals.intensifiers.map((w) => `“${w}”`).join(', ')]);
  if (signals.hedgesRemoved?.length) rows.push(['Hedges dropped', signals.hedgesRemoved.map((w) => `“${w}”`).join(', ')]);
  if (signals.hooks?.length) rows.push(['Share pressure', signals.hooks.map((w) => `“${w}”`).join(', ')]);
  if (!rows.length) return null;
  return (
    <dl className="signals">
      {rows.map(([k, v]) => (
        <div className="signals-row" key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function ClaimRow({ claim, onSelect, current, showNarrative }) {
  const m = mutationOf(claim.mutation_type);
  return (
    <li>
      <button type="button" className={`crow${current ? ' is-current' : ''}`} onClick={() => onSelect(claim.id, claim.narrative_id)} aria-current={current || undefined}>
        <span className="crow-gen" style={{ '--c': showNarrative ? narrativeColor(claim.narrative_id) : m.color }}>
          {showNarrative ? '' : claim.generation}
        </span>
        <span className="crow-body">
          <span className="crow-text">{truncate(claim.text, 110)}</span>
          <span className="crow-meta">
            {showNarrative ? truncate(claim.narrative_title, 40) : m.label}
            <span className="crow-date">{formatDate(claim.published_at)}</span>
            {claim.link_similarity != null && <span className="crow-date">{formatPercent(claim.link_similarity)} similar</span>}
          </span>
        </span>
      </button>
    </li>
  );
}

/** Details for the selected claim: what it says, how it changed, and where it sits in the lineage. */
export function Inspector({ claimId, onSelect, onClose }) {
  const { version, bump } = useApp();
  const detail = useAsync((signal) => api.claim(claimId, { signal }), [claimId, version]);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  useEffect(() => {
    setConfirming(false);
    setDeleteError(null);
  }, [claimId]);

  if (detail.loading && !detail.data) return <div className="panel-body"><LoadingState label="Loading claim…" /></div>;
  if (detail.error?.status === 404) {
    return (
      <div className="panel-body">
        <EmptyState
          title="This claim no longer exists"
          action={
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              Close
            </button>
          }
        >
          It may have been deleted or moved.
        </EmptyState>
      </div>
    );
  }
  if (detail.error) return <div className="panel-body"><ErrorState error={detail.error} onRetry={detail.reload} /></div>;
  const d = detail.data;
  if (!d) return null;
  const { claim, parent, path, children, related, mutation, diff } = d;
  const kind = datasetKindOf(claim.dataset_kind);
  const isOrigin = !claim.parent_id;

  const remove = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.deleteClaim(claim.id);
      onClose();
      bump();
    } catch (err) {
      setDeleteError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="panel-body inspector">
      <div className="insp-head">
        <MutationBadge type={claim.mutation_type} />
        <span className="insp-gen">{isOrigin ? 'Origin of this narrative' : `Generation ${claim.generation}`}</span>
        <button type="button" className="icon-btn insp-close" onClick={onClose} aria-label="Close claim details">
          <LuX />
        </button>
      </div>

      <blockquote className="quote quote--lg">{claim.text}</blockquote>

      <dl className="facts">
        <div>
          <dt>Source</dt>
          <dd>
            <span className="kind-dot" style={{ background: kind.color }} aria-hidden="true" />
            {claim.dataset_name || 'Unknown dataset'}
          </dd>
        </div>
        <div>
          <dt>Published</dt>
          <dd>{formatDate(claim.published_at)}</dd>
        </div>
        <div>
          <dt>Account</dt>
          <dd>{claim.author || '—'}</dd>
        </div>
        <div>
          <dt>Region</dt>
          <dd>{claim.region || '—'}</dd>
        </div>
        <div>
          <dt>Reach</dt>
          <dd>{formatCompact(claim.reach)}</dd>
        </div>
        {claim.source_url && (
          <div>
            <dt>Link</dt>
            <dd>
              <a href={claim.source_url} target="_blank" rel="noopener noreferrer nofollow" className="ext-link">
                Open original <LuExternalLink aria-hidden="true" />
              </a>
            </dd>
          </div>
        )}
      </dl>

      {mutation && parent && (
        <section className="insp-section">
          <h3 className="insp-h">How it changed</h3>
          <div className="insp-change">
            <ScoreRing value={claim.similarity} size={78} stroke={7} color={mutationOf(claim.mutation_type).color} label="match" />
            <div>
              <p className="insp-summary">{mutation.summary}</p>
              {mutation.tags?.length > 1 && (
                <div className="tag-row">
                  {mutation.tags.filter((t) => t !== claim.mutation_type).map((t) => (
                    <MutationBadge key={t} type={t} size="sm" />
                  ))}
                </div>
              )}
            </div>
          </div>
          <p className="insp-label">Changes from the earlier version</p>
          <DiffText ops={diff} className="diff--card" />
          <Signals signals={mutation.signals} />
        </section>
      )}

      {!isOrigin && (
        <section className="insp-section">
          <Meter value={claim.drift} color={driftColor(claim.drift)} label="Drift from the origin" valueLabel={formatPercent(claim.drift)} />
          <p className="insp-note">How little wording this version still shares with the first one found.</p>
        </section>
      )}

      <section className="insp-section">
        <h3 className="insp-h">Lineage</h3>
        <ol className="crow-list crow-list--path">
          {path.map((c) => (
            <ClaimRow key={c.id} claim={c} current={c.id === claim.id} onSelect={onSelect} />
          ))}
        </ol>
      </section>

      {children.length > 0 && (
        <section className="insp-section">
          <h3 className="insp-h">Variants that grew from it</h3>
          <ul className="crow-list">
            {children.map((c) => (
              <ClaimRow key={c.id} claim={c} onSelect={onSelect} />
            ))}
          </ul>
        </section>
      )}

      {related.length > 0 && (
        <section className="insp-section">
          <h3 className="insp-h">Similar claims elsewhere</h3>
          <ul className="crow-list">
            {related.map((c) => (
              <ClaimRow key={c.id} claim={c} onSelect={onSelect} showNarrative={c.narrative_id !== claim.narrative_id} />
            ))}
          </ul>
        </section>
      )}

      <div className="insp-actions">
        {parent && (
          <Link to={`/compare?a=${parent.id}&b=${claim.id}`} className="btn btn--ghost">
            <LuArrowLeftRight aria-hidden="true" /> Compare with parent
          </Link>
        )}
        {!confirming ? (
          <button type="button" className="btn btn--quiet" onClick={() => setConfirming(true)}>
            <LuTrash2 aria-hidden="true" /> Delete claim
          </button>
        ) : (
          <div className="confirm" role="group" aria-label="Confirm deletion">
            <span>Delete this claim? Its variants will be re-linked.</span>
            <button type="button" className="btn btn--danger" onClick={remove} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
            <button type="button" className="btn btn--quiet" onClick={() => setConfirming(false)} disabled={deleting}>
              Cancel
            </button>
          </div>
        )}
        {deleteError && <p className="form-error">{deleteError}</p>}
      </div>
    </div>
  );
}
