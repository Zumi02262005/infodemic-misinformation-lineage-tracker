import { useMemo } from 'react';
import { api } from '../lib/api.js';
import { formatCompact, formatDate, formatNumber, formatSpan, formatYear, plural, truncate } from '../lib/format.js';
import { useApp, useAsync, useDocumentTitle, usePrefersReducedMotion } from '../lib/hooks.js';
import { Link, useRouter } from '../lib/router.jsx';
import { MUTATION_ORDER, datasetKindOf, mutationOf, narrativeColor, rgba } from '../lib/theme.js';
import { EmptyState, ErrorState, LoadingState, MutationBadge, VerdictTag } from '../components/bits.jsx';
import { Constellation, Sparkline, Streamgraph } from '../components/charts.jsx';
import { HeroMorph } from '../components/HeroMorph.jsx';

function Reticle() {
  // Decorative microscope reticle behind the hero specimen.
  const ticks = Array.from({ length: 72 }, (_, i) => i);
  return (
    <svg className="reticle" viewBox="-300 -300 600 600" aria-hidden="true">
      <circle r="292" className="reticle-ring" />
      <circle r="226" className="reticle-ring reticle-ring--faint" />
      <circle r="150" className="reticle-ring reticle-ring--faint" />
      {ticks.map((i) => {
        const a = (i / ticks.length) * Math.PI * 2;
        const long = i % 6 === 0;
        const r1 = long ? 274 : 282;
        return <line key={i} x1={Math.cos(a) * r1} y1={Math.sin(a) * r1} x2={Math.cos(a) * 292} y2={Math.sin(a) * 292} className="reticle-tick" />;
      })}
      <line x1="-300" x2="-240" y1="0" y2="0" className="reticle-tick" />
      <line x1="240" x2="300" y1="0" y2="0" className="reticle-tick" />
      <line y1="-300" y2="-240" x1="0" x2="0" className="reticle-tick" />
      <line y1="240" y2="300" x1="0" x2="0" className="reticle-tick" />
    </svg>
  );
}

function NarrativeRow({ n }) {
  const color = narrativeColor(n.id);
  const s = n.stats;
  return (
    <li>
      <Link to={`/lineage/${n.id}`} className="nrow" style={{ '--c': color, '--cglow': rgba(color, 0.18) }}>
        <span className="nrow-art">
          <Constellation claims={n.claims} size={84} />
        </span>
        <span className="nrow-main">
          <span className="nrow-title">{n.title}</span>
          {n.summary && <span className="nrow-summary">{truncate(n.summary, 150)}</span>}
          <span className="nrow-tags">
            <VerdictTag verdict={n.verdict} />
            {n.category && <span className="chip">{n.category}</span>}
          </span>
        </span>
        <span className="nrow-spark">
          <Sparkline claims={n.claims} color={color} width={132} height={40} />
          <span className="nrow-span">
            {s.first_seen ? `${formatYear(s.first_seen)}${formatYear(s.last_seen) !== formatYear(s.first_seen) ? `–${formatYear(s.last_seen)}` : ''}` : '—'}
          </span>
        </span>
        <span className="nrow-stats">
          <span>
            <strong>{s.claims}</strong> variants
          </span>
          <span>
            <strong>{s.generations}</strong> generations
          </span>
          <span>
            <strong>{formatCompact(s.reach)}</strong> reach
          </span>
        </span>
      </Link>
    </li>
  );
}

