import { $ } from './dom.js';
import { state } from './state.js';
import { fetchMapRotation } from './mapRotation.js';

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

export async function loadSettings() {
  try {
    const r = localDB.get('settings');
    if (r && r.value) state.settings = JSON.parse(r.value);
  } catch (e) {
    /* 保存データなし、またはlocalStorage無効(Safariのプライベートブラウズ等) */
  }
  $('discordWebhook').value = state.settings.webhook || '';
  $('apexApiKey').value = state.settings.apexKey || '';
  if (state.settings.apexKey) fetchMapRotation();
}

export async function saveSettings() {
  state.settings.webhook = $('discordWebhook').value.trim();
  state.settings.apexKey = $('apexApiKey').value.trim();
  try {
    localDB.set('settings', JSON.stringify(state.settings));
    $('settingsStatus').textContent = '保存しました';
    $('settingsStatus').className = 'status-line ok';
  } catch (e) {
    $('settingsStatus').textContent = '保存に失敗しました（ブラウザのプライベートモードや、ストレージ無効設定が原因の可能性があります）';
    $('settingsStatus').className = 'status-line err';
  }
  if (state.settings.apexKey) fetchMapRotation();
}
