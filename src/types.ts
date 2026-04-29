export type Tag = 
  | 'Product'
  | 'Product Procedures'
  | 'Food Safety'
  | 'Shelf Life'
  | 'Cleanliness'
  | 'Repairs'
  | 'Brand Image'
  | 'Brand Safety'
  | 'Other';

export type UserRole = 'admin' | 'auditor';

export interface UserProfile {
  id: string;
  role: UserRole;
  fullName: string | null;
  isHidden: boolean;
  createdAt: number;
}

export interface Location {
  id: string;
  name: string;
}

export interface UserLocationAssignment {
  userId: string;
  locationId: string;
}

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
  locationId?: string;
  createdAt: number;
}

export type View = 'home' | 'session' | 'photo-edit' | 'report' | 'history';
