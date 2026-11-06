import { useEffect, useState } from 'react';
import { supabase, errMsg, ok } from '../lib/supabase.js';
import { useApp } from '../lib/app.js';
import { useData } from '../lib/hooks.js';
import { fmtMoney } from '../lib/time.js';
import { vietqrUrl } from '../lib/vietqr.js';

export default function Settings() {
  const { toast } = useApp();
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const { data, error, reload } = useData(async () => {
    const [s, t] = await Promise.all([
      supabase.from('settings').select('*').eq('id', 1).single(),
      supabase.from('tutor_private').select('*').eq('id', 1).single(),
    ]);
    return { ...ok(s), default_meet_link: ok(t).default_meet_link };
  }, []);

  // fill the form once; later refetches (window focus) must not overwrite what is being typed
  useEffect(() => { if (data && !f) setF({ ...data, price_per_session: String(data.price_per_session) }); }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    const a = await supabase.from('settings').update({
      price_per_session: Math.max(0, Math.round(Number(f.price_per_session) || 0)),
      bank_id: f.bank_id.trim(), account_no: f.account_no.trim(), account_name: f.account_name.trim(),
    }).eq('id', 1);
    const b = a.error ? a : await supabase.from('tutor_private').update({ default_meet_link: f.default_meet_link.trim() }).eq('id', 1);
    setBusy(false);
    if (b.error) return setErr(errMsg(b.error));
    toast('Đã lưu thay đổi');
    reload();
  }

  const preview = data && data.bank_id && data.account_no
    ? vietqrUrl({ bankId: data.bank_id, accountNo: data.account_no, amount: 100000, info: 'HOCPHI NGUYEN VAN A', accountName: data.account_name })
    : null;

  return (
    <main className="page">
      <div className="page__head">
        <h1>Cài đặt</h1>
        <p>Giá mỗi buổi, tài khoản nhận học phí và link Meet mặc định.</p>
      </div>
      {error && <p className="error" role="alert">{error}. Tải lại trang để thử lại.</p>}
      {f && (
        <div className="settings">
          <form onSubmit={submit}>
            <div className="field">
              <label htmlFor="s-price">Giá mỗi buổi (đ)</label>
              <input id="s-price" type="number" min="0" step="1000" required value={f.price_per_session} onChange={set('price_per_session')} />
              <span className="hint">Đang là {fmtMoney(Number(f.price_per_session) || 0)}. Giá mới chỉ áp dụng cho yêu cầu đặt sau khi lưu.</span>
            </div>
            <div className="field">
              <label htmlFor="s-bank">Mã ngân hàng</label>
              <input id="s-bank" value={f.bank_id} onChange={set('bank_id')} />
              <span className="hint">Mã BIN hoặc tên viết tắt, ví dụ 970436 hoặc vcb</span>
            </div>
            <div className="field">
              <label htmlFor="s-no">Số tài khoản</label>
              <input id="s-no" inputMode="numeric" value={f.account_no} onChange={set('account_no')} />
            </div>
            <div className="field">
              <label htmlFor="s-name">Tên chủ tài khoản</label>
              <input id="s-name" value={f.account_name} onChange={set('account_name')} />
            </div>
            <div className="field">
              <label htmlFor="s-meet">Link Google Meet mặc định</label>
              <input id="s-meet" type="url" value={f.default_meet_link} onChange={set('default_meet_link')} placeholder="https://meet.google.com/..." />
              <span className="hint">Tự điền khi bạn duyệt một buổi học.</span>
            </div>
            {err && <p className="error" role="alert">{err}</p>}
            <button type="submit" className="btn btn--primary" disabled={busy}>Lưu thay đổi</button>
          </form>
          <section className="section">
            <h2>Mã QR mẫu</h2>
            {preview ? (
              <>
                <img className="qr" width="240" height="240" alt="Mã VietQR mẫu cho 100.000 đ" src={preview} />
                <p className="hint">Mẫu cho 100.000 đ, theo tài khoản đã lưu.</p>
              </>
            ) : (
              <p className="muted">Nhập mã ngân hàng và số tài khoản rồi bấm Lưu thay đổi để xem mã QR mẫu.</p>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
