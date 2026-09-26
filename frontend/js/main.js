import { $ } from './dom.js';
import { state } from './state.js';
import { rankOptionsHtml } from './constants.js';
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
import { initPages } from './pages.js';

function initSettingsPanel() {
  $('settingsToggle').addEventListener('click', () => {
    $('settingsPanel').classList.toggle('open');
  });
  $('saveSettings').addEventListener('click', saveSettings);
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
  readHighlightFromUrl();

  initCalendarNav();
  initSettingsPanel();
  initReservationForm();
  initFilters();
  initPresence();
  initPresenceNameSync();
  initRealtimeSync();
  initPages();

  await loadCalendarMarkers();
  renderCalendar();
  renderTimeSlots();
  updateSelectedLine();

  await loadSettings();
  await renderReservations();
}

init();
