const $ = id => document.getElementById(id);

// ---------- supabase client ----------
// 予約データ（誰がいつ誰宛に予約したか）はSupabase(外部DB)に保存する。
// window.supabase はSDKが提供するグローバル名前空間なので、
// クライアントインスタンスは別名(sb)で保持して衝突を避ける。
const sb = window.supabase.createClient(
  window.SUPABASE_CONFIG.url,
  window.SUPABASE_CONFIG.anonKey
);
const RESV_TABLE = 'reservations';
const REPLY_TABLE = 'replies';

// ---------- rank tiers ----------
const RANK_GROUPS = [
  { group:'Rookie',   subs:['IV','III','II','I'] },
  { group:'Bronze',   subs:['IV','III','II','I'] },
  { group:'Silver',   subs:['IV','III','II','I'] },
  { group:'Gold',     subs:['IV','III','II','I'] },
  { group:'Platinum', subs:['IV','III','II','I'] },
  { group:'Diamond',  subs:['IV','III','II','I'] },
  { group:'Master',   subs:[] },
  { group:'Apex Predator', subs:[] },
];
function rankOptionsHtml(selected){
  return RANK_GROUPS.map(g=>{
    if(g.subs.length===0){
      return `<option value="${g.group}" ${g.group===selected?'selected':''}>${g.group}</option>`;
    }
    const opts = g.subs.map(s=>{
      const val = `${g.group} ${s}`;
      return `<option value="${val}" ${val===selected?'selected':''}>${val}</option>`;
    }).join('');
    return `<optgroup label="${g.group}">${opts}</optgroup>`;
  }).join('');
}

// ---------- status ----------
const STATUS_OPTIONS = ['募集中','確定','キャンセル'];
function statusOptionsHtml(selected){
  return STATUS_OPTIONS.map(s=>`<option value="${s}" ${s===selected?'selected':''}>${s}</option>`).join('');
}
function statusClass(status){
  if(status==='確定') return 'status-badge confirmed';
  if(status==='キャンセル') return 'status-badge cancelled';
  return 'status-badge open';
}

// ---------- filters ----------
let filters = { name:'', from:'', to:'' };

// ---------- state ----------
let settings = { webhook: '', apexKey: '' };
let selectedDate = null;   // 'YYYY-MM-DD'
let selectedTime = null;   // 'HH:MM'
let viewYear, viewMonth;   // calendar cursor
const today = new Date(); today.setHours(0,0,0,0);

// ---------- storage helpers ----------
// ダウンロード後にブラウザ単体で開いて使うファイルのため、
// Claudeアーティファクト専用のwindow.storageではなく、
// ブラウザ標準のlocalStorageを使う自前の小さなラッパーを用意する。
const LS_PREFIX = 'armas:';
const localDB = {
  get(key){
    try{
      const raw = localStorage.getItem(LS_PREFIX + key);
      return raw === null ? null : { key, value: raw };
    }catch(e){ throw e; } // Safariのプライベートブラウズ等で例外になる場合がある
  },
  set(key, value){
    localStorage.setItem(LS_PREFIX + key, value);
    return { key, value };
  },
  delete(key){
    localStorage.removeItem(LS_PREFIX + key);
    return { key, deleted:true };
  },
  list(prefix){
    const keys = [];
    for(let i=0;i<localStorage.length;i++){
      const k = localStorage.key(i);
      if(k && k.startsWith(LS_PREFIX + prefix)) keys.push(k.slice(LS_PREFIX.length));
    }
    return { keys };
  }
};

