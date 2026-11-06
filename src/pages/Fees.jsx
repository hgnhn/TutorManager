import { useState } from 'react';
import { supabase, errMsg, ok } from '../lib/supabase.js';
import { useApp } from '../lib/app.js';
import { useData } from '../lib/hooks.js';
import { withDates, fmtDay, fmtRange, fmtMoney } from '../lib/time.js';
import { transferInfo, vietqrUrl } from '../lib/vietqr.js';
import Dialog from '../components/Dialog.jsx';

export default function Fees() {
  const { isTutor } = useApp();
  return isTutor ? <TutorFees /> : <StudentFees />;
}

function TutorFees() {
  const { toast } = useApp();
  const [open, setOpen] = useState(null); // student id
  const [confirm, setConfirm] = useState(null); // fee_summary row
  const { data, error, reload } = useData(async () =>
    ok(await supabase.from('fee_summary').select('*').order('full_name')), []);

  const rows = data ?? [];
  const total = rows.reduce((sum, r) => sum + Number(r.amount_owed), 0);

  async function payAll(r) {
    const { error: e } = await supabase.from('bookings').update({ paid: true })
      .eq('student_id', r.student_id).eq('status', 'approved').eq('billable', true).eq('paid', false)
      .lte('start_at', new Date().toISOString());
    setConfirm(null);
    if (e) return toast(errMsg(e), 'error');
    toast(`Đã ghi nhận ${r.full_name || 'học viên'} thu đủ học phí.`);
    reload();
  }

  return (
    <main className="page">
      <div className="page__head">
        <h1>Học phí</h1>
        <p>Số tiền chưa thu của từng học viên, tính từ các buổi đã học.</p>
      </div>
      {error && <p className="error" role="alert">{error}. Tải lại trang để thử lại.</p>}
      {data && !rows.length && <p>Chưa có học viên nào. Học viên sẽ hiện ở đây sau khi họ tạo tài khoản.</p>}
      {data && rows.length > 0 && (
        <>
          <p className="total">Tổng chưa thu <strong>{fmtMoney(total)}</strong></p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Học viên</th>
                  <th className="num">Đã học</th>
                  <th className="num">Chưa thu (buổi)</th>
                  <th className="num">Số tiền chưa thu</th>
                  <th className="num">Đã thu</th>
                  <th><span className="sr-only">Thao tác</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <FeeRow key={r.student_id} r={r} open={open === r.student_id}
                    onToggle={() => setOpen(open === r.student_id ? null : r.student_id)}
                    onPayAll={() => setConfirm(r)} onChanged={reload} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {confirm && (
        <Dialog title="Đã thu đủ?" onClose={() => setConfirm(null)}>
          <p>{confirm.full_name}: {confirm.sessions_owed} buổi, {fmtMoney(confirm.amount_owed)}.</p>
          <div className="actions">
            <button type="button" className="btn btn--primary" onClick={() => payAll(confirm)}>Đã thu đủ</button>
            <button type="button" className="btn btn--secondary" data-autofocus onClick={() => setConfirm(null)}>Đóng</button>
          </div>
        </Dialog>
      )}
    </main>
  );
}

function FeeRow({ r, open, onToggle, onPayAll, onChanged }) {
  return (
    <>
      <tr>
        <td>
          <button type="button" className="btn btn--text" aria-expanded={open} onClick={onToggle}>
            {r.full_name || 'Chưa đặt tên'}
          </button>
        </td>
        <td className="num">{r.sessions_taught}</td>
        <td className="num">{r.sessions_owed}</td>
        <td className="num">{fmtMoney(r.amount_owed)}</td>
        <td className="num">{fmtMoney(r.amount_paid)}</td>
        <td className="num">
          <button type="button" className="btn btn--secondary" disabled={!r.sessions_owed} onClick={onPayAll}>Đã thu đủ</button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan="6" className="detail"><StudentLessons studentId={r.student_id} onChanged={onChanged} /></td>
        </tr>
      )}
    </>
  );
}

