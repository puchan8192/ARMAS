import { $ } from './dom.js';
import { state } from './state.js';
import { MAP_API_BASE } from './config.js';

let mapTimerInterval = null;
let mapRemainingSecs = null;

function stopMapTimer() {
  if (mapTimerInterval) {
    clearInterval(mapTimerInterval);
    mapTimerInterval = null;
  }
}

function formatRemaining(secs) {
  const clamped = Math.max(0, secs);
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = Math.floor(clamped % 60);
  return h > 0
    ? `残り ${h}時間${String(m).padStart(2, '0')}分`
    : `残り ${m}分${String(s).padStart(2, '0')}秒`;
}

// eslint-disable-next-line no-use-before-define
function tickMapTimer() {
  if (mapRemainingSecs === null) return;
  mapRemainingSecs -= 1;
  const el = $('mapTimer');
  if (el) el.textContent = formatRemaining(mapRemainingSecs);
  if (mapRemainingSecs <= 0) {
    stopMapTimer();
    fetchMapRotation(); // マップが切り替わったタイミングで自動的に再取得
  }
}

export async function fetchMapRotation() {
  stopMapTimer();
  if (!state.settings.apexKey) {
    $('mapBox').innerHTML = '<p class="fallback">APIキー未設定のため取得できません。設定からAPIキーを登録してください。</p>';
    return;
  }
  $('mapBox').innerHTML = '<p class="fallback">取得中...</p>';
  try {
    const res = await fetch(`${MAP_API_BASE}?version=2&auth=${encodeURIComponent(state.settings.apexKey)}`);
    if (!res.ok) throw new Error('API error');
    const data = await res.json();
    const ranked = data.ranked || {};
    const cur = ranked.current || {};
    const next = ranked.next || {};
    const hasTimer = typeof cur.remainingSecs === 'number';
    $('mapBox').innerHTML = `
      <div class="cur">
        <span class="name">${cur.map || '不明'}</span>
        ${hasTimer ? `<span class="timer" id="mapTimer">${formatRemaining(cur.remainingSecs)}</span>` : ''}
      </div>
      <div class="next">次のマップ: ${next.map || '不明'}</div>
      <p class="hint" style="margin-top:10px;">※このAPIは「現在」と「次」のマップしか取得できません。数日後などの予約に対しては、予約時点の直近ローテーションを参考値として記録します。</p>
    `;
    if (hasTimer) {
      mapRemainingSecs = cur.remainingSecs;
      mapTimerInterval = setInterval(tickMapTimer, 1000);
    } else {
      mapRemainingSecs = null;
    }
  } catch (e) {
    $('mapBox').innerHTML = '<p class="fallback">マップ情報の取得に失敗しました（APIキーやネットワークをご確認ください）。</p>';
  }
}

export async function currentMapSnapshot() {
  if (!state.settings.apexKey) return null;
  try {
    const res = await fetch(`${MAP_API_BASE}?version=2&auth=${encodeURIComponent(state.settings.apexKey)}`);
    if (!res.ok) return null;
    const data = await res.json();
    const ranked = data.ranked || {};
    return (ranked.current && ranked.current.map) ? ranked.current.map : null;
  } catch (e) {
    return null;
  }
}
