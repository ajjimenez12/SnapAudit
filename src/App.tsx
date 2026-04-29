import React, { useState, useRef, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Camera, 
  Plus, 
  History, 
  ChevronLeft, 
  Image as ImageIcon, 
  Trash2, 
  FileText, 
  Share, 
  X,
  Check,
  MapPin,
  Calendar,
  Home,
  LayoutGrid,
  Settings,
  RefreshCw,
  Cloud,
  CloudOff,
  Upload,
  Download,
  Pencil,
  Sun,
  Moon,
  Filter,
  Search,
  ChevronDown,
  ZoomIn
} from 'lucide-react';
import { useSnapAudit } from './hooks/useSnapAudit';
import { useAuth } from './hooks/useAuth';
import { PRESET_TAGS, HAPTIC, TIMING, CACHE, PAGINATION, DATE_FORMAT, STORAGE_KEYS } from './constants';
import { Tag, PhotoEntry, Session, View } from './types';
import { resizeImage } from './utils/image';
import { MarkupEditor } from './components/MarkupEditor';
import { AdminPanel } from './components/AdminPanel';
import { supabase } from './lib/supabaseClient';
import { isTestAuthEnabled } from './lib/runtimeFlags';
import { dataUrlToBlob, blobToDataUrl } from './utils/dataUrl';
import { loadPhotoImageData } from './utils/photoStore';

// --- Helpers ---

type SignedUrlCacheEntry = {
  url?: string;
  expiresAt: number;
  promise?: Promise<string | null>;
};

type RemoteSessionRow = {
  id: string;
  title: string;
  location: string | null;
  created_at: string;
};

type RemotePhotoRow = {
  id: string;
  session_id: string;
  tag: string;
  comment: string | null;
  storage_path: string;
  created_at: string;
};

type SyncedPhotoRow = {
  id: string;
  user_id: string;
  session_id: string;
  tag: Tag;
  comment: string;
  storage_path: string;
  created_at: string;
};

const vibrate = (pattern: number | number[] = HAPTIC.CARD_SWIPE) => {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(pattern);
  }
};

const runWithConcurrency = async <T,>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<void>
) => {
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, limit), items.length);

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      await task(items[index], index);
    }
  }));
};

const fetchPagedRows = async <T,>(
  pageSize: number,
  buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
) => {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await buildQuery(from, to);
    if (error) throw error;

    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) break;

    from += pageSize;
  }

  return rows;
};

const isIosDevice = () => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const iOS = /iPad|iPhone|iPod/i.test(ua);
  const iPadOS = ua.includes('Macintosh') && typeof document !== 'undefined' && 'ontouchend' in document;
  return iOS || iPadOS;
};

// --- Components ---

const Button = ({ 
  children, 
  onClick, 
  variant = 'primary', 
  className = '', 
  disabled = false,
  fullWidth = false 
}: { 
  children: React.ReactNode, 
  onClick?: () => void, 
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline',
  className?: string,
  disabled?: boolean,
  fullWidth?: boolean
}) => {
  const baseStyles = "px-4 py-3 rounded-xl font-medium transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:active:scale-100";
  const variants = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-200 dark:shadow-none",
    secondary: "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700",
    danger: "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40",
    ghost: "bg-transparent text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800",
    outline: "bg-transparent border-2 border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-700"
  };

  return (
    <button 
      onClick={() => {
        if (variant === 'primary' || variant === 'danger') vibrate(HAPTIC.BUTTON_PRESS);
        onClick?.();
      }} 
      disabled={disabled}
      className={`${baseStyles} ${variants[variant]} ${fullWidth ? 'w-full' : ''} ${className}`}
    >
      {children}
    </button>
  );
};

