// 予約データ（誰がいつ誰宛に予約したか）はSupabase(外部DB)に保存する。
// window.supabase はSDKが提供するグローバル名前空間なので、
// クライアントインスタンスは別名(sb)で保持して衝突を避ける。
export const sb = window.supabase.createClient(
  window.SUPABASE_CONFIG.url,
  window.SUPABASE_CONFIG.anonKey,
);

export const RESV_TABLE = 'reservations';
export const REPLY_TABLE = 'replies';
export const MAP_API_BASE = 'https://api.mozambiquehe.re/maprotation';
