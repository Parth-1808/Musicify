import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Session } from '@supabase/supabase-js';
import {
  initSupabase,
  getSupabase,
  setSupabaseCredentials,
  getSupabaseConfig,
} from '../config/supabase';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isConfigured: boolean;
  isGuest: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string) => Promise<{ error?: string; user?: User }>;
  signOut: () => Promise<void>;
  continueAsGuest: () => void;
  updateCredentials: (url: string, anonKey: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isConfigured, setIsConfigured] = useState(false);
  const [isGuest, setIsGuest] = useState(false);

  useEffect(() => {
    bootstrapAuth();
  }, []);

  const bootstrapAuth = async () => {
    try {
      const client = await initSupabase();
      const config = getSupabaseConfig();
      setIsConfigured(config.isConfigured);

      if (client) {
        const { data } = await client.auth.getSession();
        setSession(data.session);
        setUser(data.session?.user ?? null);

        client.auth.onAuthStateChange((_event, newSession) => {
          setSession(newSession);
          setUser(newSession?.user ?? null);
        });
      }
    } catch (err) {
      console.error('Auth initialization error:', err);
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    const supabase = getSupabase();
    if (!supabase) {
      return { error: 'Supabase credentials are not configured yet. Set them in Settings.' };
    }
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      return { error: error.message };
    }
    setSession(data.session);
    setUser(data.user);
    setIsGuest(false);
    return {};
  };

  const signUp = async (email: string, password: string) => {
    const supabase = getSupabase();
    if (!supabase) {
      return { error: 'Supabase is not configured yet.' };
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });
    if (error) {
      return { error: error.message };
    }
    if (data.session) {
      setSession(data.session);
      setUser(data.user);
    }
    setIsGuest(false);
    return { user: data.user ?? undefined };
  };

  const signOut = async () => {
    const supabase = getSupabase();
    if (supabase) {
      await supabase.auth.signOut();
    }
    setSession(null);
    setUser(null);
    setIsGuest(false);
  };

  const continueAsGuest = () => {
    setIsGuest(true);
  };

  const updateCredentials = async (url: string, anonKey: string) => {
    const success = await setSupabaseCredentials(url, anonKey);
    if (success) {
      setIsConfigured(true);
      await bootstrapAuth();
    }
    return success;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        isConfigured,
        isGuest,
        signIn,
        signUp,
        signOut,
        continueAsGuest,
        updateCredentials,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
