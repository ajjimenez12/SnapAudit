import { useEffect, useMemo, useState } from 'react';
import { Loader2, Shield, UserRound, MapPin, X } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import type { Location, UserRole } from '../types';

type AdminPanelProps = {
  onClose: () => void;
};

type TabKey = 'users' | 'locations';

type ProfileListItem = {
  id: string;
  role: UserRole;
  fullName: string | null;
};

const tabButtonClass = (isActive: boolean) =>
  `flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
    isActive
      ? 'bg-white text-blue-600 shadow-sm border border-gray-200'
      : 'text-gray-500 hover:text-gray-700'
  }`;

const roleBadgeClass = (role: UserRole) =>
  role === 'admin'
    ? 'bg-blue-50 text-blue-700 border-blue-100'
    : 'bg-gray-100 text-gray-700 border-gray-200';

export function AdminPanel({ onClose }: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('users');
  const [users, setUsers] = useState<ProfileListItem[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [isUsersLoading, setIsUsersLoading] = useState(true);
  const [isLocationsLoading, setIsLocationsLoading] = useState(true);
  const [isSavingLocation, setIsSavingLocation] = useState(false);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [newLocationName, setNewLocationName] = useState('');
  const [usersError, setUsersError] = useState<string | null>(null);
  const [locationsError, setLocationsError] = useState<string | null>(null);

  const emptyStateCopy = useMemo(() => ({
    users: 'No users found.',
    locations: 'No locations added yet.',
  }), []);

  const loadUsers = async () => {
    setIsUsersLoading(true);
    setUsersError(null);

    const { data, error } = await supabase
      .from('profiles')
      .select('id, role, full_name')
      .order('full_name', { ascending: true });

    if (error) {
      setUsersError('Failed to load users.');
      setUsers([]);
      setIsUsersLoading(false);
      return;
    }

    setUsers(
      (data ?? []).map((profile) => ({
        id: profile.id as string,
        role: profile.role as UserRole,
        fullName: (profile.full_name as string | null) ?? null,
      }))
    );
    setIsUsersLoading(false);
  };

  const loadLocations = async () => {
    setIsLocationsLoading(true);
    setLocationsError(null);

    const { data, error } = await supabase
      .from('locations')
      .select('id, name')
      .order('name', { ascending: true });

    if (error) {
      setLocationsError('Failed to load locations.');
      setLocations([]);
      setIsLocationsLoading(false);
      return;
    }

    setLocations((data ?? []) as Location[]);
    setIsLocationsLoading(false);
  };

  useEffect(() => {
    void loadUsers();
    void loadLocations();
  }, []);

  const toggleUserRole = async (user: ProfileListItem) => {
    const nextRole: UserRole = user.role === 'admin' ? 'auditor' : 'admin';
    setSavingUserId(user.id);
    setUsersError(null);

    const { error } = await supabase
      .from('profiles')
      .update({ role: nextRole })
      .eq('id', user.id);

    if (error) {
      setUsersError('Failed to update user role.');
      setSavingUserId(null);
      return;
    }

    setUsers((prev) =>
      prev.map((item) => (item.id === user.id ? { ...item, role: nextRole } : item))
    );
    setSavingUserId(null);
  };

  const handleAddLocation = async () => {
    const name = newLocationName.trim();
    if (!name) return;

    setIsSavingLocation(true);
    setLocationsError(null);

    const { error } = await supabase
      .from('locations')
      .insert({ name });

    if (error) {
      setLocationsError('Failed to add location.');
      setIsSavingLocation(false);
      return;
    }

    setNewLocationName('');
    await loadLocations();
    setIsSavingLocation(false);
  };

  const renderUsersTab = () => {
    if (isUsersLoading) {
      return (
        <div className="flex items-center justify-center py-12 text-gray-500">
          <Loader2 size={20} className="mr-2 animate-spin" />
          <span>Loading users...</span>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {usersError && (
          <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
            {usersError}
          </div>
        )}
        {users.length === 0 && (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">
            {emptyStateCopy.users}
          </div>
        )}
        {users.map((user) => {
          const isSaving = savingUserId === user.id;
          const nextRole = user.role === 'admin' ? 'auditor' : 'admin';

          return (
            <div
              key={user.id}
              className="flex items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-white p-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate font-semibold text-gray-900">
                    {user.fullName || 'Unnamed'}
                  </p>
                  <span
                    className={`rounded-full border px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${roleBadgeClass(user.role)}`}
                  >
                    {user.role}
                  </span>
                </div>
                <p className="mt-1 truncate text-xs text-gray-500">{user.id}</p>
              </div>

              <button
                type="button"
                disabled={isSaving}
                onClick={() => void toggleUserRole(user)}
                className="shrink-0 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:border-blue-300 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : `Make ${nextRole}`}
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  const renderLocationsTab = () => {
    if (isLocationsLoading) {
      return (
        <div className="flex items-center justify-center py-12 text-gray-500">
          <Loader2 size={20} className="mr-2 animate-spin" />
          <span>Loading locations...</span>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {locationsError && (
          <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
            {locationsError}
          </div>
        )}

        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              value={newLocationName}
              onChange={(event) => setNewLocationName(event.target.value)}
              placeholder="Add a new location"
              className="flex-1 rounded-xl border-2 border-gray-100 bg-white px-4 py-3 text-sm font-medium text-gray-900 outline-none transition-colors focus:border-blue-500"
            />
            <button
              type="button"
              disabled={isSavingLocation || !newLocationName.trim()}
              onClick={() => void handleAddLocation()}
              className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-200 transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            >
              {isSavingLocation ? 'Adding...' : 'Add Location'}
            </button>
          </div>
        </div>

        {locations.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">
            {emptyStateCopy.locations}
          </div>
        ) : (
          <div className="space-y-3">
            {locations.map((location) => (
              <div
                key={location.id}
                className="rounded-2xl border border-gray-200 bg-white px-4 py-3"
              >
                <p className="font-semibold text-gray-900">{location.name}</p>
                <p className="mt-1 text-xs text-gray-500">{location.id}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full w-full bg-gray-50 text-gray-900">
      <div className="flex h-full flex-col">
        <header className="flex items-center justify-between border-b border-gray-100 bg-white px-4 pb-4 pt-safe shadow-sm">
          <div>
            <h2 className="text-xl font-bold">Admin Panel</h2>
            <p className="text-sm text-gray-500">Manage user roles and location options.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close admin panel"
          >
            <X size={22} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="mx-auto max-w-3xl space-y-4">
            <div className="rounded-2xl border border-gray-100 bg-gray-100 p-1 shadow-sm">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setActiveTab('users')}
                  className={tabButtonClass(activeTab === 'users')}
                >
                  <span className="inline-flex items-center gap-2">
                    <UserRound size={16} />
                    Users
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('locations')}
                  className={tabButtonClass(activeTab === 'locations')}
                >
                  <span className="inline-flex items-center gap-2">
                    <MapPin size={16} />
                    Locations
                  </span>
                </button>
              </div>
            </div>

            <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  {activeTab === 'users' ? <Shield size={20} /> : <MapPin size={20} />}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">
                    {activeTab === 'users' ? 'User Roles' : 'Manage Locations'}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {activeTab === 'users'
                      ? 'Review profiles and switch role access.'
                      : 'Create and review the shared location list.'}
                  </p>
                </div>
              </div>

              {activeTab === 'users' ? renderUsersTab() : renderLocationsTab()}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
