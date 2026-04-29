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
  const [assignedLocationIds, setAssignedLocationIds] = useState<string[]>([]);
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
      setAssignedLocationIds([]);
      return;
    }

    if (!user) {
      setProfile(null);
      setAssignedLocationIds([]);
      return;
    }

    let isMounted = true;

    const ensureProfile = async () => {
      const profileResult = await supabase
        .from('profiles')
        .select('id, role, full_name, created_at')
        .eq('id', user.id)
        .maybeSingle();

      if (!isMounted) return;

      if (profileResult.error) {
        setProfile(null);
        return;
      }

      if (profileResult.data) {
        const profileRow = profileResult.data as ProfileRow;
        setProfile({
          id: profileRow.id,
          role: profileRow.role,
          fullName: profileRow.full_name,
          createdAt: new Date(profileRow.created_at).getTime(),
        });
        return;
      }

      const metadataFullName = typeof user.user_metadata?.full_name === 'string'
        ? user.user_metadata.full_name.trim() || null
        : null;

      const upsertResult = await supabase
        .from('profiles')
        .upsert(
          {
            id: user.id,
            role: 'auditor',
            full_name: metadataFullName,
          },
          { onConflict: 'id' }
        )
        .select('id, role, full_name, created_at')
        .single();

      if (!isMounted) return;

      if (upsertResult.error || !upsertResult.data) {
        setProfile(null);
        return;
      }

      const profileRow = upsertResult.data as ProfileRow;
      setProfile({
        id: profileRow.id,
        role: profileRow.role,
        fullName: profileRow.full_name,
        createdAt: new Date(profileRow.created_at).getTime(),
      });
    };

    void ensureProfile();

    return () => {
      isMounted = false;
    };
  }, [user]);

  useEffect(() => {
    if (isTestAuthEnabled()) {
      setAssignedLocationIds([]);
      return;
    }

    if (!user) {
      setAssignedLocationIds([]);
      return;
    }

    let isMounted = true;

    supabase
      .from('user_locations')
      .select('location_id')
      .eq('user_id', user.id)
      .then(({ data, error }) => {
        if (!isMounted) return;
        if (error || !data) {
          setAssignedLocationIds([]);
          return;
        }

        setAssignedLocationIds(
          data
            .map((row) => row.location_id)
            .filter((locationId): locationId is string => typeof locationId === 'string')
        );
      });

    return () => {
      isMounted = false;
    };
  }, [user]);

  return { session, user, profile, assignedLocationIds, isLoading };
}
