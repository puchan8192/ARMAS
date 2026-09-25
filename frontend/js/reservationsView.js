import { $ } from './dom.js';
import { state } from './state.js';
import { rankOptionsHtml, statusOptionsHtml, statusClass } from './constants.js';
import {
  loadReservations,
  deleteReservation,
  findConflicting,
  updateReservationStatus,
  updateReservation,
  loadCalendarMarkers,
} from './reservationsApi.js';
import { loadRepliesGrouped, saveReply } from './repliesApi.js';
import { sendDiscordCancelNotice, sendDiscordReplyNotice } from './discordNotify.js';
import { renderCalendar, renderTimeSlots } from './calendarView.js';

export function escapeHtml(s) {
  return (s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad2 = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function applyFilters(items) {
  return items.filter((r) => {
    if (state.filters.name && !(r.reservedBy || '').includes(state.filters.name)) return false;
    if (state.filters.from && r.date < state.filters.from) return false;
    if (state.filters.to && r.date > state.filters.to) return false;
    return true;
  });
}

function reservationCardHtml(r, replies) {
  const repliesHtml = replies.length
    ? replies.map((rep) => `
        <div class="reply-item">
          <span class="reply-by">${escapeHtml(rep.repliedBy) || '匿名'}</span>
          <span class="reply-time">${formatDateTime(rep.createdAt)}</span>
          <div class="reply-msg">${escapeHtml(rep.message)}</div>
        </div>
      `).join('')
    : '';

  return `
    <div class="resv" data-id="${r.id}">
      <div class="resv-header">
        <div class="resv-status">
          <span class="${statusClass(r.status)}">${r.status}</span>
          <select class="status-select" data-id="${r.id}">${statusOptionsHtml(r.status)}</select>
        </div>
        <div class="resv-actions">
          <button class="reply-toggle" data-id="${r.id}">返信</button>
          <button class="edit-toggle" data-id="${r.id}">編集</button>
          <button class="del" data-id="${r.id}">削除</button>
        </div>
      </div>

      <div class="dt">${r.date} ${r.time}</div>
      <div class="who">予約者: ${escapeHtml(r.reservedBy)}${r.reservedFor ? ` → ${escapeHtml(r.reservedFor)}` : ''}</div>
      ${r.rankTier ? `<div class="rank">現在のランク: ${escapeHtml(r.rankTier)}</div>` : ''}
      ${r.map ? `<div class="map">参考マップ: ${r.map}</div>` : ''}
      ${r.note ? `<div class="note">${escapeHtml(r.note)}</div>` : ''}

      <div class="edit-form" id="edit-form-${r.id}">
        <div class="form-title">✏ 予約を編集</div>
        <div class="row">
          <label>日付<input type="date" class="edit-date" data-id="${r.id}" value="${r.date}"></label>
          <label>時刻<input type="time" class="edit-time" data-id="${r.id}" value="${r.time}"></label>
        </div>
        <label>予約先<input type="text" class="edit-for" data-id="${r.id}" value="${escapeHtml(r.reservedFor)}"></label>
        <label>ランク<select class="edit-rank" data-id="${r.id}">${rankOptionsHtml(r.rankTier)}</select></label>
        <label>備考<textarea class="edit-note" data-id="${r.id}">${escapeHtml(r.note)}</textarea></label>
        <div class="row">
          <button class="edit-save-btn" data-id="${r.id}">保存</button>
          <button class="edit-cancel-btn" data-id="${r.id}">キャンセル</button>
        </div>
        <div class="status-line" id="edit-status-${r.id}"></div>
      </div>

      ${replies.length ? `<div class="replies">${repliesHtml}</div>` : ''}

      <div class="reply-form" id="reply-form-${r.id}">
        <div class="form-title">💬 返信する</div>
        <input class="reply-by-input" data-id="${r.id}" placeholder="返信者名（任意）">
        <textarea class="reply-msg-input" data-id="${r.id}" placeholder="この予約への返信を入力"></textarea>
        <div class="row">
          <button class="reply-send-btn" data-id="${r.id}">送信</button>
          <button class="reply-cancel-btn" data-id="${r.id}">キャンセル</button>
        </div>
        <div class="status-line" id="reply-status-${r.id}"></div>
      </div>
    </div>
  `;
}

function bindDeleteButtons(filteredItems) {
  $('resvList').querySelectorAll('.del').forEach((btn) => {
    btn.addEventListener('click', () => {
      const { id } = btn.dataset;
      const target = filteredItems.find((r) => r.id === id);
      const label = target ? `${target.date} ${target.time}（予約者: ${target.reservedBy}）` : 'この予約';
      if (window.confirm(`${label} を削除します。よろしいですか？\n※この操作は取り消せません。`)) {
        deleteReservation(id).then(renderReservations);
      }
    });
  });
}

function bindStatusSelects(filteredItems) {
  $('resvList').querySelectorAll('.status-select').forEach((sel) => {
    const prevValue = sel.value;
    sel.addEventListener('change', async () => {
      const { id } = sel.dataset;
      const newStatus = sel.value;
      const ok = await updateReservationStatus(id, newStatus);
      if (!ok) {
        window.alert('ステータスの更新に失敗しました。Supabaseのupdateポリシーをご確認ください。');
        sel.value = prevValue;
        return;
      }
      if (newStatus === 'キャンセル') {
        const target = filteredItems.find((r) => r.id === id);
        if (target) {
          const notice = await sendDiscordCancelNotice({ ...target, status: newStatus });
          if (!notice.sent) {
            window.alert(`ステータスは更新されましたが、Discordへの通知は送信できませんでした（${notice.reason || 'Webhook未確認'}）。`);
          }
        }
      }
      renderReservations();
    });
  });
}

function bindEditToggle() {
  $('resvList').querySelectorAll('.edit-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const { id } = btn.dataset;
      const editForm = document.getElementById(`edit-form-${id}`);
      const replyForm = document.getElementById(`reply-form-${id}`);
      if (replyForm) replyForm.classList.remove('open');
      if (editForm) editForm.classList.toggle('open');
    });
  });
  $('resvList').querySelectorAll('.edit-cancel-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const form = document.getElementById(`edit-form-${btn.dataset.id}`);
      if (form) form.classList.remove('open');
    });
  });
}

