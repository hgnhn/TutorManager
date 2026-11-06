import { useEffect, useState } from 'react';
import { supabase, errMsg } from '../lib/supabase.js';
import { fmtMoney } from '../lib/time.js';

/** Tutor controls for one booking: approve / reject a pending one, edit an approved one. */
export default function BookingActions({ booking: b, onChanged }) {
  const [mode, setMode] = useState(null); // 'approve' | 'reject' | 'edit'
  const close = () => setMode(null);
  const done = () => { setMode(null); onChanged(); };

  if (mode === 'reject') return <RejectForm booking={b} onClose={close} onDone={done} />;
  if (mode) return <LessonForm key={mode} mode={mode} booking={b} onClose={close} onDone={done} />;
  if (b.status === 'pending') {
    return (
      <div className="actions">
        <button type="button" className="btn btn--primary" onClick={() => setMode('approve')}>Duyệt</button>
        <button type="button" className="btn btn--danger" onClick={() => setMode('reject')}>Từ chối</button>
      </div>
    );
  }
  if (b.status === 'approved') {
    return (
      <div className="actions">
        <button type="button" className="btn btn--secondary" onClick={() => setMode('edit')}>Chỉnh sửa</button>
        <span className="muted">
          {b.billable ? `${fmtMoney(b.price)}, ${b.paid ? 'đã thu' : 'chưa thu'}` : 'Không tính tiền'}
        </span>
      </div>
    );
  }
  return null;
}

function RejectForm({ booking: b, onClose, onDone }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.from('bookings').update({ status: 'rejected', tutor_note: note.trim() }).eq('id', b.id);
    setBusy(false);
    if (error) setErr(errMsg(error)); else onDone();
  }
  return (
    <form className="inline-form" onSubmit={submit}>
      <div className="field">
        <label htmlFor={`rj-${b.id}`}>Lý do cho học viên (không bắt buộc)</label>
        <input id={`rj-${b.id}`} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      {err && <p className="error" role="alert">{err}</p>}
      <div className="actions">
        <button type="submit" className="btn btn--danger" disabled={busy}>Từ chối buổi này</button>
        <button type="button" className="btn btn--secondary" onClick={onClose}>Đóng</button>
      </div>
    </form>
  );
}

function LessonForm({ mode, booking: b, onClose, onDone }) {
  const approve = mode === 'approve';
  const [url, setUrl] = useState('');
  const [billable, setBillable] = useState(b.billable);
  const [price, setPrice] = useState(b.price);
  const [paid, setPaid] = useState(b.paid);
  const [note, setNote] = useState(b.tutor_note || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let live = true;
    (async () => {
      const own = await supabase.from('meet_links').select('url').eq('booking_id', b.id).maybeSingle();
      let link = own.data?.url;
      if (!link && approve) {
        const d = await supabase.from('tutor_private').select('default_meet_link').eq('id', 1).maybeSingle();
        link = d.data?.default_meet_link;
      }
      if (live && link) setUrl(link);
    })();
    return () => { live = false; };
  }, [b.id, approve]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    const patch = { billable, price: Math.max(0, Math.round(Number(price) || 0)) };
    if (approve) Object.assign(patch, { status: 'approved', tutor_note: note.trim() });
    else patch.paid = paid;
    let { error } = await supabase.from('bookings').update(patch).eq('id', b.id);
    if (!error) {
      const link = url.trim();
      ({ error } = link
        ? await supabase.from('meet_links').upsert({ booking_id: b.id, url: link }, { onConflict: 'booking_id' })
        : await supabase.from('meet_links').delete().eq('booking_id', b.id));
    }
    setBusy(false);
    if (error) setErr(errMsg(error)); else onDone();
  }

  const id = (s) => `${s}-${b.id}`;
  return (
    <form className="inline-form" onSubmit={submit}>
      <div className="field">
        <label htmlFor={id('url')}>Link Google Meet</label>
        <input id={id('url')} type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://meet.google.com/..." />
      </div>
      <div className="check">
        <input id={id('bill')} type="checkbox" checked={billable} onChange={(e) => setBillable(e.target.checked)} />
        <label htmlFor={id('bill')}>Tính tiền buổi này</label>
      </div>
      <div className="field">
        <label htmlFor={id('price')}>Giá buổi này (đ)</label>
        <input id={id('price')} type="number" min="0" step="1000" value={price} onChange={(e) => setPrice(e.target.value)} disabled={!billable} />
      </div>
      {approve ? (
        <div className="field">
          <label htmlFor={id('note')}>Ghi chú cho học viên</label>
          <input id={id('note')} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      ) : (
        <div className="check">
          <input id={id('paid')} type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} disabled={!billable} />
          <label htmlFor={id('paid')}>Đã thu</label>
        </div>
      )}
      {err && <p className="error" role="alert">{err}</p>}
      <div className="actions">
        <button type="submit" className="btn btn--primary" disabled={busy}>{approve ? 'Xác nhận duyệt' : 'Lưu thay đổi'}</button>
        <button type="button" className="btn btn--secondary" onClick={onClose}>Đóng</button>
      </div>
    </form>
  );
}
