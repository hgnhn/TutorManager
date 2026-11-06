import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// null when the env vars are missing; main.jsx shows a setup message instead
export const supabase = url && key ? createClient(url, key) : null;

/** Message to show the user. Trigger errors are already Vietnamese. */
export function errMsg(e) {
  if (!e) return '';
  if (e.code === '23P01') return 'Giờ này đã có buổi học khác được duyệt. Hãy từ chối buổi này hoặc chọn giờ khác.';
  const m = e.message || String(e);
  return /failed to fetch|networkerror|load failed/i.test(m) ? 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.' : m;
}

/** Throw the Supabase error, return the data. */
export function ok({ data, error, count }) {
  if (error) throw error;
  return count ?? data;
}
