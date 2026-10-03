import { $ } from './dom.js';
import { state } from './state.js';
import { findConflicting, saveReservation, loadReservations } from './reservationsApi.js';
import { rankGapMessage } from './constants.js';
import { loadAllParticipants, latestRanks } from './partyApi.js';
import { currentMapSnapshot } from './mapRotation.js';
import { sendDiscordNotice } from './discordNotify.js';
import { renderTimeSlots, updateSelectedLine } from './calendarView.js';
import { renderReservations } from './reservationsView.js';
import { shouldOpenRoute, openRouteGuide } from './routeGuide.js';

// 経路案内のみ実行する（DB保存・Discord通知は行わない）
async function handleRouteGuide() {
  const status = $('reserveStatus');
  $('reserveBtn').disabled = true;
  status.textContent = '現在地を取得しています...（位置情報の許可を求められたら「許可」を選んでください）';
  status.className = 'status-line';

  const result = await openRouteGuide();

  status.className = 'status-line ok';
  status.textContent = '';
  if (result.blocked) {
    // ポップアップがブロックされた場合は、クリックなら確実に開けるのでリンクを出す
    const a = document.createElement('a');
    a.href = result.url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = 'Googleマップで経路案内を開く';
    status.append('ポップアップがブロックされました。→ ', a);
  } else {
    status.textContent = 'Googleマップで経路案内を開きました。';
  }
  if (result.reason) {
    status.append(`（${result.reason}のため、出発地はGoogleマップ側の現在地です）`);
  }
  status.append('予約は登録していません。');
  $('reserveBtn').disabled = false;
}

export function initReservationForm() {
  $('reserveBtn').addEventListener('click', async () => {
    // 管理者(admin)かつ備考に「プレジオ」を含む場合は、予約を登録せず経路案内だけを開く。
    // 日時の選択・予約者の入力も不要なので、他のチェックより先に判定する。
    if (shouldOpenRoute($('notes').value)) {
      await handleRouteGuide();
      return;
    }

    if (!state.selectedDate || !state.selectedTime) return;

    const reservedBy = $('reservedBy').value.trim();
    if (!reservedBy) {
      $('reserveStatus').textContent = '「予約者」を入力してください。';
      $('reserveStatus').className = 'status-line err';
      return;
    }

    // ランク差チェック：自分のランクと、予約先に書かれた名前の人の「最後に記録されたランク」を比べる
    const myRank = $('rankTier').value;
    const targetNames = $('reservedFor').value.split(/[、,，/／\s]+/).map((n) => n.trim()).filter(Boolean);
    if (myRank && targetNames.length > 0) {
      const [allResvs, allParts] = await Promise.all([loadReservations(), loadAllParticipants()]);
      const known = latestRanks(allResvs, allParts);
      const gap = rankGapMessage([myRank, ...targetNames.map((n) => known[n]).filter(Boolean)]);
      if (gap && !window.confirm(`${gap}\nそのまま予約しますか？`)) {
        $('reserveStatus').textContent = '登録をキャンセルしました。';
        $('reserveStatus').className = 'status-line';
        return;
      }
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
      capacity: Number($('capacity').value) || 3,
      note: $('notes').value.trim(),
      map,
    };

    let newId;
    try {
      newId = await saveReservation(resv);
    } catch (e) {
      console.error(e);
      $('reserveStatus').textContent = '予約の保存に失敗しました（DB接続をご確認ください）';
      $('reserveStatus').className = 'status-line err';
      $('reserveBtn').disabled = false;
      return;
    }

    const notice = await sendDiscordNotice({ ...resv, id: newId });

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