function bindReplyToggle() {
  $('resvList').querySelectorAll('.reply-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const { id } = btn.dataset;
      const replyForm = document.getElementById(`reply-form-${id}`);
      const editForm = document.getElementById(`edit-form-${id}`);
      if (editForm) editForm.classList.remove('open');
      if (replyForm) replyForm.classList.toggle('open');
    });
  });
  $('resvList').querySelectorAll('.reply-cancel-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const form = document.getElementById(`reply-form-${btn.dataset.id}`);
      if (form) form.classList.remove('open');
    });
  });
}

function bindEditSave() {
  $('resvList').querySelectorAll('.edit-save-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const { id } = btn.dataset;
      const statusEl = document.getElementById(`edit-status-${id}`);
      const dateInput = $('resvList').querySelector(`.edit-date[data-id="${id}"]`);
      const timeInput = $('resvList').querySelector(`.edit-time[data-id="${id}"]`);
      const forInput = $('resvList').querySelector(`.edit-for[data-id="${id}"]`);
      const rankSelect = $('resvList').querySelector(`.edit-rank[data-id="${id}"]`);
      const noteInput = $('resvList').querySelector(`.edit-note[data-id="${id}"]`);

      const newDate = dateInput.value;
      const newTime = timeInput.value;
      if (!newDate || !newTime) {
        statusEl.textContent = '日付と時刻を入力してください。';
        statusEl.className = 'status-line err';
        return;
      }

      // 変更後の日時が他の予約と重複していないか確認（自分自身は除く）
      const conflicts = await findConflicting(newDate, newTime, id);
      if (conflicts.length > 0) {
        const names = conflicts.map((c) => c.reserved_by).join('、');
        const proceed = window.confirm(
          `変更後の日時(${newDate} ${newTime})にはすでに別の予約があります（予約者: ${names}）。\nそれでも保存しますか？`,
        );
        if (!proceed) return;
      }

      btn.disabled = true;
      statusEl.textContent = '保存中...';
      statusEl.className = 'status-line';

      try {
        await updateReservation(id, {
          date: newDate,
          time: newTime,
          reservedFor: forInput.value.trim(),
          rankTier: rankSelect.value,
          note: noteInput.value.trim(),
        });
      } catch (e) {
        console.error(e);
        statusEl.textContent = `保存に失敗しました: ${e.message || '不明なエラー'}`;
        statusEl.className = 'status-line err';
        btn.disabled = false;
        return;
      }

      renderReservations();
    });
  });
}