async function loadSettings(){
  try{
    const r = localDB.get('settings');
    if(r && r.value) settings = JSON.parse(r.value);
  }catch(e){ /* 保存データなし、またはlocalStorage無効 */ }
  $('discordWebhook').value = settings.webhook || '';
  $('apexApiKey').value = settings.apexKey || '';
  if(settings.apexKey) fetchMapRotation();
}
async function saveSettings(){
  settings.webhook = $('discordWebhook').value.trim();
  settings.apexKey = $('apexApiKey').value.trim();
  try{
    localDB.set('settings', JSON.stringify(settings));
    $('settingsStatus').textContent = '保存しました';
    $('settingsStatus').className = 'status-line ok';
  }catch(e){
    $('settingsStatus').textContent = '保存に失敗しました（ブラウザのプライベートモードや、ストレージ無効設定が原因の可能性があります）';
    $('settingsStatus').className = 'status-line err';
  }
  if(settings.apexKey) fetchMapRotation();
}
async function loadReservations(){
  const { data, error } = await sb
    .from(RESV_TABLE)
    .select('*')
    .order('reservation_date', { ascending: true })
    .order('reservation_time', { ascending: true });
  if(error){
    console.error('予約の取得に失敗:', error);
    return [];
  }
  // DBのカラム名(reservation_date等)を、既存の描画コードが使う名前に変換
  return (data || []).map(r => ({
    id: r.id,
    date: r.reservation_date,
    time: r.reservation_time ? r.reservation_time.slice(0,5) : r.reservation_time,
    reservedBy: r.reserved_by,
    reservedFor: r.reserved_for,
    note: r.note,
    map: r.map,
    rankTier: r.rank_tier,
    status: r.status || '募集中'
  }));
}
async function saveReservation(resv){
  const { error } = await sb.from(RESV_TABLE).insert({
    reserved_by: resv.reservedBy,
    reserved_for: resv.reservedFor || null,
    reservation_date: resv.date,
    reservation_time: resv.time,
    note: resv.note || null,
    map: resv.map || null,
    rank_tier: resv.rankTier || null,
    status: '募集中'
  });
  if(error) throw error;
}
async function deleteReservation(id){
  const { error } = await sb.from(RESV_TABLE).delete().eq('id', id);
  if(error){ console.error('削除に失敗:', error); }
  renderReservations();
}

// 同じ日時にすでに有効な(キャンセル以外の)予約がないかを確認する
async function findConflicting(date, time, excludeId){
  let query = sb
    .from(RESV_TABLE)
    .select('id,reserved_by,status')
    .eq('reservation_date', date)
    .eq('reservation_time', time)
    .neq('status', 'キャンセル');
  if(excludeId) query = query.neq('id', excludeId);
  const { data, error } = await query;
  if(error){ console.error('重複チェックに失敗:', error); return []; }
  return data || [];
}

async function updateReservationStatus(id, status){
  const { data, error } = await sb.from(RESV_TABLE).update({ status }).eq('id', id).select();
  if(error){ console.error('ステータス更新に失敗:', error); return false; }
  if(!data || data.length===0){
    console.error('ステータス更新が反映されませんでした（RLSのupdateポリシーをご確認ください）');
    return false;
  }
  return true;
}

async function updateReservation(id, patch){
  const { data, error } = await sb.from(RESV_TABLE).update({
    reservation_date: patch.date,
    reservation_time: patch.time,
    rank_tier: patch.rankTier || null,
    reserved_for: patch.reservedFor || null,
    note: patch.note || null
  }).eq('id', id).select();
  if(error) throw error;
  if(!data || data.length===0){
    // RLSのupdateポリシーが無い場合、エラーは出ずに0件更新になることがある
    throw new Error('更新が反映されませんでした（Supabaseのupdateポリシーをご確認ください）');
  }
}

// ---------- replies ----------
// 予約一覧の描画時にまとめて取得するため、reservation_idごとにグルーピングして返す
async function loadRepliesGrouped(reservationIds){
  if(!reservationIds || reservationIds.length===0) return {};
  const { data, error } = await sb
    .from(REPLY_TABLE)
    .select('*')
    .in('reservation_id', reservationIds)
    .order('created_at', { ascending: true });
  if(error){
    console.error('返信の取得に失敗:', error);
    return {};
  }
  const grouped = {};
  for(const row of (data || [])){
    if(!grouped[row.reservation_id]) grouped[row.reservation_id] = [];
    grouped[row.reservation_id].push({
      id: row.id,
      repliedBy: row.replied_by,
      message: row.message,
      createdAt: row.created_at
    });
  }
  return grouped;
}
async function saveReply(reservationId, repliedBy, message){
  const { error } = await sb.from(REPLY_TABLE).insert({
    reservation_id: reservationId,
    replied_by: repliedBy || null,
    message: message
  });
  if(error) throw error;
}

