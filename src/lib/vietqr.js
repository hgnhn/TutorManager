// VietQR helpers and text cleaning for bank transfer notes and storage file names.

export function stripDiacritics(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}

/** "HOCPHI " + name without accents, uppercase, letters/digits/spaces only, 25 chars at most. */
export function transferInfo(fullName) {
  const name = stripDiacritics(fullName).toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  return `HOCPHI ${name}`.slice(0, 25).trim();
}

export function vietqrUrl({ bankId, accountNo, amount, info, accountName }) {
  const q = new URLSearchParams({ amount: String(amount), addInfo: info, accountName });
  // URLSearchParams writes spaces as "+"; VietQR wants %20
  return `https://img.vietqr.io/image/${encodeURIComponent(bankId)}-${encodeURIComponent(accountNo)}-compact2.png?${q.toString().replace(/\+/g, '%20')}`;
}

/** Storage-safe file name: no accents, only letters, digits, dot, dash, underscore. */
export function safeFileName(name) {
  const clean = stripDiacritics(name).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-.]+/, '');
  return clean || 'file';
}
