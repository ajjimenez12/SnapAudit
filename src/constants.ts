import { Tag } from './types';

export const PRESET_TAGS: Tag[] = [
  'Product',
  'TM Image',
  'Cleanliness',
  'Safety Concern',
  'Repair',
  'Shelf Life',
  'Communication'
];

export const STORAGE_KEYS = {
  SESSIONS: 'snapaudit_sessions',
  PHOTOS: 'snapaudit_photos',
  CURRENT_SESSION_ID: 'snapaudit_current_session_id',
  STORES: 'snapaudit_stores'
};

export const DEFAULT_STORES = [
  '1851', '1852', '1853', '1859', '1860', '1861', '1862', '1875', 
  '1881', '1932', '1962', '1979', '1981', '1983', '7356', '7378'
];
