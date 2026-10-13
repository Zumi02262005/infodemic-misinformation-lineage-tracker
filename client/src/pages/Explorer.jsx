import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LuMaximize2, LuZoomIn, LuZoomOut } from 'react-icons/lu';
import { api } from '../lib/api.js';
import { formatCompact, formatSpan, plural, truncate } from '../lib/format.js';
import { useApp, useAsync, useDocumentTitle, useMediaQuery, usePrefersReducedMotion } from '../lib/hooks.js';
import { Link, useRouter } from '../lib/router.jsx';
import { COLOR_MODES, DATASET_KINDS, GENERATION_RAMP, MUTATIONS, MUTATION_ORDER, driftColor, narrativeColor, verdictOf } from '../lib/theme.js';
import { EmptyState, ErrorState, LoadingState } from '../components/bits.jsx';
import { Inspector } from '../components/Inspector.jsx';
import { LineageGraph } from '../components/LineageGraph.jsx';
import { NarrativePanel } from '../components/NarrativePanel.jsx';
import { Timeline } from '../components/Timeline.jsx';

const EMPTY = [];
const LAYOUTS = [
  { id: 'organic', label: 'Organic', hint: 'Force-directed: related variants cluster together' },
  { id: 'rings', label: 'Generations', hint: 'Rings: each ring is one generation away from the origin' },
  { id: 'timeline', label: 'Timeline', hint: 'Left to right by publication date' },
];

function Legend({ colorBy, nodes, narratives }) {
  let items = [];
  if (colorBy === 'mutation') {
    const present = new Set(nodes.map((n) => n.mutation_type));
    items = MUTATION_ORDER.filter((k) => present.has(k)).map((k) => [MUTATIONS[k].color, MUTATIONS[k].label]);
  } else if (colorBy === 'narrative') {
    const present = new Set(nodes.map((n) => n.narrative_id));
    items = narratives.filter((n) => present.has(n.id)).map((n) => [narrativeColor(n.id), truncate(n.title, 28)]);
  } else if (colorBy === 'dataset') {
    const present = new Set(nodes.map((n) => n.dataset_kind || 'other'));
    items = Object.entries(DATASET_KINDS).filter(([k]) => present.has(k)).map(([, v]) => [v.color, v.label]);
  } else if (colorBy === 'generation') {
    const max = nodes.reduce((m, n) => Math.max(m, n.generation), 0);
    items = GENERATION_RAMP.slice(0, Math.min(GENERATION_RAMP.length, max + 1)).map((c, i) => [c, i === 0 ? 'Origin' : `Gen ${i}${i === GENERATION_RAMP.length - 1 ? '+' : ''}`]);
  } else if (colorBy === 'drift') {
    return (
      <div className="legend legend--ramp">
        <span>Close to origin</span>
        <span className="ramp" style={{ background: `linear-gradient(90deg, ${driftColor(0)}, ${driftColor(0.5)}, ${driftColor(1)})` }} />
        <span>Far from origin</span>
      </div>
    );
  }
  return (
    <ul className="legend">
      {items.map(([c, label]) => (
        <li key={label}>
          <span className="legend-dot" style={{ background: c, boxShadow: `0 0 8px ${c}` }} />
          {label}
        </li>
      ))}
    </ul>
  );
}

