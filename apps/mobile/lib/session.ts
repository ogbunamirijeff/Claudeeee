import * as SecureStore from 'expo-secure-store';
import type { AuthTokens } from '@jiko/shared';

const KEY = 'jiko.session.v1';
const MODE_KEY = 'jiko.mode.v1';

export type AppMode = 'client' | 'artisan';

/** Tokens are kept in the OS keystore (Android Keystore / iOS Keychain), never AsyncStorage. */
export async function saveTokens(t: AuthTokens) {
  await SecureStore.setItemAsync(KEY, JSON.stringify(t));
}
export async function loadTokens(): Promise<AuthTokens | null> {
  const raw = await SecureStore.getItemAsync(KEY);
  return raw ? (JSON.parse(raw) as AuthTokens) : null;
}
export async function clearTokens() {
  await SecureStore.deleteItemAsync(KEY);
}
export async function loadMode(): Promise<AppMode> {
  return (await SecureStore.getItemAsync(MODE_KEY)) === 'artisan' ? 'artisan' : 'client';
}
export async function saveMode(mode: AppMode) {
  await SecureStore.setItemAsync(MODE_KEY, mode);
}
