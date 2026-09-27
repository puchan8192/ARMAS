-- LINE通知の送信先(グループ/個人)を保持するテーブル。
-- line-webhook Edge Functionが自動で登録し、notify-line Edge Functionが参照する。
-- フロントエンドから直接読み書きする必要はないため、
-- RLSは有効化した上でポリシーを追加せず、Edge Function(service_role key)からのみ
-- アクセスできるようにする。

create table if not exists line_targets (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'group', -- 'group' | 'user'
  line_id text not null unique,
  label text,
  created_at timestamptz default now()
);

alter table line_targets enable row level security;
-- 意図的にpolicyを追加しない = anon/authenticatedキーからは一切アクセス不可
-- (Edge Function内のservice_role keyはRLSをバイパスするため通常通り動作する)
