const WORDS = { pending: 'Chờ duyệt', approved: 'Đã xác nhận', rejected: 'Đã từ chối', cancelled: 'Đã huỷ' };

export const statusWord = (s) => WORDS[s];

export default function StatusPill({ status }) {
  return <span className={`pill pill--${status}`}>{WORDS[status]}</span>;
}
