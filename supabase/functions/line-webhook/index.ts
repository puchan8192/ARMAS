// LINEプラットフォームからのWebhookを受け取るEdge Function。
// 目的はメッセージへの自動応答ではなく、「通知を送りたいグループ/個人のID」を
// 手作業でコピーせず自動的にDB(line_targets)へ登録することにある。
//
// 使い方：
//   1. このFunctionをデプロイし、LINE Developers ConsoleのWebhook URLに設定する
//   2. Botを通知したいLINEグループに招待し、グループ内で何かひとこと発言する
//      （または個人であればBotに話しかける）
//   3. line_targetsテーブルにgroupId/userIdが自動的に登録される
//
// 必要な環境変数(Supabaseの `supabase secrets set` で設定):
//   LINE_CHANNEL_SECRET        LINE Developers Console の チャネルシークレット
//   SUPABASE_URL               (Supabaseが自動的に注入する組み込み変数)
//   SUPABASE_SERVICE_ROLE_KEY  (Supabaseが自動的に注入する組み込み変数)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CHANNEL_SECRET = Deno.env.get('LINE_CHANNEL_SECRET') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

// LINEからのリクエストが本物か（x-line-signatureヘッダ）を検証する
async function verifySignature(body: string, signature: string | null): Promise<boolean> {
  if (!signature || !CHANNEL_SECRET) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(CHANNEL_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return toBase64(new Uint8Array(mac)) === signature;
}

Deno.serve(async (req) => {
  // LINE Developers Consoleの「検証」ボタンは空のPOSTを送ってくるため、
  // 署名検証前にまず200を返せるよう本文を先に読み取ってから判定する。
  const bodyText = await req.text();
  const signature = req.headers.get('x-line-signature');

  if (bodyText && !(await verifySignature(bodyText, signature))) {
    return new Response('invalid signature', { status: 403 });
  }

  let payload: { events?: Array<Record<string, unknown>> } = {};
  try {
    payload = bodyText ? JSON.parse(bodyText) : {};
  } catch {
    return new Response('bad request', { status: 400 });
  }

  if (SUPABASE_URL && SERVICE_ROLE_KEY) {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    for (const event of payload.events ?? []) {
      const source = (event as { source?: { type?: string; groupId?: string; userId?: string } }).source ?? {};

      if (source.type === 'group' && source.groupId) {
        await supabase.from('line_targets').upsert(
          { line_id: source.groupId, kind: 'group', label: 'ARMAS通知グループ' },
          { onConflict: 'line_id' },
        );
      } else if (source.type === 'user' && source.userId) {
        await supabase.from('line_targets').upsert(
          { line_id: source.userId, kind: 'user', label: '個人' },
          { onConflict: 'line_id' },
        );
      }
    }
  }

  // LINE側はWebhookの応答が200以外だとエラー扱いにするため、常に200を返す
  return new Response('OK', { status: 200 });
});
