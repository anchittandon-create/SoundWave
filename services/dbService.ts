
import { UserSession, ProjectRecord } from "../types";

const SESSION_KEY = 'sw_session_v2';
const DB_NAME = 'SoundWeaveDB';
const DB_VERSION = 1;
const STORE_PROJECTS = 'projects';

/**
 * SoundWeave Database Service
 * Uses IndexedDB to store real binary data (Blobs) persistently.
 */
class SoundWeaveDB {
  private db: IDBDatabase | null = null;

  private async getDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(request.result);
      };
      request.onupgradeneeded = (event: any) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
          db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
        }
      };
    });
  }

  // Authentication / Session
  getSession(): UserSession | null {
    const data = localStorage.getItem(SESSION_KEY);
    return data ? JSON.parse(data) : null;
  }
  
  saveSession(session: UserSession) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }
  
  clearSession() {
    localStorage.removeItem(SESSION_KEY);
  }

  // Project Management (IndexedDB)
  async getProjects(userId: string): Promise<ProjectRecord[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_PROJECTS, 'readonly');
      const store = transaction.objectStore(STORE_PROJECTS);
      const request = store.getAll();
      
      request.onsuccess = () => {
        const all = request.result as ProjectRecord[];
        const filtered = all
          .filter(p => p.userId === userId)
          .sort((a, b) => b.createdAt - a.createdAt);
        resolve(filtered);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async saveProject(project: ProjectRecord): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_PROJECTS, 'readwrite');
      const store = transaction.objectStore(STORE_PROJECTS);
      
      // Note: project.tracks will contain Blob objects when being saved
      const request = store.put(project);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async deleteProject(id: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_PROJECTS, 'readwrite');
      const store = transaction.objectStore(STORE_PROJECTS);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

export const db = new SoundWeaveDB();