// ---------- calendar reservation markers ----------
// カレンダー・時間帯選択画面に「すでに予約がある」ことを表示するためのキャッシュ。
// キャンセル済みの予約は空き扱いにするため除外する。
let calendarReservations = [];
async function loadCalendarMarkers(){
  const { data, error } = await sb
    .from(RESV_TABLE)
    .select('reservation_date,reservation_time,reserved_by,status')
    .neq('status', 'キャンセル');
  if(error){
    console.error('カレンダー用データの取得に失敗:', error);
    calendarReservations = [];
    return;
  }
  calendarReservations = (data || []).map(r => ({
    date: r.reservation_date,
    time: r.reservation_time ? r.reservation_time.slice(0,5) : r.reservation_time,
    reservedBy: r.reserved_by,
    status: r.status || '募集中'
  }));
}
function reservationsOnDate(date){
  return calendarReservations.filter(r => r.date === date);
}

// ---------- calendar ----------
function pad(n){ return String(n).padStart(2,'0'); }

function renderCalendar(){
  $('ymLabel').textContent = `${viewYear}年 ${viewMonth+1}月`;
  const dow = ['日','月','火','水','木','金','土'];
  $('dowRow').innerHTML = dow.map(d=>`<div class="dow">${d}</div>`).join('');

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth+1, 0).getDate();

  let html = '';
  for(let i=0;i<firstDay;i++) html += `<div class="day empty"></div>`;
  for(let d=1; d<=daysInMonth; d++){
    const dateObj = new Date(viewYear, viewMonth, d);
    const iso = `${viewYear}-${pad(viewMonth+1)}-${pad(d)}`;
    const isPast = dateObj < today;
    const isToday = dateObj.getTime() === today.getTime();
    const isSelected = iso === selectedDate;

    const dayResvs = reservationsOnDate(iso);
    const hasResv = dayResvs.length > 0;
    const titleAttr = hasResv
      ? dayResvs.map(r => `${r.time} ${r.reservedBy}（${r.status}）`).join('\n').replace(/"/g,'&quot;')
      : '';

    html += `<div class="day ${isPast?'past':''} ${isToday?'today':''} ${isSelected?'selected':''} ${hasResv?'has-resv':''}"
                  data-date="${iso}" title="${titleAttr}">${d}${hasResv ? '<span class="dot"></span>' : ''}</div>`;
  }
  $('calGrid').innerHTML = html;

  $('calGrid').querySelectorAll('.day:not(.empty):not(.past)').forEach(el=>{
    el.addEventListener('click', ()=>{
      selectedDate = el.dataset.date;
      renderCalendar();
      renderTimeSlots();
      updateSelectedLine();
      if(settings.apexKey) fetchMapRotation();
    });
  });
}

