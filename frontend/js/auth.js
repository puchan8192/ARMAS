import { sb } from './config.js';
import { state } from './state.js';

export async function fetchProfile(userId) {
  const { data, error } = await sb
    .from('profiles')
    .select('role, display_name')
    .eq('id', userId)
    .single();
  if (error) {
    console.error('プロフィールの取得に失敗:', error);
    return null;
  }
  return data;
}

export async function signIn(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut() {
  await sb.auth.signOut();
}

// ログイン状態が変わるたびに、profilesのroleも合わせてstate.currentUserに反映する
export function watchAuthState(onChange) {
  sb.auth.onAuthStateChange(async (_event, session) => {
    if (session) {
      const profile = await fetchProfile(session.user.id);
      state.currentUser = {
        id: session.user.id,
        email: session.user.email,
        role: profile?.role || 'member',
        displayName: profile?.display_name || session.user.email,
      };
    } else {
      state.currentUser = null;
    }
    onChange(state.currentUser);
  });
}