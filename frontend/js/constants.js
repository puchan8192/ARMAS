export const RANK_GROUPS = [
  { group: 'Rookie', subs: ['IV', 'III', 'II', 'I'] },
  { group: 'Bronze', subs: ['IV', 'III', 'II', 'I'] },
  { group: 'Silver', subs: ['IV', 'III', 'II', 'I'] },
  { group: 'Gold', subs: ['IV', 'III', 'II', 'I'] },
  { group: 'Platinum', subs: ['IV', 'III', 'II', 'I'] },
  { group: 'Diamond', subs: ['IV', 'III', 'II', 'I'] },
  { group: 'Master', subs: [] },
  { group: 'Apex Predator', subs: [] },
];

export function rankOptionsHtml(selected) {
  return RANK_GROUPS.map((g) => {
    if (g.subs.length === 0) {
      return `<option value="${g.group}" ${g.group === selected ? 'selected' : ''}>${g.group}</option>`;
    }
    const opts = g.subs.map((s) => {
      const val = `${g.group} ${s}`;
      return `<option value="${val}" ${val === selected ? 'selected' : ''}>${val}</option>`;
    }).join('');
    return `<optgroup label="${g.group}">${opts}</optgroup>`;
  }).join('');
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
