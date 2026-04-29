import { useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { isTestAuthEnabled, TEST_USER_ID } from '../lib/runtimeFlags';
import type { UserProfile } from '../types';

type ProfileRow = {
  id: string;
  role: UserProfile['role'];
  full_name: string | null;
  created_at: string;
};

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
  const [profile, setProfile] = useState<UserProfile | null>(() => (
    isTestAuthEnabled()
      ? {
          id: TEST_USER_ID,
          role: 'admin',
          fullName: 'Test User',
          createdAt: 0,
        }
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

  useEffect(() => {
    if (isTestAuthEnabled()) {
      setProfile({
        id: TEST_USER_ID,
        role: 'admin',
        fullName: 'Test User',
        createdAt: 0,
      });
      return;
    }

    if (!user) {
      setProfile(null);
      return;
    }

    let isMounted = true;

    supabase
      .from('profiles')
      .select('id, role, full_name, created_at')
      .eq('id', user.id)
      .single()
      .then(({ data, error }) => {
        if (!isMounted) return;

        if (error || !data) {
          setProfile(null);
          return;
        }

        const profileRow = data as ProfileRow;
        setProfile({
          id: profileRow.id,
          role: profileRow.role,
          fullName: profileRow.full_name,
          createdAt: new Date(profileRow.created_at).getTime(),
        });
      });

    return () => {
      isMounted = false;
    };
  }, [user]);

  return { session, user, profile, isLoading };
}
