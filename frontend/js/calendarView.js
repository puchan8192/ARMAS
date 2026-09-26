import { $ } from './dom.js';
import { state } from './state.js';
import { reservationsOnDate } from './reservationsApi.js';
import { fetchMapRotation } from './mapRotation.js';

export function pad(n) {
  return String(n).padStart(2, '0');
}

export function renderCalendar() {
  $('ymLabel').textContent = `${state.viewYear}年 ${state.viewMonth + 1}月`;
  const dow = ['日', '月', '火', '水', '木', '金', '土'];
  $('dowRow').innerHTML = dow.map((d) => `<div class="dow">${d}</div>`).join('');

  const firstDay = new Date(state.viewYear, state.viewMonth, 1).getDay();
  const daysInMonth = new Date(state.viewYear, state.viewMonth + 1, 0).getDate();

  let html = '';
  for (let i = 0; i < firstDay; i += 1) html += '<div class="day empty"></div>';
  for (let d = 1; d <= daysInMonth; d += 1) {
    const dateObj = new Date(state.viewYear, state.viewMonth, d);
    const iso = `${state.viewYear}-${pad(state.viewMonth + 1)}-${pad(d)}`;
    const isPast = dateObj < state.today;
    const isToday = dateObj.getTime() === state.today.getTime();
    const isSelected = iso === state.selectedDate;

    const dayResvs = reservationsOnDate(iso);
    const hasResv = dayResvs.length > 0;
    const titleAttr = hasResv
      ? dayResvs.map((r) => `${r.time} ${r.reservedBy}（${r.status}）`).join('\n').replace(/"/g, '&quot;')
      : '';

    html += `<div class="day ${isPast ? 'past' : ''} ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''} ${hasResv ? 'has-resv' : ''}"
                  data-date="${iso}" title="${titleAttr}">${d}${hasResv ? '<span class="dot"></span>' : ''}</div>`;
  }
  $('calGrid').innerHTML = html;

  $('calGrid').querySelectorAll('.day:not(.empty):not(.past)').forEach((el) => {
    el.addEventListener('click', () => {
      state.selectedDate = el.dataset.date;
      renderCalendar();
      renderTimeSlots();
      updateSelectedLine();
      if (state.settings.apexKey) fetchMapRotation();
    });
  });
}

export function renderTimeSlots() {
  const dayResvs = state.selectedDate ? reservationsOnDate(state.selectedDate) : [];
  let html = '';
  for (let h = 0; h < 24; h += 1) {
    for (let m = 0; m < 60; m += 30) {
      const t = `${pad(h)}:${pad(m)}`;
      const match = dayResvs.find((r) => r.time === t);
      const titleAttr = match ? `${match.reservedBy}（${match.status}）`.replace(/"/g, '&quot;') : '';
      html += `<div class="time-slot ${t === state.selectedTime ? 'selected' : ''} ${match ? 'taken' : ''}" data-time="${t}" title="${titleAttr}">${t}${match ? '<span class="dot"></span>' : ''}</div>`;
    }
  }
  $('timeGrid').innerHTML = html;
  $('timeGrid').querySelectorAll('.time-slot').forEach((el) => {
    el.addEventListener('click', () => {
      state.selectedTime = el.dataset.time;
      renderTimeSlots();
      updateSelectedLine();
    });
  });
}

export function updateSelectedLine() {
  if (state.selectedDate && state.selectedTime) {
    $('selectedLine').innerHTML = `選択中: <b>${state.selectedDate} ${state.selectedTime}</b>`;
    $('reserveBtn').disabled = false;
  } else {
    $('selectedLine').textContent = '日付と時間を選択してください。';
    $('reserveBtn').disabled = true;
  }
}

export function initCalendarNav() {
  $('prevMonth').addEventListener('click', () => {
    state.viewMonth -= 1;
    if (state.viewMonth < 0) { state.viewMonth = 11; state.viewYear -= 1; }
    renderCalendar();
  });
  $('nextMonth').addEventListener('click', () => {
    state.viewMonth += 1;
    if (state.viewMonth > 11) { state.viewMonth = 0; state.viewYear += 1; }
    renderCalendar();
  });
}
