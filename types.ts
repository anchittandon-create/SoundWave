
export enum AppState {
  KEY_SETUP = 'KEY_SETUP',
  AUTH = 'AUTH',
  HOME = 'HOME',
  CREATE = 'CREATE',
  DASHBOARD = 'DASHBOARD'
}

export enum CreationMode {
  SINGLE = 'Single Song',
  ALBUM = 'Album'
}

export enum Status {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED'
}

export interface UserSession {
  id: string;
  name: string;
  mobile: string;
}

export interface TrackData {
  id: string;
  title: string;
  // Use string | Blob to handle both UI display (URLs) and IndexedDB storage (Blobs)
  audioUrl: string | Blob;
  videoUrl?: string | Blob;
  duration: number;
}

export interface ProjectRecord {
  id: string;
  userId: string;
  mode: CreationMode;
  title: string;
  prompt: string;
  albumPrompts?: string[];
  genres: string[];
  durationSeconds: number;
  vocalLanguages: string[];
  lyrics: string;
  artistReferences: string[];
  videoEnabled: boolean;
  videoStyle?: string;
  tracks: TrackData[];
  status: Status;
  createdAt: number;
  metadata?: {
    mood: string;
    energyLevel: number;
    technicalNotes: string;
  };
}

export interface SuggestionState {
  field: string;
  original: string;
  suggested: string;
  isActive: boolean;
}
