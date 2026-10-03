import { $ } from './dom.js';
import { loadReservations } from './reservationsApi.js';
import { escapeHtml } from './reservationsView.js';
import {
  rankColor, rankScore, rankFromScore, rankOptionsHtml, applyRankSelectColor, rankChipHtml,
} from './constants.js';
import {
  loadAllParticipants, loadGoals, saveGoal, deleteGoal, partyOf, currentMemberName,
} from './partyApi.js';

function aggregateBy(items, keyFn) {
  const map = {};
  items.forEach((item) => {
    const key = keyFn(item) || '(未設定)';
    map[key] = (map[key] || 0) + 1;
  });
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

function statListHtml(pairs, colorFn) {
  if (pairs.length === 0) return '<div class="stat-row"><span class="stat-label">データなし</span></div>';
  return pairs.map(([label, count]) => `
    <div class="stat-row">
      <span class="stat-label"${colorFn ? ` style="color:${colorFn(label)};"` : ''}>${escapeHtml(label)}</span>
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

// ---------- ランク推移グラフ・シーズン目標・一緒に遊んだ回数 ----------

const PALETTE = ['#4f8ef7', '#f0c419', '#2fc9c4', '#e0334f', '#b34ee0', '#f08c19', '#7bd957', '#ff7eb6'];
const cache = { items: [], parts: [], goals: [] };
let pairScope = 'month'; // 'month' | 'all'

// 予約と参加回答に記録されたランクを、時系列のイベントにまとめる
function rankEvents(items, parts) {
  const ev = [];
  items.forEach((r) => {
    const score = rankScore(r.rankTier);
    if (!r.reservedBy || score === null) return;
    const t = r.createdAt ? Date.parse(r.createdAt) : new Date(`${r.date}T${r.time}`).getTime();
    ev.push({ name: r.reservedBy, t, score, rank: r.rankTier });
  });
  parts.forEach((p) => {
    const score = rankScore(p.rankTier);
    if (p.answer !== '参加' || !p.name || score === null) return;
    ev.push({ name: p.name, t: Date.parse(p.createdAt), score, rank: p.rankTier });
  });
  return ev.filter((e) => Number.isFinite(e.t)).sort((a, b) => a.t - b.t);
}

function renderRankChart() {
  const el = $('statsRankChart');
  if (!el) return;
  const ev = rankEvents(cache.items, cache.parts);
  if (ev.length === 0) {
    el.innerHTML = '<h3>ランク推移</h3><div class="empty-state">ランクが記録された予約がまだありません。</div>';
    return;
  }
  const names = [...new Set(ev.map((e) => e.name))];
  const W = 640; const H = 300;
  const pad = { l: 92, r: 16, t: 14, b: 28 };
  let tMin = ev[0].t; let tMax = ev[ev.length - 1].t;
  if (tMax - tMin < 86400000) { tMax = tMin + 86400000; }
  const sMin = Math.max(0, Math.floor((Math.min(...ev.map((e) => e.score)) - 1) / 4) * 4);
  const sMax = Math.min(28, Math.ceil((Math.max(...ev.map((e) => e.score)) + 1) / 4) * 4);
  const x = (t) => pad.l + ((t - tMin) / (tMax - tMin)) * (W - pad.l - pad.r);
  const y = (sc) => H - pad.b - ((sc - sMin) / Math.max(1, sMax - sMin)) * (H - pad.t - pad.b);

  let grid = '';
  for (let sc = sMin; sc <= sMax; sc += 4) {
    const label = rankFromScore(sc).replace(/ IV$/, '');
    grid += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(sc)}" y2="${y(sc)}" stroke="currentColor" opacity=".15"/>`
      + `<text x="${pad.l - 8}" y="${y(sc) + 4}" text-anchor="end" font-size="11" fill="${rankColor(label)}">${label}</text>`;
  }
  const d = (t) => { const dt = new Date(t); return `${dt.getMonth() + 1}/${dt.getDate()}`; };
  const xAxis = `<text x="${pad.l}" y="${H - 8}" font-size="11" fill="currentColor" opacity=".7">${d(tMin)}</text>`
    + `<text x="${W - pad.r}" y="${H - 8}" text-anchor="end" font-size="11" fill="currentColor" opacity=".7">${d(tMax)}</text>`;

  const lines = names.map((n, i) => {
    const color = PALETTE[i % PALETTE.length];
    const pts = ev.filter((e) => e.name === n);
    const poly = pts.length > 1
      ? `<polyline fill="none" stroke="${color}" stroke-width="2" points="${pts.map((p) => `${x(p.t)},${y(p.score)}`).join(' ')}"/>` : '';
    const dots = pts.map((p) => `<circle cx="${x(p.t)}" cy="${y(p.score)}" r="3.5" fill="${color}"><title>${escapeHtml(n)}: ${p.rank}（${d(p.t)}）</title></circle>`).join('');
    return poly + dots;
  }).join('');

  const legend = names.map((n, i) => `<span class="chart-legend-item"><i style="background:${PALETTE[i % PALETTE.length]}"></i>${escapeHtml(n)}</span>`).join('');
  el.innerHTML = `
    <h3>ランク推移</h3>
    <div class="chart-wrap"><svg viewBox="0 0 ${W} ${H}" class="rank-chart" role="img" aria-label="メンバーごとのランク推移">${grid}${xAxis}${lines}</svg></div>
    <div class="chart-legend">${legend}</div>
    <p class="hint">予約時・参加回答時に入力したランクをもとにした推移です（RPの数値ではなく、ランク帯の段階で表示）。</p>`;
}

function renderGoals() {
  const el = $('statsGoals');
  if (!el) return;
  const ev = rankEvents(cache.items, cache.parts);
  // メンバーごとに最新の目標1件を使う
  const latest = {};
  cache.goals.forEach((g) => { latest[g.member_name] = g; });

  const cards = Object.values(latest).map((g) => {
    const mine = ev.filter((e) => e.name === g.member_name);
    const startMs = new Date(`${g.season_start}T00:00:00`).getTime();
    const before = mine.filter((e) => e.t < startMs);
    const base = before.length ? before[before.length - 1] : mine.find((e) => e.t >= startMs);
    const cur = mine.length ? mine[mine.length - 1] : null;
    const target = rankScore(g.target_rank);
    let pct = 0;
    if (base && cur && target !== null) {
      pct = target <= base.score ? (cur.score >= target ? 100 : 0)
        : Math.max(0, Math.min(100, ((cur.score - base.score) / (target - base.score)) * 100));
    }
    const done = cur && target !== null && cur.score >= target;
    return `
      <div class="goal-card">
        <div class="goal-head">
          <b>${escapeHtml(g.member_name)}</b>
          <span>${escapeHtml(g.season_label || '')}（${g.season_start}〜）</span>
          <button class="goal-del" data-id="${g.id}" title="目標を削除">✕</button>
        </div>
        <div class="goal-ranks">
          ${base ? rankChipHtml(base.rank) : '<span class="muted">開始ランク不明</span>'} →
          ${cur ? rankChipHtml(cur.rank) : '<span class="muted">未記録</span>'} →
          🎯 ${rankChipHtml(g.target_rank)}
        </div>
        <div class="goal-bar"><div class="goal-bar-fill ${done ? 'done' : ''}" style="width:${pct.toFixed(0)}%"></div></div>
        <div class="goal-pct">${done ? '🎉 達成！' : `${pct.toFixed(0)}%`}</div>
      </div>`;
  }).join('');

  el.innerHTML = `
    <h3>今シーズンの目標</h3>
    <div class="goal-list">${cards || '<div class="empty-state">目標はまだ設定されていません。</div>'}</div>
    <div class="goal-form">
      <input id="goalName" placeholder="名前" value="${escapeHtml(currentMemberName())}">
      <input id="goalSeason" placeholder="シーズン名（任意）例: S28 Split1">
      <input id="goalStart" type="date" title="シーズン開始日" value="${new Date().toISOString().slice(0, 10)}">
      <select id="goalRank">${rankOptionsHtml('Diamond IV')}</select>
      <button id="goalSave" class="reserve-btn save" style="width:auto;padding:8px 16px;">目標を設定</button>
    </div>
    <div class="status-line" id="goalStatus"></div>`;

  applyRankSelectColor($('goalRank'));
  $('goalRank').addEventListener('change', () => applyRankSelectColor($('goalRank')));
  $('goalSave').addEventListener('click', async () => {
    const name = $('goalName').value.trim();
    if (!name || !$('goalStart').value) {
      $('goalStatus').textContent = '名前とシーズン開始日を入力してください。';
      $('goalStatus').className = 'status-line err';
      return;
    }
    try {
      await saveGoal({
        name, seasonLabel: $('goalSeason').value.trim(), seasonStart: $('goalStart').value, targetRank: $('goalRank').value,
      });
      cache.goals = await loadGoals();
      renderGoals();
    } catch (e) {
      console.error(e);
      $('goalStatus').textContent = '保存に失敗しました（supabase/party_features.sql を実行済みかご確認ください）。';
      $('goalStatus').className = 'status-line err';
    }
  });
  el.querySelectorAll('.goal-del').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!window.confirm('この目標を削除しますか？')) return;
      await deleteGoal(btn.dataset.id);
      cache.goals = await loadGoals();
      renderGoals();
    });
  });
}

