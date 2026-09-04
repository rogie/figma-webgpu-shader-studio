import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { reclaimRegenerableStorage } from "../lib/authStorage.js";
import { isSupabaseConfigured, supabase } from "../lib/supabase.js";
import { beginFigmaOAuth } from "../services/figmaShaders.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!supabase) return;

    let active = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) console.error(error);
      setSession(data.session ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      // Token refresh on tab focus must not replace the user object identity —
      // several effects (library thumbnails, drafts) key off `user` and would
      // refetch / remount as if the session were new.
      setSession((previous) => {
        if (
          event === "TOKEN_REFRESHED" &&
          previous?.user?.id &&
          previous.user.id === nextSession?.user?.id
        ) {
          return { ...nextSession, user: previous.user };
        }
        return nextSession;
      });
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const sendMagicLink = useCallback(async (email) => {
    if (!supabase) throw new Error("Supabase is not configured.");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}`,
      },
    });
    if (error) throw error;
  }, []);

  const signInWithGitHub = useCallback(async () => {
    if (!supabase) throw new Error("Supabase is not configured.");
    reclaimRegenerableStorage();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}`,
      },
    });
    if (error) throw error;
  }, []);

  const signInWithFigma = useCallback(async () => {
    if (!supabase) throw new Error("Supabase is not configured.");
    await beginFigmaOAuth({ intent: "signin" });
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      configured: isSupabaseConfigured,
      sendMagicLink,
      signInWithFigma,
      signInWithGitHub,
      signOut,
    }),
    [session, loading, sendMagicLink, signInWithFigma, signInWithGitHub, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider.");
  return value;
}
