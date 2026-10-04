-- パーティー機能追加用のマイグレーション（募集人数・参加者・リマインド・目標・お気に入りマップ）
-- Supabase の SQL Editor で一度だけ実行してください（何度実行しても安全な書き方にしています）。

-- 1) 予約テーブルの拡張
alter table reservations add column if not exists capacity int not null default 3;          -- パーティー人数（予約者含む）
alter table reservations add column if not exists reminded_30 boolean not null default false; -- 30分前リマインド送信済み
alter table reservations add column if not exists reminded_5 boolean not null default false;  -- 5分前リマインド送信済み
alter table reservations drop constraint if exists reservations_capacity_check;
alter table reservations add constraint reservations_capacity_check check (capacity between 2 and 3);

-- 2) 参加者（予約者以外の「参加する／不参加」の回答）
create table if not exists participants (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references reservations(id) on delete cascade,
  member_name text not null,
  answer text not null check (answer in ('参加', '不参加')),
  rank_tier text,
  created_at timestamptz default now(),
  unique (reservation_id, member_name)
);
alter table participants enable row level security;
drop policy if exists "participants select" on participants;
drop policy if exists "participants insert" on participants;
drop policy if exists "participants update" on participants;
drop policy if exists "participants delete" on participants;
create policy "participants select" on participants for select using (true);
create policy "participants insert" on participants for insert with check (true);
create policy "participants update" on participants for update using (true) with check (true);
create policy "participants delete" on participants for delete using (true);

-- 3) シーズン目標（メンバーごとに最新の1件を使う）
create table if not exists rank_goals (
  id uuid primary key default gen_random_uuid(),
  member_name text not null,
  season_label text,
  season_start date not null default current_date,
  target_rank text not null,
  created_at timestamptz default now()
);
alter table rank_goals enable row level security;
drop policy if exists "rank_goals select" on rank_goals;
drop policy if exists "rank_goals insert" on rank_goals;
drop policy if exists "rank_goals delete" on rank_goals;
create policy "rank_goals select" on rank_goals for select using (true);
create policy "rank_goals insert" on rank_goals for insert with check (true);
create policy "rank_goals delete" on rank_goals for delete using (true);

-- 4) お気に入りマップ（通知対象）
create table if not exists favorite_maps (
  id uuid primary key default gen_random_uuid(),
  member_name text not null,
  map_name text not null,
  created_at timestamptz default now(),
  unique (member_name, map_name)
);
alter table favorite_maps enable row level security;
drop policy if exists "favorite_maps select" on favorite_maps;
drop policy if exists "favorite_maps insert" on favorite_maps;
drop policy if exists "favorite_maps delete" on favorite_maps;
create policy "favorite_maps select" on favorite_maps for select using (true);
create policy "favorite_maps insert" on favorite_maps for insert with check (true);
create policy "favorite_maps delete" on favorite_maps for delete using (true);

-- 5) 通知の重複送信防止用の状態保存（Edge Functionのみが読み書き。ポリシーなし）
create table if not exists notify_state (
  key text primary key,
  value text,
  updated_at timestamptz default now()
);
alter table notify_state enable row level security;

-- 6) リアルタイム同期の対象に追加
alter publication supabase_realtime add table participants;

-- 7) 定期実行（pg_cron + pg_net）。1分ごとに scheduled-notify を呼び出す。
--    <PROJECT_REF> と <SERVICE_ROLE_KEY> を自分のプロジェクトの値に置き換えてから実行してください。
--    事前に Database > Extensions で pg_cron と pg_net を有効化しておく必要があります。
-- select cron.schedule(
--   'armas-scheduled-notify', '* * * * *',
--   $$ select net.http_post(
--        url := 'https://<PROJECT_REF>.supabase.co/functions/v1/scheduled-notify',
--        headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer <SERVICE_ROLE_KEY>'),
--        body := '{}'::jsonb
--      ); $$
-- );
