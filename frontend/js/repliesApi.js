import { sb, REPLY_TABLE } from './config.js';

// 予約一覧の描画時にまとめて取得するため、reservation_idごとにグルーピングして返す
export async function loadRepliesGrouped(reservationIds) {
  if (!reservationIds || reservationIds.length === 0) return {};
  const { data, error } = await sb
    .from(REPLY_TABLE)
    .select('*')
    .in('reservation_id', reservationIds)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('返信の取得に失敗:', error);
    return {};
  }
  const grouped = {};
  (data || []).forEach((row) => {
    if (!grouped[row.reservation_id]) grouped[row.reservation_id] = [];
    grouped[row.reservation_id].push({
      id: row.id,
      repliedBy: row.replied_by,
      message: row.message,
      createdAt: row.created_at,
    });
  });
  return grouped;
}

export async function saveReply(reservationId, repliedBy, message) {
  const { error } = await sb.from(REPLY_TABLE).insert({
    reservation_id: reservationId,
    replied_by: repliedBy || null,
    message,
  });
  if (error) throw error;
}
