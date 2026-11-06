import { useEffect, useState } from 'react';
import { supabase, errMsg, ok } from '../lib/supabase.js';
import { useApp } from '../lib/app.js';
import { useData } from '../lib/hooks.js';
import { fmtDate } from '../lib/time.js';
import Dialog from '../components/Dialog.jsx';

export default function Announcements({ id }) {
  const { session, isTutor, toast, bump } = useApp();
  const [confirm, setConfirm] = useState(null);
  const { data, error, reload } = useData(async () => {
    const [items, students] = await Promise.all([
      supabase.from('announcements').select('*').order('created_at', { ascending: false }),
      isTutor ? supabase.from('profiles').select('id, full_name').eq('role', 'student').order('full_name') : { data: [] },
    ]);
    return { items: ok(items), students: ok(students) };
  }, [isTutor]);

  // Students: opening the page marks everything read (per browser) and refreshes the header bell.
  useEffect(() => {
    if (isTutor || !data) return;
    const key = `ann-seen:${session.user.id}`;
    const latest = data.items[0]?.created_at ?? new Date(0).toISOString();
    if (localStorage.getItem(key) === latest) return;
    localStorage.setItem(key, latest);
    bump();
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  async function remove(a) {
    setConfirm(null);
    const del = await supabase.from('announcements').delete().eq('id', a.id);
    if (del.error) return toast(errMsg(del.error), 'error');
    toast('Đã xoá thông báo.');
    reload();
  }

  const who = (a) => (a.student_id ? data.students.find((s) => s.id === a.student_id)?.full_name || 'Một học viên' : 'Tất cả học viên');

  const items = data && (id ? data.items.filter((a) => String(a.id) === id) : data.items);
  const one = id && items?.[0]; // the announcement being read, once loaded

  return (
    <main className="page">
      {id && <p><a href="#/thong-bao">← Tất cả thông báo</a></p>}
      <div className="page__head">
        <h1>{one ? one.title : 'Thông báo'}</h1>
        <p>{one ? fmtDate(new Date(one.created_at)) : isTutor ? 'Gửi thông báo cho tất cả hoặc một học viên. Học viên đọc ở đây và nhận qua email.' : 'Thông báo gia sư gửi cho bạn.'}</p>
      </div>
      {error && <p className="error" role="alert">{error}. Tải lại trang để thử lại.</p>}
      {isTutor && data && !id && <AnnounceForm students={data.students} onDone={reload} />}
      {items && !items.length && <p>{id ? 'Không tìm thấy thông báo này.' : isTutor ? 'Chưa có thông báo nào.' : 'Chưa có thông báo nào. Khi gia sư gửi, thông báo sẽ hiện ở đây.'}</p>}
      {one && (
        <section className="section">
          {one.body && <p style={{ whiteSpace: 'pre-wrap' }}>{one.body}</p>}
          {isTutor && <p className="muted">Gửi cho: {who(one)}</p>}
        </section>
      )}
      {!id && items && items.length > 0 && (
        <section className="section">
          <ul className="rows">
            {items.map((a) => (
              <li key={a.id} className="row">
                <div className="row__main">
                  <strong><a href={`#/thong-bao/${a.id}`}>{a.title}</a></strong>
                  {a.body && <span style={{ whiteSpace: 'pre-wrap' }}>{a.body}</span>}
                </div>
                <div className="row__when"><span>{fmtDate(new Date(a.created_at))}</span></div>
                <div className="row__side">{isTutor && <span className="muted">{who(a)}</span>}</div>
                <div className="row__actions">
                  {isTutor && (
                    <div className="actions">
                      <button type="button" className="btn btn--danger" onClick={() => setConfirm(a)}>Xoá</button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {confirm && (
        <Dialog title="Xoá thông báo này?" onClose={() => setConfirm(null)}>
          <p>{confirm.title} sẽ bị xoá khỏi tài khoản của học viên.</p>
          <div className="actions">
            <button type="button" className="btn btn--danger" onClick={() => remove(confirm)}>Xoá</button>
            <button type="button" className="btn btn--secondary" data-autofocus onClick={() => setConfirm(null)}>Giữ lại</button>
          </div>
        </Dialog>
      )}
    </main>
  );
}

function AnnounceForm({ students, onDone }) {
  const { toast } = useApp();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    const ins = await supabase.from('announcements')
      .insert({ title: title.trim(), body: body.trim(), student_id: to || null }).select('id').single();
    if (ins.error) { setBusy(false); return setErr(errMsg(ins.error)); }
    const { data, error: e2 } = await supabase.functions.invoke('announce', { body: { id: ins.data.id } });
    setBusy(false);
    if (e2) {
      const msg = await e2.context?.json?.().then((j) => j.error).catch(() => null) || errMsg(e2);
      toast(`Đã đăng thông báo nhưng chưa gửi được email: ${msg}`, 'error');
    } else {
      toast(`Đã đăng thông báo và gửi email cho ${data.sent} học viên.`);
    }
    setTitle(''); setBody(''); setTo('');
    onDone();
  }

  return (
    <form className="section form-narrow" onSubmit={submit}>
      <h2>Thông báo mới</h2>
      <div className="field">
        <label htmlFor="an-title">Tiêu đề</label>
        <input id="an-title" required value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="an-body">Nội dung</label>
        <textarea id="an-body" rows="5" value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="an-to">Gửi cho</label>
        <select id="an-to" value={to} onChange={(e) => setTo(e.target.value)}>
          <option value="">Tất cả học viên</option>
          {students.map((s) => <option key={s.id} value={s.id}>{s.full_name || 'Chưa đặt tên'}</option>)}
        </select>
      </div>
      {err && <p className="error" role="alert">{err}</p>}
      <button type="submit" className="btn btn--primary" disabled={busy || !title.trim()}>
        {busy ? 'Đang gửi…' : 'Đăng và gửi email'}
      </button>
    </form>
  );
}
