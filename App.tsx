
import React, { useState, useEffect } from 'react';
import { 
  AppState, 
  UserSession, 
  CreationMode, 
  ProjectRecord, 
  Status, 
  TrackData,
  SuggestionState
} from './types';
import { db } from './services/dbService';
import { getFieldSuggestion, interpretIntent, generateVeoVideo, getIsCloudExhausted } from './services/geminiService';
import { generateSynthesizedAudioBlob } from './services/audioService';

const GENRES = ["Ambient", "Cyberpunk", "Deep House", "Industrial", "Jazz Fusion", "Lo-Fi", "Neo-Classical", "Orchestral", "Phonk", "Synthwave", "Techno"];
const LANGUAGES = ["Instrumental", "English", "Japanese", "French", "Spanish", "German", "Korean"];

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.KEY_SETUP);
  const [session, setSession] = useState<UserSession | null>(null);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [activeTab, setActiveTab] = useState<AppState>(AppState.HOME);

  interface AlbumTrack {
    title: string;
    prompt: string;
    genres: string[];
    vocalLangs: string[];
    lyrics: string;
    duration: number;
    videoEnabled: boolean;
    videoStyle: string;
  }
  const defaultAlbumTrack = (): AlbumTrack => ({
    title: '', prompt: '', genres: [], vocalLangs: ['Instrumental'], lyrics: '', duration: 120, videoEnabled: false, videoStyle: ''
  });

  // Form State
  const [mode, setMode] = useState<CreationMode>(CreationMode.SINGLE);
  const [numSongs, setNumSongs] = useState(3);
  const [albumTracks, setAlbumTracks] = useState<AlbumTrack[]>([defaultAlbumTrack(), defaultAlbumTrack(), defaultAlbumTrack()]);
  const [expandedTrack, setExpandedTrack] = useState<number | null>(0);
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [duration, setDuration] = useState(120);
  const [vocalLangs, setVocalLangs] = useState<string[]>(["Instrumental"]);
  const [lyrics, setLyrics] = useState('');
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [videoStyle, setVideoStyle] = useState('');

  // UI State
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [suggestingFields, setSuggestingFields] = useState<Set<string>>(new Set());
  const [aiUsedFields, setAiUsedFields] = useState<Set<string>>(new Set());
  const [globalError, setGlobalError] = useState<{ message: string; isQuota: boolean; isHardLimit: boolean } | null>(null);
  const [isQuotaExhausted, setIsQuotaExhausted] = useState(false);

  // Keep track of active object URLs to clean up if needed
  const [objectUrls, setObjectUrls] = useState<string[]>([]);

  useEffect(() => {
    const init = async () => {
      // @ts-ignore
      const hasKey = await window.aistudio.hasSelectedApiKey();
      if (hasKey) {
        const s = db.getSession();
        if (s) {
          setSession(s);
          setAppState(AppState.HOME);
          loadAndProcessProjects(s.id);
        } else {
          setAppState(AppState.AUTH);
        }
      } else {
        setAppState(AppState.KEY_SETUP);
      }
    };
    init();

    return () => {
      // Cleanup URLs on unmount
      objectUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  const loadAndProcessProjects = async (userId: string) => {
    const rawProjects = await db.getProjects(userId);
    const processed = rawProjects.map(p => {
      p.tracks = p.tracks.map(t => {
        // If track data is a Blob (stored in IDB), recreate its URL
        // Fix: Use type-safe instanceof check by ensuring t.audioUrl is not just string (defined as string | Blob in types.ts)
        if (t.audioUrl instanceof Blob) {
          t.audioUrl = URL.createObjectURL(t.audioUrl);
        }
        // Fix: Use type-safe instanceof check for videoUrl
        if (t.videoUrl instanceof Blob) {
          t.videoUrl = URL.createObjectURL(t.videoUrl);
        }
        return t;
      });
      return p;
    });
    setProjects(processed);
  };

  const handleKeySetup = async () => {
    setGlobalError(null);
    setIsQuotaExhausted(false);
    // @ts-ignore
    await window.aistudio.openSelectKey();
    const s = db.getSession();
    if (s) {
      setSession(s);
      setAppState(AppState.HOME);
      loadAndProcessProjects(s.id);
    } else {
      setAppState(AppState.AUTH);
    }
  };

  const handleAuth = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const mobile = (fd.get('mobile') as string).trim();
    const name = fd.get('name') as string;
    const indianMobileRegex = /^(?:\+91)?[6789]\d{9}$/;
    
    if (!indianMobileRegex.test(mobile)) {
      alert("Please enter a valid Indian mobile number.");
      return;
    }

    const newSession: UserSession = { id: crypto.randomUUID(), name, mobile };
    db.saveSession(newSession);
    setSession(newSession);
    setAppState(AppState.HOME);
    setActiveTab(AppState.HOME);
    loadAndProcessProjects(newSession.id);
  };

  const handleLogout = () => {
    db.clearSession();
    setSession(null);
    setAppState(AppState.AUTH);
    setProjects([]);
    setActiveTab(AppState.HOME);
  };

  const requestSuggestion = async (field: string, currentValue: string, trackIndex?: number, action: 'new' | 'enhance' = 'new') => {
    const suggestionFieldId = trackIndex !== undefined ? `albumTrack_${trackIndex}_${field}` : field;
    if (suggestingFields.has(suggestionFieldId)) return;
    setSuggestingFields(prev => new Set(prev).add(suggestionFieldId));
    setGlobalError(null);
    try {
      const context = mode === CreationMode.ALBUM && trackIndex !== undefined 
        ? { mode, title: albumTracks[trackIndex].title, prompt: albumTracks[trackIndex].prompt, selectedGenres: albumTracks[trackIndex].genres, vocalLangs: albumTracks[trackIndex].vocalLangs, lyrics: albumTracks[trackIndex].lyrics, videoStyle: albumTracks[trackIndex].videoStyle }
        : { mode, title, prompt, selectedGenres, vocalLangs, lyrics, videoStyle };
      const suggestedText = await getFieldSuggestion(field, currentValue, context, action);
      
      // Auto-apply suggestion
      if (suggestionFieldId.startsWith('albumTrack_')) {
        const parts = suggestionFieldId.split('_');
        const index = parseInt(parts[1]);
        const trackField = parts[2] as keyof AlbumTrack;
        updateAlbumTrack(index, trackField, suggestedText);
      } else {
        if (field === 'title') setTitle(suggestedText);
        if (field === 'prompt') setPrompt(suggestedText);
        if (field === 'lyrics') setLyrics(suggestedText);
        if (field === 'videoStyle') setVideoStyle(suggestedText);
        if (field === 'numSongs') {
          const val = parseInt(suggestedText) || 3;
          handleNumSongsChange(val);
        }
      }

      // Mark field as having used AI
      setAiUsedFields(prev => new Set(prev).add(suggestionFieldId));
      
      if (getIsCloudExhausted()) {
        setIsQuotaExhausted(true);
      }
    } catch (e: any) {
      setIsQuotaExhausted(true);
      setGlobalError({ 
        message: "Neural Cloud limited. Local Preset Engine engaged.", 
        isQuota: true,
        isHardLimit: true
      });
    } finally {
      setSuggestingFields(prev => {
        const next = new Set(prev);
        next.delete(suggestionFieldId);
        return next;
      });
    }
  };

  const updateAlbumTrack = (index: number, field: keyof AlbumTrack, value: any) => {
    setAlbumTracks(prev => {
      const newTracks = [...prev];
      newTracks[index] = { ...newTracks[index], [field]: value };
      return newTracks;
    });
  };

  const handleNumSongsChange = (val: number) => {
    const validVal = Math.max(1, Math.min(10, val));
    setNumSongs(validVal);
    setAlbumTracks(prev => {
      const newTracks = [...prev];
      if (validVal > prev.length) {
        for (let i = prev.length; i < validVal; i++) newTracks.push(defaultAlbumTrack());
      } else {
        newTracks.length = validVal;
      }
      return newTracks;
    });
  };

  const startGeneration = async () => {
    if (!session) {
      setAppState(AppState.AUTH);
      return;
    }

    if (mode === CreationMode.ALBUM) {
      if (!title) {
        alert("Please provide an Album Title.");
        return;
      }
      const isValid = albumTracks.every(t => t.title && t.prompt && t.genres.length > 0);
      if (!isValid) {
        alert("Please provide Title, Creative Brief, and Genres for all tracks in the album.");
        return;
      }
    } else {
      if (!title || !prompt || selectedGenres.length === 0) {
        alert("Please provide Title, Creative Brief, and Genres.");
        return;
      }
    }

    setIsProcessing(true);
    setGlobalError(null);
    const projectId = crypto.randomUUID();
    const newProject: ProjectRecord = {
      id: projectId,
      userId: session.id,
      mode, 
      title, 
      prompt: mode === CreationMode.SINGLE ? prompt : "Album Generation", 
      albumTracks: mode === CreationMode.ALBUM ? albumTracks.map(t => ({
        title: t.title,
        prompt: t.prompt,
        genres: t.genres,
        vocalLanguages: t.vocalLangs,
        lyrics: t.lyrics,
        durationSeconds: t.duration,
        videoEnabled: t.videoEnabled,
        videoStyle: t.videoStyle
      })) : undefined,
      genres: mode === CreationMode.SINGLE ? selectedGenres : albumTracks[0].genres,
      durationSeconds: mode === CreationMode.SINGLE ? duration : albumTracks.reduce((acc, t) => acc + t.duration, 0),
      vocalLanguages: mode === CreationMode.SINGLE ? vocalLangs : [],
      lyrics: mode === CreationMode.SINGLE ? lyrics : "",
      artistReferences: [],
      videoEnabled: mode === CreationMode.SINGLE ? videoEnabled : albumTracks.some(t => t.videoEnabled),
      videoStyle: mode === CreationMode.SINGLE ? videoStyle : "",
      tracks: [],
      status: Status.PROCESSING,
      createdAt: Date.now()
    };

    try {
      const intent = await interpretIntent(newProject);
      newProject.metadata = intent;
      
      const trackCount = mode === CreationMode.ALBUM ? numSongs : 1;
      const tracks: TrackData[] = [];

      for (let i = 0; i < trackCount; i++) {
        const currentTrack = mode === CreationMode.ALBUM ? albumTracks[i] : null;
        const currentPrompt = currentTrack ? currentTrack.prompt : prompt;
        const currentDuration = currentTrack ? currentTrack.duration : duration;
        const currentVideoEnabled = currentTrack ? currentTrack.videoEnabled : videoEnabled;
        const currentVideoStyle = currentTrack ? currentTrack.videoStyle : videoStyle;
        const currentGenres = currentTrack ? currentTrack.genres : selectedGenres;

        const audioBlob = await generateSynthesizedAudioBlob(currentDuration);
        let videoBlob: any = undefined;
        if (currentVideoEnabled && !isQuotaExhausted) {
          try {
            videoBlob = await generateVeoVideo(currentVideoStyle || "Minimalist", currentGenres[0] || "Ambient", currentPrompt);
          } catch (veoErr) {
            console.warn("Video failed, continuing with audio only.");
          }
        }

        // We store real Blobs in IDB for persistence
        tracks.push({
          id: crypto.randomUUID(),
          title: currentTrack ? currentTrack.title : title,
          audioUrl: audioBlob,
          videoUrl: videoBlob,
          duration: currentDuration
        });
      }

      newProject.tracks = tracks;
      newProject.status = Status.COMPLETED;
      await db.saveProject(newProject);
      
      // Fix: Clone the object manually without using JSON.stringify to avoid losing Blob data during serialization
      const displayProject: ProjectRecord = {
        ...newProject,
        tracks: newProject.tracks.map(t => ({
          ...t,
          audioUrl: URL.createObjectURL(t.audioUrl as Blob),
          videoUrl: t.videoUrl ? URL.createObjectURL(t.videoUrl as Blob) : undefined
        }))
      };

      setProjects(prev => [displayProject, ...prev]);
      setActiveTab(AppState.DASHBOARD);
    } catch (e: any) {
      newProject.status = Status.FAILED;
      await db.saveProject(newProject);
      setGlobalError({ message: "Neural Synthesis Interrupted. Try a shorter track.", isQuota: false, isHardLimit: false });
    } finally {
      setIsProcessing(false);
      setIsQuotaExhausted(getIsCloudExhausted());
    }
  };

  if (appState === AppState.KEY_SETUP) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-deep p-6">
        <div className="glass w-full max-w-lg p-12 rounded-[3rem] space-y-10 border border-white/5 shadow-2xl text-center">
          <div className="space-y-4">
            <h1 className="text-4xl font-black tracking-tighter text-white">Neural Uplink</h1>
            <p className="text-zinc-500 text-sm font-medium leading-relaxed">SoundWeave requires a Google Cloud API key for high-fidelity synthesis.</p>
          </div>
          <button onClick={handleKeySetup} className="w-full bg-brand py-6 rounded-2xl font-black text-xs uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all shadow-xl shadow-brand/20">Configure API Key</button>
        </div>
      </div>
    );
  }

  if (appState === AppState.AUTH) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-deep p-6">
        <div className="glass w-full max-w-md p-10 rounded-[2.5rem] space-y-10 border border-white/5 shadow-2xl">
          <div className="text-center space-y-2">
            <h1 className="text-5xl font-black tracking-tighter text-white">SOUNDWEAVE</h1>
            <p className="text-zinc-500 text-xs font-bold uppercase tracking-[0.3em]">Neural Music Studio</p>
          </div>
          <form onSubmit={handleAuth} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest px-1">Identity</label>
                <input name="name" required className="w-full bg-surface border border-white/5 rounded-2xl px-5 py-4 text-white focus:outline-none focus:border-brand/50 transition-all placeholder-zinc-800" placeholder="Maestro Name" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest px-1">Mobile Access</label>
                <input name="mobile" type="tel" required className="w-full bg-surface border border-white/5 rounded-2xl px-5 py-4 text-white focus:outline-none focus:border-brand/50 transition-all placeholder-zinc-800" placeholder="+91 9876543210" />
              </div>
            </div>
            <button type="submit" className="w-full bg-brand py-5 rounded-2xl font-black text-xs uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all shadow-xl shadow-brand/20">Initialize Workspace</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-deep font-sans selection:bg-brand selection:text-white">
      {/* Mobile Backdrop */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/80 z-40 md:hidden backdrop-blur-sm"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar Nav */}
      <aside className={`fixed md:sticky top-0 h-screen z-50 ${isSidebarCollapsed ? 'w-24' : 'w-80'} border-r border-white/5 bg-[#070707] flex flex-col transition-all duration-300 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className={`flex items-center ${isSidebarCollapsed ? 'p-6 flex-col gap-6' : 'p-10 justify-between'}`}>
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-8 h-8 shrink-0 rounded-lg bg-brand flex items-center justify-center font-black text-white italic">S</div>
            {!isSidebarCollapsed && <h2 className="text-2xl font-black tracking-tighter text-white whitespace-nowrap">SOUNDWEAVE</h2>}
          </div>
          <button onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} className="hidden md:flex text-zinc-500 hover:text-white transition-colors shrink-0 w-8 h-8 items-center justify-center rounded-lg hover:bg-white/5">
            {isSidebarCollapsed ? '▶' : '◀'}
          </button>
          <button onClick={() => setIsMobileMenuOpen(false)} className="md:hidden text-zinc-500 hover:text-white transition-colors shrink-0 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5">
            ✕
          </button>
        </div>
        <nav className="flex-1 px-6 space-y-1">
          <NavItem active={activeTab === AppState.HOME} onClick={() => { setActiveTab(AppState.HOME); setIsMobileMenuOpen(false); }} icon="🏠" label="Home" collapsed={isSidebarCollapsed} />
          <NavItem active={activeTab === AppState.CREATE} onClick={() => { setActiveTab(AppState.CREATE); setIsMobileMenuOpen(false); }} icon="✨" label="Studio" collapsed={isSidebarCollapsed} />
          <NavItem active={activeTab === AppState.DASHBOARD} onClick={() => { setActiveTab(AppState.DASHBOARD); setIsMobileMenuOpen(false); }} icon="📂" label="Workspace" collapsed={isSidebarCollapsed} />
        </nav>
        
        {!isSidebarCollapsed && (
          <div className="px-6 py-4">
             <div className={`p-4 rounded-2xl border transition-all ${isQuotaExhausted ? 'bg-amber-500/10 border-amber-500/20 shadow-[0_0_20px_rgba(245,158,11,0.05)]' : 'bg-green-500/5 border-green-500/10'}`}>
                <div className="flex items-center justify-between mb-2">
                   <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Neural Link</span>
                   <div className={`w-2 h-2 rounded-full ${isQuotaExhausted ? 'bg-amber-500 animate-pulse' : 'bg-green-500'}`} />
                </div>
                <p className={`text-[10px] font-bold uppercase tracking-tight ${isQuotaExhausted ? 'text-amber-400' : 'text-zinc-400'}`}>
                   {isQuotaExhausted ? 'Local Presets Active' : 'Hybrid Cloud Active'}
                </p>
             </div>
          </div>
        )}

        <div className={`p-8 border-t border-white/5 space-y-6 ${isSidebarCollapsed ? 'flex flex-col items-center px-4' : ''}`}>
          {!isSidebarCollapsed && <button onClick={handleKeySetup} className="w-full text-[10px] uppercase font-black py-3 border border-brand/20 rounded-xl bg-brand/5 text-brand hover:text-white transition-all">Credentials</button>}
          {session && (
            <div className="space-y-4 w-full">
              <div className={`flex items-center group ${isSidebarCollapsed ? 'justify-center' : 'gap-4'}`}>
                <div className="w-12 h-12 shrink-0 rounded-2xl bg-gradient-to-br from-brand to-blue-600 flex items-center justify-center font-black text-xl shadow-lg shadow-brand/20" title={isSidebarCollapsed ? session.name : undefined}>{session.name[0]}</div>
                {!isSidebarCollapsed && (
                  <div className="min-w-0">
                    <p className="text-sm font-black truncate text-white">{session.name}</p>
                    <p className="text-[10px] font-mono text-zinc-600 truncate">{session.mobile}</p>
                  </div>
                )}
              </div>
              {!isSidebarCollapsed && <button onClick={handleLogout} className="w-full text-[9px] font-black uppercase tracking-widest text-zinc-800 hover:text-red-500 transition-colors py-2 border border-white/5 rounded-lg">Terminate Session</button>}
            </div>
          )}
        </div>
      </aside>

      {/* Content Area */}
      <main className="flex-1 overflow-y-auto w-full">
        {/* Mobile Header */}
        <div className="md:hidden flex items-center justify-between p-6 border-b border-white/5 sticky top-0 bg-deep/80 backdrop-blur-md z-30">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center font-black text-white italic">S</div>
            <h2 className="text-xl font-black tracking-tighter text-white">SOUNDWEAVE</h2>
          </div>
          <button onClick={() => setIsMobileMenuOpen(true)} className="text-white p-2">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
          </button>
        </div>

        <div className="max-w-6xl mx-auto p-6 md:p-10 lg:p-16 relative">
          
          {globalError && (
            <div className="mb-10 animate-in slide-in-from-top-4 duration-500">
               <div className={`glass border-l-4 p-8 rounded-[2rem] flex items-center justify-between gap-6 ${globalError.isQuota ? 'border-amber-500 bg-amber-500/5' : 'border-red-500 bg-red-500/5'}`}>
                  <div className="flex items-center gap-6">
                     <span className="text-3xl">{globalError.isHardLimit ? '📚' : '⚠️'}</span>
                     <div className="space-y-1">
                        <p className={`text-sm font-black uppercase tracking-widest ${globalError.isQuota ? 'text-amber-400' : 'text-red-400'}`}>{globalError.message}</p>
                        <p className="text-[10px] text-zinc-500 font-bold">The SoundWeave Local Library will now provide deterministic creative suggestions.</p>
                     </div>
                  </div>
                  <div className="flex items-center gap-6 shrink-0">
                    <button onClick={handleKeySetup} className="bg-brand px-6 py-3 rounded-xl text-[10px] font-black text-white uppercase tracking-widest shadow-xl shadow-brand/20">Update Uplink</button>
                    <button onClick={() => setGlobalError(null)} className="text-[10px] font-black text-zinc-600 uppercase">Dismiss</button>
                  </div>
               </div>
            </div>
          )}

          {activeTab === AppState.HOME && (
            <div className="space-y-10 md:space-y-16 py-6 md:py-10 animate-in fade-in duration-1000">
              <div className="space-y-4">
                <h1 className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tighter leading-none">
                  Neural <br/><span className="text-brand">Soundscapes.</span>
                </h1>
                <p className="text-zinc-500 text-base md:text-lg max-w-xl font-medium">Professional-grade AI music synthesis for modern creators.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                <button onClick={() => setActiveTab(AppState.CREATE)} className="glass p-8 md:p-12 rounded-[2rem] md:rounded-[3rem] text-left hover:border-brand/40 transition-all group relative overflow-hidden">
                  <h3 className="text-2xl md:text-3xl font-black mb-2 md:mb-3">Initiate Project</h3>
                  <p className="text-zinc-500 text-xs md:text-sm font-medium">Construct new audio signatures from creative prompts.</p>
                </button>
                <button onClick={() => setActiveTab(AppState.DASHBOARD)} className="glass p-8 md:p-12 rounded-[2rem] md:rounded-[3rem] text-left hover:border-brand/40 transition-all group relative overflow-hidden">
                  <h3 className="text-2xl md:text-3xl font-black mb-2 md:mb-3">Workspace</h3>
                  <p className="text-zinc-500 text-xs md:text-sm font-medium">Audit existing productions and archives.</p>
                </button>
              </div>
            </div>
          )}

          {activeTab === AppState.CREATE && (
            <div className={`space-y-10 md:space-y-16 animate-in fade-in duration-700 ${isProcessing ? 'pointer-events-none' : ''}`}>
              <header className="flex flex-col md:flex-row md:justify-between md:items-end gap-6 border-b border-white/5 pb-6 md:pb-10">
                <div>
                  <h2 className="text-4xl md:text-5xl font-black tracking-tighter">Studio Deck</h2>
                  <p className="text-zinc-500 font-bold uppercase text-[10px] tracking-[0.4em] mt-2">New Neural Synthesis Intent</p>
                </div>
                {isProcessing && (
                  <div className="flex items-center gap-4 bg-brand/10 border border-brand/20 px-6 py-3 rounded-2xl self-start md:self-auto">
                    <span className="w-2 h-2 rounded-full bg-brand animate-ping"></span>
                    <span className="text-[10px] font-black text-brand uppercase tracking-widest">Synthesizing Signal...</span>
                  </div>
                )}
              </header>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16">
                <div className="col-span-1 lg:col-span-8 space-y-10 md:space-y-16">
                  <section className="space-y-8 md:space-y-10">
                    <div className="space-y-4">
                      <label className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-600 px-1">Creation Mode</label>
                      <div className="flex gap-4">
                        <button 
                          onClick={() => setMode(CreationMode.SINGLE)} 
                          className={`flex-1 py-4 rounded-xl text-xs font-black uppercase tracking-widest border transition-all ${mode === CreationMode.SINGLE ? 'bg-brand border-brand text-white' : 'border-white/5 text-zinc-500 hover:text-zinc-300'}`}
                        >
                          Single Track
                        </button>
                        <button 
                          onClick={() => setMode(CreationMode.ALBUM)} 
                          className={`flex-1 py-4 rounded-xl text-xs font-black uppercase tracking-widest border transition-all ${mode === CreationMode.ALBUM ? 'bg-brand border-brand text-white' : 'border-white/5 text-zinc-500 hover:text-zinc-300'}`}
                        >
                          Album
                        </button>
                      </div>
                    </div>

                    <Field label={mode === CreationMode.ALBUM ? "Album Title" : "Project Title"} value={title} onChange={setTitle} onSuggest={() => requestSuggestion('title', title, undefined, 'new')} onEnhance={() => requestSuggestion('title', title, undefined, 'enhance')} hasAiUsed={aiUsedFields.has('title')} suggesting={suggestingFields.has('title')} exhausted={isQuotaExhausted} placeholder={mode === CreationMode.ALBUM ? "e.g. Neon Nights EP" : "e.g. Midnight Drift"} />
                    
                    {mode === CreationMode.ALBUM && (
                      <div className="space-y-4">
                         <div className="flex justify-between items-center px-1">
                           <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-700">Number of Songs</label>
                           <span className="text-brand font-black">{numSongs}</span>
                         </div>
                         <input type="range" min="2" max="10" step="1" value={numSongs} onChange={e => handleNumSongsChange(parseInt(e.target.value))} className="w-full h-1.5 bg-white/5 accent-brand rounded-full cursor-none appearance-none" />
                      </div>
                    )}
                  </section>

                  {mode === CreationMode.SINGLE ? (
                    <>
                      <section className="space-y-8 md:space-y-10">
                        <Field label="Creative Brief" isTextArea value={prompt} onChange={setPrompt} onSuggest={() => requestSuggestion('prompt', prompt, undefined, 'new')} onEnhance={() => requestSuggestion('prompt', prompt, undefined, 'enhance')} hasAiUsed={aiUsedFields.has('prompt')} suggesting={suggestingFields.has('prompt')} exhausted={isQuotaExhausted} placeholder="Describe the sonic atmosphere..." />
                      </section>

                      <section className="space-y-6 md:space-y-8">
                        <label className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-600 px-1">Genre Constraints</label>
                        <div className="flex flex-wrap gap-2">
                          {GENRES.map(g => (
                            <button key={g} onClick={() => setSelectedGenres(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g])} className={`px-4 py-2 md:px-5 md:py-3 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest border transition-all ${selectedGenres.includes(g) ? 'bg-brand border-brand text-white' : 'border-white/5 text-zinc-700 hover:text-zinc-400'}`}>
                              {g}
                            </button>
                          ))}
                        </div>
                      </section>

                      <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-6">
                          <div className="flex items-center gap-4 mb-2">
                            <label className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-600 px-1">Visual synthesis</label>
                            <button onClick={() => setVideoEnabled(!videoEnabled)} className={`w-10 h-5 rounded-full transition-all relative ${videoEnabled ? 'bg-brand' : 'bg-zinc-800'}`}>
                              <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${videoEnabled ? 'left-6' : 'left-1'}`} />
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            {LANGUAGES.map(l => (
                              <button key={l} onClick={() => setVocalLangs(prev => prev.includes(l) ? prev.filter(x => x !== l) : [...prev, l])} className={`px-3 py-3 md:px-4 md:py-4 rounded-xl border text-[8px] md:text-[9px] font-black uppercase tracking-tighter transition-all ${vocalLangs.includes(l) ? 'border-brand bg-brand/5 text-white' : 'border-white/5 text-zinc-800'}`}>
                                {l}
                              </button>
                            ))}
                          </div>
                        </div>
                        <Field label="Lyrics / Narrative" isTextArea value={lyrics} onChange={setLyrics} onSuggest={() => requestSuggestion('lyrics', lyrics, undefined, 'new')} onEnhance={() => requestSuggestion('lyrics', lyrics, undefined, 'enhance')} hasAiUsed={aiUsedFields.has('lyrics')} suggesting={suggestingFields.has('lyrics')} exhausted={isQuotaExhausted} />
                      </section>
                    </>
                  ) : (
                    <div className="space-y-4">
                      {albumTracks.map((track, i) => (
                        <div key={i} className="border border-white/5 rounded-[2rem] overflow-hidden bg-surface/20">
                          <button 
                            onClick={() => setExpandedTrack(expandedTrack === i ? null : i)}
                            className="w-full flex items-center justify-between p-6 hover:bg-white/5 transition-colors"
                          >
                            <div className="flex items-center gap-4">
                              <span className="w-8 h-8 rounded-full bg-brand/20 text-brand flex items-center justify-center font-black text-xs">{i + 1}</span>
                              <span className="font-black text-lg">{track.title || `Track ${i + 1}`}</span>
                            </div>
                            <span className="text-zinc-500">{expandedTrack === i ? '▼' : '▶'}</span>
                          </button>
                          
                          {expandedTrack === i && (
                            <div className="p-6 md:p-10 border-t border-white/5 space-y-10">
                              <Field label="Track Title" value={track.title} onChange={(val: string) => updateAlbumTrack(i, 'title', val)} onSuggest={() => requestSuggestion('title', track.title, i, 'new')} onEnhance={() => requestSuggestion('title', track.title, i, 'enhance')} hasAiUsed={aiUsedFields.has(`albumTrack_${i}_title`)} suggesting={suggestingFields.has(`albumTrack_${i}_title`)} exhausted={isQuotaExhausted} placeholder="e.g. Neon Resonance" />
                              
                              <Field label="Creative Brief" isTextArea value={track.prompt} onChange={(val: string) => updateAlbumTrack(i, 'prompt', val)} onSuggest={() => requestSuggestion('prompt', track.prompt, i, 'new')} onEnhance={() => requestSuggestion('prompt', track.prompt, i, 'enhance')} hasAiUsed={aiUsedFields.has(`albumTrack_${i}_prompt`)} suggesting={suggestingFields.has(`albumTrack_${i}_prompt`)} exhausted={isQuotaExhausted} placeholder="Describe the sonic atmosphere..." />
                              
                              <section className="space-y-6 md:space-y-8">
                                <label className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-600 px-1">Genre Constraints</label>
                                <div className="flex flex-wrap gap-2">
                                  {GENRES.map(g => (
                                    <button key={g} onClick={() => {
                                      const newGenres = track.genres.includes(g) ? track.genres.filter(x => x !== g) : [...track.genres, g];
                                      updateAlbumTrack(i, 'genres', newGenres);
                                    }} className={`px-4 py-2 md:px-5 md:py-3 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest border transition-all ${track.genres.includes(g) ? 'bg-brand border-brand text-white' : 'border-white/5 text-zinc-700 hover:text-zinc-400'}`}>
                                      {g}
                                    </button>
                                  ))}
                                </div>
                              </section>

                              <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-6">
                                  <div className="flex items-center gap-4 mb-2">
                                    <label className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-600 px-1">Visual synthesis</label>
                                    <button onClick={() => updateAlbumTrack(i, 'videoEnabled', !track.videoEnabled)} className={`w-10 h-5 rounded-full transition-all relative ${track.videoEnabled ? 'bg-brand' : 'bg-zinc-800'}`}>
                                      <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${track.videoEnabled ? 'left-6' : 'left-1'}`} />
                                    </button>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    {LANGUAGES.map(l => (
                                      <button key={l} onClick={() => {
                                        const newLangs = track.vocalLangs.includes(l) ? track.vocalLangs.filter(x => x !== l) : [...track.vocalLangs, l];
                                        updateAlbumTrack(i, 'vocalLangs', newLangs);
                                      }} className={`px-3 py-3 md:px-4 md:py-4 rounded-xl border text-[8px] md:text-[9px] font-black uppercase tracking-tighter transition-all ${track.vocalLangs.includes(l) ? 'border-brand bg-brand/5 text-white' : 'border-white/5 text-zinc-800'}`}>
                                        {l}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                                <Field label="Lyrics / Narrative" isTextArea value={track.lyrics} onChange={(val: string) => updateAlbumTrack(i, 'lyrics', val)} onSuggest={() => requestSuggestion('lyrics', track.lyrics, i, 'new')} onEnhance={() => requestSuggestion('lyrics', track.lyrics, i, 'enhance')} hasAiUsed={aiUsedFields.has(`albumTrack_${i}_lyrics`)} suggesting={suggestingFields.has(`albumTrack_${i}_lyrics`)} exhausted={isQuotaExhausted} />
                              </section>

                              <section className="space-y-4">
                                <div className="flex justify-between items-end">
                                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600">Duration</label>
                                  <div className="text-xl font-black text-brand tracking-tighter">{Math.floor(track.duration/60)}<span className="text-xs text-zinc-700 ml-1 uppercase">m</span> {track.duration%60}<span className="text-xs text-zinc-700 ml-1 uppercase">s</span></div>
                                </div>
                                <input type="range" min="30" max="600" step="10" value={track.duration} onChange={e => updateAlbumTrack(i, 'duration', parseInt(e.target.value))} className="w-full h-1.5 bg-white/5 accent-brand rounded-full cursor-none appearance-none" />
                              </section>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="col-span-1 lg:col-span-4 space-y-8 md:space-y-12">
                   {mode === CreationMode.SINGLE && (
                     <section className="glass p-8 md:p-10 rounded-[2rem] md:rounded-[2.5rem] space-y-8">
                        <div className="flex justify-between items-end">
                          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600">Duration</label>
                          <div className="text-3xl font-black text-brand tracking-tighter">{Math.floor(duration/60)}<span className="text-xs text-zinc-700 ml-1 uppercase">m</span> {duration%60}<span className="text-xs text-zinc-700 ml-1 uppercase">s</span></div>
                        </div>
                        <input type="range" min="30" max="600" step="10" value={duration} onChange={e => setDuration(parseInt(e.target.value))} className="w-full h-1.5 bg-white/5 accent-brand rounded-full cursor-none appearance-none" />
                     </section>
                   )}

                   <div className="pt-10">
                      <button onClick={startGeneration} disabled={isProcessing} className={`w-full py-8 rounded-[2rem] text-sm font-black uppercase tracking-[0.3em] shadow-2xl transition-all ${isQuotaExhausted ? 'bg-zinc-800 text-zinc-500 grayscale' : 'bg-brand text-white shadow-brand/40 hover:scale-[1.02] active:scale-[0.98]'}`}>
                        {isProcessing ? 'Synthesizing...' : 'Synthesize Audio'}
                      </button>
                      <p className="text-center text-[9px] text-zinc-800 font-bold uppercase tracking-widest mt-6">{isQuotaExhausted ? '📚 Using Local Presets' : '⚡ Connected to Cloud AI'}</p>
                   </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === AppState.DASHBOARD && (
            <div className="space-y-10 md:space-y-16 py-6 md:py-10 animate-in fade-in duration-700">
              <header className="flex justify-between items-end border-b border-white/5 pb-6 md:pb-10">
                <h2 className="text-4xl md:text-5xl font-black tracking-tighter">Archive</h2>
              </header>

              {projects.length === 0 ? (
                <div className="text-center py-24 md:py-48 border-4 border-dashed border-white/5 rounded-[2rem] md:rounded-[4rem]">
                  <p className="text-zinc-800 text-xs md:text-sm font-black uppercase tracking-[0.5em]">Empty Workspace</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-6">
                  {projects.map(p => (
                    <div key={p.id} className="glass p-6 md:p-10 rounded-[2rem] md:rounded-[3rem] border border-white/5 hover:border-white/10 transition-all group">
                      <div className="flex flex-col md:flex-row md:items-start justify-between mb-8 md:mb-10 gap-4">
                        <div>
                          <h4 className="text-2xl md:text-3xl font-black tracking-tighter text-white">{p.title}</h4>
                          <div className="text-[9px] md:text-[10px] font-bold text-zinc-600 uppercase tracking-widest mt-2">{p.genres.join(', ')} • {new Date(p.createdAt).toLocaleDateString()}</div>
                        </div>
                        {p.metadata && <span className="text-brand font-black text-[10px] md:text-xs uppercase tracking-widest self-start md:self-auto">{p.metadata.mood}</span>}
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {p.tracks.map((t) => (
                          <div key={t.id} className="bg-black/40 border border-white/5 p-6 rounded-[2rem] space-y-6 overflow-hidden">
                             <div className="aspect-video bg-zinc-900 rounded-2xl overflow-hidden relative group/video">
                                {t.videoUrl ? (
                                  <video 
                                    src={t.videoUrl as string} 
                                    className="w-full h-full object-cover" 
                                    loop 
                                    muted 
                                    autoPlay 
                                    playsInline 
                                    onError={(e) => console.error("Video load error:", e)}
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center opacity-10 text-4xl">🎵</div>
                                )}
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/video:opacity-100 transition-opacity flex items-center justify-center">
                                   <button onClick={() => new Audio(t.audioUrl as string).play()} className="w-14 h-14 rounded-full bg-brand text-white flex items-center justify-center shadow-xl shadow-brand/40">▶</button>
                                </div>
                             </div>
                             <p className="text-[10px] font-black uppercase text-white truncate px-1">{t.title}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

const NavItem = ({ active, onClick, icon, label, collapsed }: any) => (
  <button onClick={onClick} className={`w-full flex items-center ${collapsed ? 'justify-center px-0' : 'gap-5 px-6'} py-5 rounded-2xl transition-all font-black text-xs uppercase tracking-widest ${active ? 'bg-brand text-white shadow-lg shadow-brand/20' : 'text-zinc-700 hover:text-zinc-400'}`} title={collapsed ? label : undefined}>
    <span className="text-xl shrink-0">{icon}</span>
    {!collapsed && <span className="truncate">{label}</span>}
  </button>
);

const Field = ({ label, value, onChange, onSuggest, onEnhance, hasAiUsed, suggesting, exhausted, isTextArea, placeholder }: any) => {
  const Component = isTextArea ? 'textarea' : 'input';
  return (
    <div className="space-y-4 group">
      <div className="flex justify-between items-center px-1">
        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-700 group-focus-within:text-brand transition-colors">{label}</label>
        <div className="flex items-center gap-3">
          {hasAiUsed ? (
            <>
              <button onClick={onEnhance} disabled={suggesting} className={`text-[9px] font-black transition-all flex items-center gap-1 ${exhausted ? 'text-amber-500/60 hover:text-amber-500' : 'text-brand/60 hover:text-brand'}`}>
                {suggesting ? 'Processing...' : '✨ Enhance'}
              </button>
              <button onClick={onSuggest} disabled={suggesting} className={`text-[9px] font-black transition-all flex items-center gap-1 ${exhausted ? 'text-amber-500/60 hover:text-amber-500' : 'text-brand/60 hover:text-brand'}`}>
                {suggesting ? 'Processing...' : '🔄 New'}
              </button>
            </>
          ) : (
            <button onClick={onSuggest} disabled={suggesting} className={`text-[9px] font-black transition-all flex items-center gap-2 ${exhausted ? 'text-amber-500/60 hover:text-amber-500' : 'text-brand/40 hover:text-brand'}`}>
              {suggesting ? 'Processing...' : exhausted ? '📚 Neural Preset' : '✨ AI Suggest'}
            </button>
          )}
        </div>
      </div>
      <Component 
        value={value} 
        onChange={(e: any) => onChange(e.target.value)} 
        placeholder={suggesting ? "Analyzing context..." : exhausted ? "Cloud limited. Presets engaged." : placeholder}
        className={`w-full bg-surface/50 border border-white/5 rounded-[1.5rem] px-6 py-5 text-white text-sm font-medium focus:outline-none focus:border-brand/40 transition-all ${isTextArea ? 'min-h-[160px] resize-none' : ''} ${suggesting ? 'opacity-30' : ''}`}
      />
    </div>
  );
};

export default App;
