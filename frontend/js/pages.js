import { renderStatsPage } from './stats.js';

// data-page-link を持つメニュー項目をクリックすると、
// 同じdata-page値を持つ .page-view 要素だけを表示する簡易的な画面切り替え。
function showPage(page) {
  document.querySelectorAll('.page-view').forEach((el) => {
    el.style.display = el.dataset.page === page ? '' : 'none';
  });
  document.querySelectorAll('[data-page-link]').forEach((link) => {
    link.classList.toggle('active', link.dataset.pageLink === page);
  });
  if (page === 'stats') renderStatsPage();
}

export function initPages() {
  document.querySelectorAll('[data-page-link]').forEach((link) => {
    link.addEventListener('click', (ev) => {
      ev.preventDefault();
      showPage(link.dataset.pageLink);
    });
  });
}