function bindReplySend(filteredItems) {
  $('resvList').querySelectorAll('.reply-send-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const { id } = btn.dataset;
      const byInput = $('resvList').querySelector(`.reply-by-input[data-id="${id}"]`);
      const msgInput = $('resvList').querySelector(`.reply-msg-input[data-id="${id}"]`);
      const statusEl = document.getElementById(`reply-status-${id}`);
      const message = msgInput.value.trim();

      if (!message) {
        statusEl.textContent = '返信内容を入力してください。';
        statusEl.className = 'status-line err';
        return;
      }

      btn.disabled = true;
      statusEl.textContent = '送信中...';
      statusEl.className = 'status-line';

      const repliedBy = byInput.value.trim();
      const target = filteredItems.find((r) => r.id === id);

      try {
        await saveReply(id, repliedBy, message);
      } catch (e) {
        console.error(e);
        statusEl.textContent = '返信の保存に失敗しました';
        statusEl.className = 'status-line err';
        btn.disabled = false;
        return;
      }

      // 返信が来た予約は、まだ「募集中」であれば自動的に「確定」にする
      if (target && target.status === '募集中') {
        await updateReservationStatus(id, '確定');
      }

      const notice = await sendDiscordReplyNotice(target, repliedBy, message);
      if (!notice.sent) {
        // 保存自体は成功しているので、一覧を再描画してから通知失敗を伝える
        await renderReservations();
        const newStatusEl = document.getElementById(`reply-status-${id}`);
        if (newStatusEl) {
          newStatusEl.textContent = `返信は保存されましたが、Discord通知は送信できませんでした（${notice.reason || 'Webhook未確認'}）。`;
          newStatusEl.className = 'status-line err';
        }
        return;
      }

      await renderReservations();
    });
  });
}

// eslint-disable-next-line no-use-before-define
export async function renderReservations() {
  const items = await loadReservations();

  if (items.length === 0) {
    $('resvList').innerHTML = '<div class="empty-state">まだ予約はありません。</div>';
    return;
  }

  const filteredItems = applyFilters(items);
  if (filteredItems.length === 0) {
    $('resvList').innerHTML = '<div class="empty-state">条件に一致する予約はありません。</div>';
    return;
  }

  const repliesByResv = await loadRepliesGrouped(filteredItems.map((r) => r.id));

  $('resvList').innerHTML = filteredItems
    .map((r) => reservationCardHtml(r, repliesByResv[r.id] || []))
    .join('');

  bindDeleteButtons(filteredItems);
  bindStatusSelects(filteredItems);
  bindEditToggle();
  bindReplyToggle();
  bindEditSave();
  bindReplySend(filteredItems);

  // 予約一覧の更新に合わせて、カレンダー・時間帯の予約状況表示も最新化する
  await loadCalendarMarkers();
  renderCalendar();
  renderTimeSlots();
}
