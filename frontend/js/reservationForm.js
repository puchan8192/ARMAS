import { $ } from './dom.js';
import { state } from './state.js';
import { findConflicting, saveReservation } from './reservationsApi.js';
import { currentMapSnapshot } from './mapRotation.js';
import { sendDiscordNotice } from './discordNotify.js';
import { renderTimeSlots, updateSelectedLine } from './calendarView.js';
import { renderReservations } from './reservationsView.js';

export function initReservationForm() {
  $('reserveBtn').addEventListener('click', async () => {
    if (!state.selectedDate || !state.selectedTime) return;

    const reservedBy = $('reservedBy').value.trim();
    if (!reservedBy) {
      $('reserveStatus').textContent = '「予約者」を入力してください。';
      $('reserveStatus').className = 'status-line err';
      return;
    }

    // 重複チェック：同じ日時にすでに有効な予約がないか確認
    const conflicts = await findConflicting(state.selectedDate, state.selectedTime);
    if (conflicts.length > 0) {
      const names = conflicts.map((c) => c.reserved_by).join('、');
      const proceed = window.confirm(
        `この日時(${state.selectedDate} ${state.selectedTime})にはすでに予約があります（予約者: ${names}）。\nそれでも登録しますか？`,
      );
      if (!proceed) {
        $('reserveStatus').textContent = '登録をキャンセルしました。';
        $('reserveStatus').className = 'status-line';
        return;
      }
    }

    $('reserveBtn').disabled = true;
    $('reserveStatus').textContent = '予約処理中...';
    $('reserveStatus').className = 'status-line';

    const map = await currentMapSnapshot();
    const resv = {
      date: state.selectedDate,
      time: state.selectedTime,
      reservedBy,
      reservedFor: $('reservedFor').value.trim(),
      rankTier: $('rankTier').value,
      note: $('notes').value.trim(),
      map,
    };

    try {
      await saveReservation(resv);
    } catch (e) {
      console.error(e);
      $('reserveStatus').textContent = '予約の保存に失敗しました（DB接続をご確認ください）';
      $('reserveStatus').className = 'status-line err';
      $('reserveBtn').disabled = false;
      return;
    }

    const notice = await sendDiscordNotice(resv);

    $('reserveStatus').textContent = notice.sent
      ? '予約が完了し、Discordへ通知しました。'
      : `予約は完了しましたが、Discord通知は送信できませんでした（${notice.reason || 'Webhook未確認'}）。`;
    $('reserveStatus').className = notice.sent ? 'status-line ok' : 'status-line err';

    $('notes').value = '';
    $('reservedFor').value = '';
    state.selectedTime = null;
    renderTimeSlots();
    updateSelectedLine();
    renderReservations();
    setTimeout(() => { $('reserveBtn').disabled = false; }, 500);
  });
}
