import type { AuthTokens } from '@jiko/shared';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEY = 'jiko.session.v1';
const MODE_KEY = 'jiko.mode.v1';

export type AppMode = 'client' | 'artisan';

/**
 * Tokens live in the OS keystore (Android Keystore / iOS Keychain), never AsyncStorage.
 * The web build exists only so the screens can be tested in a browser; it uses sessionStorage.
 */
const store =
  Platform.OS === 'web'
    ? {
        get: (k: string) => Promise.resolve(globalThis.sessionStorage?.getItem(k) ?? null),
        set: (k: string, v: string) => Promise.resolve(globalThis.sessionStorage?.setItem(k, v)),
        del: (k: string) => Promise.resolve(globalThis.sessionStorage?.removeItem(k)),
      }
    : {
        get: SecureStore.getItemAsync,
        set: SecureStore.setItemAsync,
        del: SecureStore.deleteItemAsync,
      };

export async function saveTokens(t: AuthTokens) {
  await store.set(KEY, JSON.stringify(t));
}
export async function loadTokens(): Promise<AuthTokens | null> {
  const raw = await store.get(KEY);
  return raw ? (JSON.parse(raw) as AuthTokens) : null;
}
export async function clearTokens() {
  await store.del(KEY);
}
export async function loadMode(): Promise<AppMode> {
  return (await store.get(MODE_KEY)) === 'artisan' ? 'artisan' : 'client';
}
export async function saveMode(mode: AppMode) {
  await store.set(MODE_KEY, mode);
}
