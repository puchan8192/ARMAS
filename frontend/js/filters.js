import { $ } from './dom.js';
import { state } from './state.js';
import { renderReservations } from './reservationsView.js';

export function initFilters() {
  $('filterName').addEventListener('input', () => {
    state.filters.name = $('filterName').value.trim();
    renderReservations();
  });
  $('filterFrom').addEventListener('change', () => {
    state.filters.from = $('filterFrom').value;
    renderReservations();
  });
  $('filterTo').addEventListener('change', () => {
    state.filters.to = $('filterTo').value;
    renderReservations();
  });
  $('filterClear').addEventListener('click', () => {
    state.filters = { name: '', from: '', to: '' };
    $('filterName').value = '';
    $('filterFrom').value = '';
    $('filterTo').value = '';
    renderReservations();
  });
}
