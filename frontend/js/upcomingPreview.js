import { $ } from './dom.js';
import { loadReservations } from './reservationsApi.js';
import { statusClass } from './constants.js';

// reservationsView.js から呼ばれるため、循環import防止のためescapeHtmlはここでも軽量に定義する
function escapeHtml(s) {
  return (s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const PREVIEW_COUNT = 4;

function toDateTimeKey(r) {
  return `${r.date}${r.time}`;
}

export async function renderUpcomingPreview() {
  const container = $('upcomingList');
  if (!container) return;

  const items = await loadReservations();
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const upcoming = items
    .filter((r) => r.status !== 'キャンセル')
    .filter((r) => r.date > todayStr || (r.date === todayStr && r.time >= nowTime))
    .sort((a, b) => toDateTimeKey(a).localeCompare(toDateTimeKey(b)))
    .slice(0, PREVIEW_COUNT);

  if (upcoming.length === 0) {
    container.innerHTML = '<div class="empty-state">直近の予約はありません。</div>';
    return;
  }

  container.innerHTML = upcoming.map((r) => `
    <div class="upcoming-row">
      <div class="upcoming-dt">
        <span class="upcoming-date">${r.date.slice(5).replace('-', '/')}</span>
        <span class="upcoming-time">${r.time}</span>
      </div>
      <div class="upcoming-who">
        ${escapeHtml(r.reservedBy)}${r.reservedFor ? ` <span class="arrow">→</span> ${escapeHtml(r.reservedFor)}` : ''}
      </div>
      <span class="${statusClass(r.status)}">${r.status}</span>
    </div>
  `).join('');
}
