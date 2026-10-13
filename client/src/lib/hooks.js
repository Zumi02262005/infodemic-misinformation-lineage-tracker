import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

/** Shared app status: API health plus a version number that bumps whenever data changes. */
export const AppContext = createContext({ health: null, version: 0, bump: () => {}, refreshHealth: () => {} });
export const useApp = () => useContext(AppContext);

/**
 * Run an async loader and track loading / data / error. Re-runs when `deps` change.
 * The loader receives an AbortSignal; stale results are discarded.
 */
export function useAsync(loader, deps) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const [nonce, setNonce] = useState(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    const ctrl = new AbortController();
    setState((s) => ({ loading: true, data: s.data, error: null }));
    Promise.resolve()
      .then(() => loaderRef.current(ctrl.signal))
      .then(
        (data) => {
          if (!ctrl.signal.aborted) setState({ loading: false, data, error: null });
        },
        (error) => {
          if (!ctrl.signal.aborted && error?.name !== 'AbortError') setState({ loading: false, data: null, error });
        },
      );
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}

export function usePrefersReducedMotion() {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return undefined;
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

export function useMediaQuery(query) {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return undefined;
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}

export function useDebounced(value, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} — Infodemic` : 'Infodemic: misinformation lineage tracker';
  }, [title]);
}