function renderTimeSlots(){
  const dayResvs = selectedDate ? reservationsOnDate(selectedDate) : [];
  let html = '';
  for(let h=0; h<24; h++){
    for(let m=0; m<60; m+=30){
      const t = `${pad(h)}:${pad(m)}`;
      const match = dayResvs.find(r => r.time === t);
      const titleAttr = match ? `${match.reservedBy}（${match.status}）`.replace(/"/g,'&quot;') : '';
      html += `<div class="time-slot ${t===selectedTime?'selected':''} ${match?'taken':''}" data-time="${t}" title="${titleAttr}">${t}${match ? '<span class="dot"></span>' : ''}</div>`;
    }
  }
  $('timeGrid').innerHTML = html;
  $('timeGrid').querySelectorAll('.time-slot').forEach(el=>{
    el.addEventListener('click', ()=>{
      selectedTime = el.dataset.time;
      renderTimeSlots();
      updateSelectedLine();
    });
  });
}

function updateSelectedLine(){
  if(selectedDate && selectedTime){
    $('selectedLine').innerHTML = `選択中: <b>${selectedDate} ${selectedTime}</b>`;
    $('reserveBtn').disabled = false;
  } else {
    $('selectedLine').textContent = '日付と時間を選択してください。';
    $('reserveBtn').disabled = true;
  }
}

$('prevMonth').addEventListener('click', ()=>{
  viewMonth--; if(viewMonth<0){viewMonth=11; viewYear--;}
  renderCalendar();
});
$('nextMonth').addEventListener('click', ()=>{
  viewMonth++; if(viewMonth>11){viewMonth=0; viewYear++;}
  renderCalendar();
});

// ---------- map rotation ----------
let mapTimerInterval = null;
let mapRemainingSecs = null;

function stopMapTimer(){
  if(mapTimerInterval){ clearInterval(mapTimerInterval); mapTimerInterval = null; }
}

function formatRemaining(secs){
  secs = Math.max(0, secs);
  const h = Math.floor(secs/3600);
  const m = Math.floor((secs%3600)/60);
  const s = Math.floor(secs%60);
  return h>0
    ? `残り ${h}時間${String(m).padStart(2,'0')}分`
    : `残り ${m}分${String(s).padStart(2,'0')}秒`;
}

function tickMapTimer(){
  if(mapRemainingSecs === null) return;
  mapRemainingSecs--;
  const el = $('mapTimer');
  if(el) el.textContent = formatRemaining(mapRemainingSecs);
  if(mapRemainingSecs <= 0){
    stopMapTimer();
    fetchMapRotation(); // マップが切り替わったタイミングで自動的に再取得
  }
}

async function fetchMapRotation(){
  stopMapTimer();
  if(!settings.apexKey){
    $('mapBox').innerHTML = `<p class="fallback">APIキー未設定のため取得できません。設定からAPIキーを登録してください。</p>`;
    return;
  }
  $('mapBox').innerHTML = `<p class="fallback">取得中...</p>`;
  try{
    const res = await fetch(`https://api.mozambiquehe.re/maprotation?version=2&auth=${encodeURIComponent(settings.apexKey)}`);
    if(!res.ok) throw new Error('API error');
    const data = await res.json();
    const ranked = data.ranked || {};
    const cur = ranked.current || {};
    const next = ranked.next || {};
    const hasTimer = typeof cur.remainingSecs === 'number';
    $('mapBox').innerHTML = `
      <div class="cur">
        <span class="name">${cur.map || '不明'}</span>
        ${hasTimer ? `<span class="timer" id="mapTimer">${formatRemaining(cur.remainingSecs)}</span>` : ''}
      </div>
      <div class="next">次のマップ: ${next.map || '不明'}</div>
      <p class="hint" style="margin-top:10px;">※このAPIは「現在」と「次」のマップしか取得できません。数日後などの予約に対しては、予約時点の直近ローテーションを参考値として記録します。</p>
    `;
    if(hasTimer){
      mapRemainingSecs = cur.remainingSecs;
      mapTimerInterval = setInterval(tickMapTimer, 1000);
    } else {
      mapRemainingSecs = null;
    }
  }catch(e){
    $('mapBox').innerHTML = `<p class="fallback">マップ情報の取得に失敗しました（APIキーやネットワークをご確認ください）。</p>`;
  }
}

// ---------- reservation flow ----------
async function currentMapSnapshot(){
  if(!settings.apexKey) return null;
  try{
    const res = await fetch(`https://api.mozambiquehe.re/maprotation?version=2&auth=${encodeURIComponent(settings.apexKey)}`);
    if(!res.ok) return null;
    const data = await res.json();
    const ranked = data.ranked || {};
    return (ranked.current && ranked.current.map) ? ranked.current.map : null;
  }catch(e){ return null; }
}

async function sendDiscordNotice(resv){
  if(!settings.webhook) return { sent:false, reason:'Webhook未設定' };
  const content =
    `📅 **新しい予約が入りました**\n` +
    `日時: ${resv.date} ${resv.time}\n` +
    `予約者: ${resv.reservedBy}\n` +
    (resv.reservedFor ? `予約先: ${resv.reservedFor}\n` : '') +
    (resv.rankTier ? `現在のランク: ${resv.rankTier}\n` : '') +
    (resv.map ? `参考ランクマップ（予約時点）: ${resv.map}\n` : '') +
    (resv.note ? `備考: ${resv.note}` : '備考: なし');
  try{
    const res = await fetch(settings.webhook, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ content })
    });
    return { sent: res.ok };
  }catch(e){
    return { sent:false, reason:'通信エラー' };
  }
}

