import { useState } from 'react';
import { supabase } from '../lib/supabase.js';

const AUTH_ERRORS = [
  [/invalid login/i, 'Email hoặc mật khẩu không đúng. Kiểm tra lại hoặc tạo tài khoản mới.'],
  [/already registered/i, 'Email này đã có tài khoản. Hãy đăng nhập.'],
  [/at least/i, 'Mật khẩu cần ít nhất 6 ký tự.'],
  [/not confirmed/i, 'Email chưa được xác nhận. Mở thư xác nhận rồi đăng nhập lại.'],
  [/valid email|invalid email/i, 'Email chưa đúng. Kiểm tra lại địa chỉ email.'],
  [/rate limit|too many/i, 'Bạn thử quá nhiều lần. Chờ một lúc rồi thử lại.'],
];
const authMsg = (e) => AUTH_ERRORS.find(([re]) => re.test(e.message))?.[1] || `Không thực hiện được: ${e.message}`;

export default function Login() {
  const [signUp, setSignUp] = useState(false);
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    setNotice('');
    const { data, error } = signUp
      ? await supabase.auth.signUp({ email: f.email.trim(), password: f.password, options: { data: { full_name: f.name.trim() } } })
      : await supabase.auth.signInWithPassword({ email: f.email.trim(), password: f.password });
    setBusy(false);
    if (error) setErr(authMsg(error));
    else if (signUp && !data.session) setNotice('Đã tạo tài khoản. Mở email để xác nhận, rồi quay lại đăng nhập.');
    // with a session, App sees the auth change and returns to the calendar
  }

  return (
    <main className="page">
      <div className="auth">
        <div className="page__head">
          <h1>{signUp ? 'Tạo tài khoản' : 'Đăng nhập'}</h1>
          <p>{signUp ? 'Tạo tài khoản học viên để đặt buổi học.' : 'Đăng nhập để đặt lịch và xem học phí.'}</p>
        </div>
        <form onSubmit={submit}>
          {signUp && (
            <div className="field">
              <label htmlFor="name">Họ và tên</label>
              <input id="name" required autoComplete="name" value={f.name} onChange={set('name')} />
            </div>
          )}
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" required autoComplete="email" value={f.email} onChange={set('email')} />
          </div>
          <div className="field">
            <label htmlFor="password">Mật khẩu</label>
            <input id="password" type="password" required minLength={6} autoComplete={signUp ? 'new-password' : 'current-password'} value={f.password} onChange={set('password')} />
          </div>
          {err && <p className="error" role="alert">{err}</p>}
          {notice && <p role="status">{notice}</p>}
          <div className="actions">
            <button type="submit" className="btn btn--primary" disabled={busy}>{signUp ? 'Tạo tài khoản' : 'Đăng nhập'}</button>
            <button type="button" className="btn btn--secondary" onClick={() => { setSignUp(!signUp); setErr(''); setNotice(''); }}>
              {signUp ? 'Tôi đã có tài khoản' : 'Tạo tài khoản mới'}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
