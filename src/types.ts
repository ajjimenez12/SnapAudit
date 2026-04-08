export type Tag = 
  | 'Product'
  | 'TM Image'
  | 'Cleanliness'
  | 'Safety Concern'
  | 'Repair'
  | 'Shelf Life'
  | 'Communication';

export interface PhotoEntry {
  id: string;
  sessionId: string;
  imageData?: string; // data URL (optional once uploaded)
  storagePath?: string; // Supabase Storage path (e.g. "<uid>/<photoId>.jpg")
  tag: Tag;
  comment: string;
  createdAt: number;
  synced?: boolean;
}

export interface Session {
  id: string;
  title: string;
  location?: string;
  createdAt: number;
}

export type View = 'home' | 'session' | 'photo-edit' | 'report' | 'history';
