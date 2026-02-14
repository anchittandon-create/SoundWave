
import { UserSession, ProjectRecord } from "../types";

const SESSION_KEY = 'sw_session_v2';
const PROJECTS_KEY = 'sw_projects_v2';

/**
 * SoundWeave Database Service
 * Mimics Supabase PostgreSQL & Storage behavior using persistent local storage.
 */
export const db = {
  // Authentication / Session
  getSession: (): UserSession | null => {
    const data = localStorage.getItem(SESSION_KEY);
    return data ? JSON.parse(data) : null;
  },
  
  saveSession: (session: UserSession) => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  },
  
  clearSession: () => {
    localStorage.removeItem(SESSION_KEY);
  },

  // Project Management (Mocking Postgres)
  getProjects: (userId: string): ProjectRecord[] => {
    const data = localStorage.getItem(PROJECTS_KEY);
    const all: ProjectRecord[] = data ? JSON.parse(data) : [];
    return all
      .filter(p => p.userId === userId)
      .sort((a, b) => b.createdAt - a.createdAt);
  },

  saveProject: async (project: ProjectRecord): Promise<void> => {
    // Simulate network latency
    await new Promise(r => setTimeout(r, 800));
    
    const data = localStorage.getItem(PROJECTS_KEY);
    const all: ProjectRecord[] = data ? JSON.parse(data) : [];
    const index = all.findIndex(p => p.id === project.id);
    
    if (index > -1) {
      all[index] = project;
    } else {
      all.push(project);
    }
    
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(all));
  },

  deleteProject: (id: string) => {
    const data = localStorage.getItem(PROJECTS_KEY);
    const all: ProjectRecord[] = data ? JSON.parse(data) : [];
    const filtered = all.filter(p => p.id !== id);
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(filtered));
  },

  // Storage Simulation
  uploadFile: async (blob: Blob, path: string): Promise<string> => {
    // In a real Supabase environment, this would use supabase.storage.from().upload()
    // Here we convert to object URL to simulate a hosted resource link
    return URL.createObjectURL(blob);
  }
};
