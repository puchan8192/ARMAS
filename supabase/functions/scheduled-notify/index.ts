// 1分ごとに pg_cron から呼び出される定期通知用のEdge Function。
//   1) 予約の「30分前」「5分前」リマインドをDiscord・LINEへ送る
//   2) お気に入りマップがランクのローテーションに来たとき（現在／次）に通知する
//
// 必要な環境変数(`supabase secrets set` で設定):
//   APEX_API_KEY               api.mozambiquehe.re のAPIキー（お気に入りマップ通知に使用。未設定ならこの機能はスキップ）
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY  (Supabaseが自動的に注入)
// LINEへの送信は既存の notify-line Function を内部から呼び出して行う（トークンの重複管理を避けるため）。
// 予約の日時は日本時間(JST)として扱う。

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const APEX_API_KEY = Deno.env.get('APEX_API_KEY') ?? '';
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function getWebhook(): Promise<string> {
  const { data } = await supabase.from('app_settings').select('discord_webhook_url').eq('id', 'default').maybeSingle();
  return data?.discord_webhook_url ?? '';
}

async function notifyAll(webhook: string, text: string) {
  const tasks: Promise<unknown>[] = [];
  if (webhook) {
    tasks.push(fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text }),
    }).catch((e) => console.warn('discord failed', e)));
  }
  tasks.push(fetch(`${SUPABASE_URL}/functions/v1/notify-line`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
    body: JSON.stringify({ message: text }),
  }).catch((e) => console.warn('line failed', e)));
  await Promise.all(tasks);
}

async function getState(key: string): Promise<string | null> {
  const { data } = await supabase.from('notify_state').select('value').eq('key', key).maybeSingle();
  return data?.value ?? null;
}
async function setState(key: string, value: string) {
  await supabase.from('notify_state').upsert({ key, value, updated_at: new Date().toISOString() });
}

// ---------- 1) 予約リマインド ----------
async function runReminders(webhook: string) {
  const now = Date.now();
  // 開始が「いまから35分以内」の予約だけを対象にする（日付は前後1日の余裕を持って絞る）
  const jst = new Date(now + 9 * 3600 * 1000);
  const d0 = new Date(jst.getTime() - 24 * 3600 * 1000).toISOString().slice(0, 10);
  const d1 = new Date(jst.getTime() + 24 * 3600 * 1000).toISOString().slice(0, 10);
  const { data: resvs, error } = await supabase
    .from('reservations')
    .select('id,reserved_by,reserved_for,reservation_date,reservation_time,capacity,status,reminded_30,reminded_5')
    .neq('status', 'キャンセル')
    .gte('reservation_date', d0)
    .lte('reservation_date', d1);
  if (error || !resvs) return 0;

  let sent = 0;
  for (const r of resvs) {
    const start = new Date(`${r.reservation_date}T${String(r.reservation_time).slice(0, 5)}:00+09:00`).getTime();
    const diffMin = (start - now) / 60000;
    let which: 30 | 5 | null = null;
    if (diffMin >= 0 && diffMin <= 5 && !r.reminded_5) which = 5;
    else if (diffMin > 5 && diffMin <= 30 && !r.reminded_30) which = 30;
    if (!which) continue;

    const { data: parts } = await supabase
      .from('participants').select('member_name').eq('reservation_id', r.id).eq('answer', '参加');
    const members = [r.reserved_by, ...(parts ?? []).map((p: { member_name: string }) => p.member_name)];
    const unique = [...new Set(members)];
    const free = Math.max(0, (r.capacity ?? 3) - unique.length);

    const text = `⏰ **開始${which === 5 ? '5分前' : '30分前'}です**\n`
      + `日時: ${r.reservation_date} ${String(r.reservation_time).slice(0, 5)}\n`
      + `参加予定: ${unique.join('、')}（${unique.length}/${r.capacity ?? 3}人）\n`
      + (free > 0 ? `まだ${free}枠空いています。\n` : '')
      + (r.reserved_for ? `予約先: ${r.reserved_for}\n` : '')
      + (which === 5 ? 'そろそろロビーに集まってください！' : '準備をお願いします。');

    await notifyAll(webhook, text);
    const patch = which === 5 ? { reminded_5: true, reminded_30: true } : { reminded_30: true };
    await supabase.from('reservations').update(patch).eq('id', r.id);
    sent += 1;
  }
  return sent;
}

// ---------- 2) お気に入りマップ通知 ----------
type Rot = { map?: string; start?: number; end?: number; remainingSecs?: number };

async function runFavoriteMaps(webhook: string) {
  if (!APEX_API_KEY) return 0;
  const res = await fetch(`https://api.mozambiquehe.re/maprotation?version=2&auth=${encodeURIComponent(APEX_API_KEY)}`);
  if (!res.ok) return 0;
  const data = await res.json();
  const cur: Rot = data?.ranked?.current ?? {};
  const next: Rot = data?.ranked?.next ?? {};
  if (!cur.map) return 0;

  const { data: favs } = await supabase.from('favorite_maps').select('member_name,map_name');
  const namesFor = (map?: string) => [...new Set((favs ?? [])
    .filter((f: { map_name: string }) => f.map_name === map)
    .map((f: { member_name: string }) => f.member_name))];

  let sent = 0;

  // 現在のマップが切り替わった時
  const curKey = `${cur.map}:${cur.start ?? ''}`;
  const prevCur = await getState('map_current');
  if (prevCur !== curKey) {
    await setState('map_current', curKey);
    const names = namesFor(cur.map);
    if (prevCur !== null && names.length > 0) { // 初回実行時は通知しない（状態の記録のみ）
      await notifyAll(webhook, `🗺️ **お気に入りマップです！**\n今ならランクは「${cur.map}」です。\n対象: ${names.join('、')}`);
      sent += 1;
    }
  }

  // 次のマップがお気に入りで、切り替わりまで30分以内の時（1回だけ）
  const nextKey = `${next.map}:${next.start ?? ''}`;
  const remain = typeof cur.remainingSecs === 'number' ? cur.remainingSecs : null;
  if (next.map && remain !== null && remain <= 1800) {
    const prevNext = await getState('map_next_notified');
    const names = namesFor(next.map);
    if (prevNext !== nextKey && names.length > 0) {
      await setState('map_next_notified', nextKey);
      await notifyAll(webhook, `🗺️ **もうすぐお気に入りマップです**\nあと約${Math.ceil(remain / 60)}分でランクが「${next.map}」に切り替わります。\n対象: ${names.join('、')}`);
      sent += 1;
    }
  }
  return sent;
}

Deno.serve(async () => {
  try {
    const webhook = await getWebhook();
    const reminders = await runReminders(webhook);
    const maps = await runFavoriteMaps(webhook);
    return new Response(JSON.stringify({ ok: true, reminders, maps }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 });
  }
});
