import { LINE_NOTIFY_FUNCTION_URL } from './config.js';

// notify-line Edge Functionを呼び出し、登録済みのLINEグループへ通知する。
// fieldsを渡すとサーバー側(Edge Function)で装飾付きメッセージ(Flex Message)を
// 組み立てて送信する。fieldsが無い場合は単純なテキストメッセージとして送る。
//
// Edge Function自体はSupabaseのゲートウェイ認証を通す必要があるため、
// 公開情報であるanon keyをAuthorizationヘッダーに付与して呼び出す
// （LINEのChannel Access Tokenのような秘密鍵はフロントエンドに一切持たせない）。
export async function sendLineNotice(fields) {
  try {
    const res = await fetch(LINE_NOTIFY_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${window.SUPABASE_CONFIG.anonKey}`,
      },
      body: JSON.stringify({ fields }),
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
