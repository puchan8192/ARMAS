import { sb } from './config.js';
import { state } from './state.js';

// ---------- 参加者（「参加する／不参加」の回答） ----------

export async function loadParticipantsGrouped(reservationIds) {
  if (!reservationIds || reservationIds.length === 0) return {};
  const { data, error } = await sb.from('participants').select('*').in('reservation_id', reservationIds);
  if (error) {
    console.error('参加者の取得に失敗:', error);
    return {};
  }
  const grouped = {};
  (data || []).forEach((p) => {
    if (!grouped[p.reservation_id]) grouped[p.reservation_id] = [];
    grouped[p.reservation_id].push({
      name: p.member_name, answer: p.answer, rankTier: p.rank_tier, createdAt: p.created_at,
    });
  });
  return grouped;
}

export async function loadAllParticipants() {
  const { data, error } = await sb.from('participants').select('*');
  if (error) {
    console.error('参加者の取得に失敗:', error);
    return [];
  }
  return (data || []).map((p) => ({
    reservationId: p.reservation_id, name: p.member_name, answer: p.answer, rankTier: p.rank_tier, createdAt: p.created_at,
  }));
}

// 同じ人が回答し直した場合は上書きする（予約ID＋名前で一意）
export async function saveParticipantAnswer(reservationId, name, answer, rankTier) {
  const { error } = await sb.from('participants').upsert({
    reservation_id: reservationId,
    member_name: name,
    answer,
    rank_tier: rankTier || null,
  }, { onConflict: 'reservation_id,member_name' });
  if (error) throw error;
}

// 予約1件のパーティー状況を計算する。予約者本人は常に参加扱い。
export function partyOf(resv, participants) {
  const joined = [{ name: resv.reservedBy, isHost: true, rankTier: resv.rankTier }];
  const declined = [];
  (participants || []).forEach((p) => {
    if (p.answer === '参加') {
      if (!joined.some((j) => j.name === p.name)) joined.push({ name: p.name, isHost: false, rankTier: p.rankTier });
    } else {
      declined.push(p.name);
    }
  });
  const capacity = resv.capacity || 3;
  return {
    joined, declined, capacity, count: joined.length, free: Math.max(0, capacity - joined.length), full: joined.length >= capacity,
  };
}

export function currentMemberName() {
  const u = state.currentUser;
  return u ? (u.displayName || u.email) : '';
}

// 各メンバーの「最後に記録されたランク」を、予約と参加回答の履歴から求める
export function latestRanks(reservations, allParticipants) {
  const events = [];
  reservations.forEach((r) => {
    if (r.reservedBy && r.rankTier) events.push({ name: r.reservedBy, rank: r.rankTier, at: r.createdAt || `${r.date}T${r.time}` });
  });
  (allParticipants || []).forEach((p) => {
    if (p.name && p.rankTier && p.answer === '参加') events.push({ name: p.name, rank: p.rankTier, at: p.createdAt });
  });
  events.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const map = {};
  events.forEach((e) => { map[e.name] = e.rank; });
  return map;
}

// ---------- シーズン目標 ----------

export async function loadGoals() {
  const { data, error } = await sb.from('rank_goals').select('*').order('created_at', { ascending: true });
  if (error) {
    console.error('目標の取得に失敗:', error);
    return [];
  }
  return data || [];
}

export async function saveGoal({ name, seasonLabel, seasonStart, targetRank }) {
  const { error } = await sb.from('rank_goals').insert({
    member_name: name,
    season_label: seasonLabel || null,
    season_start: seasonStart,
    target_rank: targetRank,
  });
  if (error) throw error;
}

export async function deleteGoal(id) {
  const { error } = await sb.from('rank_goals').delete().eq('id', id);
  if (error) throw error;
}

// ---------- お気に入りマップ ----------

export async function loadFavoriteMaps() {
  const { data, error } = await sb.from('favorite_maps').select('*');
  if (error) {
    console.error('お気に入りマップの取得に失敗:', error);
    return [];
  }
  return data || [];
}

export async function addFavoriteMap(name, mapName) {
  const { error } = await sb.from('favorite_maps').upsert(
    { member_name: name, map_name: mapName },
    { onConflict: 'member_name,map_name' },
  );
  if (error) throw error;
}

export async function removeFavoriteMap(name, mapName) {
  const { error } = await sb.from('favorite_maps').delete().eq('member_name', name).eq('map_name', mapName);
  if (error) throw error;
}