async function sendDiscordCancelNotice(resv){
  if(!settings.webhook) return { sent:false, reason:'Webhook未設定' };
  const content =
    `🚫 **予約がキャンセルされました**\n` +
    `日時: ${resv.date} ${resv.time}\n` +
    `予約者: ${resv.reservedBy}${resv.reservedFor ? ` → ${resv.reservedFor}` : ''}\n` +
    (resv.rankTier ? `現在のランク: ${resv.rankTier}\n` : '') +
    (resv.note ? `備考: ${resv.note}` : '備考: なし');
  try{
    const res = await fetch(settings.webhook, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ content })
    });
    return { sent: res.ok };
  }catch(e){
    return { sent:false, reason:'通信エラー' };
  }
}

async function sendDiscordReplyNotice(resv, repliedBy, message){
  if(!settings.webhook) return { sent:false, reason:'Webhook未設定' };
  const target = resv.reservedBy
    ? `${resv.reservedBy}${resv.reservedFor ? ` → ${resv.reservedFor}` : ''}（${resv.date} ${resv.time}）`
    : `${resv.date} ${resv.time}`;
  const content =
    `💬 **予約への返信があります**\n` +
    `対象の予約: ${target}\n` +
    `予約時のメッセージ: ${resv.note ? resv.note : 'なし'}\n` +
    `返信${repliedBy ? `（${repliedBy}より）` : ''}: ${message}`;
  try{
    const res = await fetch(settings.webhook, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ content })
    });
    return { sent: res.ok };
  }catch(e){
    return { sent:false, reason:'通信エラー' };
  }
}