function NarrativeList({ narratives, currentId, compact }) {
  const [filter, setFilter] = useState('');
  const { navigate } = useRouter();
  const shown = narratives.filter((n) => n.title.toLowerCase().includes(filter.trim().toLowerCase()));
  if (compact) {
    return (
      <label className="narrative-select">
        <span className="sr-only">Narrative</span>
        <select value={currentId ?? 'all'} onChange={(e) => navigate(e.target.value === 'all' ? '/lineage' : `/lineage/${e.target.value}`)}>
          <option value="all">All narratives</option>
          {narratives.map((n) => (
            <option key={n.id} value={n.id}>
              {n.title}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <nav className="rail" aria-label="Narratives">
      <div className="rail-head">
        <h2 className="rail-title">Narratives</h2>
        <input className="rail-filter" type="search" placeholder="Filter" aria-label="Filter narratives" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      <ul className="rail-list">
        <li>
          <Link to="/lineage" className={`rail-item${currentId == null ? ' is-current' : ''}`} aria-current={currentId == null ? 'page' : undefined}>
            <span className="rail-swatch rail-swatch--all" aria-hidden="true" />
            <span className="rail-text">
              <span className="rail-name">All narratives</span>
              <span className="rail-meta">{plural(narratives.reduce((s, n) => s + n.stats.claims, 0), 'claim')}</span>
            </span>
          </Link>
        </li>
        {shown.map((n) => (
          <li key={n.id}>
            <Link to={`/lineage/${n.id}`} className={`rail-item${currentId === n.id ? ' is-current' : ''}`} aria-current={currentId === n.id ? 'page' : undefined}>
              <span className="rail-swatch" style={{ background: narrativeColor(n.id), boxShadow: `0 0 10px ${narrativeColor(n.id)}` }} aria-hidden="true" />
              <span className="rail-text">
                <span className="rail-name">{n.title}</span>
                <span className="rail-meta">
                  {plural(n.stats.claims, 'variant')}
                  <span style={{ color: verdictOf(n.verdict).color }}>{verdictOf(n.verdict).label}</span>
                </span>
              </span>
            </Link>
          </li>
        ))}
        {!shown.length && filter.trim() && <li className="rail-empty">No narratives match “{filter}”.</li>}
      </ul>
    </nav>
  );
}

export function Explorer({ narrativeParam }) {
  const { query, navigate } = useRouter();
  const { version } = useApp();
  const reduced = usePrefersReducedMotion();
  const wide = useMediaQuery('(min-width: 1180px)');
  const medium = useMediaQuery('(min-width: 900px)');
  const graphRef = useRef(null);

  const narrativeId = narrativeParam != null && /^\d+$/.test(narrativeParam) ? Number(narrativeParam) : null;
  const badParam = narrativeParam != null && narrativeId == null;
  const galaxy = narrativeId == null;
  const selectedId = query.get('claim') && /^\d+$/.test(query.get('claim')) ? Number(query.get('claim')) : null;

  const list = useAsync((signal) => api.narratives({ signal }), [version]);
  const graph = useAsync((signal) => api.graph(narrativeId ?? 'all', { signal }), [narrativeId, version]);

  const [layout, setLayout] = useState('organic');
  const [colorPref, setColorPref] = useState({ galaxy: 'narrative', single: 'mutation' });
  const [relatedPref, setRelatedPref] = useState({ galaxy: true, single: false });
  const [flow, setFlow] = useState(!reduced);
  const [until, setUntil] = useState(null);
  const colorBy = colorPref[galaxy ? 'galaxy' : 'single'];
  const showRelated = relatedPref[galaxy ? 'galaxy' : 'single'];

  useEffect(() => setUntil(null), [narrativeId]);
  useEffect(() => {
    if (reduced) setFlow(false);
  }, [reduced]);

  // Only hand the graph data that belongs to the current view.
  const data = graph.data && (graph.data.narrative?.id ?? null) === narrativeId ? graph.data : null;
  const nodes = useMemo(() => data?.nodes ?? EMPTY, [data]);
  const links = useMemo(() => data?.links ?? EMPTY, [data]);
  const narratives = list.data ?? EMPTY;
  const narrativeTitles = useMemo(() => new Map((data?.narratives ?? []).map((n) => [n.id, n.title])), [data]);
  const narrative = data?.narrative ?? null;
  const selectedNode = selectedId != null ? nodes.find((n) => n.id === selectedId) : null;

  useDocumentTitle(narrative ? narrative.title : 'Lineage');

  const basePath = narrativeId == null ? '/lineage' : `/lineage/${narrativeId}`;
  const select = useCallback(
    (id, otherNarrativeId) => {
      if (id == null) {
        navigate(basePath, { replace: true });
        return;
      }
      if (otherNarrativeId != null && otherNarrativeId !== narrativeId && narrativeId != null) {
        navigate(`/lineage/${otherNarrativeId}?claim=${id}`);
        return;
      }
      navigate(`${basePath}?claim=${id}`, { replace: true });
    },
    [basePath, narrativeId, navigate],
  );

  // A claim from another narrative (e.g. via search) was opened in the wrong view.
  useEffect(() => {
    if (!data || selectedId == null || selectedNode) return;
    if (narrativeId != null) navigate(basePath, { replace: true });
  }, [data, selectedId, selectedNode, narrativeId, basePath, navigate]);

  const totalReach = nodes.reduce((s, n) => s + (n.reach || 0), 0);
  const maxGen = nodes.reduce((m, n) => Math.max(m, n.generation || 0), 0);
  const regions = new Set(nodes.map((n) => n.region).filter(Boolean)).size;
  const sources = new Set(nodes.map((n) => n.dataset_id).filter(Boolean)).size;
  const panelOpen = wide || selectedId != null;

  if (badParam) {
    return (
      <div className="page">
        <EmptyState title="That narrative link isn’t valid" action={<Link to="/lineage" className="btn btn--ghost">Show all narratives</Link>} />
      </div>
    );
  }

  return (
    <div className={`explorer${panelOpen ? ' has-panel' : ''}${medium ? '' : ' is-compact'}`}>
      {medium && <NarrativeList narratives={narratives} currentId={narrativeId} />}

      <section className="stage" aria-label="Lineage graph">
        <header className="stage-head">
          {!medium && <NarrativeList narratives={narratives} currentId={narrativeId} compact />}
          <div className="stage-title-wrap">
            <h1 className="stage-title">{galaxy ? 'All narratives' : narrative?.title || (graph.loading ? 'Loading…' : 'Narrative')}</h1>
            {nodes.length > 0 && (
              <ul className="stage-stats">
                <li>
                  <strong>{nodes.length}</strong> variants
                </li>
                {galaxy ? (
                  <li>
                    <strong>{narrativeTitles.size}</strong> narratives
                  </li>
                ) : (
                  <li>
                    <strong>{maxGen}</strong> generations
                  </li>
                )}
                <li>
                  <strong>{formatCompact(totalReach)}</strong> reach
                </li>
                <li>
                  <strong>{sources}</strong> sources
                </li>
                <li>
                  <strong>{regions}</strong> regions
                </li>
                {nodes.length > 1 && (
                  <li>
                    over <strong>{formatSpan(nodes[0].published_at, nodes[nodes.length - 1].published_at)}</strong>
                  </li>
                )}
              </ul>
            )}
          </div>
        </header>

        <div className="stage-canvas">
          {graph.error && (
            <div className="stage-overlay">
              <ErrorState error={graph.error} onRetry={graph.reload} title={graph.error.status === 404 ? 'This narrative no longer exists' : 'The graph could not load'} />
            </div>
          )}
          {!graph.error && !data && graph.loading && (
            <div className="stage-overlay">
              <LoadingState label="Loading lineage…" />
            </div>
          )}
          {data && nodes.length === 0 && (
            <div className="stage-overlay">
              <EmptyState title="No claims yet" action={<Link to="/ingest" className="btn btn--primary">Add claims</Link>}>
                Claims you add are grouped into narratives and drawn here.
              </EmptyState>
            </div>
          )}

          <LineageGraph
            ref={graphRef}
            nodes={nodes}
            links={links}
            galaxy={galaxy}
            layout={layout}
            colorBy={colorBy}
            showRelated={showRelated}
            flow={flow}
            selectedId={selectedId}
            onSelect={select}
            visibleUntil={until}
            reducedMotion={reduced}
            narrativeTitles={narrativeTitles}
            ariaLabel={`${galaxy ? 'All narratives' : narrative?.title || 'Narrative'} lineage graph with ${nodes.length} claims. Use arrow keys to move between claims.`}
          />

          <div className="graph-controls" role="toolbar" aria-label="Graph display">
            <div className="seg" role="radiogroup" aria-label="Layout">
              {LAYOUTS.map((l) => (
                <button key={l.id} type="button" role="radio" aria-checked={layout === l.id} className={`seg-btn${layout === l.id ? ' is-on' : ''}`} onClick={() => setLayout(l.id)} title={l.hint}>
                  {l.label}
                </button>
              ))}
            </div>
            <label className="select-pill">
              <span className="select-pill-label">Colour by</span>
              <select value={colorBy} onChange={(e) => setColorPref((p) => ({ ...p, [galaxy ? 'galaxy' : 'single']: e.target.value }))}>
                {COLOR_MODES.filter((m) => galaxy || m.id !== 'narrative').map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className={`toggle${showRelated ? ' is-on' : ''}`} aria-pressed={showRelated} onClick={() => setRelatedPref((p) => ({ ...p, [galaxy ? 'galaxy' : 'single']: !showRelated }))}>
              <span className="toggle-line toggle-line--dash" aria-hidden="true" />
              <span className="toggle-text">Similarity links</span>
            </button>
            <button type="button" className={`toggle${flow ? ' is-on' : ''}`} aria-pressed={flow} onClick={() => setFlow((v) => !v)} disabled={reduced} title={reduced ? 'Turned off because your system asks for reduced motion' : undefined}>
              <span className="toggle-spark" aria-hidden="true" />
              <span className="toggle-text">Flow</span>
            </button>
          </div>

          {!(colorBy === 'narrative' && medium) && nodes.length > 0 && (
            <div className="graph-legend">
              <Legend colorBy={colorBy} nodes={nodes} narratives={narratives} />
            </div>
          )}

          <div className="zoom-controls" role="group" aria-label="Zoom">
            <button type="button" className="icon-btn icon-btn--glass" onClick={() => graphRef.current?.zoomBy(1.35)} aria-label="Zoom in">
              <LuZoomIn />
            </button>
            <button type="button" className="icon-btn icon-btn--glass" onClick={() => graphRef.current?.zoomBy(1 / 1.35)} aria-label="Zoom out">
              <LuZoomOut />
            </button>
            <button type="button" className="icon-btn icon-btn--glass" onClick={() => graphRef.current?.fit(600)} aria-label="Fit graph to screen">
              <LuMaximize2 />
            </button>
          </div>
        </div>

        {nodes.length > 0 && (
          <Timeline nodes={nodes} value={until} onChange={setUntil} selectedTime={selectedNode ? Date.parse(selectedNode.published_at) : null} />
        )}
      </section>

      {panelOpen && (
        <aside className={`panel${selectedId != null && !wide ? ' panel--overlay' : ''}`} aria-label={selectedId != null ? 'Claim details' : 'Narrative details'}>
          {selectedId != null ? (
            <Inspector claimId={selectedId} onSelect={select} onClose={() => select(null)} />
          ) : (
            data && <NarrativePanel narrative={narrative} nodes={nodes} galaxy={galaxy} colorBy={colorBy} onSelect={select} />
          )}
        </aside>
      )}
    </div>
  );
}
