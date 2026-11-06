import { useState } from 'react';
import { supabase, errMsg, ok } from '../lib/supabase.js';
import { useApp } from '../lib/app.js';
import { useData } from '../lib/hooks.js';
import { withDates, fmtDay, fmtRange, fmtTime } from '../lib/time.js';
import StatusPill from '../components/StatusPill.jsx';
import BookingActions from '../components/BookingActions.jsx';
import Dialog from '../components/Dialog.jsx';

export default function Sessions() {
  const { isTutor } = useApp();
  return isTutor ? <TutorSessions /> : <StudentSessions />;
}

function Group({ title, rows, children }) {
  if (!rows.length) return null;
  return (
    <section className="section">
      <h2>{title}</h2>
      <ul className="rows">{rows.map(children)}</ul>
    </section>
  );
}

function When({ b }) {
  return (
    <div className="row__when">
      <span>{fmtDay(b.start)}</span>
      <span className="muted">{fmtRange(b.start, b.end)}</span>
    </div>
  );
}

function TutorSessions() {
  const { bump } = useApp();
  const now = new Date();
  const { data, error, reload } = useData(async () =>
    ok(await supabase.from('bookings').select('*, profiles(full_name)').order('start_at')).map(withDates), []);
  const changed = () => { reload(); bump(); };

  const all = data ?? [];
  const pending = all.filter((b) => b.status === 'pending');
  const upcoming = all.filter((b) => b.status === 'approved' && b.end > now);
  const past = all.filter((b) => b.status === 'approved' && b.end <= now).reverse();
  const declined = all.filter((b) => b.status === 'rejected' || b.status === 'cancelled').reverse();

  const row = (showStatus) => (b) => (
    <li key={b.id} className="row">
      <div className="row__main">
        <strong>{b.profiles?.full_name || 'Học viên'}</strong>
        {b.note && <span className="muted">{b.note}</span>}
        {b.tutor_note && <span className="muted">Ghi chú của bạn: {b.tutor_note}</span>}
      </div>
      <When b={b} />
      <div className="row__side">{showStatus && <StatusPill status={b.status} />}</div>
      <div className="row__actions">
        <BookingActions key={`${b.id}-${b.status}`} booking={b} onChanged={changed} />
      </div>
    </li>
  );

  return (
    <main className="page">
      <div className="page__head">
        <h1>Buổi học</h1>
        <p>Duyệt yêu cầu của học viên và chỉnh link lớp, giá, trạng thái thu tiền.</p>
      </div>
      {error && <p className="error" role="alert">{error}. Tải lại trang để thử lại.</p>}
      {data && !all.length && <p>Chưa có yêu cầu nào. Thêm giờ rảnh trong <a href="#/">Lịch</a> để học viên đặt buổi.</p>}
      <Group title="Chờ duyệt" rows={pending}>{row(false)}</Group>
      <Group title="Sắp tới" rows={upcoming}>{row(false)}</Group>
      <Group title="Đã qua" rows={past}>{row(false)}</Group>
      <Group title="Đã từ chối hoặc huỷ" rows={declined}>{row(true)}</Group>
    </main>
  );
}

function StudentSessions() {
  const { toast, bump } = useApp();
  const [confirm, setConfirm] = useState(null);
  const now = new Date();
  // polled each minute so "Vào lớp" appears 15 minutes before the start
  const { data, error, reload } = useData(async () => {
    const rows = ok(await supabase.from('bookings').select('*').order('start_at')).map(withDates);
    const ids = rows.filter((b) => b.status === 'approved' && b.end > new Date()).map((b) => b.id);
    const links = ids.length ? ok(await supabase.from('meet_links').select('booking_id, url').in('booking_id', ids)) : [];
    return { rows, links: Object.fromEntries(links.map((l) => [l.booking_id, l.url])) };
  }, [], 60000);

  async function cancel(b) {
    const { error: e } = await supabase.rpc('cancel_booking', { booking_id: b.id });
    setConfirm(null);
    if (e) return toast(errMsg(e), 'error');
    toast('Đã huỷ buổi học.');
    reload();
    bump();
  }

  const rows = data?.rows ?? [];
  const live = (b) => b.status === 'pending' || b.status === 'approved';
  const upcoming = rows.filter((b) => live(b) && b.end > now);
  const past = rows.filter((b) => live(b) && b.end <= now).reverse();
  const declined = rows.filter((b) => !live(b)).reverse();

  const row = (b) => {
    const url = data.links[b.id];
    return (
      <li key={b.id} className="row">
        <div className="row__main">
          <StatusPill status={b.status} />
          {b.note && <span className="muted">Ghi chú của bạn: {b.note}</span>}
          {b.tutor_note && <span>Gia sư: {b.tutor_note}</span>}
        </div>
        <When b={b} />
        <div className="row__side" />
        {b.end > now && live(b) && (
          <div className="row__actions">
            <div className="actions">
              {b.status === 'approved' && (url ? (
                <a className="btn btn--primary" href={url} target="_blank" rel="noopener">Vào lớp</a>
              ) : (
                <span className="muted">Link vào lớp mở lúc {fmtTime(new Date(b.start.getTime() - 15 * 60000))}</span>
              ))}
              {live(b) && b.start > now && <button type="button" className="btn btn--danger" onClick={() => setConfirm(b)}>Huỷ buổi</button>}
            </div>
          </div>
        )}
      </li>
    );
  };

  return (
    <main className="page">
      <div className="page__head">
        <h1>Buổi học</h1>
        <p>Trạng thái các yêu cầu của bạn và link vào lớp.</p>
      </div>
      {error && <p className="error" role="alert">{error}. Tải lại trang để thử lại.</p>}
      {data && !rows.length && <p>Chưa có buổi học nào. Mở <a href="#/">Lịch</a> để chọn giờ học.</p>}
      {data && <Group title="Sắp tới" rows={upcoming}>{row}</Group>}
      {data && <Group title="Đã qua" rows={past}>{row}</Group>}
      {data && <Group title="Đã từ chối hoặc huỷ" rows={declined}>{row}</Group>}
      {confirm && (
        <Dialog title="Huỷ buổi học này?" onClose={() => setConfirm(null)}>
          <p>{fmtDay(confirm.start)}, {fmtRange(confirm.start, confirm.end)}</p>
          <div className="actions">
            <button type="button" className="btn btn--danger" onClick={() => cancel(confirm)}>Huỷ buổi</button>
            <button type="button" className="btn btn--secondary" data-autofocus onClick={() => setConfirm(null)}>Giữ buổi học</button>
          </div>
        </Dialog>
      )}
    </main>
  );
}
