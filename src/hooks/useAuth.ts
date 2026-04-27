import { useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { isTestAuthEnabled, TEST_USER_ID } from '../lib/runtimeFlags';

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(() => (
    isTestAuthEnabled()
      ? ({
          id: TEST_USER_ID,
          email: 'test@snapaudit.local',
          app_metadata: {},
          user_metadata: {},
          aud: 'authenticated',
          created_at: new Date(0).toISOString(),
        } as User)
      : null
  ));
  const [isLoading, setIsLoading] = useState(() => !isTestAuthEnabled());

  useEffect(() => {
    if (isTestAuthEnabled()) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!isMounted) return;
        setSession(data.session ?? null);
        setUser(data.session?.user ?? null);
      })
      .finally(() => {
        if (!isMounted) return;
        setIsLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { session, user, isLoading };
}