function StudentLessons({ studentId, onChanged }) {
  const { toast } = useApp();
  const { data, error, reload } = useData(async () =>
    ok(await supabase.from('bookings').select('*').eq('student_id', studentId).eq('status', 'approved')
      .lte('start_at', new Date().toISOString()).order('start_at', { ascending: false })).map(withDates), [studentId]);

  async function setBillable(b, billable) {
    const { error: e } = await supabase.from('bookings').update({ billable }).eq('id', b.id);
    if (e) return toast(errMsg(e), 'error');
    reload();
    onChanged();
  }

  if (error) return <p className="error" role="alert">{error}</p>;
  if (!data) return <p className="muted">Đang tải…</p>;
  if (!data.length) return <p className="muted">Học viên này chưa có buổi học nào đã diễn ra.</p>;
  return (
    <ul className="rows">
      {data.map((b) => (
        <li key={b.id} className="row row--compact">
          <span>{fmtDay(b.start)}, {fmtRange(b.start, b.end)}</span>
          <span>{fmtMoney(b.price)}</span>
          <span className="check">
            <input id={`bl-${b.id}`} type="checkbox" checked={b.billable} onChange={(e) => setBillable(b, e.target.checked)} />
            <label htmlFor={`bl-${b.id}`}>Tính tiền</label>
          </span>
          <span className={b.billable && b.paid ? 'paid' : 'muted'}>
            {!b.billable ? 'Không tính tiền' : b.paid ? 'Đã thu' : 'Chưa thu'}
          </span>
        </li>
      ))}
    </ul>
  );
}

function StudentFees() {
  const { profile } = useApp();
  const { data, error } = useData(async () => {
    const [settings, unpaid] = await Promise.all([
      supabase.from('settings').select('*').eq('id', 1).single(),
      supabase.from('bookings').select('*').eq('status', 'approved').eq('billable', true).eq('paid', false)
        .lte('start_at', new Date().toISOString()).order('start_at'),
    ]);
    return { settings: ok(settings), unpaid: ok(unpaid).map(withDates) };
  }, []);

  const owed = data ? data.unpaid.reduce((sum, b) => sum + b.price, 0) : 0;
  const s = data?.settings;
  const info = transferInfo(profile.full_name);
  const bankSet = !!(s && s.bank_id && s.account_no);

  return (
    <main className="page">
      <div className="page__head">
        <h1>Học phí</h1>
        <p>Số tiền bạn cần chuyển cho các buổi đã học.</p>
      </div>
      {error && <p className="error" role="alert">{error}. Tải lại trang để thử lại.</p>}
      {data && (
        <>
          <section className="section">
            <p className="owed">{fmtMoney(owed)}</p>
            {owed === 0 && <p>Bạn đã đóng đủ học phí.</p>}
          </section>
          {owed > 0 && (
            <section className="section">
              <h2>Các buổi chưa đóng</h2>
              <ul className="rows">
                {data.unpaid.map((b) => (
                  <li key={b.id} className="row row--compact">
                    <span>{fmtDay(b.start)}, {fmtRange(b.start, b.end)}</span>
                    <span>{fmtMoney(b.price)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {owed > 0 && (
            <section className="section">
              <h2>Chuyển khoản</h2>
              {!bankSet ? (
                <p>Gia sư chưa nhập tài khoản nhận tiền.</p>
              ) : (
                <div className="pay">
                  <img
                    className="qr" width="240" height="240" alt="Mã VietQR để chuyển khoản học phí"
                    src={vietqrUrl({ bankId: s.bank_id, accountNo: s.account_no, amount: owed, info, accountName: s.account_name })}
                  />
                  <dl className="facts">
                    <dt>{/^\d+$/.test(s.bank_id) ? 'Mã ngân hàng' : 'Ngân hàng'}</dt><dd>{s.bank_id}</dd>
                    <dt>Số tài khoản</dt><dd>{s.account_no}</dd>
                    <dt>Chủ tài khoản</dt><dd>{s.account_name}</dd>
                    <dt>Số tiền</dt><dd>{fmtMoney(owed)}</dd>
                    <dt>Nội dung chuyển khoản</dt><dd>{info}</dd>
                  </dl>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </main>
  );
}
