// ARMASのフロントエンドから呼び出され、line_targetsテーブルに登録済みの
// グループ/個人へLINE Messaging APIでpushメッセージを送るEdge Function。
//
// フロントエンドにはLINEのChannel Access Token(強い権限を持つ秘密鍵)を
// 一切持たせず、このFunction内(サーバー側)でのみ環境変数として保持する。
//
// 必要な環境変数(`supabase secrets set` で設定):
//   LINE_CHANNEL_ACCESS_TOKEN  LINE Developers Console の チャネルアクセストークン
//   SUPABASE_URL               (Supabaseが自動的に注入する組み込み変数)
//   SUPABASE_SERVICE_ROLE_KEY  (Supabaseが自動的に注入する組み込み変数)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CHANNEL_ACCESS_TOKEN = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// ブラウザ(GitHub Pages)からの呼び出しを許可するためのCORSヘッダー
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ sent: false, reason: 'method_not_allowed' }, 405);
  }
  if (!CHANNEL_ACCESS_TOKEN) {
    return json({ sent: false, reason: 'token_not_configured' }, 500);
  }

  let message = '';
  try {
    const body = await req.json();
    message = String(body.message ?? '').trim();
  } catch {
    return json({ sent: false, reason: 'bad_request' }, 400);
  }
  if (!message) return json({ sent: false, reason: 'empty_message' }, 400);
  // LINEのテキストメッセージは1通あたり5000文字までのため安全側で切り詰める
  message = message.slice(0, 4900);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: targets, error } = await supabase.from('line_targets').select('line_id');

  if (error) return json({ sent: false, reason: 'db_error' }, 500);
  if (!targets || targets.length === 0) {
    return json({ sent: false, reason: 'no_target_registered' });
  }

  const results = await Promise.all(targets.map((t: { line_id: string }) => fetch(
    'https://api.line.me/v2/bot/message/push',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        to: t.line_id,
        messages: [{ type: 'text', text: message }],
      }),
    },
  )));

  const allOk = results.every((r) => r.ok);
  return json({ sent: allOk }, allOk ? 200 : 502);
});
