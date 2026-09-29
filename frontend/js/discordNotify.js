import { state } from './state.js';
import { sendLineNotice } from './lineNotify.js';

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

// DiscordとLINEへ並行して通知する。
// 呼び出し元の既存コードとの互換性のため、戻り値のsent/reasonはこれまで通り
// Discordの送信結果を表す。LINE側の結果は`lineSent`として別途持たせ、
// 失敗時はコンソールにログを残す（LINE未設定でもDiscord通知の妨げにはしない）。
async function postToAllChannels(content, lineFields) {
  const [discordResult, lineResult] = await Promise.all([
    postToWebhook(content),
    sendLineNotice(lineFields),
  ]);
  if (!lineResult.sent) {
    console.warn('LINEへの通知に失敗しました:', lineResult.reason);
  }
  return { ...discordResult, lineSent: lineResult.sent, lineReason: lineResult.reason };
}

// Discordの投稿は通常のIncoming Webhookのため、Discord上にクリック可能な
// ボタン（Interactions）を直接置くことはできない（要Botサーバー）。
// 代わりに、対象の予約を開いた状態でARMASに戻れるリンクを載せ、
// アプリ側で「参加する／参加しない」を選べるようにする。
function buildAppLink(resvId) {
  try {
    return `${window.location.origin}${window.location.pathname}?resv=${resvId}`;
  } catch (e) {
    return '';
  }
}

export function sendDiscordNotice(resv) {
  const link = resv.id ? buildAppLink(resv.id) : '';
  const content = '📅 **新しい予約が入りました**\n'
    + `日時: ${resv.date} ${resv.time}\n`
    + `予約者: ${resv.reservedBy}\n`
    + (resv.reservedFor ? `予約先: ${resv.reservedFor}\n` : '')
    + (resv.rankTier ? `現在のランク: ${resv.rankTier}\n` : '')
    + (resv.map ? `参考ランクマップ（予約時点）: ${resv.map}\n` : '')
    + (resv.note ? `備考: ${resv.note}\n` : '備考: なし\n')
    + (link ? `\n▶ 参加する／参加しないはこちらから回答してください:\n${link}` : '');

  const lineFields = {
    kind: 'new',
    date: resv.date,
    time: resv.time,
    reservedBy: resv.reservedBy,
    reservedFor: resv.reservedFor,
    rankTier: resv.rankTier,
    map: resv.map,
    note: resv.note,
    link,
  };

  return postToAllChannels(content, lineFields);
}

export function sendDiscordJoinDecisionNotice(resv, decision) {
  const emoji = decision === '参加する' ? '✅' : '❌';
  const content = `${emoji} **参加可否の回答がありました**\n`
    + `日時: ${resv.date} ${resv.time}\n`
    + `予約者: ${resv.reservedBy}${resv.reservedFor ? ` → ${resv.reservedFor}` : ''}\n`
    + `回答: ${decision}`;

  const lineFields = {
    kind: 'join',
    date: resv.date,
    time: resv.time,
    reservedBy: resv.reservedBy,
    reservedFor: resv.reservedFor,
    decision,
  };

  return postToAllChannels(content, lineFields);
}

export function sendDiscordCancelNotice(resv) {
  const content = '🚫 **予約がキャンセルされました**\n'
    + `日時: ${resv.date} ${resv.time}\n`
    + `予約者: ${resv.reservedBy}${resv.reservedFor ? ` → ${resv.reservedFor}` : ''}\n`
    + (resv.rankTier ? `現在のランク: ${resv.rankTier}\n` : '')
    + (resv.note ? `備考: ${resv.note}` : '備考: なし');

  const lineFields = {
    kind: 'cancel',
    date: resv.date,
    time: resv.time,
    reservedBy: resv.reservedBy,
    reservedFor: resv.reservedFor,
    rankTier: resv.rankTier,
    note: resv.note,
  };

  return postToAllChannels(content, lineFields);
}

export function sendDiscordReplyNotice(resv, repliedBy, message) {
  const target = resv.reservedBy
    ? `${resv.reservedBy}${resv.reservedFor ? ` → ${resv.reservedFor}` : ''}（${resv.date} ${resv.time}）`
    : `${resv.date} ${resv.time}`;
  const content = '💬 **予約への返信があります**\n'
    + `対象の予約: ${target}\n`
    + `予約時のメッセージ: ${resv.note ? resv.note : 'なし'}\n`
    + `返信${repliedBy ? `（${repliedBy}より）` : ''}: ${message}`;

  const lineFields = {
    kind: 'reply',
    date: resv.date,
    time: resv.time,
    reservedBy: resv.reservedBy,
    reservedFor: resv.reservedFor,
    note: resv.note,
    repliedBy,
    message,
  };

  return postToAllChannels(content, lineFields);
}
