import { Tag } from './types';

export const PRESET_TAGS: Tag[] = [
  'Other',
  'Product',
  'Product Procedures',
  'Food Safety',
  'Shelf Life',
  'Cleanliness',
  'Repairs',
  'Brand Image',
  'Brand Safety',
];

export const STORAGE_KEYS = {
  SESSIONS: 'snapaudit_sessions',
  PHOTOS: 'snapaudit_photos',
  CURRENT_SESSION_ID: 'snapaudit_current_session_id',
  STORES: 'snapaudit_stores',
  DELETED_SESSIONS: 'snapaudit_deleted_sessions',
  HISTORY_FILTER: 'snapaudit_history_filter',
  SIGNED_URLS: 'snapaudit_signed_urls',
};

export const DEFAULT_STORES = [
  '1851', '1852', '1853', '1859', '1860', '1861', '1862', '1875', 
  '1881', '1932', '1962', '1979', '1981', '1983', '7356', '7378'
];

export const HAPTIC = {
  BUTTON_PRESS: 40,
  CARD_SWIPE: 50,
  NEW_SESSION: 70,
  SUCCESS: 30,
  LIGHT: 20,
  MEDIUM: 50,
  HEAVY: 60,
  DELETE: [50, 50, 50] as [number, number, number],
  LONG: 100
} as const;

export const TIMING = {
  TOAST_DURATION: 3000,
  BLOB_URL_REVOKE: 5000,
  SYNC_DELAY: 2000,
  PREFETCH_LIMIT: 50
} as const;

export const CACHE = {
  MAX_PHOTO_BLOB_ENTRIES: 40,
  URL_CACHE_EXPIRY: 3600000
} as const;

export const PAGINATION = {
  SESSIONS_LIMIT: 500,
  PHOTOS_LIMIT: 2000
} as const;

// Number of sessions shown on the home page that keep imageData locally.
export const HOME_SESSION_COUNT = 5;

// Signed URL lifetime in seconds (12 hours, matching Supabase token TTL).
export const SIGNED_URL_TTL_SECONDS = 60 * 60 * 12;

export const DATE_FORMAT = {
  SESSION_TITLE: 'yyyy/MM/dd - XXXX'
} as const;
