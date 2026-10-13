import { useState } from 'react';
import { LuSearch, LuX } from 'react-icons/lu';
import { useApp } from '../lib/hooks.js';
import { Link, useRouter } from '../lib/router.jsx';
import { BrandMark } from './Brand.jsx';
import { SearchBox } from './SearchBox.jsx';

const NAV = [
  { to: '/', label: 'Overview', match: (p) => p === '/' },
  { to: '/lineage', label: 'Lineage', match: (p) => p.startsWith('/lineage') },
  { to: '/compare', label: 'Compare', match: (p) => p.startsWith('/compare') },
  { to: '/ingest', label: 'Add claims', match: (p) => p.startsWith('/ingest') },
];

function StatusDot() {
  const { health } = useApp();
  let tone = 'pending';
  let text = 'Connecting to the API…';
  if (health?.unreachable) {
    tone = 'down';
    text = 'API server unreachable';
  } else if (health && !health.ok) {
    tone = 'down';
    text = 'Database unavailable';
  } else if (health?.ok) {
    tone = 'up';
    const nlp = health.nlp;
    text =
      nlp?.provider === 'local'
        ? 'Connected, using the built-in NLP engine'
        : `Connected, using ${nlp.provider} embeddings${nlp.semantic ? '' : ' (unavailable right now, so the built-in engine is used)'}`;
  }
  return (
    <span className={`status status--${tone}`} title={text}>
      <span className="status-dot" aria-hidden="true" />
      <span className="sr-only">{text}</span>
    </span>
  );
}

export function TopBar() {
  const { path } = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link to="/" className="brand" aria-label="Infodemic home">
          <BrandMark />
          <span className="brand-name">Infodemic</span>
        </Link>
        <nav className="nav" aria-label="Main">
          {NAV.map((item) => (
            <Link key={item.to} to={item.to} className={`nav-link${item.match(path) ? ' is-current' : ''}`} aria-current={item.match(path) ? 'page' : undefined}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="topbar-tools">
          <div className="topbar-search">
            <SearchBox />
          </div>
          <button
            type="button"
            className="icon-btn topbar-search-toggle"
            aria-label={searchOpen ? 'Close search' : 'Search claims'}
            aria-expanded={searchOpen}
            onClick={() => setSearchOpen((v) => !v)}
          >
            {searchOpen ? <LuX /> : <LuSearch />}
          </button>
          <StatusDot />
        </div>
      </div>
      {searchOpen && (
        <div className="topbar-search-row">
          <SearchBox autoFocus onDone={() => setSearchOpen(false)} />
        </div>
      )}
    </header>
  );
}
