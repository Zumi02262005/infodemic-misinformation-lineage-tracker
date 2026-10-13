import { useEffect, useState } from 'react';
import { LuArrowLeftRight } from 'react-icons/lu';
import { api } from '../lib/api.js';
import { formatDate, formatPercent, truncate } from '../lib/format.js';
import { useDebounced, useDocumentTitle } from '../lib/hooks.js';
import { Link, useRouter } from '../lib/router.jsx';
import { mutationOf, narrativeColor } from '../lib/theme.js';
import { DiffText, ErrorState, Meter, MutationBadge, ScoreRing, Spinner } from '../components/bits.jsx';

const EXAMPLES = [
  {
    label: 'A message gains fake authority',
    a: 'The coronavirus stays in your throat for 4 days. Drinking hot water every 15 minutes washes it into your stomach where the acid kills it.',
    b: 'Stanford doctors confirm: drinking hot water every 15 minutes kills 100% of the coronavirus. Share with everyone you love!',
  },
  {
    label: 'A chip claim picks up 5G',
    a: 'The coming COVID vaccine contains a microchip that records your data under your skin.',
    b: 'The COVID vaccine contains a microchip that tracks your location through 5G.',
  },
  {
    label: 'Two unrelated claims',
    a: 'Volcanoes produce more CO2 than all human activity combined.',
    b: 'The flag is waving in the moon landing video, but there is no wind on the moon.',
  },
];

const VERDICT_TEXT = {
  'same-lineage': { title: 'Same lineage', text: 'Close enough that the tracker would file the second claim as a variant of the first.' },
  related: { title: 'Loosely related', text: 'They share some wording or ideas, but not enough to be treated as the same claim.' },
  distinct: { title: 'Different claims', text: 'Little in common. The tracker would keep these in separate narratives.' },
};

