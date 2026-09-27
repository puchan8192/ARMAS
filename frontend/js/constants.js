export const RANK_GROUPS = [
  { group: 'Rookie', subs: ['IV', 'III', 'II', 'I'], color: '#9c9a95' },
  { group: 'Bronze', subs: ['IV', 'III', 'II', 'I'], color: '#b3702f' },
  { group: 'Silver', subs: ['IV', 'III', 'II', 'I'], color: '#c7ccd1' },
  { group: 'Gold', subs: ['IV', 'III', 'II', 'I'], color: '#f0c419' },
  { group: 'Platinum', subs: ['IV', 'III', 'II', 'I'], color: '#2fc9c4' },
  { group: 'Diamond', subs: ['IV', 'III', 'II', 'I'], color: '#4f8ef7' },
  { group: 'Master', subs: [], color: '#b34ee0' },
  { group: 'Apex Predator', subs: [], color: '#e0334f' },
];

// "Gold III" → "Gold" のようにサブ区分(I〜IV)を取り除き、ランク帯(グループ)名を取得する
function rankGroupName(rank) {
  return (rank || '').replace(/\s+(IV|III|II|I)$/, '');
}

// ランク帯に対応する色を返す。未知の値・未設定の場合はテーマの控えめな色にフォールバックする
export function rankColor(rank) {
  const g = RANK_GROUPS.find((x) => x.group === rankGroupName(rank));
  return g ? g.color : 'var(--muted)';
}

export function rankOptionsHtml(selected) {
  return RANK_GROUPS.map((g) => {
    if (g.subs.length === 0) {
      const sel = g.group === selected ? 'selected' : '';
      const style = optionStyle(g.color);
      return `<option value="${g.group}" style="${style}" ${sel}>${g.group}</option>`;
    }
    const opts = g.subs.map((s) => {
      const val = `${g.group} ${s}`;
      const sel = val === selected ? 'selected' : '';
      const style = optionStyle(g.color);
      return `<option value="${val}" style="${style}" ${sel}>${val}</option>`;
    }).join('');
    return `<optgroup label="${g.group}" style="color:${g.color};">${opts}</optgroup>`;
  }).join('');
}

// <option>の文字色・背景色（ランク色を控えめに混ぜた色）を指定するstyle文字列を作る
function optionStyle(color) {
  return `color:${color}; background-color:#14161c; background-color:color-mix(in srgb, ${color} 22%, #14161c);`;
}

// 一覧・プレビュー等で使う、ランク帯の色で縁取り・着色したチップ表示
export function rankChipHtml(rank) {
  if (!rank) return '';
  return `<span class="rank-chip" style="--rank-color:${rankColor(rank)};">${rank}</span>`;
}

// <select id="rankTier"> 自体の文字色・背景色・枠線色を、選択中のランクの色に合わせて更新する
export function applyRankSelectColor(selectEl) {
  if (!selectEl) return;
  const color = rankColor(selectEl.value);
  selectEl.style.color = color;
  selectEl.style.borderColor = color;
  selectEl.style.backgroundColor = 'var(--panel-2)'; // color-mix()未対応ブラウザ向けフォールバック
  selectEl.style.backgroundColor = `color-mix(in srgb, ${color} 20%, var(--panel-2))`;
}

export const STATUS_OPTIONS = ['募集中', '確定', 'キャンセル'];

export function statusOptionsHtml(selected) {
  return STATUS_OPTIONS
    .map((s) => `<option value="${s}" ${s === selected ? 'selected' : ''}>${s}</option>`)
    .join('');
}

export function statusClass(status) {
  if (status === '確定') return 'status-badge confirmed';
  if (status === 'キャンセル') return 'status-badge cancelled';
  return 'status-badge open';
}
