import { useEffect, useRef, useState } from 'react';
import { supabase, ok } from '../lib/supabase.js';
import { useData } from '../lib/hooks.js';
import { fmtDate } from '../lib/time.js';

const newer = (a, b) => !b || Date.parse(a) > Date.parse(b);

// Student's header bell: unread badge + dropdown of the latest announcements.
export default function Bell({ userId, path, version }) {
  const key = `ann-seen:${userId}`;
  const [open, setOpen] = useState(false);
  const [seenBefore, setSeenBefore] = useState(null); // seen-marker when the panel opened, for bold/dot
  const wrap = useRef(null);
  const btn = useRef(null);

  const { data: unread, reload: reloadCount } = useData(async () => {
    const seen = localStorage.getItem(key);
    let q = supabase.from('announcements').select('id', { count: 'exact', head: true });
    if (seen) q = q.gt('created_at', seen);
    const { count, error } = await q;
    if (error) throw error;
    return count;
  }, [userId, path, version]);

  const { data: list } = useData(async () => {
    if (!open) return null; // null = "Đang tải…" on the next open, not a flash of the empty text
    return ok(await supabase.from('announcements').select('id, title, created_at').order('created_at', { ascending: false }).limit(10));
  }, [open]);

  useEffect(() => { setOpen(false); }, [path]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (!wrap.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); btn.current.focus(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  // Opening the panel counts as reading what it shows.
  useEffect(() => {
    if (!open || !list?.[0] || !newer(list[0].created_at, localStorage.getItem(key))) return;
    localStorage.setItem(key, list[0].created_at);
    reloadCount();
  }, [open, list]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggle() {
    if (!open) setSeenBefore(localStorage.getItem(key));
    setOpen(!open);
  }

  return (
    <div className="bell-wrap" ref={wrap}>
      <button ref={btn} type="button" className="bell" aria-expanded={open} aria-haspopup="true" onClick={toggle}
        aria-label={unread > 0 ? `Thông báo, ${unread} chưa đọc` : 'Thông báo'}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && <span className="bell__count" aria-hidden="true">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="bell-panel" role="dialog" aria-label="Thông báo" onClick={(e) => { if (e.target.closest('a')) setOpen(false); }}>
          <h2 className="bell-panel__title">Thông báo</h2>
          {!list && <p className="muted">Đang tải…</p>}
          {list && !list.length && <p className="muted">Chưa có thông báo nào.</p>}
          {list && list.length > 0 && (
            <ul>
              {list.map((a) => {
                const isNew = newer(a.created_at, seenBefore);
                return (
                  <li key={a.id}>
                    <a href={`#/thong-bao/${a.id}`}>
                      <strong>
                        {isNew && <><span className="bell-panel__dot" aria-hidden="true" /><span className="sr-only">(chưa đọc) </span></>}
                        {a.title}
                      </strong>
                      <span className="muted bell-panel__date">{fmtDate(new Date(a.created_at))}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="bell-panel__all"><a href="#/thong-bao">Xem tất cả</a></p>
        </div>
      )}
    </div>
  );
}
