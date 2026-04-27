const DB_NAME = 'snapaudit-photo-store';
const DB_VERSION = 1;
const STORE_NAME = 'photoImageData';

const photoKey = (userId: string, photoId: string) => `${userId}:${photoId}`;

let dbPromise: Promise<IDBDatabase> | null = null;

export const isPhotoStoreAvailable = () =>
  typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';

const openPhotoDb = () => {
  if (!isPhotoStoreAvailable()) {
    return Promise.reject(new Error('IndexedDB is not available'));
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open photo store'));
    request.onblocked = () => reject(new Error('Photo store upgrade blocked'));
  });

  return dbPromise;
};

const runTransaction = async <T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T> | void
) => {
  const db = await openPhotoDb();

  return new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const request = run(store);
    let value: T | undefined;

    if (request) {
      request.onsuccess = () => {
        value = request.result;
      };
      request.onerror = () => reject(request.error ?? new Error('Photo store request failed'));
    }

    tx.oncomplete = () => resolve(value);
    tx.onerror = () => reject(tx.error ?? new Error('Photo store transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('Photo store transaction aborted'));
  });
};

export const savePhotoImageData = async (userId: string, photoId: string, imageData: string) => {
  await runTransaction('readwrite', (store) => store.put(imageData, photoKey(userId, photoId)));
};

export const loadPhotoImageData = async (userId: string, photoId: string) => {
  const result = await runTransaction<string>('readonly', (store) => store.get(photoKey(userId, photoId)));
  return typeof result === 'string' ? result : null;
};

export const deletePhotoImageData = async (userId: string, photoId: string) => {
  await runTransaction('readwrite', (store) => store.delete(photoKey(userId, photoId)));
};

export const deletePhotoImageDataMany = async (userId: string, photoIds: string[]) => {
  if (photoIds.length === 0) return;
  const db = await openPhotoDb();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    for (const id of photoIds) {
      store.delete(photoKey(userId, id));
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Failed to delete photo images'));
    tx.onabort = () => reject(tx.error ?? new Error('Photo image deletion aborted'));
  });
};

export const clearUserPhotoImageData = async (userId: string) => {
  const db = await openPhotoDb();
  const prefix = `${userId}:`;

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.openCursor();

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;

      if (typeof cursor.key === 'string' && cursor.key.startsWith(prefix)) {
        cursor.delete();
      }
      cursor.continue();
    };
    request.onerror = () => reject(request.error ?? new Error('Failed to clear photo images'));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Failed to clear photo images'));
    tx.onabort = () => reject(tx.error ?? new Error('Photo image clear aborted'));
  });
};
