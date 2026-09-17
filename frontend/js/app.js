const $ = id => document.getElementById(id);

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
  try{
    const list = localDB.list('resv:');
    if(!list || !list.keys || list.keys.length===0) return [];
    const items = [];
    for(const k of list.keys){
      try{
        const r = localDB.get(k);
        if(r && r.value) items.push(JSON.parse(r.value));
      }catch(e){}
    }
    items.sort((a,b)=> (a.date+a.time) < (b.date+b.time) ? -1 : 1);
    return items;
  }catch(e){ return []; }
}
async function saveReservation(resv){
  localDB.set('resv:'+resv.id, JSON.stringify(resv));
}
async function deleteReservation(id){
  localDB.delete('resv:'+id);
  renderReservations();
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
    html += `<div class="day ${isPast?'past':''} ${isToday?'today':''} ${isSelected?'selected':''}"
                  data-date="${iso}">${d}</div>`;
  }
  $('calGrid').innerHTML = html;

  $('calGrid').querySelectorAll('.day:not(.empty):not(.past)').forEach(el=>{
    el.addEventListener('click', ()=>{
      selectedDate = el.dataset.date;
      renderCalendar();
      updateSelectedLine();
      if(settings.apexKey) fetchMapRotation();
    });
  });
}

function renderTimeSlots(){
  let html = '';
  for(let h=0; h<24; h++){
    for(let m=0; m<60; m+=30){
      const t = `${pad(h)}:${pad(m)}`;
      html += `<div class="time-slot ${t===selectedTime?'selected':''}" data-time="${t}">${t}</div>`;
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

$('reserveBtn').addEventListener('click', async ()=>{
  if(!selectedDate || !selectedTime) return;
  $('reserveBtn').disabled = true;
  $('reserveStatus').textContent = '予約処理中...';
  $('reserveStatus').className = 'status-line';

  const map = await currentMapSnapshot();
  const resv = {
    id: Date.now().toString(36),
    date: selectedDate,
    time: selectedTime,
    note: $('notes').value.trim(),
    map: map
  };

  try{
    await saveReservation(resv);
  }catch(e){
    $('reserveStatus').textContent = '予約の保存に失敗しました';
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
  selectedTime = null;
  renderTimeSlots();
  updateSelectedLine();
  renderReservations();
  setTimeout(()=>{ $('reserveBtn').disabled = false; }, 500);
});

async function renderReservations(){
  const items = await loadReservations();
  if(items.length===0){
    $('resvList').innerHTML = `<div class="empty-state">まだ予約はありません。</div>`;
    return;
  }
  $('resvList').innerHTML = items.map(r=>`
    <div class="resv" data-id="${r.id}">
      <button class="del" data-id="${r.id}">削除</button>
      <div class="dt">${r.date} ${r.time}</div>
      ${r.map ? `<div class="map">参考マップ: ${r.map}</div>` : ''}
      ${r.note ? `<div class="note">${r.note.replace(/</g,'&lt;')}</div>` : ''}
    </div>
  `).join('');
  $('resvList').querySelectorAll('.del').forEach(btn=>{
    btn.addEventListener('click', ()=> deleteReservation(btn.dataset.id));
  });
}

// ---------- settings panel toggle ----------
$('settingsToggle').addEventListener('click', ()=>{
  $('settingsPanel').classList.toggle('open');
});
$('saveSettings').addEventListener('click', saveSettings);

// ---------- init ----------
viewYear = today.getFullYear();
viewMonth = today.getMonth();
renderCalendar();
renderTimeSlots();
updateSelectedLine();
loadSettings();
renderReservations();
