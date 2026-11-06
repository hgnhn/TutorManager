import { useRef, useState } from 'react';
import { supabase, errMsg, ok } from '../lib/supabase.js';
import { useApp } from '../lib/app.js';
import { useData } from '../lib/hooks.js';
import { fmtDate, fmtBytes } from '../lib/time.js';
import { safeFileName } from '../lib/vietqr.js';
import Dialog from '../components/Dialog.jsx';

const MAX_BYTES = 50 * 1024 * 1024;

export default function Materials() {
  const { isTutor, toast } = useApp();
  const [confirm, setConfirm] = useState(null);
  const { data, error, reload } = useData(async () => {
    const [mats, students] = await Promise.all([
      supabase.from('materials').select('*').order('created_at', { ascending: false }),
      isTutor ? supabase.from('profiles').select('id, full_name').eq('role', 'student').order('full_name') : { data: [] },
    ]);
    return { mats: ok(mats), students: ok(students) };
  }, [isTutor]);

  async function download(m) {
    const { data: link, error: e } = await supabase.storage.from('materials').createSignedUrl(m.file_path, 60, { download: m.file_name });
    if (e) return toast(errMsg(e), 'error');
    window.location.assign(link.signedUrl);
  }

  async function remove(m) {
    setConfirm(null);
    const del = await supabase.from('materials').delete().eq('id', m.id);
    if (del.error) return toast(errMsg(del.error), 'error');
    const rm = m.file_path ? await supabase.storage.from('materials').remove([m.file_path]) : {};
    if (rm.error) toast('Đã xoá tài liệu nhưng chưa xoá được file trong kho. Báo lại cho người quản trị.', 'error');
    else toast('Đã xoá tài liệu.');
    reload();
  }

  const who = (m) => (m.student_id ? data.students.find((s) => s.id === m.student_id)?.full_name || 'Một học viên' : 'Tất cả học viên');

  return (
    <main className="page">
      <div className="page__head">
        <h1>Tài liệu</h1>
        <p>{isTutor ? 'Gửi file (tối đa 50 MB) hoặc link Google Drive/YouTube cho file lớn hơn.' : 'Tài liệu gia sư gửi cho bạn.'}</p>
      </div>
      {error && <p className="error" role="alert">{error}. Tải lại trang để thử lại.</p>}
      {isTutor && data && <UploadForm students={data.students} onDone={reload} />}
      {data && !data.mats.length && <p>{isTutor ? 'Chưa có tài liệu nào. Gửi file hoặc link ở trên cho học viên.' : 'Chưa có tài liệu nào. Khi gia sư gửi file, nó sẽ hiện ở đây.'}</p>}
      {data && data.mats.length > 0 && (
        <section className="section">
          <ul className="rows">
            {data.mats.map((m) => (
              <li key={m.id} className="row">
                <div className="row__main">
                  <strong>{m.title}</strong>
                  {m.description && <span className="muted">{m.description}</span>}
                </div>
                <div className="row__when">
                  <span>{fmtDate(new Date(m.created_at))}</span>
                  <span className="muted">{m.link_url ? 'Link' : fmtBytes(m.size_bytes)}</span>
                </div>
                <div className="row__side">{isTutor && <span className="muted">{who(m)}</span>}</div>
                <div className="row__actions">
                  <div className="actions">
                    {m.link_url
                      ? <a className="btn btn--secondary" href={m.link_url} target="_blank" rel="noopener noreferrer">Mở link</a>
                      : <button type="button" className="btn btn--secondary" onClick={() => download(m)}>Tải về</button>}
                    {isTutor && <button type="button" className="btn btn--danger" onClick={() => setConfirm(m)}>Xoá</button>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {confirm && (
        <Dialog title="Xoá tài liệu này?" onClose={() => setConfirm(null)}>
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

function UploadForm({ students, onDone }) {
  const { toast } = useApp();
  const form = useRef(null);
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [kind, setKind] = useState('file');
  const [link, setLink] = useState('');
  const canSend = kind === 'link' ? !!link.trim() && !!title.trim() : !!file && file.size <= MAX_BYTES;

  function pick(e) {
    const f = e.target.files[0] || null;
    setFile(f);
    setErr(f && f.size > MAX_BYTES ? `File nặng ${fmtBytes(f.size)}, quá giới hạn 50 MB. Hãy nén file hoặc chia nhỏ rồi chọn lại.` : '');
    if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, ''));
  }

  async function submit(e) {
    e.preventDefault();
    if (!canSend) return;
    setBusy(true);
    setErr('');
    if (kind === 'link') {
      const url = link.trim();
      if (!url.startsWith('https://')) { setBusy(false); return setErr('Link phải bắt đầu bằng https://'); }
      const ins = await supabase.from('materials').insert({ title: title.trim(), description: desc.trim(), link_url: url, student_id: to || null });
      setBusy(false);
      if (ins.error) return setErr(errMsg(ins.error));
      return sent();
    }
    const path = `${crypto.randomUUID()}/${safeFileName(file.name)}`;
    const up = await supabase.storage.from('materials').upload(path, file, { contentType: file.type || undefined });
    if (up.error) { setBusy(false); return setErr(errMsg(up.error)); }
    const ins = await supabase.from('materials').insert({
      title: title.trim() || file.name, description: desc.trim(), file_path: path,
      file_name: file.name, size_bytes: file.size, student_id: to || null,
    });
    if (ins.error) {
      await supabase.storage.from('materials').remove([path]); // do not leave an orphan file
      setBusy(false);
      return setErr(errMsg(ins.error));
    }
    setBusy(false);
    sent();
  }

  function sent() {
    form.current.reset();
    setFile(null); setLink(''); setKind('file'); setTitle(''); setDesc(''); setTo('');
    toast('Đã gửi tài liệu.');
    onDone();
  }

  return (
    <form ref={form} className="section form-narrow" onSubmit={submit}>
      <h2>Gửi tài liệu mới</h2>
      <div className="field">
        <span className="field__label">Loại tài liệu</span>
        <div className="check">
          <input id="m-kind-file" type="radio" name="m-kind" checked={kind === 'file'} onChange={() => { setKind('file'); setErr(''); }} />
          <label htmlFor="m-kind-file">File (tối đa 50 MB)</label>
        </div>
        <div className="check">
          <input id="m-kind-link" type="radio" name="m-kind" checked={kind === 'link'} onChange={() => { setKind('link'); setFile(null); setErr(''); }} />
          <label htmlFor="m-kind-link">Link (Google Drive, YouTube…)</label>
        </div>
      </div>
      {kind === 'file' ? (
        <div className="field">
          <span className="field__label">File (tối đa 50 MB)</span>
          <div className="file">
            <input id="m-file" type="file" required onChange={pick} />
            <label htmlFor="m-file" className="btn btn--secondary">Chọn file</label>
            <span className="file__name">{file ? `${file.name} (${fmtBytes(file.size)})` : 'Chưa chọn file'}</span>
          </div>
        </div>
      ) : (
        <div className="field">
          <label htmlFor="m-link">Link</label>
          <input id="m-link" type="url" required placeholder="https://drive.google.com/..." value={link} onChange={(e) => setLink(e.target.value)} />
          <p className="hint">Dùng cho file lớn hơn 50 MB. Trên Google Drive nhớ chia sẻ: Bất kỳ ai có đường liên kết.</p>
        </div>
      )}
      <div className="field">
        <label htmlFor="m-title">Tiêu đề</label>
        <input id="m-title" required value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="m-desc">Mô tả</label>
        <textarea id="m-desc" rows="2" value={desc} onChange={(e) => setDesc(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="m-to">Gửi cho</label>
        <select id="m-to" value={to} onChange={(e) => setTo(e.target.value)}>
          <option value="">Tất cả học viên</option>
          {students.map((s) => <option key={s.id} value={s.id}>{s.full_name || 'Chưa đặt tên'}</option>)}
        </select>
      </div>
      {err && <p className="error" role="alert">{err}</p>}
      <button type="submit" className="btn btn--primary" disabled={busy || !canSend}>
        {busy ? (kind === 'link' ? 'Đang gửi…' : 'Đang tải lên…') : 'Gửi tài liệu'}
      </button>
    </form>
  );
}
