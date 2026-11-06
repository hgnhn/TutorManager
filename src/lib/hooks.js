import { useCallback, useEffect, useRef, useState } from 'react';
import { errMsg } from './supabase.js';

/** Load data now, when deps change, when the window regains focus, and every pollMs if given. */
export function useData(fetcher, deps, pollMs) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const seq = useRef(0);
  const fn = useRef(fetcher);
  fn.current = fetcher;

  const reload = useCallback(async () => {
    const n = ++seq.current;
    try {
      const d = await fn.current();
      if (n === seq.current) { setData(d); setError(''); }
    } catch (e) {
      if (n === seq.current) setError(errMsg(e));
    }
  }, []);

  useEffect(() => { reload(); }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    window.addEventListener('focus', reload);
    const t = pollMs ? setInterval(reload, pollMs) : null;
    return () => { window.removeEventListener('focus', reload); clearInterval(t); };
  }, [reload, pollMs]);

  return { data, error, reload };
}

export function useNow(ms = 60000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function useMedia(query) {
  const [on, setOn] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const h = () => setOn(m.matches);
    m.addEventListener('change', h);
    return () => m.removeEventListener('change', h);
  }, [query]);
  return on;
}