function renderPairs() {
  const el = $('statsPairs');
  if (!el) return;
  const byResv = {};
  cache.parts.forEach((p) => { (byResv[p.reservationId] = byResv[p.reservationId] || []).push(p); });
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const counts = {};
  cache.items
    .filter((r) => r.status === '確定' && new Date(`${r.date}T${r.time}`).getTime() <= now.getTime())
    .filter((r) => pairScope === 'all' || r.date.startsWith(month))
    .forEach((r) => {
      const names = partyOf(r, byResv[r.id] || []).joined.map((j) => j.name).sort();
      for (let i = 0; i < names.length; i += 1) {
        for (let j = i + 1; j < names.length; j += 1) {
          const key = `${names[i]} × ${names[j]}`;
          counts[key] = (counts[key] || 0) + 1;
        }
      }
    });
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  el.innerHTML = `
    <h3>一緒に遊んだ回数
      <select id="pairScope" class="pair-scope">
        <option value="month" ${pairScope === 'month' ? 'selected' : ''}>今月</option>
        <option value="all" ${pairScope === 'all' ? 'selected' : ''}>全期間</option>
      </select>
    </h3>
    ${rows.length ? rows.map(([k, n]) => `<div class="stat-row"><span class="stat-label">${escapeHtml(k)}</span><span class="stat-count">${n}回</span></div>`).join('')
    : '<div class="stat-row"><span class="stat-label">データなし</span></div>'}
    <p class="hint">開始時刻を過ぎた「確定」の予約で、同じパーティーだったメンバーの組み合わせを数えています。</p>`;
  $('pairScope').addEventListener('change', () => { pairScope = $('pairScope').value; renderPairs(); });
}

async function renderExtraStats(items) {
  cache.items = items;
  [cache.parts, cache.goals] = await Promise.all([loadAllParticipants(), loadGoals()]);
  renderRankChart();
  renderGoals();
  renderPairs();
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
        ${statListHtml(byRank, rankColor)}
      </div>
      <div class="stats-block">
        <h3>ステータスごとの件数</h3>
        ${statListHtml(byStatus)}
      </div>
    </div>
    <div class="stats-block stats-wide" id="statsRankChart"></div>
    <div class="stats-grid" style="margin-top:16px;">
      <div class="stats-block" id="statsGoals"></div>
      <div class="stats-block" id="statsPairs"></div>
    </div>
    <div class="row" style="margin-top:16px;">
      <button id="exportCsvBtn" class="reserve-btn save" style="width:auto;padding:9px 18px;">
        CSVエクスポート（全${items.length}件）
      </button>
    </div>
  `;

  $('exportCsvBtn').addEventListener('click', () => downloadCsv(items));
  await renderExtraStats(items);
}
