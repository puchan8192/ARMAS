import { $ } from './dom.js';
import { sb } from './config.js';

const presenceChannel = sb.channel('armas-presence', {
  config: { presence: { key: crypto.randomUUID() } },
});

let trackedPayload = { online_at: new Date().toISOString(), name: '' };
let isSubscribed = false;

function updateOnlineCount() {
  const presenceState = presenceChannel.presenceState();
  const entries = Object.values(presenceState).map((arr) => arr[0]).filter(Boolean);
  const count = entries.length;
  const el = $('onlineCount');
  if (!el) return;

  if (count === 0) {
    el.textContent = '現在のオンライン：0人';
    return;
  }
  const names = entries.map((e) => (e && e.name ? e.name : '匿名'));
  el.textContent = `現在のオンライン（${count}人）：${names.join('、')}`;
}

export function initPresence() {
  presenceChannel.on('presence', { event: 'sync' }, updateOnlineCount);
  presenceChannel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      isSubscribed = true;
      await presenceChannel.track(trackedPayload);
    }
  });
}

// 予約者名の入力に合わせて、オンライン一覧に表示される自分の名前も更新する
export async function updatePresenceName(name) {
  trackedPayload = { ...trackedPayload, name };
  if (!isSubscribed) return;
  try {
    await presenceChannel.track(trackedPayload);
  } catch (e) {
    /* チャンネル未接続時などは無視 */
  }
}

// 「予約者」入力欄の内容を、デバウンスしながらpresenceに反映する
export function initPresenceNameSync() {
  const input = $('reservedBy');
  if (!input) return;
  let debounceTimer = null;
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      updatePresenceName(input.value.trim());
    }, 500);
  });
}
