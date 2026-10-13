import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LuCircleAlert } from 'react-icons/lu';
import { api } from './lib/api.js';
import { AppContext } from './lib/hooks.js';
import { Link, RouterProvider, matchPath, useRouter } from './lib/router.jsx';
import { TopBar } from './components/TopBar.jsx';
import { EmptyState } from './components/bits.jsx';
import { Overview } from './pages/Overview.jsx';
import { Explorer } from './pages/Explorer.jsx';
import { Compare } from './pages/Compare.jsx';
import { Ingest } from './pages/Ingest.jsx';

function HealthBanner({ health, onRetry }) {
  if (!health || health.ok) return null;
  const title = health.unreachable ? 'The Infodemic API is not running' : 'The API cannot reach PostgreSQL';
  const message = health.unreachable ? 'Start it with “npm run dev” in the project folder. This page reconnects on its own.' : health.database?.error;
  const hint = health.unreachable ? null : health.database?.hint;
  return (
    <div className="banner" role="alert">
      <LuCircleAlert className="banner-icon" aria-hidden="true" />
      <div className="banner-body">
        <p className="banner-title">{title}</p>
        {message && <p className="banner-text">{message}</p>}
        {hint && <p className="banner-text banner-hint">{hint}</p>}
      </div>
      <button type="button" className="btn btn--ghost btn--sm" onClick={onRetry}>
        Check again
      </button>
    </div>
  );
}

function Routes() {
  const { path } = useRouter();
  if (path === '/' || path === '') return <Overview />;
  if (path === '/lineage' || path === '/lineage/') return <Explorer key="lineage" narrativeParam={null} />;
  const lineage = matchPath('/lineage/:id', path);
  if (lineage) return <Explorer key="lineage" narrativeParam={lineage.id} />;
  if (path === '/compare') return <Compare />;
  if (path === '/ingest') return <Ingest />;
  return (
    <div className="page">
      <EmptyState
        title="There’s nothing at this address"
        action={
          <Link to="/" className="btn btn--ghost">
            Go to the overview
          </Link>
        }
      >
        Check the link, or start from the overview.
      </EmptyState>
    </div>
  );
}

function Shell() {
  const [health, setHealth] = useState(null);
  const [version, setVersion] = useState(0);
  const wasOk = useRef(null);

  const refreshHealth = useCallback(async () => {
    try {
      const h = await api.health();
      setHealth(h);
      // When the database comes back, reload whatever is on screen.
      if (h.ok && wasOk.current === false) setVersion((v) => v + 1);
      wasOk.current = h.ok;
    } catch {
      setHealth({ ok: false, unreachable: true });
      wasOk.current = false;
    }
  }, []);

  useEffect(() => {
    refreshHealth();
    const ok = health?.ok;
    const id = setInterval(refreshHealth, ok ? 30000 : 4000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [health?.ok]);

  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const ctx = useMemo(() => ({ health, version, bump, refreshHealth }), [health, version, bump, refreshHealth]);
  const { path } = useRouter();
  const fullBleed = path.startsWith('/lineage');

  return (
    <AppContext.Provider value={ctx}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <TopBar />
      <HealthBanner health={health} onRetry={refreshHealth} />
      <main id="main" className={fullBleed ? 'main main--full' : 'main'}>
        <Routes />
      </main>
    </AppContext.Provider>
  );
}

export default function App() {
  return (
    <RouterProvider>
      <Shell />
    </RouterProvider>
  );
}
