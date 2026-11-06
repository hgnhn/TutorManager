-- Chạy file này trong Supabase SQL Editor (không phải migration).
-- TRƯỚC KHI CHẠY: thay DAN_CRON_SECRET_VAO_DAY bằng đúng giá trị secret CRON_SECRET đã đặt cho Edge Function
-- (supabase secrets set CRON_SECRET=...). KHÔNG commit giá trị thật lên git.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Gỡ lịch cũ cùng tên (nếu có) để chạy lại file này không bị trùng.
select cron.unschedule('tutormanager-reminders')
where exists (select 1 from cron.job where jobname = 'tutormanager-reminders');

-- Mỗi 15 phút gọi Edge Function "reminders" (nhắc lịch học, học phí).
select cron.schedule(
  'tutormanager-reminders',
  '*/15 * * * *',
  $$ select net.http_post(
    url := 'https://rdnrojtblfmrjhbqlzrk.supabase.co/functions/v1/reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'DAN_CRON_SECRET_VAO_DAY'),
    body := '{}'::jsonb
  ) $$
);
