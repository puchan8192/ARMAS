import { state } from './state.js';

async function postToWebhook(content) {
  if (!state.settings.webhook) return { sent: false, reason: 'Webhook未設定' };
  try {
    const res = await fetch(state.settings.webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    return { sent: res.ok };
  } catch (e) {
    return { sent: false, reason: '通信エラー' };
  }
}

export function sendDiscordNotice(resv) {
  const content = '📅 **新しい予約が入りました**\n'
    + `日時: ${resv.date} ${resv.time}\n`
    + `予約者: ${resv.reservedBy}\n`
    + (resv.reservedFor ? `予約先: ${resv.reservedFor}\n` : '')
    + (resv.rankTier ? `現在のランク: ${resv.rankTier}\n` : '')
    + (resv.map ? `参考ランクマップ（予約時点）: ${resv.map}\n` : '')
    + (resv.note ? `備考: ${resv.note}` : '備考: なし');
  return postToWebhook(content);
}

export function sendDiscordCancelNotice(resv) {
  const content = '🚫 **予約がキャンセルされました**\n'
    + `日時: ${resv.date} ${resv.time}\n`
    + `予約者: ${resv.reservedBy}${resv.reservedFor ? ` → ${resv.reservedFor}` : ''}\n`
    + (resv.rankTier ? `現在のランク: ${resv.rankTier}\n` : '')
    + (resv.note ? `備考: ${resv.note}` : '備考: なし');
  return postToWebhook(content);
}

export function sendDiscordReplyNotice(resv, repliedBy, message) {
  const target = resv.reservedBy
    ? `${resv.reservedBy}${resv.reservedFor ? ` → ${resv.reservedFor}` : ''}（${resv.date} ${resv.time}）`
    : `${resv.date} ${resv.time}`;
  const content = '💬 **予約への返信があります**\n'
    + `対象の予約: ${target}\n`
    + `予約時のメッセージ: ${resv.note ? resv.note : 'なし'}\n`
    + `返信${repliedBy ? `（${repliedBy}より）` : ''}: ${message}`;
  return postToWebhook(content);
}
