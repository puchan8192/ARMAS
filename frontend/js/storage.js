import { $ } from './dom.js';
import { state } from './state.js';
import { fetchMapRotation } from './mapRotation.js';
import { sb, APP_SETTINGS_TABLE } from './config.js';

// ダウンロード後にブラウザ単体で開いて使うファイルのため、
// Claudeアーティファクト専用のwindow.storageではなく、
// ブラウザ標準のlocalStorageを使う自前の小さなラッパーを用意する。
const LS_PREFIX = 'armas:';

export const localDB = {
  get(key) {
    const raw = localStorage.getItem(LS_PREFIX + key);
    return raw === null ? null : { key, value: raw };
  },
  set(key, value) {
    localStorage.setItem(LS_PREFIX + key, value);
    return { key, value };
  },
  delete(key) {
    localStorage.removeItem(LS_PREFIX + key);
    return { key, deleted: true };
  },
  list(prefix) {
    const keys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith(LS_PREFIX + prefix)) keys.push(k.slice(LS_PREFIX.length));
    }
    return { keys };
  },
};

// 直近でDBから取得できた共有Webhook URL。保存時に変更を検知して警告を出すために使う。
let lastKnownSharedWebhook = '';

export async function loadSettings() {
  // Apex APIキーは端末ごとの個人設定のため、これまで通りlocalStorageから読む
  try {
    const r = localDB.get('settings');
    if (r && r.value) {
      const local = JSON.parse(r.value);
      state.settings.apexKey = local.apexKey || '';
      state.settings.webhook = local.webhook || ''; // DB取得に失敗した場合の暫定値
    }
  } catch (e) {
    /* 保存データなし、またはlocalStorage無効(Safariのプライベートブラウズ等) */
  }

  // Discord Webhook URLは「全員共通」の設定として、Supabaseから取得する。
  // これにより、他の端末（Discord/LINE通知から開いたスマホ等）でも
  // 同じWebhook URLを参照でき、参加可否の回答通知などが正しく送信できる。
  try {
    const { data, error } = await sb
      .from(APP_SETTINGS_TABLE)
      .select('discord_webhook_url')
      .eq('id', 'default')
      .maybeSingle();
    if (!error && data && data.discord_webhook_url) {
      state.settings.webhook = data.discord_webhook_url;
      lastKnownSharedWebhook = data.discord_webhook_url;
    }
  } catch (e) {
    /* DB未接続時はlocalStorageの値（あれば）のまま動作する */
  }

  $('discordWebhook').value = state.settings.webhook || '';
  $('apexApiKey').value = state.settings.apexKey || '';
  if (state.settings.apexKey) fetchMapRotation();
}

export async function saveSettings() {
  const newWebhook = $('discordWebhook').value.trim();

  // 既知の共有Webhook URLと異なる値を保存しようとしている場合は、
  // 全員の通知先が切り替わってしまう操作であることを警告する
  if (lastKnownSharedWebhook && newWebhook !== lastKnownSharedWebhook) {
    const proceed = window.confirm(
      'Discord Webhook URLは全員共通の設定です。\n'
      + 'ここで変更すると、あなた個人だけでなく全員の通知先が切り替わります。\n'
      + '（誤って自分専用のWebhook URLを設定しようとしていませんか？）\n\n'
      + '本当に変更しますか？',
    );
    if (!proceed) {
      $('discordWebhook').value = lastKnownSharedWebhook; // 入力を元の共有値に戻す
      return;
    }
  }

  state.settings.webhook = newWebhook;
  state.settings.apexKey = $('apexApiKey').value.trim();

  let dbOk = true;
  try {
    const { error } = await sb.from(APP_SETTINGS_TABLE).upsert({
      id: 'default',
      discord_webhook_url: state.settings.webhook,
      updated_at: new Date().toISOString(),
    });
    if (error) dbOk = false;
  } catch (e) {
    dbOk = false;
  }

  if (dbOk) lastKnownSharedWebhook = state.settings.webhook;

  try {
    // 通信できない環境でも最低限この端末では動くよう、localStorageにも保存しておく
    localDB.set('settings', JSON.stringify(state.settings));
  } catch (e) {
    /* localStorage無効でも、DB保存ができていれば他機能への影響はない */
  }

  if (dbOk) {
    $('settingsStatus').textContent = '保存しました（Discord通知先は全員共通の設定として反映されます）';
    $('settingsStatus').className = 'status-line ok';
  } else {
    $('settingsStatus').textContent = 'この端末には保存しましたが、共有設定への保存に失敗しました（Supabaseのapp_settingsテーブル・ポリシーをご確認ください）';
    $('settingsStatus').className = 'status-line err';
  }

  if (state.settings.apexKey) fetchMapRotation();
}
