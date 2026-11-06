import test from 'node:test';
import assert from 'node:assert/strict';
import { stripDiacritics, transferInfo, vietqrUrl, safeFileName } from './vietqr.js';

test('stripDiacritics handles Vietnamese including đ', () => {
  assert.equal(stripDiacritics('Nguyễn Thị Đào'), 'Nguyen Thi Dao');
  assert.equal(stripDiacritics('đường'), 'duong');
});

test('transferInfo is uppercase, unaccented and at most 25 chars', () => {
  assert.equal(transferInfo('Nguyễn Văn An'), 'HOCPHI NGUYEN VAN AN');
  const long = transferInfo('Trần Thị Thuỳ Dương Nguyễn');
  assert.ok(long.length <= 25);
  assert.ok(long.startsWith('HOCPHI TRAN THI'));
  assert.equal(transferInfo('  an   b!! '), 'HOCPHI AN B');
  assert.equal(transferInfo(''), 'HOCPHI');
});

test('vietqrUrl encodes every part', () => {
  const url = vietqrUrl({ bankId: 'vcb', accountNo: '0123456789', amount: 200000, info: 'HOCPHI AN', accountName: 'NGUYEN VAN A' });
  assert.equal(
    url,
    'https://img.vietqr.io/image/vcb-0123456789-compact2.png?amount=200000&addInfo=HOCPHI%20AN&accountName=NGUYEN%20VAN%20A',
  );
  assert.match(vietqrUrl({ bankId: '970436', accountNo: '1', amount: 1, info: 'A&B', accountName: 'Đỗ' }), /addInfo=A%26B&accountName=%C4%90%E1%BB%97$/);
});

test('safeFileName keeps the extension and drops unsafe characters', () => {
  assert.equal(safeFileName('Bài tập tuần 3 (final).pdf'), 'Bai-tap-tuan-3-final-.pdf');
  assert.equal(safeFileName('../../etc/passwd'), 'etc-passwd');
  assert.equal(safeFileName('???'), 'file');
});
