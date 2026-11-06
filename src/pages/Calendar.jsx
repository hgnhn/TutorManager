import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase, errMsg, ok } from '../lib/supabase.js';
import { useApp } from '../lib/app.js';
import { useData, useNow, useMedia } from '../lib/hooks.js';
import {
  ROWS, FIRST_HOUR, HALF, addDays, startOfWeek, sameDay, withDates, rowIndex, snapRow, dragRange,
  firstFutureRow, dayRows, contains, freeIntervals, mergeRange, halfHours,
  weekdayName, fmtDay, fmtDate, fmtTime, fmtRange,
} from '../lib/time.js';
import StatusPill, { statusWord } from '../components/StatusPill.jsx';
import BookingActions from '../components/BookingActions.jsx';

const SHORT = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const HOURS = Array.from({ length: ROWS / 2 }, (_, i) => `${String(FIRST_HOUR + i).padStart(2, '0')}:00`);
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const todayIdx = () => (new Date().getDay() + 6) % 7;

export default function Calendar() {
  const { session, isTutor, toast, bump } = useApp();
  const isStudent = !!session && !isTutor;
  const now = useNow();
  const mobile = useMedia('(max-width: 720px)');
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [dayIdx, setDayIdx] = useState(todayIdx);
  const [sel, setSel] = useState(null); // tutor: {type:'free'|'booking', id}; student: {type:'range', start, end}
  const [draft, setDraft] = useState(null);
  const drag = useRef(null);
  const panelRef = useRef(null);
  const wk = weekStart.getTime();
  const days = useMemo(() => ALL_DAYS.map((i) => addDays(weekStart, i)), [wk]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data, error, reload } = useData(async () => {
    const from = weekStart.toISOString();
    const to = addDays(weekStart, 7).toISOString();
    const [av, tk, bk] = await Promise.all([
      supabase.from('availability').select('*').lt('start_at', to).gt('end_at', from).order('start_at'),
      supabase.rpc('taken_slots', { from_ts: from, to_ts: to }),
      session
        ? supabase.from('bookings').select(isTutor ? '*, profiles(full_name)' : '*').lt('start_at', to).gt('end_at', from)
        : { data: [] },
    ]);
    return { wk, avail: ok(av).map(withDates), taken: ok(tk).map(withDates), bookings: ok(bk).map(withDates) };
  }, [wk, session?.user.id, isTutor]);

  const d = data?.wk === wk ? data : null;
  const avail = d?.avail ?? [];
  const bookings = (d?.bookings ?? []).filter((b) => !isTutor || b.status === 'pending' || b.status === 'approved');
  const same = (a, b) => a.start.getTime() === b.start.getTime() && a.end.getTime() === b.end.getTime();
  // own approved lessons are drawn as bookings, so skip them among "taken"
  const taken = isTutor ? [] : (d?.taken ?? []).filter((t) => !bookings.some((b) => b.status === 'approved' && same(b, t)));
  const busy = [...taken, ...bookings.filter((b) => b.status === 'pending' || b.status === 'approved')];
  const free = isStudent ? freeIntervals(avail, busy, now) : [];

  useEffect(() => { if (sel && mobile) panelRef.current?.scrollIntoView({ block: 'nearest' }); }, [sel, mobile]);

  const changeWeek = (start) => { setWeekStart(start); setSel(null); };

  // ----- tutor: availability -----
  async function paint(range) {
    if (avail.some((a) => contains(a, range))) return;
    const m = mergeRange(avail, range); // join touching blocks so students can book across them
    const ins = await supabase.from('availability').insert({ start_at: m.start.toISOString(), end_at: m.end.toISOString() });
    if (ins.error) return toast(errMsg(ins.error), 'error');
    if (m.ids.length) {
      const del = await supabase.from('availability').delete().in('id', m.ids);
      if (del.error) toast(errMsg(del.error), 'error');
    }
    reload();
  }

  async function removeFree(id) {
    const { error: e } = await supabase.from('availability').delete().eq('id', id);
    if (e) return toast(errMsg(e), 'error');
    setSel(null);
    reload();
  }

  async function copyLastWeek() {
    try {
      const prev = ok(await supabase.from('availability').select('*')
        .lt('start_at', weekStart.toISOString()).gt('end_at', addDays(weekStart, -7).toISOString()));
      if (!prev.length) return toast('Tuần trước chưa có giờ rảnh để chép.');
      const rows = prev.map(withDates)
        .map((r) => ({ start: addDays(r.start, 7), end: addDays(r.end, 7) }))
        .filter((r) => r.end > now && !avail.some((a) => contains(a, r)));
      if (!rows.length) return toast('Tuần này đã có đủ các giờ rảnh của tuần trước.');
      ok(await supabase.from('availability').insert(rows.map((r) => ({ start_at: r.start.toISOString(), end_at: r.end.toISOString() }))));
      toast(`Đã chép ${rows.length} khung giờ rảnh.`);
      reload();
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  }

  // ----- student: choosing a range -----
  function pickRange(range) {
    if (!free.some((f) => contains(f, range))) {
      return toast('Khoảng giờ phải nằm trong một khung giờ rảnh và không trùng buổi học khác.', 'error');
    }
    setSel({ type: 'range', ...range });
  }

  function pickBlock(a) {
    const piece = free.find((f) => contains(a, f));
    if (piece) setSel({ type: 'range', start: piece.start, end: piece.end });
    else toast('Khung giờ này đã kín hoặc đã qua. Chọn khung khác.', 'error');
  }

  // ----- pointer drag on a day column -----
  function down(e, i) {
    if (!session || e.button > 0) return;
    if (isTutor && e.target.closest('.mark')) return; // clicking a mark selects it instead of painting
    const box = e.currentTarget.getBoundingClientRect();
    const min = firstFutureRow(days[i], now);
    const row = snapRow(e.clientY - box.top, box.height / ROWS);
    if (row < min) return;
    drag.current = { i, anchor: row, cur: row, min, moved: false, id: e.pointerId };
  }

  function move(e) {
    const g = drag.current;
    if (!g || g.id !== e.pointerId) return;
    if (!e.buttons) { drag.current = null; return; }
    const box = e.currentTarget.getBoundingClientRect();
    const row = Math.max(g.min, snapRow(e.clientY - box.top, box.height / ROWS));
    if (!g.moved) {
      if (row === g.anchor) return;
      g.moved = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    g.cur = row;
    setDraft({ i: g.i, a: g.anchor, b: row });
  }

  function up() {
    const g = drag.current;
    drag.current = null;
    setDraft(null);
    if (!g?.moved) return;
    const range = dragRange(days[g.i], g.anchor, g.cur);
    if (isTutor) paint(range); else pickRange(range);
  }

  const cancel = () => { drag.current = null; setDraft(null); };

  // ----- rendering -----
  const shown = mobile ? [dayIdx] : ALL_DAYS;

  function marksFor(day) {
    const out = [];
    const put = (r, { key, ...props }) => {
      const g = dayRows(r, day);
      if (g) out.push(<Mark key={key} top={g.top} len={g.len} {...props} />);
    };
    const when = (r) => `${weekdayName(day)} ${fmtTime(r.start)} đến ${fmtTime(r.end)}`;

    for (const a of avail) {
      const selected = isTutor && sel?.type === 'free' && sel.id === a.id;
      let onClick;
      if (a.end > now && isTutor) onClick = () => setSel({ type: 'free', id: a.id });
      else if (a.end > now && isStudent) onClick = () => pickBlock(a);
      put(a, { key: `f${a.id}`, cls: 'free', label: `Giờ rảnh ${when(a)}`, onClick, selected });
    }
    for (const t of taken) put(t, { key: `t${t.start_at}`, cls: 'taken', label: `Đã có người học ${when(t)}` });
    for (const b of bookings) {
      const name = b.profiles?.full_name || 'Học viên';
      const word = statusWord(b.status);
      if (isTutor) {
        put(b, {
          key: `b${b.id}`, cls: b.status, text: name, label: `${word} ${name} ${when(b)}`,
          selected: sel?.type === 'booking' && sel.id === b.id,
          onClick: () => setSel({ type: 'booking', id: b.id }),
        });
      } else {
        const cls = b.status === 'rejected' || b.status === 'cancelled' ? 'struck' : b.status;
        put(b, { key: `b${b.id}`, cls, text: word, label: `${word} ${when(b)}` });
      }
    }
    return out;
  }

  const bookingSel = sel?.type === 'booking' && bookings.find((b) => b.id === sel.id);
  const freeSel = sel?.type === 'free' && avail.find((a) => a.id === sel.id);
  const rangeSel = sel?.type === 'range' ? sel : null;
  const draftRows = (i) => draft && draft.i === i ? { top: Math.min(draft.a, draft.b), len: Math.abs(draft.a - draft.b) + 1 } : null;
  const rangeRows = (day) => rangeSel ? dayRows(rangeSel, day) : null;

  const title = !session ? 'Lịch rảnh' : isTutor ? 'Lịch' : 'Đặt buổi học';
  const lead = !session
    ? 'Chọn giờ còn trống để đặt buổi học. Đăng nhập để gửi yêu cầu.'
    : isTutor
      ? 'Kéo trên lịch để thêm giờ rảnh. Bấm vào một khung để xem hoặc xoá.'
      : 'Kéo trong vùng vàng hoặc bấm vào một khung giờ rảnh, rồi gửi yêu cầu cho gia sư.';

  return (
    <main className="page">
      <div className="page__head">
        <h1>{title}</h1>
        <p>{lead}</p>
      </div>
      <div className="cal-layout">
        <div>
          <div className="cal-toolbar">
            <button type="button" className="btn btn--secondary" onClick={() => changeWeek(addDays(weekStart, -7))}>Tuần trước</button>
            <button type="button" className="btn btn--secondary" onClick={() => { changeWeek(startOfWeek(new Date())); setDayIdx(todayIdx()); }}>Tuần này</button>
            <button type="button" className="btn btn--secondary" onClick={() => changeWeek(addDays(weekStart, 7))}>Tuần sau</button>
            <span className="cal-toolbar__range">{days[0].getDate()}/{days[0].getMonth() + 1} – {fmtDate(days[6])}</span>
            {isTutor && <button type="button" className="btn btn--secondary cal-toolbar__copy" onClick={copyLastWeek}>Chép lịch tuần trước</button>}
          </div>
          {error && <p className="error" role="alert">{error}. Kiểm tra mạng rồi quay lại trang này.</p>}
          {mobile && (
            <div className="daybar">
              {ALL_DAYS.map((i) => (
                <button
                  key={i} type="button" aria-pressed={i === dayIdx}
                  aria-current={sameDay(days[i], now) ? 'date' : undefined}
                  aria-label={`${weekdayName(days[i])} ${days[i].getDate()}/${days[i].getMonth() + 1}`}
                  onClick={() => setDayIdx(i)}
                >
                  <span>{SHORT[i]}</span><strong>{days[i].getDate()}</strong>
                </button>
              ))}
            </div>
          )}
          <div className={`cal${isTutor ? ' cal--paint' : ''}`}>
            <div className="cal__head">
              <div />
              {shown.map((i) => (
                <div key={i} className="cal__dayname" aria-current={sameDay(days[i], now) ? 'date' : undefined}>
                  {weekdayName(days[i])}
                  <strong>{days[i].getDate()}</strong>
                </div>
              ))}
            </div>
            <div className="cal__body">
              <div className="cal__gutter">
                {HOURS.map((h) => <div key={h} className="cal__hour">{h}</div>)}
              </div>
              {shown.map((i) => {
                const day = days[i];
                const past = firstFutureRow(day, now);
                const dr = draftRows(i) || rangeRows(day);
                const nowRow = sameDay(day, now) ? rowIndex(now) : -1;
                return (
                  <div
                    key={i}
                    className={`cal__col${past === ROWS ? ' cal__col--past' : ''}`}
                    onPointerDown={(e) => down(e, i)}
                    onPointerMove={move}
                    onPointerUp={up}
                    onPointerCancel={cancel}
                  >
                    {past > 0 && past < ROWS && <div className="cal__past" style={{ height: `calc(${past} * var(--cal-row))` }} />}
                    {marksFor(day)}
                    {dr && <div className="mark mark--draft" style={{ '--top': dr.top, '--len': dr.len }} />}
                    {nowRow >= 0 && nowRow <= ROWS && <div className="cal__now" style={{ top: `calc(${nowRow} * var(--cal-row))` }} />}
                  </div>
                );
              })}
            </div>
          </div>
          <ul className="legend">
            <li><span className="mark mark--free" />Giờ rảnh</li>
            <li><span className="mark mark--pending" />Chờ duyệt</li>
            <li><span className="mark mark--approved" />Đã xác nhận</li>
            <li><span className="mark mark--taken" />Đã có người học</li>
          </ul>
        </div>

        <aside className="panel" ref={panelRef} aria-label="Chi tiết">
          {!session && (
            <>
              <h2>Muốn học giờ nào?</h2>
              <p>Đăng nhập rồi chọn một khung giờ màu vàng để gửi yêu cầu cho gia sư.</p>
              <a className="btn btn--primary" href="#/dang-nhap">Đăng nhập</a>
            </>
          )}
          {isTutor && freeSel && (
            <>
              <h2>Giờ rảnh</h2>
              <p>{fmtDay(freeSel.start)}, {fmtRange(freeSel.start, freeSel.end)}</p>
              <div className="actions">
                <button type="button" className="btn btn--danger" onClick={() => removeFree(freeSel.id)}>Xoá giờ rảnh</button>
                <button type="button" className="btn btn--secondary" onClick={() => setSel(null)}>Đóng</button>
              </div>
            </>
          )}
          {isTutor && bookingSel && (
            <>
              <h2>{bookingSel.profiles?.full_name || 'Học viên'}</h2>
              <p>{fmtDay(bookingSel.start)}, {fmtRange(bookingSel.start, bookingSel.end)}</p>
              <p><StatusPill status={bookingSel.status} /></p>
              {bookingSel.note && <p className="muted">{bookingSel.note}</p>}
              <BookingActions key={`${bookingSel.id}-${bookingSel.status}`} booking={bookingSel} onChanged={() => { reload(); bump(); }} />
            </>
          )}
          {isTutor && !freeSel && !bookingSel && (
            <>
              <h2>Chưa chọn khung nào</h2>
              <p className="muted">Bấm vào giờ rảnh hoặc buổi học trên lịch để xem chi tiết.</p>
            </>
          )}
          {isStudent && rangeSel && (
            <BookForm
              free={free} days={days} range={rangeSel}
              onRange={(r) => setSel({ type: 'range', ...r })}
              onClose={() => setSel(null)}
              onSent={() => { setSel(null); reload(); bump(); }}
            />
          )}
          {isStudent && !rangeSel && (
            <>
              <h2>Chưa chọn giờ học</h2>
              <p className="muted">Chọn một khung giờ rảnh trên lịch để gửi yêu cầu.</p>
            </>
          )}
        </aside>
      </div>
    </main>
  );
}

function Mark({ cls, top, len, label, text, onClick, selected }) {
  const props = { className: `mark mark--${cls}${selected ? ' mark--selected' : ''}`, style: { '--top': top, '--len': len } };
  return onClick ? (
    <button type="button" {...props} aria-label={label} onClick={onClick}>{text}</button>
  ) : (
    <div {...props}><span className="sr-only">{label}</span><span aria-hidden="true">{text}</span></div>
  );
}

/** Day / start / end selects limited to bookable half-hours, plus a note. */
function BookForm({ free, days, range, onRange, onClose, onSent }) {
  const { toast } = useApp();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const iv = free.find((f) => contains(f, range));
  if (!iv) {
    return (
      <>
        <h2>Gửi yêu cầu học</h2>
        <p className="error" role="alert">Khung giờ này không còn trống. Chọn lại một khung giờ rảnh trên lịch.</p>
        <button type="button" className="btn btn--secondary" onClick={onClose}>Đóng</button>
      </>
    );
  }

  const dayOf = (t) => days.findIndex((x) => sameDay(x, t));
  const dayList = days.filter((x) => free.some((f) => sameDay(f.start, x)));
  const starts = free
    .filter((f) => sameDay(f.start, range.start))
    .flatMap((f) => halfHours(f.start, new Date(f.end.getTime() - HALF + 1)));
  const ends = halfHours(new Date(range.start.getTime() + HALF), new Date(iv.end.getTime() + 1));

  function setDay(i) {
    const f = free.find((x) => sameDay(x.start, days[i]));
    if (f) onRange({ start: f.start, end: f.end });
  }

  function setStart(ms) {
    const start = new Date(ms);
    const f = free.find((x) => x.start <= start && start < x.end);
    const keep = f === iv && range.end > start;
    onRange({ start, end: keep ? range.end : new Date(Math.min(f.end.getTime(), start.getTime() + 2 * HALF)) });
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    const { error } = await supabase.from('bookings').insert({
      start_at: range.start.toISOString(), end_at: range.end.toISOString(), note: note.trim(),
    });
    setBusy(false);
    if (error) return setErr(errMsg(error));
    toast('Đã gửi yêu cầu. Xem trạng thái ở mục Buổi học.');
    onSent();
  }

  return (
    <form onSubmit={submit}>
      <h2>Gửi yêu cầu học</h2>
      <div className="field">
        <label htmlFor="bk-day">Ngày</label>
        <select id="bk-day" value={dayOf(range.start)} onChange={(e) => setDay(Number(e.target.value))}>
          {dayList.map((x) => <option key={x.getTime()} value={dayOf(x)}>{fmtDay(x)}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="bk-start">Bắt đầu</label>
        <select id="bk-start" value={range.start.getTime()} onChange={(e) => setStart(Number(e.target.value))}>
          {starts.map((t) => <option key={t.getTime()} value={t.getTime()}>{fmtTime(t)}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="bk-end">Kết thúc</label>
        <select id="bk-end" value={range.end.getTime()} onChange={(e) => onRange({ start: range.start, end: new Date(Number(e.target.value)) })}>
          {ends.map((t) => <option key={t.getTime()} value={t.getTime()}>{fmtTime(t)}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="bk-note">Ghi chú cho gia sư (không bắt buộc)</label>
        <textarea id="bk-note" rows="3" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      {err && <p className="error" role="alert">{err}</p>}
      <div className="actions">
        <button type="submit" className="btn btn--primary" disabled={busy}>Gửi yêu cầu</button>
        <button type="button" className="btn btn--secondary" onClick={onClose}>Đóng</button>
      </div>
    </form>
  );
}