const Card = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => (
  <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden ${className}`}>
    {children}
  </div>
);

const BottomNav = ({ 
  activeView, 
  setView, 
  onNewSession,
  hasActiveSession
}: { 
  activeView: string, 
  setView: (v: any) => void, 
  onNewSession: () => void,
  hasActiveSession: boolean
}) => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-t border-gray-100 dark:border-gray-800 flex justify-around items-center h-20 pb-safe z-50 px-6">
      <button 
        onClick={() => { vibrate(); setView('home'); }}
        className={`flex flex-col items-center gap-1 transition-all ${activeView === 'home' ? 'text-blue-600 scale-110' : 'text-gray-400 dark:text-gray-500'}`}
      >
        <Home size={24} />
        <span className="text-[10px] font-bold uppercase tracking-widest">Home</span>
      </button>
      
      <div className="relative -top-6">
        <button 
          onClick={() => { vibrate(HAPTIC.NEW_SESSION); onNewSession(); }}
          aria-label="New audit session"
          className="w-16 h-16 bg-blue-600 text-white rounded-full shadow-xl shadow-blue-200 dark:shadow-none flex items-center justify-center active:scale-90 transition-transform border-4 border-white dark:border-gray-900"
        >
          <Plus size={32} />
        </button>
      </div>

      <button 
        onClick={() => { 
          vibrate(); 
          setView('history');
        }}
        className={`flex flex-col items-center gap-1 transition-all ${activeView === 'history' ? 'text-blue-600 scale-110' : 'text-gray-400 dark:text-gray-500'}`}
      >
        <History size={24} />
        <span className="text-[10px] font-bold uppercase tracking-widest">History</span>
      </button>
    </nav>
  );
};

function AuthView() {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const signIn = async () => {
    setIsWorking(true);
    setError(null);
    setInfo(null);
    try {
      const { error: e } = await supabase.auth.signInWithPassword({ email, password });
      if (e) throw e;
    } catch (e: any) {
      setError(e?.message ?? 'Sign-in failed');
    } finally {
      setIsWorking(false);
    }
  };

  const signUp = async () => {
    setIsWorking(true);
    setError(null);
    setInfo(null);
    try {
      const { data, error: e } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName.trim(),
          },
        },
      });
      if (e) throw e;
      if (data.user && !data.session) {
        setInfo('Check your email to confirm your account, then come back and sign in.');
      }
    } catch (e: any) {
      setError(e?.message ?? 'Sign-up failed');
    } finally {
      setIsWorking(false);
    }
  };

  const switchMode = (nextMode: 'sign-in' | 'sign-up') => {
    setMode(nextMode);
    setError(null);
    setInfo(null);
    if (nextMode === 'sign-in') {
      setFullName('');
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      <header className="shrink-0 z-30 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-100 dark:border-gray-800 px-4 pt-safe pb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white">
            <Camera size={18} />
          </div>
          <h1 className="font-bold text-xl tracking-tight">SnapAudit</h1>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6 pb-32 max-w-md w-full mx-auto">
        <div className="mb-6 flex rounded-2xl border border-gray-100 bg-white p-1 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <button
            type="button"
            onClick={() => switchMode('sign-in')}
            className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
              mode === 'sign-in'
                ? 'bg-blue-600 text-white'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => switchMode('sign-up')}
            className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
              mode === 'sign-up'
                ? 'bg-blue-600 text-white'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            Sign up
          </button>
        </div>

        <h2 className="text-2xl font-black tracking-tight mb-2">
          {mode === 'sign-in' ? 'Sign in' : 'Create account'}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          {mode === 'sign-in'
            ? 'Use your email and password to access your assigned stores and audit history.'
            : 'Create a user account with your name, email, and password. Admins will handle role and store assignments.'}
        </p>

        {info && (
          <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/40 rounded-2xl">
            <p className="text-sm font-bold text-blue-700 dark:text-blue-300">{info}</p>
          </div>
        )}

        {error && (
          <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/40 rounded-2xl">
            <p className="text-sm font-bold text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        {mode === 'sign-in' ? (
          <div key="sign-in-form" className="space-y-3">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 dark:border-gray-800 focus:border-blue-500 outline-none transition-colors bg-white dark:bg-gray-900"
              autoCapitalize="none"
              autoCorrect="off"
              inputMode="email"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 dark:border-gray-800 focus:border-blue-500 outline-none transition-colors bg-white dark:bg-gray-900"
            />
            <Button fullWidth disabled={isWorking || !email || !password} onClick={signIn}>
              {isWorking ? 'Signing in...' : 'Sign in'}
            </Button>
          </div>
        ) : (
          <div key="sign-up-form" className="space-y-3">
            <input
              type="text"
              placeholder="Full name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 dark:border-gray-800 focus:border-blue-500 outline-none transition-colors bg-white dark:bg-gray-900"
              autoCapitalize="words"
            />
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 dark:border-gray-800 focus:border-blue-500 outline-none transition-colors bg-white dark:bg-gray-900"
              autoCapitalize="none"
              autoCorrect="off"
              inputMode="email"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 dark:border-gray-800 focus:border-blue-500 outline-none transition-colors bg-white dark:bg-gray-900"
            />
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                fullWidth
                disabled={isWorking}
                onClick={() => switchMode('sign-in')}
              >
                Cancel
              </Button>
              <Button
                fullWidth
                disabled={isWorking || !fullName.trim() || !email || !password}
                onClick={signUp}
              >
                {isWorking ? 'Creating...' : 'Create account'}
              </Button>
            </div>
          </div>
        )}

        <div className="mt-8 text-xs text-gray-400 leading-relaxed">
          Setup: create a Supabase project, run `supabase.sql`, and create a private Storage bucket named `photos`.
        </div>
      </main>
    </div>
  );
}

function HistoryCard({ 
  session, 
  onClick, 
  onEdit, 
  onDelete 
}: { 
  session: Session, 
  onClick: () => void,
  onEdit: () => void,
  onDelete: () => void,
  key?: string
}) {
  const [isSwiped, setIsSwiped] = useState(false);
  const startX = useRef(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const diff = startX.current - e.touches[0].clientX;
    if (diff > HAPTIC.CARD_SWIPE) setIsSwiped(true);
    if (diff < -HAPTIC.CARD_SWIPE) setIsSwiped(false);
  };

  return (
    <div 
      className="relative overflow-hidden rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
    >
      {/* Action Buttons (Revealed on Swipe) */}
      <div className="absolute inset-0 flex justify-end">
        <button 
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="w-20 h-full bg-blue-600 text-white flex flex-col items-center justify-center gap-1"
        >
          <Pencil size={20} />
          <span className="text-[10px] font-bold uppercase">Edit</span>
        </button>
        <button 
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="w-20 h-full bg-red-600 text-white flex flex-col items-center justify-center gap-1"
        >
          <Trash2 size={20} />
          <span className="text-[10px] font-bold uppercase">Delete</span>
        </button>
      </div>

      {/* Card Content */}
      <motion.div 
        animate={{ x: isSwiped ? -160 : 0 }}
        transition={{ type: 'spring', damping: 20, stiffness: 300 }}
        onClick={onClick}
        className="relative z-10 bg-white dark:bg-gray-900 p-5 flex items-center justify-between active:bg-gray-50 dark:active:bg-gray-800 transition-colors"
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center">
            <FileText size={24} />
          </div>
          <div>
            <h3 className="font-bold dark:text-white">{session.title}</h3>
            <div className="flex items-center gap-3 mt-1">
              <div className="flex items-center gap-1 text-xs text-gray-400">
                <MapPin size={12} />
                <span>Store {session.location || 'N/A'}</span>
              </div>
              <div className="flex items-center gap-1 text-xs text-gray-400">
                <Calendar size={12} />
                <span>{new Date(session.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-1">
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className="p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            aria-label="Edit session"
          >
            <Pencil size={18} />
          </button>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
            aria-label="Delete session"
          >
            <Trash2 size={18} />
          </button>
          <div className="text-gray-300">
            <ChevronLeft size={20} className="rotate-180" />
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function HistoryView({ 
  sessions, 
  onOpenReport, 
  onEditSession, 
  onDeleteSession,
  stores,
  filter,
  setFilter,
  onGoHome
}: { 
  sessions: Session[], 
  onOpenReport: (session: Session) => void,
  onEditSession: (session: Session) => void,
  onDeleteSession: (session: Session) => void,
  stores: string[],
  filter: { startDate: string, endDate: string, selectedStores: string[] },
  setFilter: (f: any) => void,
  onGoHome: () => void
}) {
  const [showStoreFilter, setShowStoreFilter] = useState(false);

  const filteredSessions = sessions.filter(session => {
    const sessionDate = new Date(session.createdAt);
    const start = filter.startDate ? new Date(filter.startDate) : null;
    const end = filter.endDate ? new Date(filter.endDate) : null;
    
    if (start && sessionDate < start) return false;
    if (end) {
      const endWithTime = new Date(end);
      endWithTime.setHours(23, 59, 59, 999);
      if (sessionDate > endWithTime) return false;
    }
    
    if (filter.selectedStores.length > 0 && session.location && !filter.selectedStores.includes(session.location)) {
      return false;
    }
    
    return true;
  });

  const toggleStore = (store: string) => {
    setFilter((prev: any) => ({
      ...prev,
      selectedStores: prev.selectedStores.includes(store)
        ? prev.selectedStores.filter((s: string) => s !== store)
        : [...prev.selectedStores, store]
    }));
  };

  const hasActiveFilters = filter.startDate || filter.endDate || filter.selectedStores.length > 0;

  const clearFilters = () => {
    vibrate(HAPTIC.SUCCESS);
    setFilter({
      startDate: '',
      endDate: '',
      selectedStores: []
    });
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-950">
      <header className="shrink-0 p-6 pt-safe bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-black tracking-tight dark:text-white">Audit History</h1>
          {hasActiveFilters && (
            <button 
              onClick={clearFilters}
              className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest hover:underline"
            >
              Clear Filters
            </button>
          )}
        </div>
        
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input 
                type="date" 
                value={filter.startDate}
                onChange={(e) => setFilter((prev: any) => ({ ...prev, startDate: e.target.value }))}
                className="w-full pl-10 pr-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg text-sm dark:text-white outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex-1 relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input 
                type="date" 
                value={filter.endDate}
                onChange={(e) => setFilter((prev: any) => ({ ...prev, endDate: e.target.value }))}
                className="w-full pl-10 pr-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg text-sm dark:text-white outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="relative">
            <button 
              onClick={() => setShowStoreFilter(!showStoreFilter)}
              className="w-full flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg text-sm dark:text-white"
            >
              <div className="flex items-center gap-2">
                <Filter size={16} className="text-gray-400" />
                <span>
                  {filter.selectedStores.length === 0 
                    ? "All Stores" 
                    : `${filter.selectedStores.length} Stores Selected`}
                </span>
              </div>
              <ChevronDown size={16} className={`transition-transform ${showStoreFilter ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {showStoreFilter && (
                <>
                  <div 
                    className="fixed inset-0 z-10" 
                    onClick={() => setShowStoreFilter(false)} 
                  />
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl shadow-xl z-20 max-h-60 overflow-y-auto p-2"
                  >
                    {stores.map(store => (
                      <button
                        key={store}
                        onClick={() => toggleStore(store)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm mb-1 last:mb-0 transition-colors ${
                          filter.selectedStores.includes(store)
                            ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        <span>Store {store}</span>
                        {filter.selectedStores.includes(store) && <Check size={14} />}
                      </button>
                    ))}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 pb-32">
        {filteredSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <History size={48} className="mb-4 opacity-20" />
            <p className="font-medium">No sessions found</p>
            <p className="text-sm mb-4">Try adjusting your filters</p>
            <button 
              onClick={() => { vibrate(HAPTIC.MEDIUM); onGoHome(); }}
              className="text-blue-600 font-semibold text-sm flex items-center gap-1"
            >
              <Home size={16} />
              Go to Home
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredSessions.map(session => (
              <HistoryCard 
                key={session.id} 
                session={session} 
                onClick={() => onOpenReport(session)}
                onEdit={() => onEditSession(session)}
                onDelete={() => onDeleteSession(session)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Main App ---

export default function App() {
  const { user, profile, assignedLocationIds, isLoading: authLoading } = useAuth();
  const {
    sessions,
    photos,
    currentSessionId, 
    setCurrentSessionId, 
    createSession, 
    deleteSession, 
    addPhoto, 
    updatePhoto, 
    deletePhoto, 
    markAsSynced,
    getSessionPhotos,
    storageError,
    setStorageError,
    isSyncing,
    setIsSyncing,
    stores,
    addStore,
    clearAllData,
    clearPhotos,
    setUserScope,
    mergeRemote,
    locations,
    loadLocations,
  } = useSnapAudit();

  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const photoBlobCacheRef = useRef<Map<string, Blob>>(new Map());
  const signedUrlCacheRef = useRef<Map<string, SignedUrlCacheEntry>>(new Map());
  const syncInFlightRef = useRef(false);
  const syncRetryCountRef = useRef(0);
  const isIOS = useMemo(() => isIosDevice(), []);

  useEffect(() => {
    setUserScope(user?.id ?? null);
    setPhotoUrls({});
    if (!user) {
      setCurrentSessionId(null);
    }
  }, [user?.id, user, setUserScope, setCurrentSessionId]);

  useEffect(() => {
    if (!user || isTestAuthEnabled()) return;

    loadLocations().catch((error) => {
      console.error('Failed to load locations', error);
    });
  }, [user, loadLocations]);

  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), TIMING.TOAST_DURATION);
    return () => clearTimeout(t);
  }, [toastMessage]);

  // Load remote sessions + photo metadata when signed in.
  useEffect(() => {
    const loadRemote = async () => {
      if (!user) return;
      try {
        const [sessionRows, photoRows] = await Promise.all([
          fetchPagedRows<RemoteSessionRow>(PAGINATION.REMOTE_PAGE_SIZE, (from, to) =>
            supabase
              .from('sessions')
              .select('id,title,location,created_at')
              .order('created_at', { ascending: false })
              .range(from, to)
          ),
          fetchPagedRows<RemotePhotoRow>(PAGINATION.REMOTE_PAGE_SIZE, (from, to) =>
            supabase
              .from('photos')
              .select('id,session_id,tag,comment,storage_path,created_at')
              .order('created_at', { ascending: false })
              .range(from, to)
          ),
        ]);

        const remoteSessions: Session[] = (sessionRows ?? []).map((r: any) => ({
          id: String(r.id),
          title: String(r.title),
          location: r.location ? String(r.location) : undefined,
          createdAt: new Date(r.created_at).getTime(),
        }));

        const remotePhotos: PhotoEntry[] = (photoRows ?? []).map((r: any) => ({
          id: String(r.id),
          sessionId: String(r.session_id),
          tag: r.tag as Tag,
          comment: String(r.comment ?? ''),
          storagePath: String(r.storage_path),
          createdAt: new Date(r.created_at).getTime(),
          synced: true,
        }));

        mergeRemote(remoteSessions, remotePhotos);
      } catch (e) {
        console.error('Failed to load remote data', e);
      }
    };

    if (user && !isTestAuthEnabled()) loadRemote();
  }, [user, mergeRemote]);

  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('darkMode');
      if (saved !== null) return saved === 'true';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });
  const [printingSessionId, setPrintingSessionId] = useState<string | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [showPhotosList, setShowPhotosList] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [lastView, setLastView] = useState<View>('home');
  const [shareMenuSession, setShareMenuSession] = useState<{session: Session, photos: PhotoEntry[]} | null>(null);
  const [historyFilter, setHistoryFilter] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_KEYS.HISTORY_FILTER);
        return saved ? JSON.parse(saved) : { startDate: '', endDate: '', selectedStores: [] as string[] };
      } catch {
        return { startDate: '', endDate: '', selectedStores: [] as string[] };
      }
    }
    return { startDate: '', endDate: '', selectedStores: [] as string[] };
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.HISTORY_FILTER, JSON.stringify(historyFilter));
    }
  }, [historyFilter]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (isDarkMode) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      localStorage.setItem('darkMode', String(isDarkMode));
    }
  }, [isDarkMode]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const getPhotoSrc = (photo: PhotoEntry) => photo.imageData || photoUrls[photo.id] || '';

  const signedUrlCacheKey = (photo: PhotoEntry) => photo.storagePath || photo.id;

  const ensureSignedUrl = async (photo: PhotoEntry): Promise<string | null> => {
    if (!user || !photo.storagePath) return null;
    const key = signedUrlCacheKey(photo);
    const now = Date.now();
    const cached = signedUrlCacheRef.current.get(key);

    if (cached?.url && cached.expiresAt > now) {
      if (!photoUrls[photo.id]) {
        setPhotoUrls(prev => (prev[photo.id] ? prev : { ...prev, [photo.id]: cached.url! }));
      }
      return cached.url;
    }

    if (cached?.promise) return cached.promise;

    const promise = (async () => {
      try {
        const { data, error } = await supabase.storage.from('photos').createSignedUrl(photo.storagePath!, 60 * 60 * 12);
        if (error) throw error;
        if (data?.signedUrl) {
          signedUrlCacheRef.current.set(key, {
            url: data.signedUrl,
            expiresAt: Date.now() + CACHE.URL_CACHE_EXPIRY,
          });
          setPhotoUrls(prev => (prev[photo.id] === data.signedUrl ? prev : { ...prev, [photo.id]: data.signedUrl }));
          return data.signedUrl;
        }
      } catch (e) {
        signedUrlCacheRef.current.delete(key);
        console.error('Failed to create signed URL', e);
      }
      return null;
    })();

    signedUrlCacheRef.current.set(key, { expiresAt: now + CACHE.URL_CACHE_EXPIRY, promise });

    return promise;
  };

  const getPhotoBlob = async (photo: PhotoEntry): Promise<Blob | null> => {
    try {
      const cached = photoBlobCacheRef.current.get(photo.id);
      if (cached) return cached;
      if (photo.imageData) return dataUrlToBlob(photo.imageData);

      if (user) {
        const storedImageData = await loadPhotoImageData(user.id, photo.id).catch(() => null);
        if (storedImageData) return dataUrlToBlob(storedImageData);
      }

      if (user && photo.storagePath) {
        const { data, error } = await supabase.storage.from('photos').download(photo.storagePath);
        if (error) throw error;
        return data ?? null;
      }

      if (photo.storagePath) {
        const url = await ensureSignedUrl(photo);
        if (url) {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`Failed to fetch photo blob (${res.status})`);
          return await res.blob();
        }
      }

      const src = getPhotoSrc(photo);
      if (!src) return null;
      const res = await fetch(src);
      if (!res.ok) throw new Error(`Failed to fetch photo blob (${res.status})`);
      return await res.blob();
    } catch (e) {
      console.error('Failed to get photo blob', photo.id, e);
      return null;
    }
  };

  const cachePhotoBlob = (photoId: string, blob: Blob) => {
    const cache = photoBlobCacheRef.current;
    if (cache.has(photoId)) cache.delete(photoId);
    cache.set(photoId, blob);
    if (cache.size > CACHE.MAX_PHOTO_BLOB_ENTRIES) {
      const oldestKey = cache.keys().next().value as string | undefined;
      if (oldestKey) cache.delete(oldestKey);
    }
  };

  const prefetchPhotoBlob = (photo: PhotoEntry) => {
    if (!isIOS) return;
    if (photoBlobCacheRef.current.has(photo.id)) return;
    void (async () => {
      const blob = await getPhotoBlob(photo);
      if (blob) cachePhotoBlob(photo.id, blob);
    })();
  };

  const downloadBlobToDevice = (blob: Blob, suggestedName: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = suggestedName;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), TIMING.BLOB_URL_REVOKE);
  };

  const savePhotoToDevice = (photo: PhotoEntry) => {
    const tagPart = photo.tag.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'photo';
    const datePart = new Date(photo.createdAt).toISOString().slice(0, 19).replace(/[:T]/g, '-');

    const cachedBlob = photoBlobCacheRef.current.get(photo.id) ?? (photo.imageData ? dataUrlToBlob(photo.imageData) : null);
    if (cachedBlob && !photoBlobCacheRef.current.has(photo.id)) {
      cachePhotoBlob(photo.id, cachedBlob);
    }

    const contentType = cachedBlob?.type || 'image/jpeg';
    const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
    const suggestedName = `snapaudit-${tagPart}-${datePart}.${ext}`;

    if (isIOS) {
      // iOS Safari often ignores `download` and navigates to a file preview.
      // Use the Share sheet with a File when available to keep the user on this page.
      if (!cachedBlob) {
        setToastMessage('Preparing image… tap Save again');
        void (async () => {
          const blob = await getPhotoBlob(photo);
          if (!blob) {
            setToastMessage('Could not prepare image');
            return;
          }
          cachePhotoBlob(photo.id, blob);
          setToastMessage('Ready — tap Save again');
        })();
        return;
      }

      const file = new File([cachedBlob], suggestedName, { type: cachedBlob.type || 'image/jpeg' });
      const nav = navigator as any;
      const canShareFiles =
        typeof nav.share === 'function' &&
        (typeof nav.canShare !== 'function' || (() => {
          try { return nav.canShare({ files: [file] }); } catch { return false; }
        })());

      if (canShareFiles) {
        setToastMessage('Use Share → Save Image');
        void nav.share({ files: [file], title: suggestedName }).catch(() => {});
        return;
      }

      // Fallback: may still show a preview on iOS.
      downloadBlobToDevice(cachedBlob, suggestedName);
      setToastMessage('Image saved');
      return;
    }

    if (cachedBlob) {
      downloadBlobToDevice(cachedBlob, suggestedName);
      setToastMessage('Image saved');
      return;
    }

    setToastMessage('Preparing download…');
    void (async () => {
      const blob = await getPhotoBlob(photo);
      if (!blob) {
        setToastMessage('Could not download image');
        return;
      }
      cachePhotoBlob(photo.id, blob);
      downloadBlobToDevice(blob, suggestedName);
      setToastMessage('Image saved');
    })();
  };

  // Pre-fetch signed URLs for uploaded photos (keeps localStorage small by clearing imageData after sync).
  useEffect(() => {
    if (!user || !isOnline || isTestAuthEnabled()) return;
    const missing = photos.filter(p => !p.imageData && p.storagePath && !photoUrls[p.id]).slice(0, 50);
    for (const p of missing) {
      ensureSignedUrl(p);
    }
  }, [photos, photoUrls, user, isOnline]);

  // Background Sync Logic (upload unsynced photos to Supabase)
  useEffect(() => {
    const syncPhotos = async () => {
      try {
        if (!user || isTestAuthEnabled()) return;
        const unsyncedPhotos = photos.filter(p => !p.synced);
        if (unsyncedPhotos.length === 0 || !isOnline || syncInFlightRef.current) return;

        syncInFlightRef.current = true;
        setIsSyncing(true);
        let syncedCount = 0;

        const sessionsById = new Map<string, Session>(
          unsyncedPhotos
            .map(photo => sessions.find(s => s.id === photo.sessionId))
            .filter((session): session is Session => !!session)
            .map(session => [session.id, session] as [string, Session])
        );

        if (sessionsById.size > 0) {
          const { error: upsertSessionsErr } = await supabase.from('sessions').upsert(
            Array.from(sessionsById.values()).map(session => ({
              id: session.id,
              user_id: user.id,
              title: session.title,
              location: session.location ?? null,
              created_at: new Date(session.createdAt).toISOString(),
            }))
          );
          if (upsertSessionsErr) throw upsertSessionsErr;
        }

        const syncedPhotoRows: SyncedPhotoRow[] = [];
        const failedPhotoIds: string[] = [];

        await runWithConcurrency<PhotoEntry>(unsyncedPhotos, TIMING.SYNC_UPLOAD_CONCURRENCY, async (photo) => {
          try {
            const session = sessions.find(s => s.id === photo.sessionId);
            if (!session) return;

            const storagePath = photo.storagePath ?? `${user.id}/${photo.id}.jpg`;
            const blob = await getPhotoBlob(photo);
            if (!blob) return;

            const { error: uploadErr } = await supabase.storage
              .from('photos')
              .upload(storagePath, blob, { contentType: blob.type || 'image/jpeg', upsert: true });
            if (uploadErr) throw uploadErr;

            syncedPhotoRows.push({
              id: photo.id,
              user_id: user.id,
              session_id: photo.sessionId,
              tag: photo.tag,
              comment: photo.comment ?? '',
              storage_path: storagePath,
              created_at: new Date(photo.createdAt).toISOString(),
            });

            syncedCount += 1;
          } catch (error) {
            console.error('Failed to sync photo:', photo.id, error);
            failedPhotoIds.push(photo.id);
          }
        });

        if (syncedPhotoRows.length > 0) {
          const { error: upsertPhotosErr } = await supabase.from('photos').upsert(syncedPhotoRows);
          if (upsertPhotosErr) throw upsertPhotosErr;

          for (const row of syncedPhotoRows) {
            markAsSynced(row.id);
            updatePhoto(row.id, { storagePath: row.storage_path, imageData: undefined, synced: true });
            await ensureSignedUrl({
              id: row.id,
              sessionId: row.session_id,
              tag: row.tag,
              comment: row.comment,
              storagePath: row.storage_path,
              createdAt: new Date(row.created_at).getTime(),
              synced: true,
            });
          }
        }

        syncRetryCountRef.current =
          failedPhotoIds.length === 0 && syncedCount === unsyncedPhotos.length
            ? 0
            : Math.min(syncRetryCountRef.current + 1, 5);
      } catch (error) {
        syncRetryCountRef.current = Math.min(syncRetryCountRef.current + 1, 5);
        console.error('Sync error:', error);
      } finally {
        syncInFlightRef.current = false;
        setIsSyncing(false);
      }
    };

    if (isOnline && user && !isTestAuthEnabled()) {
      const retryDelay = TIMING.SYNC_DELAY * Math.max(1, syncRetryCountRef.current + 1);
      const timer = setTimeout(syncPhotos, retryDelay);
      return () => clearTimeout(timer);
    }
  }, [photos, isOnline, isSyncing, markAsSynced, setIsSyncing, sessions, user]);
  
  const [view, setView] = useState<View>('home');
  const [editingPhoto, setEditingPhoto] = useState<PhotoEntry | null>(null);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ title: string, message: string, onConfirm: () => void, variant?: 'danger' | 'warning' } | null>(null);
  
  // New session form state
  const [newSessionStore, setNewSessionStore] = useState('');
  const [newSessionTitle, setNewSessionTitle] = useState('');
  const [isAddingNewStore, setIsAddingNewStore] = useState(false);
  const [customStoreNumber, setCustomStoreNumber] = useState('');

  const assignedLocations = useMemo(() => {
    if (profile?.role === 'admin') return locations;
    const assignedIdSet = new Set(assignedLocationIds);
    return locations.filter((location) => assignedIdSet.has(location.id));
  }, [assignedLocationIds, locations, profile?.role]);

  const storeOptions = useMemo(() => {
    if (assignedLocations.length > 0) {
      return assignedLocations.map((location) => ({
        id: location.id,
        label: location.name || location.id,
      }));
    }

    if (profile?.role === 'admin' || isTestAuthEnabled()) {
      return stores.map((store) => ({ id: store, label: store }));
    }

    if (locations.length > 0 || assignedLocationIds.length > 0) {
      return [];
    }

    return stores.map((store) => ({ id: store, label: store }));
  }, [assignedLocationIds.length, assignedLocations, locations.length, profile?.role, stores]);

  const selectedStoreOption = useMemo(
    () => storeOptions.find((option) => option.id === newSessionStore) ?? null,
    [newSessionStore, storeOptions]
  );
  const canAddLegacyStore = (profile?.role === 'admin' || isTestAuthEnabled()) && locations.length === 0;

  // Auto-populate title when store changes
  useEffect(() => {
    if (newSessionStore) {
      const date = new Date();
      const yyyy = String(date.getFullYear());
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      setNewSessionTitle(`${yyyy}/${mm}/${dd}-${newSessionStore}`);
    }
  }, [newSessionStore]);

  useEffect(() => {
    if (!newSessionStore) return;
    if (storeOptions.some((option) => option.id === newSessionStore)) return;
    setNewSessionStore('');
  }, [newSessionStore, storeOptions]);
  
  // Wake Lock to keep screen on during audit and photo tagging
  useEffect(() => {
    let wakeLock: any = null;
    const requestWakeLock = async () => {
      if ('wakeLock' in navigator) {
        try {
          wakeLock = await (navigator as any).wakeLock.request('screen');
        } catch (err) {
          // Ignore errors
        }
      }
    };

    if (view === 'session' || capturedImage) {
      requestWakeLock();
    }

    return () => {
      if (wakeLock) {
        wakeLock.release().catch(() => {});
      }
    };
  }, [view, capturedImage]);

  const uploadImageInputRef = useRef<HTMLInputElement>(null);

  const handlePickedFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;

    vibrate(HAPTIC.SUCCESS);
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const resized = await resizeImage(reader.result as string);
        setCapturedImage(resized);
      } catch (error) {
        console.error('Failed to resize image', error);
        setCapturedImage(reader.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  const pickFromFiles = async () => {
    try {
      const showOpenFilePicker = (window as any).showOpenFilePicker as undefined | ((options?: any) => Promise<any[]>);
      if (showOpenFilePicker) {
        const [handle] = await showOpenFilePicker({
          multiple: false,
          types: [
            {
              description: 'Images',
              accept: {
                'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.heic', '.heif'],
              },
            },
          ],
          excludeAcceptAllOption: true,
        });

        if (!handle) return;
        const file = await handle.getFile();
        if (file) handlePickedFile(file);
        return;
      }

      uploadImageInputRef.current?.click();
    } catch (e: any) {
      // User cancel or browser restriction
      const name = String(e?.name ?? '');
      if (name !== 'AbortError') console.error('File picker failed', e);
    }
  };

  const currentSession = useMemo(() => 
    sessions.find(s => s.id === currentSessionId), 
    [sessions, currentSessionId]
  );

  const currentPhotos = useMemo(() => 
    currentSessionId ? getSessionPhotos(currentSessionId) : [], 
    [currentSessionId, getSessionPhotos]
  );

  // --- Handlers ---

  const handleNewSession = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (newSessionTitle.trim() && selectedStoreOption) {
      vibrate(HAPTIC.NEW_SESSION);
      createSession(newSessionTitle, selectedStoreOption.label, selectedStoreOption.id);
      setIsCreatingSession(false);
      setNewSessionStore('');
      setNewSessionTitle('');
      setView('session');
    }
  };

  const handleAddCustomStore = () => {
    if (customStoreNumber && customStoreNumber.length === 4) {
      if (stores.includes(customStoreNumber)) {
        setToastMessage('Store number already exists');
        return;
      }
      vibrate(HAPTIC.SUCCESS);
      addStore(customStoreNumber);
      setNewSessionStore(customStoreNumber);
      setIsAddingNewStore(false);
      setCustomStoreNumber('');
    }
  };

  const handleCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) {
      handlePickedFile(file);
    }
  };

  const handleSavePhoto = (tag: Tag, comment: string, imageData: string) => {
    vibrate(HAPTIC.HEAVY);
    if (capturedImage && currentSessionId) {
      addPhoto(currentSessionId, imageData, tag, comment);
      setCapturedImage(null);
    } else if (editingPhoto) {
      updatePhoto(editingPhoto.id, { tag, comment, imageData, synced: false });
      setEditingPhoto(null);
      setView(lastView);
    }
  };

  const openPhotoEditor = async (photo: PhotoEntry, fromView: View) => {
    if (!user) return;

    // If we cleared local imageData to save storage, download it on-demand for editing.
    if (!photo.imageData && photo.storagePath) {
      try {
        const { data, error } = await supabase.storage.from('photos').download(photo.storagePath);
        if (error) throw error;
        if (data) {
          const dataUrl = await blobToDataUrl(data);
          updatePhoto(photo.id, { imageData: dataUrl });
          photo = { ...photo, imageData: dataUrl };
        }
      } catch (e) {
        console.error('Failed to download photo for editing', e);
        setToastMessage('Failed to load photo for editing. Please try again.');
        return;
      }
    }

    if (!photo.imageData) {
      setToastMessage('No image data available. Please capture a new photo.');
      return;
    }
    vibrate(HAPTIC.SUCCESS);
    setEditingPhoto(photo);
    setLastView(fromView);
    setView('photo-edit');
  };

  const handleShareSession = (session: Session) => {
    vibrate(HAPTIC.SUCCESS);
    const sessionPhotos = photos.filter(p => p.sessionId === session.id);
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
      setPrintingSessionId(session.id);
    } else {
      setShareMenuSession({ session, photos: sessionPhotos });
    }
  };

  const handlePrint = () => {
    vibrate(HAPTIC.SUCCESS);
    window.print();
  };

  const deleteSessionRemote = async (sessionId: string) => {
    if (!user || !isOnline) return;
    if (isTestAuthEnabled()) return;

    try {
      const { data: photoRows, error: listErr } = await supabase
        .from('photos')
        .select('storage_path')
        .eq('user_id', user.id)
        .eq('session_id', sessionId);
      if (listErr) throw listErr;

      const paths = (photoRows ?? [])
        .map((r: any) => String(r.storage_path ?? ''))
        .filter(Boolean);

      if (paths.length > 0) {
        const { error: removeErr } = await supabase.storage.from('photos').remove(paths);
        if (removeErr) console.error('Failed to remove photo files from storage', removeErr);
      }

      const { error: delPhotosErr } = await supabase
        .from('photos')
        .delete()
        .eq('user_id', user.id)
        .eq('session_id', sessionId);
      if (delPhotosErr) throw delPhotosErr;

      const { error: delSessionErr } = await supabase
        .from('sessions')
        .delete()
        .eq('user_id', user.id)
        .eq('id', sessionId);
      if (delSessionErr) throw delSessionErr;
    } catch (e) {
      console.error('Failed to delete session remotely', e);
    }
  };

  const deleteSessionEverywhere = async (sessionId: string) => {
    vibrate(HAPTIC.DELETE);
    deleteSession(sessionId);
    await deleteSessionRemote(sessionId);
  };

  const generateAndSharePDF = async (
    session: Session, 
    photosToPrint: PhotoEntry[], 
    action: 'native' | 'email' | 'print' | 'download' = 'native'
  ) => {
    try {
      vibrate(HAPTIC.SUCCESS);
      setIsGeneratingPdf(true);
      const [{ jsPDF }, { default: html2canvas }] = await Promise.all([
        import('jspdf'),
        import('html2canvas'),
      ]);
      // Let React flush the hidden ReportContent (isPrintOnly) into the DOM
      // before we search for it — without this, report-to-print may not exist yet.
      await new Promise(r => setTimeout(r, 150));
      const pdfBackground = '#ffffff';
      const pdfText = '#111827';
      let avoidBreakRects: Array<{ top: number; bottom: number }> = [];
      let reportHeightCssPx: number | null = null;

      // Pre-fetch all photos as data URLs keyed by photo ID.
      // Each fetch is capped at 12 s so a stalled Supabase download can't hang forever.
      const PHOTO_FETCH_TIMEOUT_MS = 12000;
      const photoDataUrlMap = new Map<string, string>();
      await runWithConcurrency(photosToPrint, TIMING.PDF_PHOTO_FETCH_CONCURRENCY, async (photo) => {
        try {
          const timeout = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), PHOTO_FETCH_TIMEOUT_MS)
          );
          const blob = await Promise.race([getPhotoBlob(photo), timeout]);
          if (!blob) return;
          const dataUrl = await blobToDataUrl(blob);
          photoDataUrlMap.set(photo.id, dataUrl);
        } catch (e) {
          console.warn('Failed to pre-fetch photo for PDF', photo.id, e);
        }
      });

      // Ensure the element is rendered and visible for html2canvas
      const element = document.getElementById('report-to-print') || document.getElementById('report-view');
      if (!element) {
        console.error('Report element not found');
        setIsGeneratingPdf(false);
        setPrintingSessionId(null);
        return;
      }

      // Inject pre-fetched data URLs directly into the live DOM images BEFORE
      // html2canvas runs. html2canvas pre-scans src values when it starts, so
      // onclone swaps (which fire after scanning) arrive too late for synced
      // photos whose src is still "". By patching the live element first and
      // waiting for the load events, html2canvas sees fully-loaded images.
      const originalSrcs = new Map<HTMLImageElement, string>();
      const loadPromises: Promise<void>[] = [];
      element.querySelectorAll<HTMLImageElement>('img[data-photo-id]').forEach((img) => {
        const dataUrl = photoDataUrlMap.get(img.dataset.photoId ?? '');
        if (!dataUrl) return;
        originalSrcs.set(img, img.getAttribute('src') ?? '');
        img.removeAttribute('crossorigin');
        img.src = dataUrl;
        if (!img.complete) {
          loadPromises.push(
            new Promise<void>((resolve) => {
              img.onload = () => resolve();
              img.onerror = () => resolve();
            }),
          );
        }
      });
      if (loadPromises.length > 0) {
        await Promise.race([Promise.all(loadPromises), new Promise((r) => setTimeout(r, 5000))]);
      }

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: false,
        allowTaint: true,
        logging: false,
        backgroundColor: pdfBackground,
        windowWidth: 800,
        onclone: (clonedDoc) => {
          // Replace photo image srcs with pre-fetched data URLs so html2canvas
          // never needs CORS access to Supabase storage. Works even when the
          // img src is empty (synced photos with no cached signed URL yet).
          // Transparent 1×1 GIF — used when photo fetch timed out so html2canvas
          // never makes its own CORS network requests for these images.
          const PLACEHOLDER = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
          clonedDoc.querySelectorAll('img[data-photo-id]').forEach((imgEl: Element) => {
            const img = imgEl as HTMLImageElement;
            const dataUrl = photoDataUrlMap.get(img.dataset.photoId ?? '');
            img.src = dataUrl ?? PLACEHOLDER;
            img.removeAttribute('crossorigin');
          });
          // Force light mode inside the cloned document so PDFs always render with white backgrounds.
          clonedDoc.documentElement.classList.remove('dark');
          clonedDoc.body.classList.remove('dark');
          clonedDoc.querySelectorAll('.dark').forEach((el) => el.classList.remove('dark'));

          // Inject a global style to override common Tailwind v4 oklch colors
          const style = clonedDoc.createElement('style');
          style.innerHTML = `
            * {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            /* Force RGB/Hex for common elements to bypass oklch parsing in html2canvas */
            body, html, #report-to-print, #report-view {
              background-color: ${pdfBackground} !important;
              color: ${pdfText} !important;
            }
            h1, h2, h3, h4, h5, h6 {
              color: ${pdfText} !important;
            }
            .text-blue-600 { color: #2563eb !important; }
            .text-gray-900 { color: #111827 !important; }
            .text-gray-600 { color: #4b5563 !important; }
            .text-gray-400 { color: #9ca3af !important; }
            .bg-white { background-color: #ffffff !important; }
            .bg-gray-50 { background-color: #f9fafb !important; }
            .dark\\:bg-gray-950 { background-color: #ffffff !important; }
            .border-blue-100 { border-color: #dbeafe !important; }
            .border-blue-900 { border-color: #1e3a8a !important; }
            .border-gray-900 { border-color: #111827 !important; }
            .border-gray-100 { border-color: #f3f4f6 !important; }
          `;
          clonedDoc.head.appendChild(style);

          // Iterate and replace any remaining oklch in computed styles
          const elements = clonedDoc.getElementsByTagName('*');
          for (let i = 0; i < elements.length; i++) {
            const el = elements[i] as HTMLElement;
            const computedStyle = window.getComputedStyle(el);
            
            const fixProperty = (prop: string, fallback: string) => {
              const val = (computedStyle as any)[prop];
              if (val && (val.includes('oklch') || val.includes('oklab'))) {
                el.style.setProperty(prop, fallback, 'important');
              }
            };

            fixProperty('color', pdfText);
            fixProperty('backgroundColor', pdfBackground);
            fixProperty('borderColor', '#e5e7eb');
            fixProperty('fill', pdfText);
            fixProperty('stroke', pdfText);
          }

          // Collect blocks that shouldn't be split across PDF page boundaries.
          // These correspond to the photo + comment rows in the report.
          const clonedReport =
            clonedDoc.getElementById(element.id) ||
            clonedDoc.getElementById('report-to-print') ||
            clonedDoc.getElementById('report-view');
          if (clonedReport) {
            const reportRect = clonedReport.getBoundingClientRect();
            reportHeightCssPx = reportRect.height;
            avoidBreakRects = Array.from(clonedReport.querySelectorAll('.break-inside-avoid'))
              .map((node) => {
                const r = (node as HTMLElement).getBoundingClientRect();
                return { top: r.top - reportRect.top, bottom: r.bottom - reportRect.top };
              })
              .filter((r) => Number.isFinite(r.top) && Number.isFinite(r.bottom) && r.bottom > r.top);

            // Prevent "orphan" category headers at the bottom of a page by keeping each
            // header with at least the first row in its section.
            const keepWithNextRects = Array.from(clonedReport.querySelectorAll('section'))
              .map((section) => {
                const header = section.querySelector('h2');
                const firstRow = section.querySelector('.break-inside-avoid');
                if (!header || !firstRow) return null;

                const headerRect = (header as HTMLElement).getBoundingClientRect();
                const rowRect = (firstRow as HTMLElement).getBoundingClientRect();

                const top = headerRect.top - reportRect.top;
                const bottom = rowRect.bottom - reportRect.top;
                if (!Number.isFinite(top) || !Number.isFinite(bottom) || bottom <= top) return null;

                return { top, bottom };
              })
              .filter((r): r is { top: number; bottom: number } => !!r);

            avoidBreakRects = avoidBreakRects.concat(keepWithNextRects);
          }
        }
      });

      // Restore original srcs so the live report view stays intact
      originalSrcs.forEach((src, img) => { img.src = src; });

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      // Smart pagination: slice the rendered canvas into A4-sized strips, and try to
      // avoid cutting through `.break-inside-avoid` blocks (photo/comment rows).
      const mmPerPx = pdfWidth / canvas.width;
      const topMarginInches = 0.75;
      const topMarginMm = topMarginInches * 25.4;

      const scaleY =
        typeof reportHeightCssPx === 'number' && Number.isFinite(reportHeightCssPx) && reportHeightCssPx > 0
          ? canvas.height / reportHeightCssPx
          : 2;

      // Convert cloned DOM (CSS px) -> rendered canvas pixels using the observed scale.
      const avoidBlocksPx = avoidBreakRects
        .map((r) => ({ top: Math.round(r.top * scaleY), bottom: Math.round(r.bottom * scaleY) }))
        .filter((r) => r.bottom > r.top)
        .sort((a, b) => a.top - b.top);

      const findPageBreakY = (startY: number, maxHeightPx: number) => {
        const ideal = Math.min(startY + Math.max(1, maxHeightPx), canvas.height);
        let breakY = ideal;
        const epsilon = 2;

        // Iterate a few times in case an adjustment lands inside another block.
        for (let i = 0; i < 12; i++) {
          const hit = avoidBlocksPx.find(
            (block) => block.top + epsilon < breakY && block.bottom - epsilon > breakY
          );
          if (!hit) break;

          // Preferred behavior: push the whole block to the next page (break BEFORE it).
          if (hit.top > startY + 1) {
            breakY = Math.max(startY + 1, hit.top);
            continue;
          }

          // If the block starts at/above the top of this page, try to keep it whole by
          // breaking AFTER it (only if it fits on this page).
          const pageEndY = startY + Math.max(1, maxHeightPx);
          if (hit.bottom > startY + 1 && hit.bottom <= pageEndY) {
            breakY = Math.min(canvas.height, hit.bottom);
            continue;
          }

          // Block is taller than a page; can't avoid cutting it.
          breakY = ideal;
          break;
        }

        if (breakY <= startY) return ideal;
        return breakY;
      };

      let sourceY = 0;
      let isFirstPage = true;
      while (sourceY < canvas.height) {
        const pageTopMarginMm = isFirstPage ? 0 : topMarginMm;
        const availableHeightMm = Math.max(1, pageHeight - pageTopMarginMm);
        const availableHeightPx = Math.floor(availableHeightMm / mmPerPx);

        let breakY = findPageBreakY(sourceY, availableHeightPx);
        if (breakY <= sourceY) breakY = Math.min(sourceY + availableHeightPx, canvas.height);

        const sliceHeight = Math.max(1, breakY - sourceY);

        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvas.width;
        pageCanvas.height = sliceHeight;
        const ctx = pageCanvas.getContext('2d');
        if (!ctx) throw new Error('Failed to get 2D context for PDF pagination');

        ctx.drawImage(canvas, 0, sourceY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

        const pageImgData = pageCanvas.toDataURL('image/jpeg', 0.86);
        const pageImgHeightMm = sliceHeight * mmPerPx;

        if (!isFirstPage) pdf.addPage();
        pdf.addImage(pageImgData, 'JPEG', 0, pageTopMarginMm, pdfWidth, pageImgHeightMm);

        isFirstPage = false;
        sourceY += sliceHeight;
      }

      const pdfBlob = pdf.output('blob');
      const fileName = `SnapAudit_${session.title.replace(/\s+/g, '_')}.pdf`;
      const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });

      if (action === 'download') {
        const url = URL.createObjectURL(pdfBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.click();
        URL.revokeObjectURL(url);
      } else if (action === 'print') {
        const url = URL.createObjectURL(pdfBlob);
        const printWindow = window.open(url);
        if (printWindow) {
          printWindow.onload = () => {
            printWindow.print();
          };
        } else {
          // Fallback to direct print if popup blocked
          window.print();
        }
      } else {
        // Native share
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
          try {
            await navigator.share({
              files: [pdfFile],
              title: `SnapAudit Report - ${session.title}`,
              text: `Audit report for ${session.title}`,
            });
          } catch (err) {
            if (err instanceof Error && err.name !== 'AbortError') {
              console.error('Share failed:', err);
              // Fallback: Download
              const url = URL.createObjectURL(pdfBlob);
              const link = document.createElement('a');
              link.href = url;
              link.download = fileName;
              link.click();
              URL.revokeObjectURL(url);
            }
          }
        } else {
          // Fallback: Download
          const url = URL.createObjectURL(pdfBlob);
          const link = document.createElement('a');
          link.href = url;
          link.download = fileName;
          link.click();
          URL.revokeObjectURL(url);
        }
      }
    } catch (error) {
      console.error('Error generating PDF:', error);
      // Fallback to print if PDF generation fails
      window.print();
    } finally {
      setIsGeneratingPdf(false);
      setPrintingSessionId(null);
    }
  };

  const handleShare = () => {
    if (currentSession) {
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile) {
        generateAndSharePDF(currentSession, currentPhotos).catch(err => {
          console.error('Failed to share report:', err);
        });
      } else {
        setShareMenuSession({ session: currentSession, photos: currentPhotos });
      }
    }
  };

  // Trigger PDF generation when printingSessionId is set (for home screen share)
  useEffect(() => {
    if (printingSessionId && view !== 'report') {
      const session = sessions.find(s => s.id === printingSessionId);
      const sessionPhotos = photos.filter(p => p.sessionId === printingSessionId);
      if (session) {
        // Small delay to ensure the hidden report is rendered
        const timer = setTimeout(() => {
          generateAndSharePDF(session, sessionPhotos).catch(err => {
            console.error('Failed to generate/share PDF:', err);
          });
        }, 300);
        return () => clearTimeout(timer);
      }
    }
  }, [printingSessionId, view, sessions, photos]);

  // --- Components ---

  const ReportContent = ({ session, sessionPhotos, isPrintOnly = false }: { session: Session, sessionPhotos: PhotoEntry[], isPrintOnly?: boolean }) => {
    const groupedPhotos = PRESET_TAGS.map(tag => ({
      tag,
      photos: sessionPhotos.filter(p => p.tag === tag)
    })).filter(group => group.photos.length > 0);

    return (
      <div 
        id={isPrintOnly ? "report-to-print" : "report-view"}
        className={`bg-white dark:bg-gray-950 p-6 md:p-12 max-w-4xl mx-auto ${isPrintOnly ? 'fixed left-[-9999px] top-[-9999px] w-[800px]' : 'min-h-screen pb-safe'}`}
        style={{
          backgroundColor: isDarkMode ? '#030712' : '#ffffff',
          color: isDarkMode ? '#f3f4f6' : '#111827'
        }}
      >
        <header className="border-b-2 border-gray-900 dark:border-gray-100 pb-6 mb-8">
          <h1 className="text-4xl font-black text-gray-900 dark:text-white uppercase tracking-tight mb-2">{session.title}</h1>
          <div className="flex flex-wrap gap-4 text-gray-600 dark:text-gray-400 font-medium">
            <div className="flex items-center gap-1">
              <Calendar size={18} />
              {new Date(session.createdAt).toLocaleDateString()}
            </div>
            {session.location && (
              <div className="flex items-center gap-1">
                <MapPin size={18} />
                {session.location}
              </div>
            )}
            <div className="flex items-center gap-1">
              <ImageIcon size={18} />
              {sessionPhotos.length} Photos
            </div>
          </div>
        </header>

        <div className="space-y-12">
          {groupedPhotos.map(group => (
            <section key={group.tag}>
              <h2 className="text-xl font-bold text-blue-600 border-b border-blue-100 dark:border-blue-900 pb-2 mb-6 uppercase tracking-wider">
                {group.tag}
              </h2>
              <div className="flex flex-wrap gap-6">
                {group.photos.map(photo => (
                  <div key={photo.id} className="flex gap-4 items-start break-inside-avoid w-full md:w-[calc(50%-12px)] print:w-full">
                    <div className="relative shrink-0 w-[1.5in] h-[1.5in] bg-gray-50 dark:bg-gray-900 rounded-lg overflow-hidden border border-gray-100 dark:border-gray-800 shadow-sm">
                      <img
                        src={getPhotoSrc(photo)}
                        alt={photo.tag}
                        data-photo-id={photo.id}
                        onClick={() => {
                          if (!isPrintOnly) {
                            openPhotoEditor(photo, 'report');
                          }
                        }}
                        onLoad={() => {
                          if (!photo.imageData && photo.storagePath) ensureSignedUrl(photo);
                          prefetchPhotoBlob(photo);
                        }}
                        crossOrigin="anonymous"
                        className={`w-full h-full object-cover ${!isPrintOnly ? 'cursor-pointer active:scale-95 transition-transform' : ''}`}
                        referrerPolicy="no-referrer"
                      />
                      {!isPrintOnly && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            vibrate(HAPTIC.SUCCESS);
                            savePhotoToDevice(photo);
                          }}
                          aria-label="Save photo to device"
                          title="Save to device"
                          className="absolute top-1 left-1 p-1 bg-white/90 dark:bg-gray-900/80 text-blue-600 dark:text-blue-400 rounded-full shadow"
                        >
                          <Download size={14} />
                        </button>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-800 dark:text-gray-300 text-sm leading-relaxed italic break-words">
                        "{photo.comment || 'No comment provided.'}"
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <footer className="mt-20 pt-8 border-t border-gray-200 dark:border-gray-800 text-center text-gray-400 dark:text-gray-500 text-sm print:mt-10">
          Generated via SnapAudit • {new Date().toLocaleString()}
        </footer>
      </div>
    );
  };

  const SavedToast = () => {
    if (!toastMessage) return null;
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed left-1/2 -translate-x-1/2 bottom-6 z-[200] px-4 py-3 rounded-2xl bg-gray-900/90 text-white text-sm font-bold shadow-2xl backdrop-blur-md border border-white/10"
      >
        {toastMessage}
      </div>
    );
  };

  const renderConfirmationModal = () => {
    if (!confirmAction) return null;

    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => { vibrate(HAPTIC.SUCCESS); setConfirmAction(null); }}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="relative w-full max-w-xs bg-white dark:bg-gray-900 rounded-3xl p-6 shadow-2xl text-center"
        >
          <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${
            confirmAction.variant === 'warning' 
              ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-500 dark:text-orange-400' 
              : 'bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400'
          }`}>
            {confirmAction.variant === 'warning' ? <Settings size={24} /> : <Trash2 size={24} />}
          </div>
          <h3 className="text-lg font-bold mb-2 dark:text-white">{confirmAction.title}</h3>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">{confirmAction.message}</p>
          {confirmAction.variant === 'warning' ? (
            <div className="flex flex-col gap-3">
              <Button variant="primary" fullWidth onClick={() => {
                vibrate(HAPTIC.DELETE);
                setConfirmAction({
                  title: 'Clear All Data',
                  message: 'This will delete ALL sessions and photos. This action cannot be undone.',
                  onConfirm: clearAllData,
                  variant: 'danger'
                });
              }}>
                Clear All Data
              </Button>
              <Button variant="secondary" fullWidth onClick={() => {
                vibrate(HAPTIC.MEDIUM);
                clearPhotos();
                setConfirmAction(null);
                setToastMessage('All photos cleared');
              }}>
                Clear Photos Only
              </Button>
              <Button variant="ghost" fullWidth onClick={() => { vibrate(HAPTIC.SUCCESS); setConfirmAction(null); }}>
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex gap-3">
              <Button variant="ghost" fullWidth onClick={() => { vibrate(HAPTIC.SUCCESS); setConfirmAction(null); }}>
                Cancel
              </Button>
              <Button variant="danger" fullWidth onClick={() => {
                vibrate(HAPTIC.DELETE);
                confirmAction.onConfirm();
                setConfirmAction(null);
              }}>
                Delete
              </Button>
            </div>
          )}
        </motion.div>
      </div>
    );
  };

  // --- Views ---

  if (authLoading) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-950 text-gray-500 gap-4">
        <RefreshCw className="animate-spin" size={32} />
        <span>Loading SnapAudit...</span>
      </div>
    );
  }

  if (!user) {
    return <AuthView />;
  }

  const adminPanelOverlay = isAdminPanelOpen ? (
    <div className="fixed inset-0 z-[120] bg-black/40 backdrop-blur-sm">
      <AdminPanel onClose={() => setIsAdminPanelOpen(false)} />
    </div>
  ) : null;

  if (view === 'history') {
    return (
      <div className="h-screen flex flex-col">
        <HistoryView 
          sessions={sessions}
          stores={storeOptions.map((option) => option.label)}
          filter={historyFilter}
          setFilter={setHistoryFilter}
          onOpenReport={(session) => {
            vibrate(HAPTIC.SUCCESS);
            setCurrentSessionId(session.id);
            setView('report');
          }}
          onEditSession={(session) => {
            vibrate(HAPTIC.SUCCESS);
            setCurrentSessionId(session.id);
            setView('session');
          }}
          onDeleteSession={(session) => {
            setConfirmAction({
              title: 'Delete Session',
              message: `Are you sure you want to delete the audit for Store ${session.location}? This cannot be undone.`,
              onConfirm: () => { deleteSessionEverywhere(session.id); }
            });
          }}
          onGoHome={() => setView('home')}
        />
        <BottomNav
          activeView={view}
          setView={setView}
          onNewSession={() => { setView('home'); setIsCreatingSession(true); }}
          hasActiveSession={!!currentSessionId}
        />
        <AnimatePresence>
          {renderConfirmationModal()}
        </AnimatePresence>
        {adminPanelOverlay}
        <SavedToast />
      </div>
    );
  }

  if (view === 'report' && currentSession) {
    return (
      <div className="h-screen overflow-y-auto bg-white dark:bg-gray-950">
        {/* Hidden off-screen report for html2canvas — positioned outside the
            scrollable container so the full document height is captured. */}
        {isGeneratingPdf && (
          <ReportContent
            session={currentSession}
            sessionPhotos={currentPhotos}
            isPrintOnly={true}
          />
        )}
        {isGeneratingPdf && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center flex-col gap-4 text-white">
            <RefreshCw className="animate-spin" size={48} />
            <p className="text-xl font-bold">Generating PDF Report...</p>
            <p className="text-sm opacity-80">This may take a few moments</p>
          </div>
        )}
        <div className="max-w-4xl mx-auto p-6 md:p-12 print:p-0">
          <div className="flex flex-col gap-4 mb-8 print:hidden">
            <Button
              variant="ghost"
              onClick={() => { vibrate(HAPTIC.SUCCESS); setView('home'); }}
              className="flex items-center gap-2 self-start"
            >
              <Home size={20} />
              <span className="font-bold">Home</span>
            </Button>

            <div className="flex justify-between items-center">
              <Button variant="ghost" onClick={() => setView('session')}>
                <ChevronLeft size={20} /> Camera
              </Button>
              <div className="flex gap-2">
                <Button fullWidth onClick={handleShare} disabled={isGeneratingPdf}>
                  <Share size={20} className={isGeneratingPdf ? 'animate-spin' : ''} />
                  {isGeneratingPdf ? 'Generating PDF...' : 'Share'}
                </Button>
              </div>
            </div>
          </div>

          <ReportContent session={currentSession} sessionPhotos={currentPhotos} />
        </div>
        {adminPanelOverlay}
        <SavedToast />
      </div>
    );
  }

  if (view === 'photo-edit') {
    return (
      <PhotoEditor 
        initialData={editingPhoto!}
        onSave={handleSavePhoto}
        onCancel={() => {
          vibrate(HAPTIC.SUCCESS);
          setEditingPhoto(null);
          setView(lastView);
        }}
      />
    );
  }

  return (
    <div className={`h-full flex flex-col bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 font-sans selection:bg-blue-100 overflow-hidden ${isDarkMode ? 'dark' : ''}`}>
      {/* Hidden report for PDF generation */}
      {(printingSessionId || shareMenuSession) && (
        <ReportContent 
          session={printingSessionId ? sessions.find(s => s.id === printingSessionId)! : shareMenuSession!.session} 
          sessionPhotos={printingSessionId ? photos.filter(p => p.sessionId === printingSessionId) : shareMenuSession!.photos} 
          isPrintOnly={true} 
        />
      )}
      
      {/* Loading Overlay for PDF Generation */}
      {isGeneratingPdf && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center flex-col gap-4 text-white">
          <RefreshCw className="animate-spin" size={48} />
          <p className="text-xl font-bold">Generating PDF Report...</p>
          <p className="text-sm opacity-80">This may take a few moments</p>
        </div>
      )}

      {/* Header */}
      <header className="shrink-0 z-30 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-100 dark:border-gray-800 px-4 pt-safe pb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white">
            <Camera size={18} />
          </div>
          <h1 className="font-bold text-xl tracking-tight">SnapAudit</h1>
          {!isOnline && (
            <div className="bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest ml-1">
              Offline
            </div>
          )}
          {isOnline && isSyncing && (
            <div className="bg-blue-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest ml-1 flex items-center gap-1">
              <RefreshCw size={10} className="animate-spin" />
              Syncing
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {profile?.role === 'admin' && (
            <button
              onClick={() => setIsAdminPanelOpen(true)}
              className="text-[10px] font-bold px-2 py-1 rounded-full border border-gray-200 dark:border-gray-800 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              Admin
            </button>
          )}
          <button
            onClick={() => {
              if (isTestAuthEnabled()) {
                window.location.href = window.location.pathname;
                return;
              }
              supabase.auth.signOut();
            }}
            className="text-[10px] font-bold px-2 py-1 rounded-full border border-gray-200 dark:border-gray-800 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          >
            Sign out
          </button>
          <button 
            onClick={() => { vibrate(HAPTIC.SUCCESS); setIsDarkMode(!isDarkMode); }}
            className="p-2 text-gray-400 dark:text-gray-500 hover:text-blue-500 transition-colors"
          >
            {isDarkMode ? <Sun size={20} className="text-yellow-500" /> : <Moon size={20} />}
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 pb-32">
        {storageError && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3"
          >
            <div className="p-1 bg-red-100 text-red-600 rounded-full">
              <X size={16} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-red-800">Storage Warning</p>
              <p className="text-xs text-red-600 mb-2">{storageError}</p>
              <Button 
                variant="danger" 
                className="py-1 px-3 text-[10px]" 
                onClick={() => {
                  vibrate(HAPTIC.SUCCESS);
                  setConfirmAction({
                    title: 'Clear Data',
                    message: 'How would you like to clear data?',
                    onConfirm: () => {},
                    variant: 'warning'
                  });
                }}
              >
                Clear Data
              </Button>
            </div>
            <button onClick={() => { vibrate(HAPTIC.SUCCESS); setStorageError(null); }} className="text-red-400">
              <X size={16} />
            </button>
          </motion.div>
        )}
        
      <AnimatePresence mode="wait">
          {view === 'home' ? (
            <motion.div 
              key="home"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="h-full flex flex-col space-y-4"
            >
              <div className="flex justify-between items-end shrink-0">
                <div>
                  <h2 className="text-2xl font-bold dark:text-white">Sessions</h2>
                  <p className="text-gray-500 dark:text-gray-400">Last 5 audit jobs</p>
                </div>
              </div>

              <div className="flex-1 flex flex-col gap-3 overflow-hidden">
                {sessions.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center bg-white dark:bg-gray-900 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-800">
                    <div className="w-12 h-12 bg-gray-50 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-3 text-gray-400">
                      <FileText size={24} />
                    </div>
                    <p className="text-gray-500 dark:text-gray-400 font-medium">No sessions yet</p>
                    <button 
                      onClick={() => { vibrate(HAPTIC.SUCCESS); setIsCreatingSession(true); }}
                      className="text-blue-600 font-semibold mt-1"
                    >
                      Start your first audit
                    </button>
                  </div>
                ) : (
                  sessions.slice(0, 5).map(session => (
                    <div 
                      key={session.id} 
                      className="relative flex-1 min-h-0 bg-gray-100 dark:bg-gray-800 rounded-2xl overflow-hidden group"
                    >
                      {/* Action buttons revealed on swipe */}
                      <div className="absolute inset-y-0 right-0 flex items-center pr-4 gap-2">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleShareSession(session);
                          }}
                          className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center hover:bg-blue-200 transition-colors"
                        >
                          <Share size={18} />
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            vibrate(HAPTIC.SUCCESS);
                            setConfirmAction({
                              title: 'Delete Session',
                              message: 'Are you sure you want to delete this session and all its photos? This action cannot be undone.',
                              onConfirm: () => { deleteSessionEverywhere(session.id); }
                            });
                          }}
                          className="w-10 h-10 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center hover:bg-red-200 transition-colors"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>

                      {/* Swipable card content */}
                      <motion.div 
                        drag="x"
                        dragConstraints={{ left: -120, right: 0 }}
                        dragElastic={0.1}
                        className="relative z-10 h-full bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm rounded-2xl flex flex-col"
                      >
                        <div 
                          className="flex-1 p-4 flex items-center justify-between cursor-pointer active:bg-gray-50 dark:active:bg-gray-800"
                          onClick={() => {
                            setCurrentSessionId(session.id);
                            setView('report');
                          }}
                        >
                          <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-lg truncate dark:text-white">{session.title}</h3>
                          </div>
                          <ChevronLeft size={20} className="rotate-180 text-gray-300 group-hover:text-blue-500 transition-colors" />
                        </div>
                        <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800 flex justify-between items-center">
                          <span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                            {getSessionPhotos(session.id).length} Entries
                          </span>
                        </div>
                      </motion.div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="session"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black z-40"
            >
              <CameraView 
                onCapture={(data) => {
                  vibrate(HAPTIC.LONG);
                  setCapturedImage(data);
                }}
                onDone={() => {
                  vibrate(HAPTIC.SUCCESS);
                  setView('report');
                }}
                onUpload={() => {
                  vibrate(HAPTIC.SUCCESS);
                  pickFromFiles();
                }}
              />
              {/* Tagging Overlay */}
              <AnimatePresence>
                {capturedImage && (
                  <motion.div 
                    initial={{ y: '100%' }}
                    animate={{ y: 0 }}
                    exit={{ y: '100%' }}
                    transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                    className="fixed inset-0 z-[60]"
                  >
                    <TaggingOverlay 
                      imageData={capturedImage}
                      onSave={handleSavePhoto}
                      onCancel={() => setCapturedImage(null)}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Photos List Modal */}
              <AnimatePresence>
                {showPhotosList && (
                  <motion.div
                    initial={{ y: '100%' }}
                    animate={{ y: 0 }}
                    exit={{ y: '100%' }}
                    transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                    className="fixed inset-0 z-[60] bg-gray-50 flex flex-col"
                  >
                    <header className="shrink-0 bg-white border-b border-gray-100 px-4 pt-safe pb-4 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" onClick={() => setShowPhotosList(false)} className="-ml-2">
                          <ChevronLeft size={20} />
                        </Button>
                        <h2 className="font-bold text-lg">Session Photos</h2>
                      </div>
                      <span className="bg-blue-100 text-blue-600 text-xs font-bold px-2 py-1 rounded-full">
                        {currentPhotos.length}
                      </span>
                    </header>

                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                      {currentPhotos.length === 0 ? (
                        <div className="text-center py-20">
                          <ImageIcon size={48} className="mx-auto text-gray-300 mb-4" />
                          <p className="text-gray-500">No photos captured yet.</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-3">
                          {currentPhotos.map(photo => (
                            <div 
                              key={photo.id} 
                              className="relative aspect-square rounded-2xl overflow-hidden shadow-sm border border-gray-200 group"
                              onClick={() => {
                                openPhotoEditor(photo, 'session').finally(() => setShowPhotosList(false));
                              }}
                            >
                              <img 
                                src={getPhotoSrc(photo)} 
                                alt={photo.tag} 
                                className="w-full h-full object-cover"
                                onLoad={() => {
                                  if (!photo.imageData && photo.storagePath) ensureSignedUrl(photo);
                                  prefetchPhotoBlob(photo);
                                }}
                                crossOrigin="anonymous"
                                referrerPolicy="no-referrer"
                              />
                              <div className="absolute bottom-2 left-2 right-2">
                                <span className="inline-block px-2 py-1 bg-white/90 backdrop-blur-sm text-[10px] font-black uppercase tracking-wider rounded-md text-blue-600 truncate max-w-full">
                                  {photo.tag}
                                </span>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  vibrate(HAPTIC.SUCCESS);
                                  savePhotoToDevice(photo);
                                }}
                                aria-label="Save photo to device"
                                title="Save to device"
                                className="absolute top-2 left-2 p-1.5 bg-white/90 dark:bg-gray-900/80 text-blue-600 dark:text-blue-400 rounded-full shadow-lg"
                              >
                                <Download size={12} />
                              </button>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  vibrate(HAPTIC.SUCCESS);
                                  setConfirmAction({
                                    title: 'Delete Photo',
                                    message: 'Are you sure you want to delete this photo?',
                                    onConfirm: () => { vibrate(HAPTIC.DELETE); deletePhoto(photo.id); }
                                  });
                                }}
                                className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full shadow-lg"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {adminPanelOverlay}

      {/* Floating Action Button for Camera */}
      <input 
        type="file" 
        accept="image/*" 
        className="hidden" 
        ref={uploadImageInputRef}
        onChange={handleCapture}
      />

      {/* Bottom Navigation */}
      {(view === 'home') && (
        <BottomNav 
          activeView={view} 
          setView={setView} 
          onNewSession={() => setIsCreatingSession(true)}
          hasActiveSession={!!currentSessionId}
        />
      )}

      {/* New Session Modal */}
      {/* Share Menu Modal (Desktop) */}
      <AnimatePresence>
        {shareMenuSession && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShareMenuSession(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm bg-white dark:bg-gray-900 rounded-3xl p-8 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold dark:text-white">Share Report</h3>
                <button onClick={() => setShareMenuSession(null)} className="text-gray-400 hover:text-gray-600">
                  <X size={24} />
                </button>
              </div>
              
              <div className="space-y-3">
                <button 
                  onClick={async () => {
                    try {
                      const session = shareMenuSession.session;
                      const photos = shareMenuSession.photos;
                      setPrintingSessionId(session.id);
                      setShareMenuSession(null);
                      await generateAndSharePDF(session, photos, 'print');
                    } catch (err) {
                      console.error('Share menu print failed:', err);
                    }
                  }}
                  className="w-full flex items-center gap-4 p-4 rounded-2xl bg-gray-50 dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-gray-700 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400 transition-all group"
                >
                  <div className="w-12 h-12 rounded-xl bg-white dark:bg-gray-700 flex items-center justify-center shadow-sm group-hover:shadow-md transition-all">
                    <FileText size={24} />
                  </div>
                  <div className="text-left">
                    <div className="font-bold">Print Report</div>
                    <div className="text-xs text-gray-400">Print or save to PDF</div>
                  </div>
                </button>

                <button 
                  onClick={async () => {
                    try {
                      const session = shareMenuSession.session;
                      const photos = shareMenuSession.photos;
                      setPrintingSessionId(session.id);
                      setShareMenuSession(null);
                      await generateAndSharePDF(session, photos, 'download');
                    } catch (err) {
                      console.error('Share menu download failed:', err);
                    }
                  }}
                  className="w-full flex items-center gap-4 p-4 rounded-2xl bg-gray-50 dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-gray-700 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400 transition-all group"
                >
                  <div className="w-12 h-12 rounded-xl bg-white dark:bg-gray-700 flex items-center justify-center shadow-sm group-hover:shadow-md transition-all">
                    <Download size={24} />
                  </div>
                  <div className="text-left">
                    <div className="font-bold">Download PDF</div>
                    <div className="text-xs text-gray-400">Save file to your device</div>
                  </div>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isCreatingSession && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { vibrate(HAPTIC.SUCCESS); setIsCreatingSession(false); }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="relative w-full max-w-md bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl overflow-hidden pb-safe"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold dark:text-white">New Audit Session</h3>
                <button onClick={() => { vibrate(HAPTIC.SUCCESS); setIsCreatingSession(false); }} className="p-2 text-gray-400 dark:text-gray-500">
                  <X size={24} />
                </button>
              </div>

              {isAddingNewStore ? (
                <div className="space-y-4 py-4">
                  <h4 className="font-bold text-gray-700 dark:text-gray-300">Add New Store Number</h4>
                  <input 
                    type="number"
                    maxLength={4}
                    placeholder="Enter 4-digit store number"
                    value={customStoreNumber}
                    onChange={(e) => setCustomStoreNumber(e.target.value.slice(0, 4))}
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 dark:border-gray-800 focus:border-blue-500 outline-none transition-colors bg-white dark:bg-gray-800 dark:text-white"
                  />
                  <div className="flex gap-3">
                    <Button variant="ghost" fullWidth onClick={() => setIsAddingNewStore(false)}>Cancel</Button>
                    <Button fullWidth onClick={handleAddCustomStore} disabled={customStoreNumber.length !== 4}>Add Store</Button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleNewSession} className="space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Select Store</label>
                    <div className="flex gap-2">
                      <select 
                        value={newSessionStore}
                        onChange={(e) => { vibrate(HAPTIC.SUCCESS); setNewSessionStore(e.target.value); }}
                        className="flex-1 px-4 py-3 rounded-xl border-2 border-gray-100 dark:border-gray-800 focus:border-blue-500 outline-none bg-white dark:bg-gray-800 font-bold text-gray-700 dark:text-gray-200 appearance-none"
                        disabled={storeOptions.length === 0}
                      >
                        <option value="" disabled>
                          {storeOptions.length === 0 ? 'No assigned stores available' : 'Select a store...'}
                        </option>
                        {storeOptions.map((store) => (
                          <option key={store.id} value={store.id}>{store.label}</option>
                        ))}
                      </select>
                      {canAddLegacyStore && (
                        <button
                          type="button"
                          onClick={() => { vibrate(HAPTIC.SUCCESS); setIsAddingNewStore(true); }}
                          className="w-12 h-12 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-800 text-gray-400 dark:text-gray-500 flex items-center justify-center hover:border-blue-300 hover:text-blue-400 transition-all shrink-0"
                        >
                          <Plus size={20} />
                        </button>
                      )}
                    </div>
                    {storeOptions.length === 0 && (
                      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                        Your store list is managed by admins. Ask an admin to assign a location to your account.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Session Name</label>
                    <input 
                      value={newSessionTitle}
                      onChange={(e) => setNewSessionTitle(e.target.value)}
                      required 
                      placeholder="YYYY/MM/DD - XXXX" 
                      className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 dark:border-gray-800 focus:border-blue-500 outline-none transition-colors bg-white dark:bg-gray-800 dark:text-white"
                    />
                  </div>

                  <Button fullWidth className="mt-4" disabled={!newSessionTitle || !selectedStoreOption}>
                    Start Session
                  </Button>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {renderConfirmationModal()}
      </AnimatePresence>

      <SavedToast />
    </div>
  );
}

// --- Photo Editor Component ---

const MIN_CAMERA_ZOOM = 1;
const MAX_CAMERA_ZOOM = 4;
const CAMERA_ZOOM_STEP = 0.1;

type CameraZoomRange = {
  min: number;
  max: number;
  step: number;
};

type CameraZoomCapabilities = MediaTrackCapabilities & {
  zoom?: {
    min?: number;
    max?: number;
    step?: number;
  };
};

type CameraZoomSettings = MediaTrackSettings & {
  zoom?: number;
};

type CameraZoomConstraintSet = MediaTrackConstraintSet & {
  zoom?: number;
};

const clampCameraZoom = (value: number) => (
  Math.min(MAX_CAMERA_ZOOM, Math.max(MIN_CAMERA_ZOOM, Number(value.toFixed(1))))
);

const getTouchDistance = (touches: TouchList) => {
  const [first, second] = [touches[0], touches[1]];
  if (!first || !second) return 0;
  return Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
};

const getCameraZoomRange = (track: MediaStreamTrack): CameraZoomRange | null => {
  const capabilities = track.getCapabilities?.() as CameraZoomCapabilities | undefined;
  const zoom = capabilities?.zoom;
  if (!zoom) return null;

  const min = typeof zoom.min === 'number' ? zoom.min : MIN_CAMERA_ZOOM;
  const max = typeof zoom.max === 'number' ? zoom.max : MAX_CAMERA_ZOOM;
  const step = typeof zoom.step === 'number' && zoom.step > 0 ? zoom.step : CAMERA_ZOOM_STEP;

  if (max <= min) return null;
  return { min, max, step };
};

const snapNativeZoom = (value: number, range: CameraZoomRange) => {
  const clamped = Math.min(range.max, Math.max(range.min, value));
  const steps = Math.round((clamped - range.min) / range.step);
  return Number((range.min + steps * range.step).toFixed(3));
};

function CameraView({ 
  onCapture,
  onDone,
  onUpload
}: {
  onCapture: (data: string) => void,
  onDone: () => void,
  onUpload: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraRequestKey, setCameraRequestKey] = useState(0);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [zoom, setZoom] = useState(MIN_CAMERA_ZOOM);
  const [nativeZoomRange, setNativeZoomRange] = useState<CameraZoomRange | null>(null);
  const [nativeZoom, setNativeZoom] = useState(MIN_CAMERA_ZOOM);
  const digitalZoom = Math.max(MIN_CAMERA_ZOOM, zoom / Math.max(nativeZoom, MIN_CAMERA_ZOOM));

  useEffect(() => {
    let isActive = true;

    async function startCamera() {
      try {
        setCameraError(null);
        setIsCameraReady(false);
        setZoom(MIN_CAMERA_ZOOM);
        setNativeZoom(MIN_CAMERA_ZOOM);
        setNativeZoomRange(null);
        videoTrackRef.current = null;

        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }

        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('CameraNotSupported');
        }

        const s = await navigator.mediaDevices.getUserMedia({ 
          video: {
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false 
        });

        if (!isActive) {
          s.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = s;
        const videoTrack = s.getVideoTracks()[0] ?? null;
        videoTrackRef.current = videoTrack;
        setNativeZoomRange(videoTrack ? getCameraZoomRange(videoTrack) : null);

        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play().catch(() => {
            // Autoplay can be blocked in some embedded browsers; the video element
            // still receives the stream and will start when the browser allows it.
          });
        }
      } catch (err: any) {
        console.error("Error accessing camera:", err);
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setCameraError('Camera access denied. Please enable camera permissions or upload a photo instead.');
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          setCameraError('No camera found. Please connect a camera or upload a photo.');
        } else if (err.message === 'CameraNotSupported') {
          setCameraError('Camera capture is not available in this browser. Please upload a photo instead.');
        } else {
          setCameraError('Failed to access camera. Please try again or upload a photo.');
        }
      }
    }
    startCamera();
    return () => {
      isActive = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      videoTrackRef.current = null;
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [cameraRequestKey]);

  useEffect(() => {
    const track = videoTrackRef.current;
    if (!track || !nativeZoomRange) {
      setNativeZoom(MIN_CAMERA_ZOOM);
      return;
    }

    let cancelled = false;
    const requestedNativeZoom = snapNativeZoom(Math.min(zoom, nativeZoomRange.max), nativeZoomRange);

    track.applyConstraints({
      advanced: [{ zoom: requestedNativeZoom } as CameraZoomConstraintSet],
    }).then(() => {
      if (cancelled) return;
      const settings = track.getSettings?.() as CameraZoomSettings | undefined;
      setNativeZoom(settings?.zoom ?? requestedNativeZoom);
    }).catch(() => {
      if (!cancelled) setNativeZoom(MIN_CAMERA_ZOOM);
    });

    return () => {
      cancelled = true;
    };
  }, [nativeZoomRange, zoom]);

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 2) return;
    pinchRef.current = {
      distance: getTouchDistance(event.touches),
      zoom,
    };
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 2 || !pinchRef.current) return;

    const distance = getTouchDistance(event.touches);
    if (!distance || !pinchRef.current.distance) return;

    setZoom(clampCameraZoom(pinchRef.current.zoom * (distance / pinchRef.current.distance)));
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length < 2) {
      pinchRef.current = null;
    }
  };

  if (cameraError) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-900 p-8 text-center">
        <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mb-4">
          <Camera size={32} className="text-red-500 dark:text-red-400" />
        </div>
        <p className="text-gray-700 dark:text-gray-300 mb-6 max-w-sm">{cameraError}</p>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <Button onClick={() => setCameraRequestKey((key) => key + 1)}>Try Again</Button>
          <Button variant="outline" onClick={onUpload}>Upload Photo Instead</Button>
          <Button variant="ghost" onClick={onDone}>Cancel</Button>
        </div>
      </div>
    );
  }

  const capture = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const videoWidth = video.videoWidth;
      const videoHeight = video.videoHeight;
      const previewRect = video.getBoundingClientRect();

      if (!videoWidth || !videoHeight || !previewRect.width || !previewRect.height) return;

      const previewAspect = previewRect.width / previewRect.height;
      const videoAspect = videoWidth / videoHeight;
      let baseWidth = videoWidth;
      let baseHeight = videoHeight;
      let baseX = 0;
      let baseY = 0;

      if (videoAspect > previewAspect) {
        baseWidth = videoHeight * previewAspect;
        baseX = (videoWidth - baseWidth) / 2;
      } else {
        baseHeight = videoWidth / previewAspect;
        baseY = (videoHeight - baseHeight) / 2;
      }

      const cropWidth = baseWidth / digitalZoom;
      const cropHeight = baseHeight / digitalZoom;
      const cropX = baseX + (baseWidth - cropWidth) / 2;
      const cropY = baseY + (baseHeight - cropHeight) / 2;

      canvas.width = Math.round(baseWidth);
      canvas.height = Math.round(baseHeight);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);
        const data = canvas.toDataURL('image/jpeg', 0.92);
        onCapture(data);
      }
    }
  };

  return (
    <div
      className="relative h-full w-full flex flex-col overflow-hidden"
      data-testid="camera-pinch-surface"
      aria-label="Pinch to zoom camera"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      style={{ touchAction: 'none' }}
    >
      <video 
        ref={videoRef} 
        autoPlay 
        playsInline 
        onLoadedMetadata={() => setIsCameraReady(true)}
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-150 ease-out"
        style={{ transform: `scale(${digitalZoom})` }}
      />
      <canvas ref={canvasRef} className="hidden" />

      {!isCameraReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-950 text-white z-10">
          <div className="flex flex-col items-center gap-3">
            <RefreshCw size={28} className="animate-spin" />
            <p className="text-sm font-semibold">Starting camera...</p>
          </div>
        </div>
      )}
      
      {/* Top Bar */}
      <div className="absolute top-0 left-0 right-0 p-4 pt-safe flex justify-end z-10">
        <Button 
          variant="primary" 
          onClick={onDone}
          className="bg-blue-600/90 backdrop-blur-md border-none shadow-lg"
        >
          Review
        </Button>
      </div>

      <div className="absolute left-1/2 bottom-32 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/45 px-4 py-2 text-white shadow-lg backdrop-blur-md">
        <ZoomIn size={18} aria-hidden="true" />
        <span className="w-12 text-center text-sm font-bold tabular-nums" aria-live="polite">{zoom.toFixed(1)}x</span>
      </div>

      <button
        onClick={capture}
        disabled={!isCameraReady}
        aria-label="Take snapshot"
        className="absolute left-1/2 -translate-x-1/2 bottom-8 z-10 w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-2xl active:scale-90 transition-transform border-4 border-gray-300/50 disabled:opacity-50 disabled:active:scale-100"
      >
        <div className="w-16 h-16 rounded-full border-2 border-black/10" />
      </button>

      {/* Bottom Controls */}
      <div className="absolute bottom-0 left-0 right-0 p-8 pb-safe-offset-8 flex items-center justify-end z-10 bg-gradient-to-t from-black/60 to-transparent">
        <button
          onClick={onUpload}
          aria-label="Upload photo"
          className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white active:scale-90 transition-transform"
        >
          <Upload size={24} />
        </button>
      </div>
    </div>
  );
}

function TaggingOverlay({ 
  imageData: initialImageData, 
  onSave, 
  onCancel 
}: { 
  imageData: string, 
  onSave: (tag: Tag, comment: string, imageData: string) => void, 
  onCancel: () => void 
}) {
  const [tag, setTag] = useState<Tag>('Other');
  const [comment, setComment] = useState('');
  const [imageData, setImageData] = useState(initialImageData);
  const [showMarkup, setShowMarkup] = useState(false);

  if (showMarkup) {
    return (
      <MarkupEditor 
        imageData={imageData}
        onSave={(newImg) => {
          setImageData(newImg);
          setShowMarkup(false);
        }}
        onCancel={() => setShowMarkup(false)}
      />
    );
  }

  return (
    <div className="h-full w-full bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 flex flex-col overflow-hidden">
      <header className="shrink-0 p-4 pt-safe flex items-center justify-between border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950">
        <Button variant="ghost" onClick={onCancel} className="-ml-2">
          <X size={24} />
        </Button>
        <h2 className="font-bold text-lg">Tag Photo</h2>
        <Button variant="ghost" onClick={() => onSave(tag, comment, imageData)} className="text-blue-600">
          Save
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <div className="relative aspect-video w-full rounded-2xl overflow-hidden shadow-lg border border-gray-100 group">
          <img src={imageData} alt="Captured" className="w-full h-full object-cover" />
          <button 
            onClick={() => setShowMarkup(true)}
            className="absolute bottom-4 right-4 bg-blue-600 text-white px-4 py-3 rounded-full shadow-xl active:scale-90 transition-transform flex items-center gap-2"
          >
            <Pencil size={20} />
            <span className="font-bold text-sm">Markup</span>
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2 block">Category</label>
            <select
              value={tag}
              onChange={(e) => { vibrate(HAPTIC.LIGHT); setTag(e.target.value as Tag); }}
              className="w-full bg-gray-50 dark:bg-black border-2 border-gray-100 dark:border-gray-800 rounded-xl px-4 py-3.5 text-sm font-bold text-gray-700 dark:text-gray-100 focus:border-blue-500 focus:bg-white dark:focus:bg-black outline-none transition-all appearance-none"
            >
              {PRESET_TAGS.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2 block">Comment (Optional)</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add details about this observation..."
              className="w-full bg-gray-50 dark:bg-black border-2 border-gray-100 dark:border-gray-800 rounded-2xl p-4 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-blue-500 focus:bg-white dark:focus:bg-black outline-none transition-all min-h-[100px] resize-none"
            />
          </div>
        </div>
      </div>

      <footer className="p-4 pb-safe-offset-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-950">
        <Button fullWidth onClick={() => onSave(tag, comment, imageData)}>
          Save Entry
        </Button>
      </footer>
    </div>
  );
}

function PhotoEditor({ 
  initialData, 
  onSave, 
  onCancel 
}: { 
  initialData: { imageData: string, tag: Tag, comment: string },
  onSave: (tag: Tag, comment: string, imageData: string) => void,
  onCancel: () => void
}) {
  const [tag, setTag] = useState<Tag>(initialData.tag);
  const [comment, setComment] = useState(initialData.comment);
  const [imageData, setImageData] = useState(initialData.imageData);
  const [showMarkup, setShowMarkup] = useState(false);

  if (showMarkup) {
    return (
      <MarkupEditor 
        imageData={imageData}
        onSave={(newImg) => {
          setImageData(newImg);
          setShowMarkup(false);
        }}
        onCancel={() => setShowMarkup(false)}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 flex flex-col">
      <div className="p-4 flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pt-safe bg-white dark:bg-gray-950">
        <Button variant="ghost" onClick={() => { vibrate(HAPTIC.SUCCESS); onCancel(); }}>
          <X size={24} />
        </Button>
        <h2 className="font-bold text-lg">Edit Entry</h2>
        <Button variant="ghost" onClick={() => { vibrate(HAPTIC.HEAVY); onSave(tag, comment, imageData); }} className="text-blue-600">
          <Check size={24} />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="relative aspect-square w-full bg-black flex items-center justify-center">
          <img 
            src={imageData} 
            alt="Preview" 
            className="max-w-full max-h-full object-contain"
            referrerPolicy="no-referrer"
          />
          <button 
            onClick={() => setShowMarkup(true)}
            className="absolute bottom-4 right-4 bg-blue-600 text-white px-5 py-4 rounded-full shadow-2xl active:scale-90 transition-transform flex items-center gap-2"
          >
            <Pencil size={24} />
            <span className="font-bold">Markup Photo</span>
          </button>
        </div>

        <div className="p-6 space-y-8">
          <div>
            <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Select Category</label>
            <select
              value={tag}
              onChange={(e) => { vibrate(HAPTIC.SUCCESS); setTag(e.target.value as Tag); }}
              className="w-full bg-white dark:bg-black border-2 border-gray-100 dark:border-gray-800 rounded-xl px-4 py-3.5 text-sm font-bold text-gray-700 dark:text-gray-100 focus:border-blue-500 outline-none transition-all appearance-none"
            >
              {PRESET_TAGS.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Comments</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add details about this issue..."
              rows={4}
              className="w-full bg-white dark:bg-black px-4 py-3 rounded-2xl border-2 border-gray-100 dark:border-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-blue-500 outline-none transition-colors resize-none"
            />
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 pb-safe">
        <Button fullWidth onClick={() => { vibrate(HAPTIC.HEAVY); onSave(tag, comment, imageData); }}>
          Save Changes
        </Button>
      </div>
    </div>
  );
}
