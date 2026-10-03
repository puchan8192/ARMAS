// ARMASのフロントエンドから呼び出され、line_targetsテーブルに登録済みの
// 「グループ」へLINE Messaging APIでFlex Message(装飾付きメッセージ)をpushするEdge Function。
// 個人(1:1)の登録先には意図的に送信しない(誤って公式アカウントを追加した
// 第三者への誤送信を避けるため)。
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

type NoticeFields = {
  kind: 'new' | 'reply' | 'cancel' | 'join' | 'full';
  date?: string;
  time?: string;
  reservedBy?: string;
  reservedFor?: string;
  rankTier?: string;
  map?: string;
  note?: string;
  link?: string;
  repliedBy?: string;
  message?: string;
  decision?: string;
  member?: string;
  progress?: string;
  capacity?: number;
};

const COLOR = {
  accent: '#FF6B35', // 新規予約(日時強調)
  info: '#4F8EF7', // 返信
  danger: '#FF4655', // キャンセル/不参加
  ok: '#2ECC71', // 参加する
  text: '#1A1A1A',
  muted: '#767676',
};

// 見出し用の色付き日時ボックス
function dateTimeBox(date: string, time: string, color: string) {
  return {
    type: 'box',
    layout: 'vertical',
    backgroundColor: color,
    cornerRadius: '8px',
    paddingAll: '10px',
    contents: [
      {
        type: 'text',
        text: `${date || ''} ${time || ''}`.trim(),
        color: '#FFFFFF',
        weight: 'bold',
        size: 'lg',
        align: 'center',
      },
    ],
  };
}

// ラベル:値 の1行
function row(label: string, value?: string) {
  if (!value) return null;
  return {
    type: 'box',
    layout: 'baseline',
    spacing: 'sm',
    contents: [
      {
        type: 'text', text: label, size: 'xs', color: COLOR.muted, flex: 2,
      },
      {
        type: 'text', text: value, size: 'sm', color: COLOR.text, flex: 5, wrap: true,
      },
    ],
  };
}

function headerText(title: string, color: string) {
  return {
    type: 'text', text: title, weight: 'bold', size: 'md', color, wrap: true,
  };
}

function linkText(link?: string) {
  if (!link) return null;
  return {
    type: 'text',
    text: '▶ 参加する／参加しないはこちらから回答',
    size: 'sm',
    color: COLOR.info,
    weight: 'bold',
    margin: 'md',
    wrap: true,
    action: { type: 'uri', label: '回答する', uri: link },
  };
}

function buildBubble(fields: NoticeFields) {
  const rows: Array<Record<string, unknown> | null> = [];
  let title = '';
  let titleColor: string = COLOR.text;
  let boxColor: string = COLOR.accent;

  if (fields.kind === 'new') {
    title = '📅 新しい予約が入りました';
    titleColor = COLOR.accent;
    boxColor = COLOR.accent;
    rows.push(
      row('予約者', fields.reservedBy),
      row('予約先', fields.reservedFor),
      row('ランク', fields.rankTier),
      fields.capacity ? row('募集人数', `${fields.capacity}人パーティー（予約者含む）`) : null,
      row('参考マップ', fields.map),
      row('備考', fields.note || 'なし'),
    );
  } else if (fields.kind === 'reply') {
    title = '💬 予約への返信があります';
    titleColor = COLOR.info;
    boxColor = COLOR.info;
    rows.push(
      row('対象の予約者', `${fields.reservedBy || ''}${fields.reservedFor ? ` → ${fields.reservedFor}` : ''}`),
      row('予約時のメッセージ', fields.note || 'なし'),
      row(fields.repliedBy ? `返信（${fields.repliedBy}）` : '返信', fields.message),
    );
  } else if (fields.kind === 'cancel') {
    title = '🚫 予約がキャンセルされました';
    titleColor = COLOR.danger;
    boxColor = COLOR.danger;
    rows.push(
      row('予約者', `${fields.reservedBy || ''}${fields.reservedFor ? ` → ${fields.reservedFor}` : ''}`),
      row('ランク', fields.rankTier),
      row('備考', fields.note || 'なし'),
    );
  } else if (fields.kind === 'join') {
    const isYes = fields.decision === '参加する';
    title = `${isYes ? '✅' : '❌'} 参加可否の回答がありました`;
    titleColor = isYes ? COLOR.ok : COLOR.danger;
    boxColor = isYes ? COLOR.ok : COLOR.danger;
    rows.push(
      row('予約者', `${fields.reservedBy || ''}${fields.reservedFor ? ` → ${fields.reservedFor}` : ''}`),
      row('回答者', fields.member),
      row('回答', fields.decision),
      row('参加状況', fields.progress),
    );
  } else if (fields.kind === 'full') {
    title = '🎉 メンバーが揃い、予約が確定しました';
    titleColor = COLOR.ok;
    boxColor = COLOR.ok;
    rows.push(
      row('予約者', fields.reservedBy),
      row('メンバー', fields.member),
      row('人数', fields.progress),
    );
  }

  const bodyContents: Array<Record<string, unknown>> = [
    headerText(title, titleColor),
  ];
  if (fields.date || fields.time) {
    bodyContents.push({ type: 'separator', margin: 'md' });
    bodyContents.push({ ...dateTimeBox(fields.date || '', fields.time || '', boxColor), margin: 'md' });
  }
  bodyContents.push({ type: 'separator', margin: 'md' });
  bodyContents.push({
    type: 'box',
    layout: 'vertical',
    spacing: 'sm',
    margin: 'md',
    contents: rows.filter((r): r is Record<string, unknown> => r !== null),
  });
  const link = linkText(fields.link);
  if (link) bodyContents.push(link);

  return {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '16px',
      contents: bodyContents,
    },
  };
}

function buildAltText(fields: NoticeFields): string {
  if (fields.kind === 'new') return `新しい予約: ${fields.date} ${fields.time} (${fields.reservedBy})`;
  if (fields.kind === 'reply') return `予約への返信: ${fields.message || ''}`;
  if (fields.kind === 'cancel') return `予約がキャンセルされました: ${fields.date} ${fields.time}`;
  if (fields.kind === 'join') return `参加可否の回答: ${fields.member || ''} ${fields.decision}`;
  if (fields.kind === 'full') return `予約が確定しました: ${fields.date} ${fields.time}`;
  return 'ARMASからの通知';
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

  let body: { kind?: string; fields?: NoticeFields; message?: string };
  try {
    body = await req.json();
  } catch {
    return json({ sent: false, reason: 'bad_request' }, 400);
  }

  // fields(構造化データ)があればFlex Messageを、無ければ従来通りの単純テキストを送る
  let lineMessage: Record<string, unknown>;
  if (body.fields && body.fields.kind) {
    lineMessage = {
      type: 'flex',
      altText: buildAltText(body.fields).slice(0, 400),
      contents: buildBubble(body.fields),
    };
  } else {
    const text = String(body.message ?? '').trim().slice(0, 4900);
    if (!text) return json({ sent: false, reason: 'empty_message' }, 400);
    lineMessage = { type: 'text', text };
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  // 個人(1:1)には送らず、グループにのみ送信する
  const { data: targets, error } = await supabase
    .from('line_targets')
    .select('line_id')
    .eq('kind', 'group');

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
        messages: [lineMessage],
      }),
    },
  )));

  const allOk = results.every((r) => r.ok);
  return json({ sent: allOk }, allOk ? 200 : 502);
});
