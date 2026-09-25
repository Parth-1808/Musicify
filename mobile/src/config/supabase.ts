import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const STORAGE_KEY_URL = 'MUSIFY_SUPABASE_URL';
const STORAGE_KEY_ANON = 'MUSIFY_SUPABASE_ANON_KEY';
const STORAGE_KEY_BACKEND = 'MUSIFY_BACKEND_URL';

// Defaults
export const DEFAULT_BACKEND_URL =
  Platform.OS === 'web' ? 'http://localhost:8000' : 'http://172.22.126.19:8000';
export const DEFAULT_SUPABASE_URL = '';
export const DEFAULT_SUPABASE_ANON = '';

let supabaseInstance: SupabaseClient | null = null;
let currentSupabaseUrl = DEFAULT_SUPABASE_URL;
let currentSupabaseAnon = DEFAULT_SUPABASE_ANON;
let currentBackendUrl = DEFAULT_BACKEND_URL;

export async function initSupabase(): Promise<SupabaseClient | null> {
  try {
    const savedUrl = await AsyncStorage.getItem(STORAGE_KEY_URL);
    const savedAnon = await AsyncStorage.getItem(STORAGE_KEY_ANON);
    const savedBackend = await AsyncStorage.getItem(STORAGE_KEY_BACKEND);

    if (savedBackend) {
      currentBackendUrl = savedBackend;
    }

    if (savedUrl && savedAnon) {
      currentSupabaseUrl = savedUrl;
      currentSupabaseAnon = savedAnon;
      supabaseInstance = createClient(savedUrl, savedAnon, {
        auth: {
          storage: AsyncStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      });
      return supabaseInstance;
    }
  } catch (error) {
    console.error('Failed to initialize Supabase from storage:', error);
  }
  return null;
}

export function getSupabase(): SupabaseClient | null {
  return supabaseInstance;
}

export async function setSupabaseCredentials(url: string, anonKey: string): Promise<boolean> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY_URL, url.trim());
    await AsyncStorage.setItem(STORAGE_KEY_ANON, anonKey.trim());
    currentSupabaseUrl = url.trim();
    currentSupabaseAnon = anonKey.trim();

    supabaseInstance = createClient(currentSupabaseUrl, currentSupabaseAnon, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
    return true;
  } catch (err) {
    console.error('Error saving Supabase credentials:', err);
    return false;
  }
}

export async function setBackendUrl(url: string): Promise<void> {
  currentBackendUrl = url.trim();
  await AsyncStorage.setItem(STORAGE_KEY_BACKEND, currentBackendUrl);
}

export function getBackendUrl(): string {
  return currentBackendUrl;
}

export function getSupabaseConfig(): { url: string; anon: string; isConfigured: boolean } {
  return {
    url: currentSupabaseUrl,
    anon: currentSupabaseAnon,
    isConfigured: Boolean(supabaseInstance && currentSupabaseUrl && currentSupabaseAnon),
  };
}
