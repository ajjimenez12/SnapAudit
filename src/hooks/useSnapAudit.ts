import { useState, useEffect, useCallback } from 'react';
import { Session, PhotoEntry, Tag, Location } from '../types';
import { STORAGE_KEYS, DEFAULT_STORES } from '../constants';
import { supabase } from '../lib/supabaseClient';
import {
  clearUserPhotoImageData,
  deletePhotoImageData,
  deletePhotoImageDataMany,
  isPhotoStoreAvailable,
  loadPhotoImageData,
  savePhotoImageData,
} from '../utils/photoStore';

const isLocalStorageAvailable = () => {
  try {
    const test = '__storage_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch (e) {
    return false;
  }
};

const stripPhotoImageData = (photo: PhotoEntry): PhotoEntry => {
  if (!isPhotoStoreAvailable()) return photo;
  const { imageData, ...metadata } = photo;
  return metadata;
};

const persistPhotoImageData = (userId: string | null, photoId: string, imageData?: string) => {
  if (!userId || !imageData || !isPhotoStoreAvailable()) return;
  void savePhotoImageData(userId, photoId, imageData).catch((e) => {
    console.error('Failed to save photo image data to IndexedDB', e);
  });
};

const removePhotoImageData = (userId: string | null, photoId: string) => {
  if (!userId || !isPhotoStoreAvailable()) return;
  void deletePhotoImageData(userId, photoId).catch((e) => {
    console.error('Failed to delete photo image data from IndexedDB', e);
  });
};

