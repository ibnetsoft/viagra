-- Run as the database owner after the migration, with the pg_cron extension enabled.
-- Default cron timezone is UTC: 15:01 UTC = next day 00:01 Asia/Seoul.
create extension if not exists pg_cron;
select cron.schedule(
  'vital-daily-bonus-close',
  '1 15 * * *',
  $$select private.close_due((now() at time zone 'Asia/Seoul')::date - 1);$$
);
