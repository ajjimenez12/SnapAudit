import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, MapPin, Shield, Trash2, UserRound, X } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import type { Location, UserLocationAssignment, UserRole } from '../types';

type AdminPanelProps = {
  onClose: () => void;
};

type TabKey = 'users' | 'locations' | 'assignments';

type ProfileListItem = {
  id: string;
  role: UserRole;
  fullName: string | null;
  email: string | null;
};

type AdminUserDirectoryRow = {
  id: string;
  role: UserRole;
  full_name: string | null;
  email: string | null;
};

type ProfileRow = {
  id: string;
  role: UserRole;
  full_name: string | null;
  is_hidden: boolean | null;
};

type UserLocationRow = {
  user_id: string;
  location_id: string;
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
  const [assignments, setAssignments] = useState<UserLocationAssignment[]>([]);
  const [isUsersLoading, setIsUsersLoading] = useState(true);
  const [isLocationsLoading, setIsLocationsLoading] = useState(true);
  const [isAssignmentsLoading, setIsAssignmentsLoading] = useState(true);
  const [isSavingLocation, setIsSavingLocation] = useState(false);
  const [deletingLocationId, setDeletingLocationId] = useState<string | null>(null);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [isSavingAssignments, setIsSavingAssignments] = useState(false);
  const [newLocationName, setNewLocationName] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [draftAssignmentIds, setDraftAssignmentIds] = useState<string[]>([]);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [locationsError, setLocationsError] = useState<string | null>(null);
  const [assignmentsError, setAssignmentsError] = useState<string | null>(null);

  const emptyStateCopy = useMemo(
    () => ({
      users: 'No users found.',
      locations: 'No locations added yet.',
      assignments: 'Select a user to manage assigned stores.',
    }),
    []
  );

  const loadUsers = async () => {
    setIsUsersLoading(true);
    setUsersError(null);

    const profileResult = await supabase
      .from('profiles')
      .select('id, role, full_name, is_hidden')
      .eq('is_hidden', false)
      .order('full_name', { ascending: true });

    if (profileResult.error) {
      setUsersError('Failed to load users.');
      setUsers([]);
      setIsUsersLoading(false);
      return;
    }

    const visibleProfiles = ((profileResult.data ?? []) as ProfileRow[])
      .filter((profile) => !profile.is_hidden);

    const directoryResult = await supabase
      .from('admin_user_directory')
      .select('id, role, full_name, email')
      .order('full_name', { ascending: true });

    const emailByUserId = new Map<string, string | null>();
    if (!directoryResult.error) {
      for (const profile of (directoryResult.data ?? []) as AdminUserDirectoryRow[]) {
        emailByUserId.set(profile.id, profile.email ?? null);
      }
    }

    setUsers(
      visibleProfiles.map((profile) => ({
        id: profile.id,
        role: profile.role,
        fullName: profile.full_name ?? null,
        email: emailByUserId.get(profile.id) ?? null,
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

  const loadAssignments = async () => {
    setIsAssignmentsLoading(true);
    setAssignmentsError(null);

    const { data, error } = await supabase
      .from('user_locations')
      .select('user_id, location_id');

    if (error) {
      setAssignmentsError('Failed to load user assignments.');
      setAssignments([]);
      setIsAssignmentsLoading(false);
      return;
    }

    setAssignments(
      ((data ?? []) as UserLocationRow[]).map((row) => ({
        userId: row.user_id,
        locationId: row.location_id,
      }))
    );
    setIsAssignmentsLoading(false);
  };

  useEffect(() => {
    void loadUsers();
    void loadLocations();
    void loadAssignments();
  }, []);

  useEffect(() => {
    if (selectedUserId && !users.some((user) => user.id === selectedUserId)) {
      setSelectedUserId(null);
      setDraftAssignmentIds([]);
    }
  }, [users, selectedUserId]);

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
      .insert({ id: name, name });

    if (error) {
      setLocationsError('Failed to add location.');
      setIsSavingLocation(false);
      return;
    }

    setNewLocationName('');
    await loadLocations();
    setIsSavingLocation(false);
  };

  const handleDeleteLocation = async (location: Location) => {
    const confirmed = window.confirm(
      `Delete location ${location.name}? Existing session records will keep their text location, but this store will be removed from the shared location list and user assignments.`
    );
    if (!confirmed) return;

    setDeletingLocationId(location.id);
    setLocationsError(null);

    const { error } = await supabase
      .from('locations')
      .delete()
      .eq('id', location.id);

    if (error) {
      setLocationsError('Failed to delete location.');
      setDeletingLocationId(null);
      return;
    }

    setLocations((prev) => prev.filter((item) => item.id !== location.id));
    setAssignments((prev) => prev.filter((assignment) => assignment.locationId !== location.id));
    setDeletingLocationId(null);
  };

  const openAssignmentsEditor = (userId: string) => {
    const currentAssignmentIds = assignments
      .filter((assignment) => assignment.userId === userId)
      .map((assignment) => assignment.locationId);

    setSelectedUserId(userId);
    setDraftAssignmentIds(currentAssignmentIds);
    setAssignmentsError(null);
  };

  const closeAssignmentsEditor = () => {
    if (isSavingAssignments) return;
    setSelectedUserId(null);
    setDraftAssignmentIds([]);
    setAssignmentsError(null);
  };

  const toggleDraftAssignment = (locationId: string) => {
    setDraftAssignmentIds((prev) => (
      prev.includes(locationId)
        ? prev.filter((id) => id !== locationId)
        : [...prev, locationId]
    ));
  };

  const handleSaveAssignments = async () => {
    if (!selectedUserId) return;

    setIsSavingAssignments(true);
    setAssignmentsError(null);

    const previousAssignments = assignments
      .filter((assignment) => assignment.userId === selectedUserId)
      .map((assignment) => assignment.locationId);

    const nextIds = new Set(draftAssignmentIds);
    const previousIds = new Set(previousAssignments);
    const idsToAdd = draftAssignmentIds.filter((locationId) => !previousIds.has(locationId));
    const idsToRemove = previousAssignments.filter((locationId) => !nextIds.has(locationId));

    const removeResult = idsToRemove.length === 0
      ? { error: null }
      : await supabase
          .from('user_locations')
          .delete()
          .eq('user_id', selectedUserId)
          .in('location_id', idsToRemove);

    if (removeResult.error) {
      setAssignmentsError('Failed to update store assignments.');
      setIsSavingAssignments(false);
      return;
    }

    const insertResult = idsToAdd.length === 0
      ? { error: null }
      : await supabase
          .from('user_locations')
          .insert(idsToAdd.map((locationId) => ({ user_id: selectedUserId, location_id: locationId })));

    if (insertResult.error) {
      setAssignmentsError('Failed to update store assignments.');
      setIsSavingAssignments(false);
      return;
    }

    setAssignments((prev) => {
      const retained = prev.filter((assignment) => assignment.userId !== selectedUserId);
      const nextAssignments = draftAssignmentIds.map((locationId) => ({
        userId: selectedUserId,
        locationId,
      }));
      return [...retained, ...nextAssignments];
    });

    setIsSavingAssignments(false);
    closeAssignmentsEditor();
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
                    {user.fullName || user.email || 'Unnamed'}
                  </p>
                  <span
                    className={`rounded-full border px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${roleBadgeClass(user.role)}`}
                  >
                    {user.role}
                  </span>
                </div>
                <p className="mt-1 truncate text-xs text-gray-500">{user.email || user.id}</p>
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
              onChange={(event) => setNewLocationName(event.target.value.replace(/\s+/g, '').slice(0, 8))}
              placeholder="Add a location id"
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
            {locations.map((location) => {
              const isDeleting = deletingLocationId === location.id;

              return (
                <div
                  key={location.id}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-white px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900">{location.name}</p>
                    <p className="mt-1 text-xs text-gray-500">{location.id}</p>
                  </div>
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={() => void handleDeleteLocation(location)}
                    className="shrink-0 rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="inline-flex items-center gap-2">
                      {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                      {isDeleting ? 'Deleting...' : 'Delete'}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderAssignmentsTab = () => {
    if (isUsersLoading || isLocationsLoading || isAssignmentsLoading) {
      return (
        <div className="flex items-center justify-center py-12 text-gray-500">
          <Loader2 size={20} className="mr-2 animate-spin" />
          <span>Loading assignments...</span>
        </div>
      );
    }

    const selectedUser = users.find((user) => user.id === selectedUserId) ?? null;
    const assignedLocationIds = new Set(draftAssignmentIds);

    return (
      <div className="space-y-4">
        <p className="text-xs font-black uppercase tracking-wider text-gray-400">Users</p>
        {users.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-500">
            {emptyStateCopy.users}
          </div>
        ) : (
          <div className="space-y-3">
            {users.map((user) => {
              const assignedCount = assignments.filter((assignment) => assignment.userId === user.id).length;

              return (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => openAssignmentsEditor(user.id)}
                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-left transition-colors hover:border-blue-200 hover:bg-blue-50/50"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-gray-900">
                        {user.fullName || user.email || 'Unnamed'}
                      </p>
                      <p className="mt-1 truncate text-xs text-gray-500">{user.email || user.id}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-gray-100 px-2 py-1 text-xs font-bold text-gray-600">
                      {assignedCount}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {!selectedUser && (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
            {emptyStateCopy.assignments}
          </div>
        )}

        {selectedUser && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
            <button
              type="button"
              aria-label="Close assignments"
              onClick={closeAssignmentsEditor}
              className="absolute inset-0 bg-black/45 backdrop-blur-sm"
            />

            <div className="relative z-10 flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl">
              <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-gray-400">Assigned Stores</p>
                  <h4 className="mt-1 text-lg font-semibold text-gray-900">
                    {selectedUser.fullName || selectedUser.email || 'Unnamed'}
                  </h4>
                  <p className="text-sm text-gray-500">
                    Select the stores for this user, then save or cancel.
                  </p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-5">
                {assignmentsError && (
                  <div className="mb-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                    {assignmentsError}
                  </div>
                )}

                {locations.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">
                    Add locations first before assigning them.
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {locations.map((location) => {
                      const isAssigned = assignedLocationIds.has(location.id);

                      return (
                        <button
                          key={location.id}
                          type="button"
                          disabled={isSavingAssignments}
                          onClick={() => toggleDraftAssignment(location.id)}
                          className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${
                            isAssigned
                              ? 'border-blue-200 bg-blue-50 text-blue-700'
                              : 'border-gray-200 bg-white text-gray-700 hover:border-blue-200 hover:bg-blue-50/50'
                          } disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                          <div className="min-w-0">
                            <p className="font-semibold">{location.name}</p>
                            <p className="mt-1 text-xs opacity-70">{location.id}</p>
                          </div>
                          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
                            isAssigned ? 'border-blue-200 bg-white' : 'border-gray-200 bg-gray-50'
                          }`}>
                            {isAssigned ? <Check size={14} /> : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="sticky bottom-0 flex justify-end gap-3 border-t border-gray-100 bg-white px-5 py-4 shadow-[0_-8px_20px_rgba(15,23,42,0.06)]">
                <button
                  type="button"
                  onClick={closeAssignmentsEditor}
                  disabled={isSavingAssignments}
                  className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveAssignments()}
                  disabled={isSavingAssignments}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSavingAssignments ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
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
            <p className="text-sm text-gray-500">Manage user roles, location data, and store assignments.</p>
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
          <div className="mx-auto max-w-5xl space-y-4">
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
                <button
                  type="button"
                  onClick={() => setActiveTab('assignments')}
                  className={tabButtonClass(activeTab === 'assignments')}
                >
                  <span className="inline-flex items-center gap-2">
                    <Shield size={16} />
                    Assignments
                  </span>
                </button>
              </div>
            </div>

            <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  {activeTab === 'users'
                    ? <Shield size={20} />
                    : activeTab === 'locations'
                      ? <MapPin size={20} />
                      : <UserRound size={20} />}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">
                    {activeTab === 'users'
                      ? 'User Roles'
                      : activeTab === 'locations'
                        ? 'Manage Locations'
                        : 'Store Assignments'}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {activeTab === 'users'
                      ? 'Review profiles and switch role access.'
                      : activeTab === 'locations'
                        ? 'Create and review the shared location list.'
                        : 'Assign store coverage to each user account.'}
                  </p>
                </div>
              </div>

              {activeTab === 'users'
                ? renderUsersTab()
                : activeTab === 'locations'
                  ? renderLocationsTab()
                  : renderAssignmentsTab()}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
