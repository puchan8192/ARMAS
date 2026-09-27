import { LINE_NOTIFY_FUNCTION_URL } from './config.js';

// LINEはDiscordのMarkdown記法(**太字**など)を解釈しないため、
// 表示が崩れないよう記号を取り除いてから送信する。
function toLinePlainText(discordStyleContent) {
  return discordStyleContent.replace(/\*\*/g, '');
}

// notify-line Edge Functionを呼び出し、登録済みのLINEグループ/個人へ通知する。
// Edge Function自体はSupabaseのゲートウェイ認証を通す必要があるため、
// 公開情報であるanon keyをAuthorizationヘッダーに付与して呼び出す
// （LINEのChannel Access Tokenのような秘密鍵はフロントエンドに一切持たせない）。
export async function sendLineNotice(discordStyleContent) {
  try {
    const res = await fetch(LINE_NOTIFY_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${window.SUPABASE_CONFIG.anonKey}`,
      },
      body: JSON.stringify({ message: toLinePlainText(discordStyleContent) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.sent === false) {
      return { sent: false, reason: data.reason || `http_${res.status}` };
    }
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: '通信エラー' };
  }
}
