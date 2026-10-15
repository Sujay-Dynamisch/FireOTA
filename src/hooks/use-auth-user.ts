import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

/**
 * The signed-in Supabase user on public pages, kept in sync across tabs and token refreshes.
 * `loading` is true until the stored session has been read, so pages can avoid flashing
 * "Sign in" to someone who is already signed in.
 */
export function useAuthUser() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const toUser = (u: { id: string; email?: string; user_metadata?: Record<string, unknown> } | null | undefined) => {
      if (!u) return null;
      const meta = u.user_metadata ?? {};
      const email = u.email ?? "";
      return {
        id: u.id,
        email,
        name: String(meta["full_name"] ?? meta["name"] ?? email.split("@")[0] ?? ""),
        avatarUrl: (meta["avatar_url"] ?? meta["picture"] ?? null) as string | null,
      };
    };
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setUser(toUser(data.session?.user));
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(toUser(session?.user));
      setLoading(false);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return { user, loading };
}