export function Overview() {
  useDocumentTitle(null);
  const { version } = useApp();
  const { navigate } = useRouter();
  const reduced = usePrefersReducedMotion();
  const stats = useAsync((signal) => api.stats({ signal }), [version]);
  const narratives = useAsync((signal) => api.narratives({ signal }), [version]);
  const showcase = useAsync((signal) => api.showcase(undefined, { signal }), [version]);

  const mutationRows = useMemo(() => {
    const m = stats.data?.mutations || {};
    const total = Object.values(m).reduce((a, b) => a + b, 0) || 1;
    return MUTATION_ORDER.filter((k) => m[k]).map((k) => ({ type: k, count: m[k], share: m[k] / total })).sort((a, b) => b.count - a.count);
  }, [stats.data]);

  const t = stats.data?.totals;
  const maxDataset = Math.max(1, ...(stats.data?.datasets || []).map((d) => d.claims));
  const empty = t && t.claims === 0;

  return (
    <div className="page overview">
      <section className="hero">
        <div className="hero-copy">
          <h1 className="hero-title">Every viral claim has a family tree.</h1>
          <p className="hero-lede">
            Infodemic finds the reworded, exaggerated and re-attributed versions of a claim across public datasets, then draws their lineage so you
            can trace any variant back to where it started.
          </p>
          <div className="hero-actions">
            <Link to="/lineage" className="btn btn--primary btn--lg">
              Explore lineages
            </Link>
            <Link to="/ingest" className="btn btn--ghost btn--lg">
              Check a claim
            </Link>
          </div>
          {t && !empty && (
            <p className="hero-tally">
              Tracking <strong>{plural(t.claims, 'claim variant')}</strong> in <strong>{plural(t.narratives, 'narrative')}</strong>
              {t.datasets > 0 && (
                <>
                  , drawn from <strong>{plural(t.datasets, 'dataset')}</strong>
                </>
              )}
              {t.regions > 0 && (
                <>
                  {' '}
                  across <strong>{plural(t.regions, 'region')}</strong>
                </>
              )}
              {t.claims > 1 && formatSpan(t.first_seen, t.last_seen) !== 'same day' && <>, spanning {formatSpan(t.first_seen, t.last_seen)}</>}.
            </p>
          )}
        </div>
        <div className="hero-lens">
          <Reticle />
          <div className="hero-lens-inner">
            {showcase.data && <HeroMorph showcase={showcase.data} reducedMotion={reduced} />}
            {showcase.loading && !showcase.data && <LoadingState label="Loading a lineage…" />}
            {!showcase.loading && !showcase.data && !showcase.error && (
              <EmptyState title="No lineages yet">Add a few claims and the longest lineage will replay here.</EmptyState>
            )}
          </div>
        </div>
      </section>

      {(stats.error || narratives.error) && (
        <ErrorState
          error={stats.error || narratives.error}
          onRetry={() => {
            stats.reload();
            narratives.reload();
            showcase.reload();
          }}
        />
      )}

      {empty && (
        <section className="section">
          <EmptyState
            title="The tracker is empty"
            action={
              <Link to="/ingest" className="btn btn--primary">
                Add your first claim
              </Link>
            }
          >
            Add claims one at a time or import a CSV file. Variants of the same claim are grouped into narratives automatically.
          </EmptyState>
        </section>
      )}

      {narratives.data?.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2 className="section-title">Narratives</h2>
            <p className="section-lede">Each narrative is one claim and every variant of it found so far. Open one to see how it branched.</p>
          </div>
          <ol className="nlist">
            {narratives.data.map((n) => (
              <NarrativeRow key={n.id} n={n} />
            ))}
          </ol>
        </section>
      )}

      {t && t.claims > 1 && narratives.data?.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2 className="section-title">Spread over time</h2>
            <p className="section-lede">When new variants of each narrative surfaced, smoothed so bursts read as waves.</p>
          </div>
          <Streamgraph narratives={narratives.data} onPick={(id) => navigate(`/lineage/${id}`)} />
        </section>
      )}

      {stats.data && !empty && (
        <section className="section split">
          <div>
            <div className="section-head">
              <h2 className="section-title">How claims change</h2>
              <p className="section-lede">Each variant is labelled by its strongest change from the claim it grew out of.</p>
            </div>
            <ul className="spectrum">
              {mutationRows.map((r) => {
                const m = mutationOf(r.type);
                return (
                  <li key={r.type} className="spectrum-row" style={{ '--c': m.color }}>
                    <span className="spectrum-name">
                      <MutationBadge type={r.type} />
                    </span>
                    <span className="spectrum-desc">{m.description}</span>
                    <span className="spectrum-bar" aria-hidden="true">
                      <span style={{ width: `${Math.max(3, r.share * 100)}%` }} />
                    </span>
                    <span className="spectrum-count">{formatNumber(r.count)}</span>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="stack">
            {stats.data.datasets.length > 0 && (
            <div>
              <div className="section-head">
                <h2 className="section-title">Sources</h2>
              </div>
              <ul className="sources">
                {stats.data.datasets.map((d) => {
                  const k = datasetKindOf(d.kind);
                  return (
                    <li key={d.id} className="source-row">
                      <span className="source-name">
                        <span className="kind-dot" style={{ background: k.color }} aria-hidden="true" />
                        {d.name}
                      </span>
                      <span className="source-kind">{k.label}</span>
                      <span className="source-bar" aria-hidden="true">
                        <span style={{ width: `${(d.claims / maxDataset) * 100}%`, background: k.color }} />
                      </span>
                      <span className="source-count">{d.claims}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
            )}
            <div>
              <div className="section-head">
                <h2 className="section-title">Latest additions</h2>
              </div>
              <ul className="feed">
                {stats.data.recent.map((c) => (
                  <li key={c.id}>
                    <Link to={`/lineage/${c.narrative_id}?claim=${c.id}`} className="feed-item">
                      <span className="feed-text">{truncate(c.text, 120)}</span>
                      <span className="feed-meta">
                        <MutationBadge type={c.mutation_type} size="sm" />
                        <span>{truncate(c.narrative_title, 42)}</span>
                        <span className="feed-date">{formatDate(c.published_at)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      {(stats.loading || narratives.loading) && !stats.data && !narratives.data && !stats.error && <LoadingState label="Loading the tracker…" />}
    </div>
  );
}
