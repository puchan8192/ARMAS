import { state } from './state.js';

// 備考欄にこの文字列が含まれ、かつ管理者(admin)のときに経路案内を開く
export const ROUTE_TRIGGER_NOTE = 'プレジオ';
export const ROUTE_DESTINATION = '大阪府大阪市城東区今福南３丁目２－１２';

// 位置情報の許可ダイアログへの回答待ちも含めた、全体の待ち時間の上限
const GEO_TOTAL_TIMEOUT_MS = 20000;

// 全角/半角の揺れ・前後の空白を吸収して比較する
function normalize(s) {
  return (s || '').normalize('NFKC').trim();
}

// 「ログイン中のユーザーがadmin」かつ「備考に『プレジオ』を含む（部分一致）」のときだけtrue
export function shouldOpenRoute(note) {
  const isAdmin = !!state.currentUser && state.currentUser.role === 'admin';
  return isAdmin && normalize(note).includes(normalize(ROUTE_TRIGGER_NOTE));
}

// 位置情報を取得する。
// getCurrentPosition の timeout は「許可ダイアログの回答待ち」を含まないため、
// 回答されないまま固まらないよう、全体の上限を別に設ける。
function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('このブラウザは位置情報に対応していません'));
      return;
    }
    const timer = setTimeout(() => reject({ code: 3, message: 'timeout' }), GEO_TOTAL_TIMEOUT_MS);
    navigator.geolocation.getCurrentPosition(
      (pos) => { clearTimeout(timer); resolve(pos); },
      (err) => { clearTimeout(timer); reject(err); },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  });
}

// 現在地を取得し、Googleマップの経路案内（現在地 → 目的地）のURLを組み立てる。
// 位置情報が取れない場合は origin を省略する（Googleマップ側が現在地を使う）。
export async function buildRouteUrl() {
  let origin = '';
  let reason = '';
  try {
    const pos = await getCurrentPosition();
    origin = `${pos.coords.latitude},${pos.coords.longitude}`;
  } catch (e) {
    if (e && e.code === 1) reason = '位置情報の利用が許可されていません';
    else if (e && e.code === 3) reason = '現在地の取得がタイムアウトしました';
    else reason = '現在地を取得できませんでした';
    console.warn('位置情報の取得に失敗:', e);
  }

  const params = new URLSearchParams({
    api: '1',
    destination: ROUTE_DESTINATION,
    travelmode: 'driving',
  });
  if (origin) params.set('origin', origin);
  return { url: `https://www.google.com/maps/dir/?${params.toString()}`, reason };
}

// 経路案内を新しいタブで開く。
// 位置情報の取得を待ったあとに開くため、ブラウザのポップアップブロックに止められることがある。
// その場合は blocked: true とURLを返し、呼び出し側でクリック可能なリンクを出す。
export async function openRouteGuide() {
  const { url, reason } = await buildRouteUrl();
  const w = window.open(url, '_blank');
  return { ok: !!w, blocked: !w, url, reason };
}
