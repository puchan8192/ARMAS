import { sb, RESV_TABLE } from './config.js';
import { state } from './state.js';

export async function loadReservations() {
  const { data, error } = await sb
    .from(RESV_TABLE)
    .select('*')
    .order('reservation_date', { ascending: true })
    .order('reservation_time', { ascending: true });
  if (error) {
    console.error('予約の取得に失敗:', error);
    return [];
  }
  // DBのカラム名(reservation_date等)を、描画コードが使う名前に変換
  return (data || []).map((r) => ({
    id: r.id,
    date: r.reservation_date,
    time: r.reservation_time ? r.reservation_time.slice(0, 5) : r.reservation_time,
    reservedBy: r.reserved_by,
    reservedFor: r.reserved_for,
    note: r.note,
    map: r.map,
    rankTier: r.rank_tier,
    status: r.status || '募集中',
  }));
}

export async function saveReservation(resv) {
  const { data, error } = await sb.from(RESV_TABLE).insert({
    reserved_by: resv.reservedBy,
    reserved_for: resv.reservedFor || null,
    reservation_date: resv.date,
    reservation_time: resv.time,
    note: resv.note || null,
    map: resv.map || null,
    rank_tier: resv.rankTier || null,
    status: '募集中',
  }).select().single();
  if (error) throw error;
  return data.id;
}

export async function deleteReservation(id) {
  const { error } = await sb.from(RESV_TABLE).delete().eq('id', id);
  if (error) console.error('削除に失敗:', error);
}

// 同じ日時にすでに有効な(キャンセル以外の)予約がないかを確認する
export async function findConflicting(date, time, excludeId) {
  let query = sb
    .from(RESV_TABLE)
    .select('id,reserved_by,status')
    .eq('reservation_date', date)
    .eq('reservation_time', time)
    .neq('status', 'キャンセル');
  if (excludeId) query = query.neq('id', excludeId);
  const { data, error } = await query;
  if (error) {
    console.error('重複チェックに失敗:', error);
    return [];
  }
  return data || [];
}

export async function updateReservationStatus(id, status) {
  const { data, error } = await sb.from(RESV_TABLE).update({ status }).eq('id', id).select();
  if (error) {
    console.error('ステータス更新に失敗:', error);
    return false;
  }
  if (!data || data.length === 0) {
    console.error('ステータス更新が反映されませんでした（RLSのupdateポリシーをご確認ください）');
    return false;
  }
  return true;
}

export async function updateReservation(id, patch) {
  const { data, error } = await sb.from(RESV_TABLE).update({
    reservation_date: patch.date,
    reservation_time: patch.time,
    rank_tier: patch.rankTier || null,
    reserved_for: patch.reservedFor || null,
    note: patch.note || null,
  }).eq('id', id).select();
  if (error) throw error;
  if (!data || data.length === 0) {
    // RLSのupdateポリシーが無い場合、エラーは出ずに0件更新になることがある
    throw new Error('更新が反映されませんでした（Supabaseのupdateポリシーをご確認ください）');
  }
}

// カレンダー・時間帯選択画面に「すでに予約がある」ことを表示するためのキャッシュを更新する。
// キャンセル済みの予約は空き扱いにするため除外する。
export async function loadCalendarMarkers() {
  const { data, error } = await sb
    .from(RESV_TABLE)
    .select('reservation_date,reservation_time,reserved_by,status')
    .neq('status', 'キャンセル');
  if (error) {
    console.error('カレンダー用データの取得に失敗:', error);
    state.calendarReservations = [];
    return;
  }
  state.calendarReservations = (data || []).map((r) => ({
    date: r.reservation_date,
    time: r.reservation_time ? r.reservation_time.slice(0, 5) : r.reservation_time,
    reservedBy: r.reserved_by,
    status: r.status || '募集中',
  }));
}

export function reservationsOnDate(date) {
  return state.calendarReservations.filter((r) => r.date === date);
}
