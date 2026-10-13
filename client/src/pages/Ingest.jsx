import { useMemo, useRef, useState } from 'react';
import { LuCheck, LuFileUp, LuSparkles } from 'react-icons/lu';
import { api } from '../lib/api.js';
import { formatDate, formatPercent, truncate } from '../lib/format.js';
import { useApp, useAsync, useDocumentTitle } from '../lib/hooks.js';
import { Link } from '../lib/router.jsx';
import { DATASET_KINDS, mutationOf, narrativeColor } from '../lib/theme.js';
import { DiffText, ErrorState, MutationBadge, ScoreRing } from '../components/bits.jsx';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const blank = () => ({
  text: '',
  published_at: today(),
  dataset: '',
  newDatasetName: '',
  newDatasetKind: 'social',
  author: '',
  region: '',
  reach: '',
  source_url: '',
  narrative: 'auto',
});

function MatchResult({ result, onCommit, committing, onReset }) {
  const linked = result.decision === 'linked';
  const saved = !result.dry_run;
  const m = result.analysis ? mutationOf(result.analysis.type) : null;
  return (
    <div className="result card" aria-live="polite">
      <p className={`result-kicker${saved ? ' is-saved' : ''}`}>
        {saved ? (
          <>
            <LuCheck aria-hidden="true" /> Claim added
          </>
        ) : (
          'Preview, not saved yet'
        )}
      </p>
      <h2 className="result-title">
        {linked ? (
          <>
            Joins <span style={{ color: narrativeColor(result.narrative.id) }}>{result.narrative.title}</span>
          </>
        ) : (
          'Starts a new narrative'
        )}
      </h2>

      {linked && result.parent && (
        <>
          <div className="result-score">
            <ScoreRing value={result.similarity} size={96} stroke={8} color={m?.color} label="match" />
            <div>
              <p className="insp-label">Closest earlier version, {formatDate(result.parent.published_at)}</p>
              <blockquote className="quote">{result.parent.text}</blockquote>
            </div>
          </div>
          {result.analysis && (
            <>
              <div className="tag-row">
                <MutationBadge type={result.analysis.type} />
                {result.analysis.tags.filter((t) => t !== result.analysis.type).map((t) => (
                  <MutationBadge key={t} type={t} size="sm" />
                ))}
              </div>
              <p className="insp-summary" style={{ borderColor: m.color }}>
                {result.analysis.summary}
              </p>
              <DiffText ops={result.diff} className="diff--card" />
            </>
          )}
        </>
      )}
      {linked && result.becomes_origin && (
        <p className="result-text">It is older than every claim already in this narrative, so it becomes the narrative’s new origin.</p>
      )}
      {linked && result.reason === 'manual' && <p className="muted small">You chose this narrative, so the automatic match was skipped.</p>}
      {!linked && (
        <p className="result-text">
          {result.reason === 'manual'
            ? 'You asked for a new narrative.'
            : result.best_match
              ? `No tracked claim reached the ${formatPercent(result.threshold)} link threshold. The closest was ${formatPercent(result.best_match.score)} similar.`
              : 'This is the first claim in the tracker.'}{' '}
          It will be titled “{truncate(result.narrative.title, 80)}”, and you can rename it from the lineage view.
        </p>
      )}

      {result.candidates?.length > 0 && (
        <details className="candidates">
          <summary>Top matches in the tracker</summary>
          <ol className="matches">
            {result.candidates.map((c) => (
              <li key={c.id}>
                <div className="match">
                  <span className="match-score" style={{ '--p': `${Math.round(c.score * 100)}%`, '--c': narrativeColor(c.narrative_id) }}>
                    {formatPercent(c.score)}
                  </span>
                  <span className="match-body">
                    <span className="match-text">{c.text}</span>
                    <span className="match-meta">{truncate(c.narrative_title, 60)}</span>
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </details>
      )}

      <div className="form-actions">
        {saved ? (
          <>
            <Link to={`/lineage/${result.narrative.id}?claim=${result.claim.id}`} className="btn btn--primary">
              Open in lineage
            </Link>
            <button type="button" className="btn btn--ghost" onClick={onReset}>
              Add another claim
            </button>
          </>
        ) : (
          <button type="button" className="btn btn--primary" onClick={onCommit} disabled={committing}>
            {committing ? 'Adding…' : 'Add this claim'}
          </button>
        )}
      </div>
    </div>
  );
}

function SingleClaim({ datasets, narratives, examples }) {
  const { bump } = useApp();
  const [form, setForm] = useState(blank);
  const [state, setState] = useState({ busy: null, result: null, error: null });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const payload = () => {
    const p = {
      text: form.text,
      published_at: form.published_at || undefined,
      author: form.author || undefined,
      region: form.region || undefined,
      reach: form.reach === '' ? undefined : form.reach,
      source_url: form.source_url || undefined,
    };
    if (form.dataset === '__new') {
      p.dataset = form.newDatasetName.trim() || undefined;
      p.dataset_kind = form.newDatasetKind;
    } else if (form.dataset) p.dataset = Number(form.dataset);
    if (form.narrative === 'new') p.force_new = true;
    else if (form.narrative !== 'auto') p.narrative_id = Number(form.narrative);
    return p;
  };

  const submit = async (dryRun) => {
    if (form.dataset === '__new' && !form.newDatasetName.trim()) {
      setState({ busy: null, result: null, error: new Error('Give the new dataset a name, or pick an existing one.') });
      return;
    }
    setState((s) => ({ ...s, busy: dryRun ? 'preview' : 'save', error: null }));
    try {
      const result = await api.ingest(payload(), { dryRun });
      setState({ busy: null, result, error: null });
      if (!dryRun) bump();
    } catch (error) {
      setState((s) => ({ ...s, busy: null, error }));
    }
  };

  const applyExample = (ex) => {
    const ds = datasets.find((d) => d.slug === ex.dataset);
    setForm({ ...blank(), text: ex.text, region: ex.region || '', dataset: ds ? String(ds.id) : '' });
    setState({ busy: null, result: null, error: null });
  };

  return (
    <div className="ingest-grid">
      <form
        className="form card"
        onSubmit={(e) => {
          e.preventDefault();
          submit(false);
        }}
      >
        <label className="field">
          <span className="field-label">Claim text</span>
          <textarea rows={4} value={form.text} onChange={set('text')} required minLength={8} maxLength={2000} placeholder="Paste the claim exactly as it was posted" />
          <span className="field-hint">{form.text.length}/2000 characters</span>
        </label>
        {examples?.length > 0 && (
          <div className="examples">
            <span className="examples-label">Try an example:</span>
            {examples.map((ex) => (
              <button key={ex.label} type="button" className="chip chip--button" onClick={() => applyExample(ex)}>
                {ex.label}
              </button>
            ))}
          </div>
        )}
        <div className="field-row">
          <label className="field">
            <span className="field-label">Published on</span>
            <input type="date" value={form.published_at} onChange={set('published_at')} min="1900-01-01" max="2100-12-31" />
          </label>
          <label className="field">
            <span className="field-label">Reach (shares or views)</span>
            <input type="number" min="0" step="1" inputMode="numeric" value={form.reach} onChange={set('reach')} placeholder="0" />
          </label>
        </div>
        <label className="field">
          <span className="field-label">Source dataset</span>
          <select value={form.dataset} onChange={set('dataset')}>
            <option value="">Not specified</option>
            {datasets.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
            <option value="__new">New dataset…</option>
          </select>
        </label>
        {form.dataset === '__new' && (
          <div className="field-row">
            <label className="field">
              <span className="field-label">Dataset name</span>
              <input value={form.newDatasetName} onChange={set('newDatasetName')} maxLength={120} placeholder="e.g. Viber community groups" />
            </label>
            <label className="field">
              <span className="field-label">Kind</span>
              <select value={form.newDatasetKind} onChange={set('newDatasetKind')}>
                {Object.entries(DATASET_KINDS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        <div className="field-row">
          <label className="field">
            <span className="field-label">Account or author</span>
            <input value={form.author} onChange={set('author')} maxLength={200} placeholder="@handle or page name" />
          </label>
          <label className="field">
            <span className="field-label">Region</span>
            <input value={form.region} onChange={set('region')} maxLength={60} placeholder="PH" />
          </label>
        </div>
        <label className="field">
          <span className="field-label">Link to the post</span>
          <input type="url" value={form.source_url} onChange={set('source_url')} placeholder="https://" />
        </label>
        <label className="field">
          <span className="field-label">Narrative</span>
          <select value={form.narrative} onChange={set('narrative')}>
            <option value="auto">Detect automatically</option>
            {narratives.map((n) => (
              <option key={n.id} value={n.id}>
                {truncate(n.title, 70)}
              </option>
            ))}
            <option value="new">Start a new narrative</option>
          </select>
        </label>
        {state.error && <p className="form-error">{state.error.message}</p>}
        <div className="form-actions">
          <button type="button" className="btn btn--ghost" onClick={() => submit(true)} disabled={!!state.busy || form.text.trim().length < 8}>
            {state.busy === 'preview' ? 'Matching…' : 'Preview match'}
          </button>
          <button type="submit" className="btn btn--primary" disabled={!!state.busy || form.text.trim().length < 8}>
            {state.busy === 'save' ? 'Adding…' : 'Add claim'}
          </button>
        </div>
      </form>

      <div className="ingest-side">
        {state.result ? (
          <MatchResult
            result={state.result}
            committing={state.busy === 'save'}
            onCommit={() => submit(false)}
            onReset={() => {
              setForm(blank());
              setState({ busy: null, result: null, error: null });
            }}
          />
        ) : (
          <div className="card explain">
            <LuSparkles className="explain-icon" aria-hidden="true" />
            <h2 className="explain-title">What happens when you add a claim</h2>
            <ol className="steps">
              <li>The text is compared with every claim already tracked, by shared words, phrases and spelling fragments.</li>
              <li>If the best match passes the link threshold, the claim joins that narrative. Otherwise it starts a new one.</li>
              <li>Its parent becomes the most similar claim published before it, and the change between them is labelled.</li>
            </ol>
            <p className="muted small">Use “Preview match” to see the result without saving anything.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function BulkImport() {
  const { bump } = useApp();
  const [content, setContent] = useState('');
  const [fileName, setFileName] = useState(null);
  const [drag, setDrag] = useState(false);
  const [state, setState] = useState({ busy: false, result: null, error: null });
  const inputRef = useRef(null);

  const format = useMemo(() => {
    const t = content.trim();
    if (!t) return null;
    return t.startsWith('[') || t.startsWith('{') ? 'json' : 'csv';
  }, [content]);

  const readFile = async (file) => {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      setState({ busy: false, result: null, error: new Error('That file is larger than 4 MB. Split it into smaller files.') });
      return;
    }
    setFileName(file.name);
    setContent(await file.text());
    setState({ busy: false, result: null, error: null });
  };

  const run = async () => {
    setState({ busy: true, result: null, error: null });
    try {
      const result = await api.bulk({ format, content });
      setState({ busy: false, result, error: null });
      bump();
    } catch (error) {
      setState({ busy: false, result: null, error });
    }
  };

  const r = state.result;
  return (
    <div className="bulk">
      <div
        className={`drop card${drag ? ' is-drag' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          readFile(e.dataTransfer.files?.[0]);
        }}
      >
        <LuFileUp className="drop-icon" aria-hidden="true" />
        <p className="drop-title">{fileName ? `Loaded ${fileName}` : 'Drop a CSV or JSON file here'}</p>
        <button type="button" className="btn btn--ghost" onClick={() => inputRef.current?.click()}>
          Choose a file
        </button>
        <input ref={inputRef} type="file" accept=".csv,.json,text/csv,application/json" hidden onChange={(e) => readFile(e.target.files?.[0])} />
        <p className="muted small">
          Columns: <code>text</code> (required), <code>published_at</code>, <code>dataset</code>, <code>dataset_kind</code>, <code>author</code>, <code>region</code>,{' '}
          <code>reach</code>, <code>source_url</code>. Up to 1,000 rows. Download a <a href="/samples/sample-claims.csv" download>sample CSV</a> or{' '}
          <a href="/samples/sample-claims.json" download>sample JSON</a>.
        </p>
      </div>
      <label className="field">
        <span className="field-label">Or paste CSV or JSON</span>
        <textarea
          rows={8}
          className="mono"
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            setFileName(null);
          }}
          placeholder={'text,published_at,dataset,region\n"5G masts spread the virus",2020-04-01,facebook-pages,PH'}
        />
      </label>
      <div className="form-actions">
        <button type="button" className="btn btn--primary" onClick={run} disabled={!content.trim() || state.busy}>
          {state.busy ? 'Importing… this can take a moment' : `Import ${format ? format.toUpperCase() : ''}`}
        </button>
        {format && <span className="muted small">Detected {format.toUpperCase()}. Rows are matched in date order, so earlier rows can become parents of later ones.</span>}
      </div>
      {state.error && <ErrorState error={state.error} title="Import failed" />}
      {r && (
        <section className="card" aria-live="polite">
          <h2 className="result-title">
            Imported {r.total - r.errors} of {r.total} rows
          </h2>
          <p className="result-text">
            {r.linked} joined existing narratives, {r.new_narratives} started new ones{r.errors ? `, ${r.errors} had errors` : ''}.
          </p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Row</th>
                  <th scope="col">Result</th>
                  <th scope="col">Narrative</th>
                  <th scope="col">Match</th>
                  <th scope="col">Change</th>
                </tr>
              </thead>
              <tbody>
                {r.results.map((row) => (
                  <tr key={row.row}>
                    <td>{row.row}</td>
                    <td>
                      <span className={`status-chip status-chip--${row.status}`}>
                        {row.status === 'linked' ? 'Linked' : row.status === 'new-narrative' ? 'New narrative' : 'Error'}
                      </span>
                    </td>
                    <td>
                      {row.status === 'error' ? (
                        <span className="form-error">{row.error}</span>
                      ) : (
                        <Link to={`/lineage/${row.narrative_id}?claim=${row.claim_id}`}>{truncate(row.narrative_title, 56)}</Link>
                      )}
                    </td>
                    <td>{row.similarity != null ? formatPercent(row.similarity) : '—'}</td>
                    <td>{row.mutation_type ? <MutationBadge type={row.mutation_type} size="sm" /> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

export function Ingest() {
  useDocumentTitle('Add claims');
  const { version } = useApp();
  const [tab, setTab] = useState('single');
  const datasets = useAsync((signal) => api.datasets({ signal }), [version]);
  const narratives = useAsync((signal) => api.narratives({ signal }), [version]);
  const examples = useAsync((signal) => api.examples({ signal }), []);

  return (
    <div className="page page--narrow">
      <header className="page-head">
        <h1 className="page-title">Add claims</h1>
        <p className="page-lede">Add a claim you found and the tracker files it into the right narrative, links it to the version it most likely came from, and labels what changed.</p>
      </header>
      <div className="tabs" role="tablist" aria-label="How to add claims">
        <button type="button" role="tab" id="tab-single" aria-controls="panel-single" aria-selected={tab === 'single'} className={`tab${tab === 'single' ? ' is-on' : ''}`} onClick={() => setTab('single')}>
          One claim
        </button>
        <button type="button" role="tab" id="tab-bulk" aria-controls="panel-bulk" aria-selected={tab === 'bulk'} className={`tab${tab === 'bulk' ? ' is-on' : ''}`} onClick={() => setTab('bulk')}>
          Import a file
        </button>
      </div>
      {(datasets.error || narratives.error) && <ErrorState error={datasets.error || narratives.error} onRetry={() => { datasets.reload(); narratives.reload(); }} />}
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'single' ? (
          <SingleClaim datasets={datasets.data || []} narratives={narratives.data || []} examples={examples.data?.ingest} />
        ) : (
          <BulkImport />
        )}
      </div>
    </div>
  );
}
