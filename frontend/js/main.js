import { $ } from './dom.js';
import { state } from './state.js';
import { rankOptionsHtml, applyRankSelectColor } from './constants.js';
import { loadSettings, saveSettings } from './storage.js';
import { loadCalendarMarkers } from './reservationsApi.js';
import {
  renderCalendar,
  renderTimeSlots,
  updateSelectedLine,
  initCalendarNav,
} from './calendarView.js';
import { renderReservations } from './reservationsView.js';
import { initReservationForm } from './reservationForm.js';
import { initFilters } from './filters.js';
import { initPresence, initPresenceNameSync } from './presence.js';
import { initRealtimeSync } from './realtime.js';
import { initPages, showPage } from './pages.js';
import { watchAuthState, signIn, signOut } from './auth.js';
import { renderSidebar } from './sidebar.js';
import { refreshFavoriteMaps } from './mapExtras.js';

function initSettingsPanel() {
  $('settingsToggle').addEventListener('click', () => {
    $('settingsPanel').classList.toggle('open');
  });
  $('saveSettings').addEventListener('click', saveSettings);
}

function initAuthUI() {
  $('loginBtn').addEventListener('click', async () => {
    const email = $('loginEmail').value.trim();
    const password = $('loginPassword').value;
    $('loginStatus').textContent = 'ログイン中...';
    $('loginStatus').className = 'status-line';
    try {
      await signIn(email, password);
      $('loginStatus').textContent = '';
    } catch (e) {
      console.error(e);
      $('loginStatus').textContent = 'ログインに失敗しました（メールアドレスまたはパスワードをご確認ください）';
      $('loginStatus').className = 'status-line err';
    }
  });

  $('logoutBtn').addEventListener('click', async () => {
    await signOut();
  });

  watchAuthState((currentUser) => {
    renderSidebar(currentUser);
    $('loginScreen').style.display = currentUser ? 'none' : 'flex';
    $('appRoot').style.display = currentUser ? 'block' : 'none';
    $('headerUser').style.display = currentUser ? 'flex' : 'none';

    if (currentUser) {
      $('userDisplayName').textContent = currentUser.email;
      $('adminBadge').style.display = currentUser.role === 'admin' ? 'inline-block' : 'none';
      $('loginEmail').value = '';
      $('loginPassword').value = '';
      refreshFavoriteMaps();
      renderReservations(); // 参加ボタンの「自分の名前」「既定ランク」をログイン後の情報で反映
    }
  });
}

// Discord通知のリンク（?resv=予約ID）から開かれた場合、
// 対象の予約をハイライト表示し、参加/不参加の回答ボタンを出すための下準備。
function readHighlightFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const resvId = params.get('resv');
  if (resvId) state.highlightResvId = resvId;
}

async function init() {
  $('rankTier').innerHTML = rankOptionsHtml();
  applyRankSelectColor($('rankTier'));
  $('rankTier').addEventListener('change', () => applyRankSelectColor($('rankTier')));
  readHighlightFromUrl();

  initCalendarNav();
  initSettingsPanel();
  initReservationForm();
  initFilters();
  initPresence();
  initPresenceNameSync();
  initRealtimeSync();
  initPages();
  initAuthUI();

  // マップの時間帯から「この時間で予約」を押したとき、カレンダーと時間枠を選択状態に更新する
  document.addEventListener('armas:slot-picked', () => {
    renderCalendar();
    renderTimeSlots();
    updateSelectedLine();
  });

  // ログイン状態が確定するまでは管理者リンクを隠した状態で表示しておく
  renderSidebar(null);

  // Discordの回答リンク（?resv=予約ID）から開かれた場合は、
  // 予約一覧ページを最初から表示し、対象カードを見つけやすくする
  if (state.highlightResvId) showPage('list');

  await loadCalendarMarkers();
  renderCalendar();
  renderTimeSlots();
  updateSelectedLine();

  await loadSettings();
  await renderReservations();
}

init();