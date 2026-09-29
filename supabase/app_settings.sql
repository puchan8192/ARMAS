-- Discord Webhook URLを「端末ごと」ではなく「全員共通」の設定として
-- 保持するためのテーブル。1行だけ(id='default')を使い回す想定。
--
-- 背景: Discord/LINEの通知リンク(?resv=...)は、予約を作った本人とは
-- 別の端末(スマホ等)で開かれることが多い。Webhook URLをlocalStorageだけに
-- 保存していると、その端末には設定が無く「参加する/しない」の回答時に
-- Discordへ通知が飛ばせない問題が起きる。これをDBで共有することで解消する。

create table if not exists app_settings (
  id text primary key default 'default',
  discord_webhook_url text,
  updated_at timestamptz default now()
);

alter table app_settings enable row level security;

-- 身内利用の簡易ポリシー（読み取り・更新ともに匿名キーで許可）
create policy "Allow anon read" on app_settings for select using (true);
create policy "Allow anon insert" on app_settings for insert with check (true);
create policy "Allow anon update" on app_settings for update using (true) with check (true);
