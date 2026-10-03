import { $ } from './dom.js';
import { state } from './state.js';
import {
  loadFavoriteMaps, addFavoriteMap, removeFavoriteMap, currentMemberName,
} from './partyApi.js';

// ランクのマップ名（API表記）。お気に入り登録の選択肢に使う。
export const RANK_MAP_NAMES = ["World's Edge", 'Storm Point', 'Broken Moon', 'Olympus', 'Kings Canyon', 'E-District'];

const pad2 = (n) => String(n).padStart(2, '0');

function clock(unixSec) {
  const d = new Date(unixSec * 1000);
  return `${d.getMonth() + 1}/${d.getDate()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// 「現在」「次」のマップとその時間帯を表示する。
// このAPIは現在と次の2つしか返さないため、先々のローテーションまでは出せない。
// 時間帯から、そのマップのうちに遊べる枠として予約日時をワンタップで選べるようにする。
export function renderMapSchedule(cur, next) {
  const el = $('mapSchedule');
  if (!el) return;
  const rows = [];
  const add = (label, rot) => {
    if (!rot || !rot.map) return;
    const hasRange = typeof rot.start === 'number' && typeof rot.end === 'number';
    const range = hasRange ? `${clock(rot.start)} 〜 ${clock(rot.end)}` : '時間帯は取得できません';
    const pick = hasRange && rot.start * 1000 > Date.now()
      ? `<button class="map-pick-btn" data-start="${rot.start}">この時間で予約</button>` : '';
    rows.push(`<div class="map-sched-row"><span class="map-sched-label">${label}</span><b>${rot.map}</b><span class="map-sched-range">${range}</span>${pick}</div>`);
  };
  add('現在', cur);
  add('次', next);
  el.innerHTML = rows.length
    ? `<div class="map-sched-title">マップ別の時間帯（おすすめの予約時間）</div>${rows.join('')}` : '';

  el.querySelectorAll('.map-pick-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      // 開始時刻を30分刻みに切り上げて、日付・時間を選択状態にする
      const d = new Date(Number(btn.dataset.start) * 1000);
      const m = d.getMinutes();
      if (m % 30 !== 0) d.setMinutes(m < 30 ? 30 : 60, 0, 0);
      state.selectedDate = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
      state.selectedTime = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
      state.viewYear = d.getFullYear();
      state.viewMonth = d.getMonth();
      // 循環importを避けるため、画面の再描画は通知イベント経由で行う
      document.dispatchEvent(new CustomEvent('armas:slot-picked'));
    });
  });
}

// ---------- お気に入りマップ ----------
// 登録するとDBに保存され、Edge Function(scheduled-notify)がローテーション切り替え時にDiscord/LINEで通知する。
// この端末のブラウザが開いている間は、ブラウザ通知（許可した場合）でもお知らせする。

let lastNotifiedKey = '';
let lastMaps = { cur: '', next: '' };

// ログイン完了後など、直近のマップ情報で表示を更新し直す
export function refreshFavoriteMaps() {
  return renderFavoriteMaps(lastMaps.cur, lastMaps.next);
}

export async function renderFavoriteMaps(currentMapName, nextMapName) {
  const el = $('favMaps');
  if (!el) return;
  lastMaps = { cur: currentMapName, next: nextMapName };
  const me = currentMemberName();
  if (!me) { el.innerHTML = ''; return; }

  const favs = (await loadFavoriteMaps()).filter((f) => f.member_name === me).map((f) => f.map_name);
  el.innerHTML = `
    <div class="map-sched-title">お気に入りマップ通知（${me}さん）</div>
    <div class="fav-chips">
      ${RANK_MAP_NAMES.map((m) => `<button class="fav-chip ${favs.includes(m) ? 'on' : ''}" data-map="${m}">${favs.includes(m) ? '★' : '☆'} ${m}</button>`).join('')}
    </div>
    <p class="hint">★のマップがランクに来ると、Discord・LINEで通知します（切り替わり時と、切り替わり30分前）。</p>`;

  el.querySelectorAll('.fav-chip').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const map = btn.dataset.map;
      try {
        if (favs.includes(map)) await removeFavoriteMap(me, map);
        else {
          await addFavoriteMap(me, map);
          if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
        }
      } catch (e) {
        console.error(e);
        window.alert('お気に入りの保存に失敗しました（supabase/party_features.sql を実行済みかご確認ください）。');
      }
      renderFavoriteMaps(currentMapName, nextMapName);
    });
  });

  // 画面を開いている間のお知らせ（現在のマップがお気に入りの時、1回だけ）
  if (currentMapName && favs.includes(currentMapName) && lastNotifiedKey !== currentMapName) {
    lastNotifiedKey = currentMapName;
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('ARMAS', { body: `今のランクは「${currentMapName}」です（お気に入り）` });
    }
  }
}
