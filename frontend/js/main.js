import { $ } from './dom.js';
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
import { initPresence } from './presence.js';

function initSettingsPanel() {
  $('settingsToggle').addEventListener('click', () => {
    $('settingsPanel').classList.toggle('open');
  });
  $('saveSettings').addEventListener('click', saveSettings);
}

async function init() {
  $('rankTier').innerHTML = rankOptionsHtml();

  initCalendarNav();
  initSettingsPanel();
  initReservationForm();
  initFilters();
  initPresence();

  await loadCalendarMarkers();
  renderCalendar();
  renderTimeSlots();
  updateSelectedLine();

  await loadSettings();
  await renderReservations();
}

init();
