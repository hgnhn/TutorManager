import { useState } from 'react';
import { supabase } from '../lib/supabase.js';

const AUTH_ERRORS = [
  [/invalid login/i, 'Email hoặc mật khẩu không đúng. Kiểm tra lại.'],
  [/not confirmed/i, 'Email chưa được xác nhận. Mở thư xác nhận rồi đăng nhập lại.'],
  [/valid email|invalid email/i, 'Email chưa đúng. Kiểm tra lại địa chỉ email.'],
  [/rate limit|too many/i, 'Bạn thử quá nhiều lần. Chờ một lúc rồi thử lại.'],
];
const authMsg = (e) => AUTH_ERRORS.find(([re]) => re.test(e.message))?.[1] || `Không thực hiện được: ${e.message}`;

export default function Login() {
  const [f, setF] = useState({ email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    const { error } = await supabase.auth.signInWithPassword({ email: f.email.trim(), password: f.password });
    setBusy(false);
    if (error) setErr(authMsg(error));
    // with a session, App sees the auth change and returns to the calendar
  }

  return (
    <main className="page">
      <div className="auth">
        <div className="page__head">
          <h1>Đăng nhập</h1>
          <p>Đăng nhập để đặt lịch và xem học phí. Chưa có tài khoản? Liên hệ gia sư để được cấp.</p>
        </div>
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" required autoComplete="email" value={f.email} onChange={set('email')} />
          </div>
          <div className="field">
            <label htmlFor="password">Mật khẩu</label>
            <input id="password" type="password" required autoComplete="current-password" value={f.password} onChange={set('password')} />
          </div>
          {err && <p className="error" role="alert">{err}</p>}
          <div className="actions">
            <button type="submit" className="btn btn--primary" disabled={busy}>Đăng nhập</button>
          </div>
        </form>
      </div>
    </main>
  );
}