$('reserveBtn').addEventListener('click', async ()=>{
  if(!selectedDate || !selectedTime) return;

  const reservedBy = $('reservedBy').value.trim();
  if(!reservedBy){
    $('reserveStatus').textContent = '「予約者」を入力してください。';
    $('reserveStatus').className = 'status-line err';
    return;
  }

  // 重複チェック：同じ日時にすでに有効な予約がないか確認
  const conflicts = await findConflicting(selectedDate, selectedTime);
  if(conflicts.length > 0){
    const names = conflicts.map(c => c.reserved_by).join('、');
    const proceed = confirm(
      `この日時(${selectedDate} ${selectedTime})にはすでに予約があります（予約者: ${names}）。\nそれでも登録しますか？`
    );
    if(!proceed){
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
    date: selectedDate,
    time: selectedTime,
    reservedBy: reservedBy,
    reservedFor: $('reservedFor').value.trim(),
    rankTier: $('rankTier').value,
    note: $('notes').value.trim(),
    map: map
  };

  try{
    await saveReservation(resv);
  }catch(e){
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
  selectedTime = null;
  renderTimeSlots();
  updateSelectedLine();
  renderReservations();
  setTimeout(()=>{ $('reserveBtn').disabled = false; }, 500);
});

function escapeHtml(s){
  return (s || '').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function formatDateTime(iso){
  if(!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth()+1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function applyFilters(items){
  return items.filter(r=>{
    if(filters.name && !(r.reservedBy||'').includes(filters.name)) return false;
    if(filters.from && r.date < filters.from) return false;
    if(filters.to && r.date > filters.to) return false;
    return true;
  });
}

async function renderReservations(){
  const items = await loadReservations();

  if(items.length===0){
    $('resvList').innerHTML = `<div class="empty-state">まだ予約はありません。</div>`;
    return;
  }

  const filteredItems = applyFilters(items);
  if(filteredItems.length===0){
    $('resvList').innerHTML = `<div class="empty-state">条件に一致する予約はありません。</div>`;
    return;
  }

  const repliesByResv = await loadRepliesGrouped(filteredItems.map(r=>r.id));

  $('resvList').innerHTML = filteredItems.map(r=>{
    const replies = repliesByResv[r.id] || [];
    const repliesHtml = replies.length
      ? replies.map(rep => `
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
  }).join('');

  // ---- 削除（確認ダイアログ付き） ----
  $('resvList').querySelectorAll('.del').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.dataset.id;
      const target = filteredItems.find(r => r.id === id);
      const label = target ? `${target.date} ${target.time}（予約者: ${target.reservedBy}）` : 'この予約';
      if(confirm(`${label} を削除します。よろしいですか？\n※この操作は取り消せません。`)){
        deleteReservation(id);
      }
    });
  });

  // ---- ステータス変更（キャンセル時はDiscordへ通知） ----
  $('resvList').querySelectorAll('.status-select').forEach(sel=>{
    const prevValue = sel.value;
    sel.addEventListener('change', async ()=>{
      const id = sel.dataset.id;
      const newStatus = sel.value;
      const ok = await updateReservationStatus(id, newStatus);
      if(!ok){
        alert('ステータスの更新に失敗しました。Supabaseのupdateポリシーをご確認ください。');
        sel.value = prevValue;
        return;
      }
      if(newStatus === 'キャンセル'){
        const target = filteredItems.find(r => r.id === id);
        if(target){
          const notice = await sendDiscordCancelNotice({ ...target, status: newStatus });
          if(!notice.sent){
            alert(`ステータスは更新されましたが、Discordへの通知は送信できませんでした（${notice.reason || 'Webhook未確認'}）。`);
          }
        }
      }
      renderReservations();
    });
  });

  // ---- 編集フォームの開閉（開いているときは返信フォームを閉じる） ----
  $('resvList').querySelectorAll('.edit-toggle').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.dataset.id;
      const editForm = document.getElementById(`edit-form-${id}`);
      const replyForm = document.getElementById(`reply-form-${id}`);
      if(replyForm) replyForm.classList.remove('open');
      if(editForm) editForm.classList.toggle('open');
    });
  });
  $('resvList').querySelectorAll('.edit-cancel-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const form = document.getElementById(`edit-form-${btn.dataset.id}`);
      if(form) form.classList.remove('open');
    });
  });

  // ---- 返信フォームの開閉（開いているときは編集フォームを閉じる） ----
  $('resvList').querySelectorAll('.reply-toggle').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.dataset.id;
      const replyForm = document.getElementById(`reply-form-${id}`);
      const editForm = document.getElementById(`edit-form-${id}`);
      if(editForm) editForm.classList.remove('open');
      if(replyForm) replyForm.classList.toggle('open');
    });
  });
  $('resvList').querySelectorAll('.reply-cancel-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const form = document.getElementById(`reply-form-${btn.dataset.id}`);
      if(form) form.classList.remove('open');
    });
  });

  // ---- 編集の保存 ----
  $('resvList').querySelectorAll('.edit-save-btn').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const id = btn.dataset.id;
      const statusEl = document.getElementById(`edit-status-${id}`);
      const dateInput = $('resvList').querySelector(`.edit-date[data-id="${id}"]`);
      const timeInput = $('resvList').querySelector(`.edit-time[data-id="${id}"]`);
      const forInput = $('resvList').querySelector(`.edit-for[data-id="${id}"]`);
      const rankSelect = $('resvList').querySelector(`.edit-rank[data-id="${id}"]`);
      const noteInput = $('resvList').querySelector(`.edit-note[data-id="${id}"]`);

      const newDate = dateInput.value;
      const newTime = timeInput.value;
      if(!newDate || !newTime){
        statusEl.textContent = '日付と時刻を入力してください。';
        statusEl.className = 'status-line err';
        return;
      }

      // 変更後の日時が他の予約と重複していないか確認（自分自身は除く）
      const conflicts = await findConflicting(newDate, newTime, id);
      if(conflicts.length > 0){
        const names = conflicts.map(c => c.reserved_by).join('、');
        const proceed = confirm(
          `変更後の日時(${newDate} ${newTime})にはすでに別の予約があります（予約者: ${names}）。\nそれでも保存しますか？`
        );
        if(!proceed) return;
      }

      btn.disabled = true;
      statusEl.textContent = '保存中...';
      statusEl.className = 'status-line';

      try{
        await updateReservation(id, {
          date: newDate,
          time: newTime,
          reservedFor: forInput.value.trim(),
          rankTier: rankSelect.value,
          note: noteInput.value.trim()
        });
      }catch(e){
        console.error(e);
        statusEl.textContent = `保存に失敗しました: ${e.message || '不明なエラー'}`;
        statusEl.className = 'status-line err';
        btn.disabled = false;
        return;
      }

      renderReservations();
    });
  });

  // ---- 返信 ----
  $('resvList').querySelectorAll('.reply-send-btn').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const id = btn.dataset.id;
      const byInput = $('resvList').querySelector(`.reply-by-input[data-id="${id}"]`);
      const msgInput = $('resvList').querySelector(`.reply-msg-input[data-id="${id}"]`);
      const statusEl = document.getElementById(`reply-status-${id}`);
      const message = msgInput.value.trim();

      if(!message){
        statusEl.textContent = '返信内容を入力してください。';
        statusEl.className = 'status-line err';
        return;
      }

      btn.disabled = true;
      statusEl.textContent = '送信中...';
      statusEl.className = 'status-line';

      const repliedBy = byInput.value.trim();
      const target = filteredItems.find(r => r.id === id);

      try{
        await saveReply(id, repliedBy, message);
      }catch(e){
        console.error(e);
        statusEl.textContent = '返信の保存に失敗しました';
        statusEl.className = 'status-line err';
        btn.disabled = false;
        return;
      }

      // 返信が来た予約は、まだ「募集中」であれば自動的に「確定」にする
      if(target && target.status === '募集中'){
        await updateReservationStatus(id, '確定');
      }

      const notice = await sendDiscordReplyNotice(target, repliedBy, message);
      if(!notice.sent){
        // 保存自体は成功しているので、一覧を再描画してから通知失敗を伝える
        await renderReservations();
        const newStatusEl = document.getElementById(`reply-status-${id}`);
        if(newStatusEl){
          newStatusEl.textContent = `返信は保存されましたが、Discord通知は送信できませんでした（${notice.reason || 'Webhook未確認'}）。`;
          newStatusEl.className = 'status-line err';
        }
        return;
      }

      await renderReservations();
    });
  });

  // 予約一覧の更新に合わせて、カレンダー・時間帯の予約状況表示も最新化する
  await loadCalendarMarkers();
  renderCalendar();
  renderTimeSlots();
}

// ---------- filter events ----------
$('filterName').addEventListener('input', ()=>{
  filters.name = $('filterName').value.trim();
  renderReservations();
});
$('filterFrom').addEventListener('change', ()=>{
  filters.from = $('filterFrom').value;
  renderReservations();
});
$('filterTo').addEventListener('change', ()=>{
  filters.to = $('filterTo').value;
  renderReservations();
});
$('filterClear').addEventListener('click', ()=>{
  filters = { name:'', from:'', to:'' };
  $('filterName').value = '';
  $('filterFrom').value = '';
  $('filterTo').value = '';
  renderReservations();
});

// ---------- presence (online count) ----------
const presenceChannel = sb.channel('armas-presence', {
  config: { presence: { key: crypto.randomUUID() } }
});

function updateOnlineCount(){
  const state = presenceChannel.presenceState();
  const count = Object.keys(state).length;
  const el = $('onlineCount');
  if(el) el.textContent = `現在のオンライン：${count}人`;
}

presenceChannel.on('presence', { event: 'sync' }, updateOnlineCount);

presenceChannel.subscribe(async (status) => {
  if(status === 'SUBSCRIBED'){
    await presenceChannel.track({ online_at: new Date().toISOString() });
  }
});

// ---------- settings panel toggle ----------
$('settingsToggle').addEventListener('click', ()=>{
  $('settingsPanel').classList.toggle('open');
});
$('saveSettings').addEventListener('click', saveSettings);

// ---------- init ----------
viewYear = today.getFullYear();
viewMonth = today.getMonth();
$('rankTier').innerHTML = rankOptionsHtml();
loadCalendarMarkers().then(()=>{
  renderCalendar();
  renderTimeSlots();
});
updateSelectedLine();
loadSettings();
renderReservations();
