import { createClient } from "@supabase/supabase-js";
import { createResilientAuthStorage } from "./authStorage.js";
import { createSupabaseFetch } from "./supabaseFetch.js";

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const authStorage = createResilientAuthStorage();

export const isSupabaseConfigured = Boolean(url && publishableKey);

export const supabase = isSupabaseConfigured
  ? createClient(url, publishableKey, {
      global: {
        fetch: createSupabaseFetch(),
      },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        ...(authStorage ? { storage: authStorage } : {}),
      },
    })
  : null;
