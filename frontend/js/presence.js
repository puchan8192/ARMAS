import { $ } from './dom.js';
import { sb } from './config.js';

const presenceChannel = sb.channel('armas-presence', {
  config: { presence: { key: crypto.randomUUID() } },
});

function updateOnlineCount() {
  const presenceState = presenceChannel.presenceState();
  const count = Object.keys(presenceState).length;
  const el = $('onlineCount');
  if (el) el.textContent = `現在のオンライン：${count}人`;
}

export function initPresence() {
  presenceChannel.on('presence', { event: 'sync' }, updateOnlineCount);
  presenceChannel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await presenceChannel.track({ online_at: new Date().toISOString() });
    }
  });
}
