import { sb, RESV_TABLE, REPLY_TABLE } from './config.js';
import { renderReservations } from './reservationsView.js';

// 他の利用者による予約・返信の追加/変更/削除をリアルタイムに購読し、
// 開いている画面に自動反映する。
// Supabase側で対象テーブルがRealtime配信対象(publication)に
// 含まれている必要がある（Database > Replication で有効化、
// またはSQLで `alter publication supabase_realtime add table reservations, replies;`）。

// 短時間に複数の変更イベントが連続しても再描画が重ならないよう、簡易的にデバウンスする。
let refreshTimer = null;
function scheduleRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    renderReservations();
  }, 300);
}

export function initRealtimeSync() {
  sb.channel('armas-db-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: RESV_TABLE }, scheduleRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: REPLY_TABLE }, scheduleRefresh)
    .subscribe();
}
