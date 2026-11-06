import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, errMsg } from './lib/supabase.js';
import { AppCtx } from './lib/app.js';
import { useData } from './lib/hooks.js';
import Calendar from './pages/Calendar.jsx';
import Sessions from './pages/Sessions.jsx';
import Fees from './pages/Fees.jsx';
import Materials from './pages/Materials.jsx';
import Bell from './components/Bell.jsx';
import Announcements from './pages/Announcements.jsx';
import Settings from './pages/Settings.jsx';
import Login from './pages/Login.jsx';

const TABS = [
  { path: '/', label: 'Lịch' },
  { path: '/buoi-hoc', label: 'Buổi học' },
  { path: '/hoc-phi', label: 'Học phí' },
  { path: '/tai-lieu', label: 'Tài liệu' },
  { path: '/thong-bao', label: 'Thông báo' },
];

const currentPath = () => window.location.hash.replace(/^#/, '') || '/';

export default function App() {
  const [path, setPath] = useState(currentPath);
  const [session, setSession] = useState(undefined); // undefined = still checking
  const [profile, setProfile] = useState(null);
  const [profileErr, setProfileErr] = useState('');
  const [toastMsg, setToastMsg] = useState(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const onHash = () => { setPath(currentPath()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s)); // no awaits in here
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    setProfile(null);
    setProfileErr('');
    if (!userId) return;
    supabase.from('profiles').select('*').eq('id', userId).single().then(({ data, error }) => {
      if (error) setProfileErr(errMsg(error)); else setProfile(data);
    });
  }, [userId]);

  const toast = useCallback((text, kind = 'ok') => setToastMsg({ text, kind, id: Date.now() }), []);
  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 4000);
    return () => clearTimeout(t);
  }, [toastMsg]);

  const isTutor = profile?.role === 'tutor';
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const { data: pending } = useData(async () => {
    if (!isTutor) return 0;
    const { count, error } = await supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('status', 'pending');
    if (error) throw error;
    return count;
  }, [isTutor, version]);

  const ctx = useMemo(() => ({ session, profile, isTutor, toast, bump }), [session, profile, isTutor, toast, bump]);

  const checking = session === undefined || (session && !profile && !profileErr);
  const tabs = isTutor ? [...TABS, { path: '/cai-dat', label: 'Cài đặt' }] : TABS.filter((t) => t.path !== '/thong-bao');
  const name = profile?.full_name || session?.user.email;

  let page;
  if (checking) page = <main className="page"><p>Đang tải…</p></main>;
  else if (profileErr) page = <main className="page"><h1>Không tải được hồ sơ</h1><p className="error" role="alert">{profileErr}. Tải lại trang để thử lại.</p></main>;
  else if (path === '/dang-nhap') page = session ? <Redirect /> : <Login />;
  else if (path === '/') page = <Calendar />;
  else if (!session && [...TABS, { path: '/cai-dat' }].some((t) => t.path === path || (t.path === '/thong-bao' && path.startsWith('/thong-bao/')))) page = <NeedLogin />;
  else if (path === '/buoi-hoc') page = <Sessions />;
  else if (path === '/hoc-phi') page = <Fees />;
  else if (path === '/tai-lieu') page = <Materials />;
  else if (path === '/thong-bao' || path.startsWith('/thong-bao/')) page = <Announcements id={path.split('/')[2] || null} />;
  else if (path === '/cai-dat') page = isTutor ? <Settings /> : <main className="page"><h1>Cài đặt</h1><p>Trang này chỉ dành cho gia sư.</p></main>;
  else page = <main className="page"><h1>Không tìm thấy trang</h1><p><a href="#/">Về trang Lịch</a></p></main>;

  return (
    <AppCtx.Provider value={ctx}>
      <header className="header">
        <div className="header__in">
          <a className="wordmark" href="#/">TutorManager</a>
          <nav className="tabs" aria-label="Chính">
            {tabs.map((t) => (
              <a key={t.path} href={`#${t.path}`} aria-current={path === t.path ? 'page' : undefined}>
                {t.label}
                {t.path === '/buoi-hoc' && pending > 0 && <span className="pill pill--pending" aria-label={`${pending} buổi chờ duyệt`}>{pending}</span>}
              </a>
            ))}
          </nav>
          <div className="user">
            {session ? (
              <>
                {profile && !isTutor && <Bell userId={userId} path={path} version={version} />}
                <span>{name}</span>
                <button type="button" className="btn btn--secondary" onClick={() => supabase.auth.signOut()}>Đăng xuất</button>
              </>
            ) : (
              <a className="btn btn--secondary" href="#/dang-nhap">Đăng nhập</a>
            )}
          </div>
        </div>
      </header>
      {page}
      <div className="toast-region" role="status">
        {toastMsg && <div className={`toast${toastMsg.kind === 'error' ? ' toast--error' : ''}`}>{toastMsg.text}</div>}
      </div>
    </AppCtx.Provider>
  );
}

function Redirect() {
  useEffect(() => { window.location.hash = '#/'; }, []);
  return null;
}

function NeedLogin() {
  return (
    <main className="page">
      <h1>Đăng nhập để xem trang này</h1>
      <p><a className="btn btn--primary" href="#/dang-nhap">Đăng nhập</a></p>
    </main>
  );
}
