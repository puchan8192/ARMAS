import { $ } from './dom.js';

const ADMIN_LINKS = [
  { label: '基本設計書', url: 'https://github.com/puchan8192/ARMAS/blob/main/01_基本設計書.md' },
  { label: '詳細設計書', url: 'https://github.com/puchan8192/ARMAS/blob/main/02_詳細設計書.md' },
  { label: 'GitHubリポジトリ', url: 'https://github.com/puchan8192/ARMAS' },
];

function linkItemHtml({ label, url }) {
  return `<li><a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a></li>`;
}

// 管理者以外はadminLinksTitle/adminLinksごと非表示にする。
// 既存のページ切り替えリンク（予約する／予約一覧／履歴・統計 等）はここでは一切触らない。
export function renderSidebar(currentUser) {
  const isAdmin = !!currentUser && currentUser.role === 'admin';
  const titleEl = $('adminLinksTitle');
  const linksEl = $('adminLinks');
  if (titleEl) titleEl.style.display = isAdmin ? 'block' : 'none';
  if (linksEl) {
    linksEl.style.display = isAdmin ? 'block' : 'none';
    linksEl.innerHTML = isAdmin ? ADMIN_LINKS.map(linkItemHtml).join('') : '';
  }
}