export function useSnapAudit() {
  const storageKey = useCallback((key: string, userId?: string) => {
    if (!userId) return key;
    return `${key}:${userId}`;
  }, []);

  const [isStorageAvailable] = useState(() => isLocalStorageAvailable());
  const [activeUserId, setActiveUserId] = useState<string | null>(null);

  const [sessions, setSessions] = useState<Session[]>(() => {
    return [];
  });

  const [photos, setPhotos] = useState<PhotoEntry[]>(() => {
    return [];
  });

  const [deletedSessionIds, setDeletedSessionIds] = useState<string[]>(() => {
    return [];
  });

  const [currentSessionId, setCurrentSessionId] = useState<string | null>(() => {
    return null;
  });

  const [stores, setStores] = useState<string[]>(() => {
    if (!isLocalStorageAvailable()) return DEFAULT_STORES;
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.STORES);
      const parsed = saved ? JSON.parse(saved) : DEFAULT_STORES;
      return Array.isArray(parsed) ? parsed : DEFAULT_STORES;
    } catch (e) {
      return DEFAULT_STORES;
    }
  });

  const [storageError, setStorageError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [locations, setLocations] = useState<Location[]>([]);

  // Persist sessions
  useEffect(() => {
    if (isStorageAvailable && activeUserId) {
      try {
        localStorage.setItem(storageKey(STORAGE_KEYS.SESSIONS, activeUserId), JSON.stringify(sessions));
        setStorageError(null);
      } catch (e) {
        console.error('Failed to save sessions to localStorage', e);
        setStorageError('Storage quota exceeded. Please delete some old sessions or photos.');
      }
    }
  }, [sessions, isStorageAvailable, activeUserId, storageKey]);

  // Persist photos
  useEffect(() => {
    if (isStorageAvailable && activeUserId) {
      try {
        localStorage.setItem(
          storageKey(STORAGE_KEYS.PHOTOS, activeUserId),
          JSON.stringify(photos.map(stripPhotoImageData))
        );
        setStorageError(null);
      } catch (e) {
        console.error('Failed to save photos to localStorage', e);
        if (e instanceof Error && e.name === 'QuotaExceededError') {
          setStorageError('Storage quota exceeded. Please delete some old sessions or photos.');
        } else {
          setStorageError('Failed to save data to storage.');
        }
      }
    }
  }, [photos, isStorageAvailable, activeUserId, storageKey]);

  // Persist deleted sessions (tombstones) to prevent remote re-adding them.
  useEffect(() => {
    if (isStorageAvailable && activeUserId) {
      try {
        localStorage.setItem(
          storageKey(STORAGE_KEYS.DELETED_SESSIONS, activeUserId),
          JSON.stringify(deletedSessionIds)
        );
      } catch (e) {
        console.error('Failed to save deleted sessions to localStorage', e);
      }
    }
  }, [deletedSessionIds, isStorageAvailable, activeUserId, storageKey]);

  // Persist current session ID
  useEffect(() => {
    if (isStorageAvailable && activeUserId) {
      if (currentSessionId) {
        localStorage.setItem(storageKey(STORAGE_KEYS.CURRENT_SESSION_ID, activeUserId), currentSessionId);
      } else {
        localStorage.removeItem(storageKey(STORAGE_KEYS.CURRENT_SESSION_ID, activeUserId));
      }
    }
  }, [currentSessionId, isStorageAvailable, activeUserId, storageKey]);

  // Persist stores
  useEffect(() => {
    if (isStorageAvailable) {
      localStorage.setItem(STORAGE_KEYS.STORES, JSON.stringify(stores));
    }
  }, [stores, isStorageAvailable]);

  const createSession = useCallback((title: string, location?: string) => {
    const newSession: Session = {
      id: (globalThis.crypto as any)?.randomUUID?.() ?? (Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)),
      title,
      location,
      createdAt: Date.now(),
    };
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
    return newSession;
  }, []);

  const deleteSession = useCallback((id: string) => {
    setDeletedSessionIds(prev => (prev.includes(id) ? prev : [id, ...prev].slice(0, 500)));
    setSessions(prev => prev.filter(s => s.id !== id));
    setPhotos(prev => {
      const removedIds = prev.filter(p => p.sessionId === id).map(p => p.id);
      if (activeUserId && isPhotoStoreAvailable()) {
        void deletePhotoImageDataMany(activeUserId, removedIds).catch((e) => {
          console.error('Failed to delete session photo image data from IndexedDB', e);
        });
      }
      return prev.filter(p => p.sessionId !== id);
    });
    if (currentSessionId === id) {
      setCurrentSessionId(null);
    }
  }, [activeUserId, currentSessionId]);

  const addPhoto = useCallback((sessionId: string, imageData: string, tag: Tag, comment: string) => {
    const newPhoto: PhotoEntry = {
      id: (globalThis.crypto as any)?.randomUUID?.() ?? (Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)),
      sessionId,
      imageData,
      tag,
      comment,
      createdAt: Date.now(),
      synced: false,
    };
    persistPhotoImageData(activeUserId, newPhoto.id, imageData);
    setPhotos(prev => [newPhoto, ...prev]);
    return newPhoto;
  }, [activeUserId]);

  const markAsSynced = useCallback((photoId: string) => {
    setPhotos(prev => prev.map(p => p.id === photoId ? { ...p, synced: true } : p));
  }, []);

  const updatePhoto = useCallback((photoId: string, updates: Partial<Pick<PhotoEntry, 'tag' | 'comment' | 'imageData' | 'storagePath' | 'synced'>>) => {
    if (updates.imageData) {
      persistPhotoImageData(activeUserId, photoId, updates.imageData);
    } else if (updates.imageData === undefined && updates.synced && updates.storagePath) {
      removePhotoImageData(activeUserId, photoId);
    }
    setPhotos(prev => prev.map(p => p.id === photoId ? { ...p, ...updates } : p));
  }, [activeUserId]);

  const deletePhoto = useCallback((photoId: string) => {
    removePhotoImageData(activeUserId, photoId);
    setPhotos(prev => prev.filter(p => p.id !== photoId));
  }, [activeUserId]);

  const getSessionPhotos = useCallback((sessionId: string) => {
    return photos.filter(p => p.sessionId === sessionId).sort((a, b) => b.createdAt - a.createdAt);
  }, [photos]);

  const addStore = useCallback((storeNumber: string) => {
    setStores(prev => (prev.includes(storeNumber) ? prev : [...prev, storeNumber].sort()));
  }, []);

  const clearAllData = useCallback(() => {
    setSessions([]);
    setPhotos([]);
    setStores(DEFAULT_STORES);
    setCurrentSessionId(null);
    setDeletedSessionIds([]);
    if (isStorageAvailable) {
      if (activeUserId) {
        localStorage.removeItem(storageKey(STORAGE_KEYS.SESSIONS, activeUserId));
        localStorage.removeItem(storageKey(STORAGE_KEYS.PHOTOS, activeUserId));
        localStorage.removeItem(storageKey(STORAGE_KEYS.CURRENT_SESSION_ID, activeUserId));
        localStorage.removeItem(storageKey(STORAGE_KEYS.DELETED_SESSIONS, activeUserId));
        if (isPhotoStoreAvailable()) {
          void clearUserPhotoImageData(activeUserId).catch((e) => {
            console.error('Failed to clear user photo image data from IndexedDB', e);
          });
        }
      }
    }
  }, [isStorageAvailable, activeUserId, storageKey]);

  const clearPhotos = useCallback(() => {
    setPhotos([]);
    if (isStorageAvailable && activeUserId) {
      localStorage.removeItem(storageKey(STORAGE_KEYS.PHOTOS, activeUserId));
    }
    if (activeUserId && isPhotoStoreAvailable()) {
      void clearUserPhotoImageData(activeUserId).catch((e) => {
        console.error('Failed to clear photo image data from IndexedDB', e);
      });
    }
  }, [isStorageAvailable, activeUserId, storageKey]);

  const setUserScope = useCallback((userId: string | null) => {
    setActiveUserId(userId);
    if (!isStorageAvailable) return;
    if (!userId) {
      setSessions([]);
      setPhotos([]);
      setCurrentSessionId(null);
      setDeletedSessionIds([]);
      return;
    }

    try {
      const savedSessions = localStorage.getItem(storageKey(STORAGE_KEYS.SESSIONS, userId));
      const parsedSessions = savedSessions ? JSON.parse(savedSessions) : [];
      setSessions(Array.isArray(parsedSessions) ? parsedSessions : []);
    } catch {
      setSessions([]);
    }

    try {
      const savedPhotos = localStorage.getItem(storageKey(STORAGE_KEYS.PHOTOS, userId));
      const parsedPhotos = savedPhotos ? JSON.parse(savedPhotos) : [];
      const nextPhotos = Array.isArray(parsedPhotos) ? parsedPhotos : [];
      setPhotos(nextPhotos);
      if (isPhotoStoreAvailable()) {
        void (async () => {
          await Promise.all(nextPhotos.map(async (photo: PhotoEntry) => {
            if (photo.imageData) {
              await savePhotoImageData(userId, photo.id, photo.imageData);
              return;
            }

            const imageData = await loadPhotoImageData(userId, photo.id);
            if (!imageData) return;
            setPhotos(prev => prev.map(p => p.id === photo.id && !p.imageData ? { ...p, imageData } : p));
          }));
        })().catch((e) => {
          console.error('Failed to hydrate photo image data from IndexedDB', e);
        });
      }
    } catch {
      setPhotos([]);
    }

    try {
      const savedDeleted = localStorage.getItem(storageKey(STORAGE_KEYS.DELETED_SESSIONS, userId));
      const parsedDeleted = savedDeleted ? JSON.parse(savedDeleted) : [];
      setDeletedSessionIds(Array.isArray(parsedDeleted) ? parsedDeleted : []);
    } catch {
      setDeletedSessionIds([]);
    }

    setCurrentSessionId(localStorage.getItem(storageKey(STORAGE_KEYS.CURRENT_SESSION_ID, userId)));
  }, [isStorageAvailable, storageKey]);

  const mergeRemote = useCallback((remoteSessions: Session[], remotePhotos: PhotoEntry[]) => {
    const deleted = new Set(deletedSessionIds);
    setSessions(prev => {
      const byId = new Map<string, Session>();
      for (const s of remoteSessions) {
        if (!deleted.has(s.id)) byId.set(s.id, s);
      }
      for (const s of prev) {
        if (!deleted.has(s.id)) byId.set(s.id, byId.get(s.id) ?? s);
      }
      return Array.from(byId.values()).sort((a, b) => b.createdAt - a.createdAt);
    });
    setPhotos(prev => {
      const byId = new Map<string, PhotoEntry>();
      for (const p of remotePhotos) {
        if (!deleted.has(p.sessionId)) byId.set(p.id, p);
      }
      for (const p of prev) {
        if (deleted.has(p.sessionId)) continue;
        const existing = byId.get(p.id);
        if (!existing) {
          byId.set(p.id, p);
        } else {
          byId.set(p.id, {
            ...existing,
            ...p,
            imageData: p.imageData ?? existing.imageData,
            storagePath: existing.storagePath ?? p.storagePath,
            synced: (existing.synced ?? false) || (p.synced ?? false),
          });
        }
      }
      return Array.from(byId.values()).sort((a, b) => b.createdAt - a.createdAt);
    });
  }, [deletedSessionIds]);

  const loadLocations = useCallback(async () => {
    const { data, error } = await supabase
      .from('locations')
      .select('id, name')
      .order('name', { ascending: true });

    if (error) {
      throw error;
    }

    setLocations((data ?? []) as Location[]);
  }, []);

  const addLocation = useCallback(async (name: string) => {
    const { error } = await supabase
      .from('locations')
      .insert({ name });

    if (error) {
      throw error;
    }

    await loadLocations();
  }, [loadLocations]);

  return {
    sessions,
    photos,
    currentSessionId,
    stores,
    storageError,
    setStorageError,
    isSyncing,
    setIsSyncing,
    setCurrentSessionId,
    setUserScope,
    mergeRemote,
    createSession,
    deleteSession,
    addPhoto,
    updatePhoto,
    deletePhoto,
    markAsSynced,
    getSessionPhotos,
    addStore,
    clearAllData,
    clearPhotos,
    locations,
    loadLocations,
    addLocation,
  };
}
