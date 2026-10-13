import { useEffect, useState } from 'react';
import { LuDownload, LuPencil, LuTrash2 } from 'react-icons/lu';
import { api } from '../lib/api.js';
import { formatCompact, formatDate, formatSpan, truncate } from '../lib/format.js';
import { useApp } from '../lib/hooks.js';
import { useRouter } from '../lib/router.jsx';
import { MUTATIONS, MUTATION_ORDER, VERDICTS, datasetKindOf, mutationOf } from '../lib/theme.js';
import { MutationBadge, VerdictTag } from './bits.jsx';

function NarrativeEditor({ narrative, onDone }) {
  const { bump } = useApp();
  const { navigate } = useRouter();
  const [form, setForm] = useState({
    title: narrative.title || '',
    verdict: narrative.verdict || 'unverified',
    category: narrative.category || '',
    summary: narrative.summary || '',
    fact_check: narrative.fact_check || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.updateNarrative(narrative.id, form);
      bump();
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      await api.deleteNarrative(narrative.id);
      bump();
      navigate('/lineage');
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <form className="form form--compact" onSubmit={save}>
      <label className="field">
        <span className="field-label">Title</span>
        <input value={form.title} onChange={set('title')} required minLength={3} maxLength={200} />
      </label>
      <div className="field-row">
        <label className="field">
          <span className="field-label">Fact-check verdict</span>
          <select value={form.verdict} onChange={set('verdict')}>
            {Object.entries(VERDICTS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Category</span>
          <input value={form.category} onChange={set('category')} maxLength={80} placeholder="Health" />
        </label>
      </div>
      <label className="field">
        <span className="field-label">Summary</span>
        <textarea rows={3} value={form.summary} onChange={set('summary')} maxLength={1000} />
      </label>
      <label className="field">
        <span className="field-label">What fact-checkers found</span>
        <textarea rows={3} value={form.fact_check} onChange={set('fact_check')} maxLength={1000} />
      </label>
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions">
        <button type="submit" className="btn btn--primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        <button type="button" className="btn btn--quiet" onClick={onDone} disabled={saving}>
          Cancel
        </button>
      </div>
      <div className="danger-zone">
        {!confirmDelete ? (
          <button type="button" className="btn btn--quiet" onClick={() => setConfirmDelete(true)}>
            <LuTrash2 aria-hidden="true" /> Delete narrative
          </button>
        ) : (
          <div className="confirm">
            <span>Delete this narrative and all of its claims?</span>
            <button type="button" className="btn btn--danger" onClick={remove} disabled={saving}>
              Delete
            </button>
            <button type="button" className="btn btn--quiet" onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </form>
  );
}

/** Right-hand panel when no claim is selected: a brief on the narrative, or a key to the graph. */
export function NarrativePanel({ narrative, nodes, galaxy, colorBy, onSelect }) {
  const [editing, setEditing] = useState(false);
  useEffect(() => setEditing(false), [narrative?.id]);

  const mutationCounts = {};
  for (const n of nodes) mutationCounts[n.mutation_type] = (mutationCounts[n.mutation_type] || 0) + 1;
  const sources = {};
  for (const n of nodes) {
    const key = n.dataset_name || 'Unknown dataset';
    sources[key] = sources[key] || { count: 0, kind: n.dataset_kind };
    sources[key].count += 1;
  }
  const origin = nodes.find((n) => !n.parent_id) || null;
  const top = [...nodes].sort((a, b) => b.reach - a.reach)[0];
  const deepest = [...nodes].sort((a, b) => b.generation - a.generation)[0];

  if (galaxy) {
    return (
      <div className="panel-body">
        <h2 className="panel-title">Reading the graph</h2>
        <p className="panel-text">
          Each dot is one version of a claim. A solid line runs from a claim to the variant most likely copied from it; dashed lines join similar
          claims that live in different narratives.
        </p>
        <ul className="legend-list">
          <li>
            <span className="legend-swatch legend-swatch--origin" /> Ringed dots are origins, the earliest version found.
          </li>
          <li>
            <span className="legend-swatch legend-swatch--size" /> Bigger dots reached more people.
          </li>
          <li>
            <span className="legend-swatch legend-swatch--flow" /> Moving sparks show the direction of spread.
          </li>
        </ul>
        <p className="panel-text">Click any dot to see what it says and how it changed. Use the arrow keys to step through claims in time order.</p>
        {colorBy === 'narrative' && <p className="panel-text">Colours match the narratives listed on the left.</p>}
        {colorBy === 'mutation' && (
          <>
            <h3 className="insp-h">Mutation types in view</h3>
            <ul className="legend-list legend-list--grid">
              {MUTATION_ORDER.filter((k) => mutationCounts[k]).map((k) => (
                <li key={k}>
                  <MutationBadge type={k} size="sm" />
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="panel-note">{nodes.length} claims shown.</p>
      </div>
    );
  }

  if (!narrative) return null;
  return (
    <div className="panel-body">
      <div className="panel-toolbar">
        <VerdictTag verdict={narrative.verdict} />
        <span className="panel-toolbar-actions">
          <a className="icon-btn" href={api.exportUrl(narrative.id)} download={`narrative-${narrative.id}.json`} aria-label="Export this narrative as JSON" title="Export JSON">
            <LuDownload />
          </a>
          <button type="button" className={`icon-btn${editing ? ' is-on' : ''}`} onClick={() => setEditing((v) => !v)} aria-label="Edit narrative details" aria-pressed={editing} title="Edit">
            <LuPencil />
          </button>
        </span>
      </div>
      {editing ? (
        <NarrativeEditor narrative={narrative} onDone={() => setEditing(false)} />
      ) : (
        <>
          {narrative.summary && <p className="panel-text">{narrative.summary}</p>}
          {narrative.fact_check && (
            <div className="factcheck">
              <h3 className="insp-h">What fact-checkers found</h3>
              <p>{narrative.fact_check}</p>
            </div>
          )}
          {origin && (
            <section className="insp-section">
              <h3 className="insp-h">Where it started</h3>
              <button type="button" className="origin-card" onClick={() => onSelect(origin.id)}>
                <span className="quote">{origin.text}</span>
                <span className="origin-meta">
                  {origin.dataset_name || 'Unknown dataset'}, {formatDate(origin.published_at)}
                </span>
              </button>
            </section>
          )}
          <section className="insp-section">
            <h3 className="insp-h">At a glance</h3>
            <dl className="facts facts--grid">
              <div>
                <dt>Variants</dt>
                <dd>{nodes.length}</dd>
              </div>
              <div>
                <dt>Generations</dt>
                <dd>{deepest ? deepest.generation : 0}</dd>
              </div>
              <div>
                <dt>Total reach</dt>
                <dd>{formatCompact(nodes.reduce((s, n) => s + (n.reach || 0), 0))}</dd>
              </div>
              <div>
                <dt>Active for</dt>
                <dd>{nodes.length > 1 ? formatSpan(nodes[0].published_at, nodes[nodes.length - 1].published_at) : '—'}</dd>
              </div>
            </dl>
          </section>
          <section className="insp-section">
            <h3 className="insp-h">How it mutated</h3>
            <ul className="mix">
              {MUTATION_ORDER.filter((k) => mutationCounts[k]).map((k) => (
                <li key={k} style={{ '--c': MUTATIONS[k].color }}>
                  <span className="mix-label">{mutationOf(k).label}</span>
                  <span className="mix-bar" aria-hidden="true">
                    <span style={{ width: `${(mutationCounts[k] / nodes.length) * 100}%` }} />
                  </span>
                  <span className="mix-count">{mutationCounts[k]}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="insp-section">
            <h3 className="insp-h">Where it spread</h3>
            <ul className="mix">
              {Object.entries(sources)
                .sort((a, b) => b[1].count - a[1].count)
                .map(([name, v]) => (
                  <li key={name} style={{ '--c': datasetKindOf(v.kind).color }}>
                    <span className="mix-label">{truncate(name, 34)}</span>
                    <span className="mix-bar" aria-hidden="true">
                      <span style={{ width: `${(v.count / nodes.length) * 100}%` }} />
                    </span>
                    <span className="mix-count">{v.count}</span>
                  </li>
                ))}
            </ul>
          </section>
          {top && top.id !== origin?.id && (
            <section className="insp-section">
              <h3 className="insp-h">Most widely seen variant</h3>
              <button type="button" className="origin-card" onClick={() => onSelect(top.id)}>
                <span className="quote">{top.text}</span>
                <span className="origin-meta">
                  {formatCompact(top.reach)} reach, {formatDate(top.published_at)}
                </span>
              </button>
            </section>
          )}
        </>
      )}
    </div>
  );
}
