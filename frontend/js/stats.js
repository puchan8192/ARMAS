import { $ } from './dom.js';
import { loadReservations } from './reservationsApi.js';
import { escapeHtml } from './reservationsView.js';

function aggregateBy(items, keyFn) {
  const map = {};
  items.forEach((item) => {
    const key = keyFn(item) || '(未設定)';
    map[key] = (map[key] || 0) + 1;
  });
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

function statListHtml(pairs) {
  if (pairs.length === 0) return '<div class="stat-row"><span class="stat-label">データなし</span></div>';
  return pairs.map(([label, count]) => `
    <div class="stat-row">
      <span class="stat-label">${escapeHtml(label)}</span>
      <span class="stat-count">${count}件</span>
    </div>
  `).join('');
}

function toCsv(items) {
  const headers = ['日付', '時刻', '予約者', '予約先', 'ランク', 'ステータス', '備考'];
  const rows = items.map((r) => [
    r.date,
    r.time,
    r.reservedBy || '',
    r.reservedFor || '',
    r.rankTier || '',
    r.status || '',
    (r.note || '').replace(/\r?\n/g, ' '),
  ]);
  const escapeCell = (v) => `"${String(v).replace(/"/g, '""')}"`;
  return [headers, ...rows].map((row) => row.map(escapeCell).join(',')).join('\r\n');
}

function downloadCsv(items) {
  const csv = toCsv(items);
  // ExcelでBOM無しCSVを開くと文字化けするため、UTF-8 BOMを先頭に付与する
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `armas_reservations_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function renderStatsPage() {
  const container = $('statsContent');
  if (!container) return;
  container.innerHTML = '<div class="empty-state">読み込み中...</div>';

  const items = await loadReservations();

  if (items.length === 0) {
    container.innerHTML = '<div class="empty-state">予約データがまだありません。</div>';
    return;
  }

  const byPerson = aggregateBy(items, (r) => r.reservedBy);
  const byRank = aggregateBy(items, (r) => r.rankTier);
  const byStatus = aggregateBy(items, (r) => r.status);

  container.innerHTML = `
    <div class="stats-grid">
      <div class="stats-block">
        <h3>予約者ごとの件数</h3>
        ${statListHtml(byPerson)}
      </div>
      <div class="stats-block">
        <h3>ランク帯ごとの件数</h3>
        ${statListHtml(byRank)}
      </div>
      <div class="stats-block">
        <h3>ステータスごとの件数</h3>
        ${statListHtml(byStatus)}
      </div>
    </div>
    <div class="row" style="margin-top:16px;">
      <button id="exportCsvBtn" class="reserve-btn save" style="width:auto;padding:9px 18px;">
        CSVエクスポート（全${items.length}件）
      </button>
    </div>
  `;

  $('exportCsvBtn').addEventListener('click', () => downloadCsv(items));
}