function CorpusSearch() {
  const [text, setText] = useState('');
  const q = useDebounced(text.trim(), 300);
  const [state, setState] = useState({ loading: false, results: null, error: null });
  useEffect(() => {
    if (q.length < 2) {
      setState({ loading: false, results: null, error: null });
      return undefined;
    }
    const ctrl = new AbortController();
    setState((s) => ({ ...s, loading: true }));
    api.search(q, { signal: ctrl.signal }).then(
      (r) => setState({ loading: false, results: r.results, error: null }),
      (err) => err.name !== 'AbortError' && setState({ loading: false, results: null, error: err }),
    );
    return () => ctrl.abort();
  }, [q]);
  return (
    <section className="section">
      <div className="section-head">
        <h2 className="section-title">Find the closest tracked claims</h2>
        <p className="section-lede">Paste something you saw online to see which tracked claims it most resembles.</p>
      </div>
      <div className="card">
        <label className="field">
          <span className="field-label">Text to look up</span>
          <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. 5G masts are making people sick" />
        </label>
        {state.loading && (
          <p className="muted">
            <Spinner /> Searching…
          </p>
        )}
        {state.error && <ErrorState error={state.error} />}
        {state.results && !state.results.length && <p className="muted">No tracked claim resembles this yet.</p>}
        {state.results?.length > 0 && (
          <ol className="matches">
            {state.results.map((r) => (
              <li key={r.id}>
                <Link to={`/lineage/${r.narrative_id}?claim=${r.id}`} className="match">
                  <span className="match-score" style={{ '--p': `${Math.round(r.score * 100)}%`, '--c': narrativeColor(r.narrative_id) }}>
                    {formatPercent(r.score)}
                  </span>
                  <span className="match-body">
                    <span className="match-text">{r.text}</span>
                    <span className="match-meta">
                      {truncate(r.narrative_title, 60)}
                      <span>{formatDate(r.published_at)}</span>
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

export function Compare() {
  useDocumentTitle('Compare');
  const { query } = useRouter();
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [state, setState] = useState({ loading: false, result: null, error: null });

  // Prefill from claim ids (?a=12&b=34), as linked from the claim inspector.
  const qa = query.get('a');
  const qb = query.get('b');
  useEffect(() => {
    if (!qa || !qb) return;
    let alive = true;
    Promise.all([api.claim(qa), api.claim(qb)]).then(
      ([x, y]) => {
        if (!alive) return;
        setA(x.claim.text);
        setB(y.claim.text);
        run(x.claim.text, y.claim.text);
      },
      (err) => alive && setState({ loading: false, result: null, error: err }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qa, qb]);

  async function run(x = a, y = b) {
    if (x.trim().length < 3 || y.trim().length < 3) {
      setState({ loading: false, result: null, error: new Error('Enter both claims (at least 3 characters each).') });
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const result = await api.compare(x.trim(), y.trim());
      setState({ loading: false, result, error: null });
    } catch (error) {
      setState({ loading: false, result: null, error });
    }
  }

  const r = state.result;
  const v = r ? VERDICT_TEXT[r.verdict] : null;
  const ringColor = r ? (r.verdict === 'same-lineage' ? '#FF5A76' : r.verdict === 'related' ? '#FFD84D' : '#56D8FF') : '#56D8FF';

  return (
    <div className="page page--narrow">
      <header className="page-head">
        <h1 className="page-title">Compare two claims</h1>
        <p className="page-lede">
          Put an earlier claim on the left and a later one on the right. The similarity engine scores how closely they match and explains what
          changed between them.
        </p>
      </header>

      <form
        className="compare"
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <label className="field compare-a">
          <span className="field-label">Earlier claim</span>
          <textarea rows={4} value={a} onChange={(e) => setA(e.target.value)} maxLength={2000} placeholder="The original wording" />
        </label>
        <button
          type="button"
          className="icon-btn compare-swap"
          aria-label="Swap the two claims"
          onClick={() => {
            setA(b);
            setB(a);
          }}
        >
          <LuArrowLeftRight />
        </button>
        <label className="field compare-b">
          <span className="field-label">Later claim</span>
          <textarea rows={4} value={b} onChange={(e) => setB(e.target.value)} maxLength={2000} placeholder="The variant you found" />
        </label>
        <div className="compare-actions">
          <button type="submit" className="btn btn--primary" disabled={state.loading}>
            {state.loading ? 'Comparing…' : 'Compare claims'}
          </button>
          <span className="examples">
            <span className="examples-label">Try:</span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex.label}
                type="button"
                className="chip chip--button"
                onClick={() => {
                  setA(ex.a);
                  setB(ex.b);
                  run(ex.a, ex.b);
                }}
              >
                {ex.label}
              </button>
            ))}
          </span>
        </div>
      </form>

      {state.error && <ErrorState error={state.error} title="Could not compare" />}

      {r && (
        <section className="result card" aria-live="polite">
          <div className="result-score">
            <ScoreRing value={r.score} size={132} color={ringColor} label="similar" />
            <div>
              <h2 className="result-title">{v.title}</h2>
              <p className="result-text">{v.text}</p>
              <p className="muted small">A new claim joins an existing narrative at {formatPercent(r.thresholds.link)} or more.</p>
            </div>
          </div>
          <div className="result-grid">
            <div className="result-col">
              <h3 className="insp-h">Score breakdown</h3>
              <Meter label="Shared words and phrases" value={r.breakdown.lexical} color="#56D8FF" />
              <Meter label="Shared spelling fragments" value={r.breakdown.character} color="#B98CFF" />
              {r.breakdown.semantic != null ? (
                <Meter label="Meaning (embeddings)" value={r.breakdown.semantic} color="#4DF5A8" />
              ) : (
                <p className="muted small">Meaning-based embeddings are off. Set NLP_PROVIDER in server/.env to blend them in.</p>
              )}
              {r.shared_terms.length > 0 && (
                <>
                  <h3 className="insp-h">Words in common</h3>
                  <div className="tag-row">
                    {r.shared_terms.map((t) => (
                      <span key={t} className="chip">
                        {t}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="result-col">
              <h3 className="insp-h">What changed from the earlier claim</h3>
              {r.verdict === 'distinct' ? (
                <p className="muted">These read as different claims, so there is no single change to describe. The word-level differences are below.</p>
              ) : (
                <>
                  <div className="tag-row">
                    <MutationBadge type={r.analysis.type} />
                    {r.analysis.tags.filter((t) => t !== r.analysis.type).map((t) => (
                      <MutationBadge key={t} type={t} size="sm" />
                    ))}
                  </div>
                  <p className="insp-summary" style={{ borderColor: mutationOf(r.analysis.type).color }}>
                    {r.analysis.summary}
                  </p>
                </>
              )}
              <DiffText ops={r.diff} className="diff--card" />
            </div>
          </div>
        </section>
      )}

      <CorpusSearch />
    </div>
  );
}
