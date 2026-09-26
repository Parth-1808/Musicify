import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const STORAGE_KEY_URL = 'MUSIFY_SUPABASE_URL';
const STORAGE_KEY_ANON = 'MUSIFY_SUPABASE_ANON_KEY';
const STORAGE_KEY_BACKEND = 'MUSIFY_BACKEND_URL';

// 1. Read directly from Environment Variables (.env)
export const ENV_SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://bqerkiosvweccpkklwfv.supabase.co';
export const ENV_SUPABASE_ANON =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxZXJraW9zdndlY2Nwa2tsd2Z2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzNTk5NTMsImV4cCI6MjEwNTkzNTk1M30.CwWf1Vz-ThJR_enejWXZh-PzD5uunUNWJjQKpZt6YQE';
export const ENV_BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8000';

let supabaseInstance: SupabaseClient | null = null;
let currentSupabaseUrl = ENV_SUPABASE_URL;
let currentSupabaseAnon = ENV_SUPABASE_ANON;
let currentBackendUrl = ENV_BACKEND_URL;

// Eagerly initialize if env vars are present
if (currentSupabaseUrl && currentSupabaseAnon) {
  try {
    supabaseInstance = createClient(currentSupabaseUrl, currentSupabaseAnon, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  } catch (err) {
    console.warn('Initial Supabase client creation error:', err);
  }
}

export async function initSupabase(): Promise<SupabaseClient | null> {
  try {
    // If already created from env, return it
    if (supabaseInstance) {
      return supabaseInstance;
    }

    // Check storage or fallback to env
    const savedUrl = (await AsyncStorage.getItem(STORAGE_KEY_URL)) || ENV_SUPABASE_URL;
    const savedAnon = (await AsyncStorage.getItem(STORAGE_KEY_ANON)) || ENV_SUPABASE_ANON;
    const savedBackend = (await AsyncStorage.getItem(STORAGE_KEY_BACKEND)) || ENV_BACKEND_URL;

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
