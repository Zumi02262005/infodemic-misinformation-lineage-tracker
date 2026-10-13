import { useEffect, useId, useRef, useState } from 'react';
import { LuSearch, LuX } from 'react-icons/lu';
import { api } from '../lib/api.js';
import { truncate, formatYear } from '../lib/format.js';
import { useDebounced } from '../lib/hooks.js';
import { useRouter } from '../lib/router.jsx';
import { narrativeColor } from '../lib/theme.js';

/** Global search: finds claims by meaning as well as exact words, then opens them in the lineage view. */
export function SearchBox({ autoFocus = false, onDone }) {
  const { navigate } = useRouter();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [state, setState] = useState({ loading: false, results: [], error: null });
  const debounced = useDebounced(text.trim(), 220);
  const listId = useId();
  const boxRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (debounced.length < 2) {
      setState({ loading: false, results: [], error: null });
      return undefined;
    }
    const ctrl = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    api.search(debounced, { signal: ctrl.signal }).then(
      (r) => {
        setState({ loading: false, results: r.results, error: null });
        setActive(0);
      },
      (err) => {
        if (err.name !== 'AbortError') setState({ loading: false, results: [], error: err.message });
      },
    );
    return () => ctrl.abort();
  }, [debounced]);

  useEffect(() => {
    const onDoc = (e) => {
      if (!boxRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDoc);
    return () => document.removeEventListener('pointerdown', onDoc);
  }, []);

  const go = (r) => {
    navigate(`/lineage/${r.narrative_id}?claim=${r.id}`);
    setOpen(false);
    setText('');
    inputRef.current?.blur();
    onDone?.();
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(state.results.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' && state.results[active]) {
      e.preventDefault();
      go(state.results[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
      onDone?.();
    }
  };

  const showList = open && debounced.length >= 2;
  return (
    <div className="search" ref={boxRef}>
      <LuSearch className="search-icon" aria-hidden="true" />
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList && state.results[active] ? `${listId}-${active}` : undefined}
        aria-label="Search claims"
        placeholder="Search claims, e.g. “salt water”"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {text && (
        <button type="button" className="search-clear" aria-label="Clear search" onClick={() => setText('')}>
          <LuX />
        </button>
      )}
      {showList && (
        <div className="search-pop" id={listId} role="listbox">
          {state.loading && !state.results.length && <p className="search-note">Searching…</p>}
          {state.error && <p className="search-note">{state.error}</p>}
          {!state.loading && !state.error && !state.results.length && <p className="search-note">No claims match “{debounced}”.</p>}
          {state.results.map((r, i) => (
            <button
              type="button"
              role="option"
              id={`${listId}-${i}`}
              aria-selected={i === active}
              key={r.id}
              className={`search-item${i === active ? ' is-active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(r)}
            >
              <span className="search-dot" style={{ background: narrativeColor(r.narrative_id) }} />
              <span className="search-text">
                <span className="search-claim">{truncate(r.text, 96)}</span>
                <span className="search-meta">
                  {truncate(r.narrative_title || 'Untitled narrative', 48)}
                  <span className="search-year">{formatYear(r.published_at)}</span>
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
