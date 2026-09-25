const today = new Date();
today.setHours(0, 0, 0, 0);

// 複数モジュールから参照・更新される可変状態。
// ESモジュールのimportバインディングは再代入できないため、
// 個別の`let`をエクスポートするのではなく、1つのオブジェクトのプロパティを
// 各モジュールが書き換える形にしている。
export const state = {
  settings: { webhook: '', apexKey: '' },
  selectedDate: null, // 'YYYY-MM-DD'
  selectedTime: null, // 'HH:MM'
  viewYear: today.getFullYear(),
  viewMonth: today.getMonth(),
  filters: { name: '', from: '', to: '' },
  calendarReservations: [],
  today,
};
