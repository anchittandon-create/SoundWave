
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
import { getFieldSuggestion, interpretIntent, generateVeoVideo } from './services/geminiService';
import { generateSynthesizedAudio } from './services/audioService';

const GENRES = ["Ambient", "Cyberpunk", "Deep House", "Industrial", "Jazz Fusion", "Lo-Fi", "Neo-Classical", "Orchestral", "Phonk", "Synthwave", "Techno"];
const LANGUAGES = ["Instrumental", "English", "Japanese", "French", "Spanish", "German", "Korean"];

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.KEY_SETUP);
  const [session, setSession] = useState<UserSession | null>(null);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [activeTab, setActiveTab] = useState<AppState>(AppState.HOME);

  // Form State
  const [mode, setMode] = useState<CreationMode>(CreationMode.SINGLE);
  const [numSongs, setNumSongs] = useState(3);
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
  const [suggestingField, setSuggestingField] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<SuggestionState | null>(null);
  const [globalError, setGlobalError] = useState<{ message: string; isQuota: boolean } | null>(null);

  useEffect(() => {
    const init = async () => {
      // @ts-ignore
      const hasKey = await window.aistudio.hasSelectedApiKey();
      if (hasKey) {
        const s = db.getSession();
        if (s) {
          setSession(s);
          setAppState(AppState.HOME);
          setProjects(db.getProjects(s.id));
        } else {
          setAppState(AppState.AUTH);
        }
      } else {
        setAppState(AppState.KEY_SETUP);
      }
    };
    init();
  }, []);

  const handleKeySetup = async () => {
    // @ts-ignore
    await window.aistudio.openSelectKey();
    setGlobalError(null);
    const s = db.getSession();
    if (s) {
      setSession(s);
      setAppState(AppState.HOME);
      setProjects(db.getProjects(s.id));
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
    setProjects(db.getProjects(newSession.id));
  };

  const handleLogout = () => {
    db.clearSession();
    setSession(null);
    setAppState(AppState.AUTH);
  };

  const requestSuggestion = async (field: string, currentValue: string) => {
    if (suggestingField) return;
    setSuggestingField(field);
    setGlobalError(null);
    try {
      const context = { mode, title, prompt, selectedGenres, vocalLangs, lyrics, videoStyle };
      const suggestedText = await getFieldSuggestion(field, currentValue, context);
      setSuggestion({ field, original: currentValue, suggested: suggestedText, isActive: true });
    } catch (e: any) {
      console.error("AI Suggestion error:", e);
      const errStr = e.message || JSON.stringify(e);
      if (errStr.includes("429") || errStr.includes("quota")) {
        setGlobalError({ message: "Free tier request limit reached. To continue generating instantly, switch to a paid API key.", isQuota: true });
      } else if (errStr.includes("403") || errStr.includes("leaked")) {
        setGlobalError({ message: "The selected API key is invalid or has been revoked.", isQuota: true });
      } else {
        setGlobalError({ message: "Connection lost. Please try again.", isQuota: false });
      }
    } finally {
      setSuggestingField(null);
    }
  };

  const applySuggestion = () => {
    if (!suggestion) return;
    const { field, suggested } = suggestion;
    if (field === 'title') setTitle(suggested);
    if (field === 'prompt') setPrompt(suggested);
    if (field === 'lyrics') setLyrics(suggested);
    if (field === 'videoStyle') setVideoStyle(suggested);
    if (field === 'numSongs') setNumSongs(parseInt(suggested) || 3);
    setSuggestion(null);
  };

  const startGeneration = async () => {
    if (!title || !prompt || selectedGenres.length === 0) {
      alert("Title, Prompt, and at least one Genre are mandatory.");
      return;
    }

    setIsProcessing(true);
    setGlobalError(null);
    const projectId = crypto.randomUUID();
    const newProject: ProjectRecord = {
      id: projectId,
      userId: session!.id,
      mode, title, prompt, 
      genres: selectedGenres,
      durationSeconds: duration,
      vocalLanguages: vocalLangs,
      lyrics,
      artistReferences: [],
      videoEnabled,
      videoStyle,
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
        const audioUrl = await generateSynthesizedAudio(duration);
        let videoUrl = undefined;
        if (videoEnabled) {
          videoUrl = await generateVeoVideo(videoStyle || "Minimalist Abstract", selectedGenres[0], prompt);
        }
        tracks.push({
          id: crypto.randomUUID(),
          title: mode === CreationMode.ALBUM ? `${title} - Part ${i+1}` : title,
          audioUrl,
          videoUrl,
          duration
        });
      }

      newProject.tracks = tracks;
      newProject.status = Status.COMPLETED;
      await db.saveProject(newProject);
      setProjects(prev => [newProject, ...prev]);
      setActiveTab(AppState.DASHBOARD);
    } catch (e: any) {
      console.error("Synthesis failed:", e);
      newProject.status = Status.FAILED;
      await db.saveProject(newProject);
      
      const errStr = e.message || JSON.stringify(e);
      if (errStr.includes("429") || errStr.includes("quota")) {
        setGlobalError({ message: "Neural capacity reached. Upgrade your API key to bypass daily generation limits.", isQuota: true });
      } else if (e.message === "KEY_RESET_REQUIRED" || errStr.includes("403") || errStr.includes("leaked")) {
        setGlobalError({ message: "API Credentials expired. Please re-authenticate your key.", isQuota: true });
      } else {
        setGlobalError({ message: "Neural Synthesis failed. Refine your brief and retry.", isQuota: false });
      }
    } finally {
      setIsProcessing(false);
    }
  };

  if (appState === AppState.KEY_SETUP) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-deep p-6">
        <div className="glass w-full max-w-lg p-12 rounded-[3rem] space-y-10 border border-white/5 shadow-2xl text-center">
          <div className="space-y-4">
            <h1 className="text-4xl font-black tracking-tighter text-white">Neural Link Required</h1>
            <p className="text-zinc-500 text-sm font-medium leading-relaxed">
              SoundWeave requires a Google Cloud API key with billing enabled for full-featured neural synthesis and video generation.
            </p>
          </div>
          <div className="space-y-6">
            <button 
              onClick={handleKeySetup}
              className="w-full bg-brand py-6 rounded-2xl font-black text-xs uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all shadow-xl shadow-brand/20"
            >
              Configure API Key
            </button>
            <a 
              href="https://ai.google.dev/gemini-api/docs/billing" 
              target="_blank" 
              rel="noopener noreferrer"
              className="block text-[10px] font-black text-zinc-600 hover:text-brand uppercase tracking-widest transition-colors"
            >
              Learn about Paid Tiers →
            </a>
          </div>
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
                <p className="text-[9px] text-zinc-700 font-bold px-1">Indian mobile number required for authentication.</p>
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
      {/* Sidebar Nav */}
      <aside className="w-80 border-r border-white/5 bg-[#070707] flex flex-col sticky top-0 h-screen">
        <div className="p-10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center font-black text-white italic">S</div>
            <h2 className="text-2xl font-black tracking-tighter text-white">SOUNDWEAVE</h2>
          </div>
        </div>
        <nav className="flex-1 px-6 space-y-1">
          <NavItem active={activeTab === AppState.HOME} onClick={() => setActiveTab(AppState.HOME)} icon="🏠" label="Home" />
          <NavItem active={activeTab === AppState.CREATE} onClick={() => setActiveTab(AppState.CREATE)} icon="✨" label="Create Music" />
          <NavItem active={activeTab === AppState.DASHBOARD} onClick={() => setActiveTab(AppState.DASHBOARD)} icon="📂" label="Dashboard" />
        </nav>
        <div className="p-8 border-t border-white/5 space-y-6">
          <button onClick={handleKeySetup} className="w-full text-[10px] uppercase font-black text-brand hover:text-white transition-colors tracking-widest py-3 border border-brand/20 rounded-xl bg-brand/5">Credentials</button>
          <div className="flex items-center gap-4 group cursor-default">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand to-blue-600 flex items-center justify-center font-black text-xl shadow-lg shadow-brand/20">{session?.name[0]}</div>
            <div className="min-w-0">
              <p className="text-sm font-black truncate text-white">{session?.name}</p>
              <p className="text-[10px] font-mono text-zinc-600 truncate">{session?.mobile}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="w-full text-[10px] uppercase font-black text-zinc-700 hover:text-red-500 transition-colors tracking-widest py-2 border border-white/5 rounded-xl">Terminate Session</button>
        </div>
      </aside>

      {/* Content Area */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto p-16">
          
          {globalError && (
            <div className="mb-10 animate-in slide-in-from-top-4 duration-500">
               <div className={`glass border-l-4 p-6 rounded-2xl flex items-center justify-between ${globalError.isQuota ? 'border-amber-500 bg-amber-500/5 shadow-[0_0_20px_rgba(245,158,11,0.05)]' : 'border-red-500 bg-red-500/5'}`}>
                  <div className="flex items-center gap-4">
                     <span className="text-xl">{globalError.isQuota ? '⚡' : '⚠️'}</span>
                     <p className={`text-xs font-black uppercase tracking-widest ${globalError.isQuota ? 'text-amber-400' : 'text-red-400'}`}>{globalError.message}</p>
                  </div>
                  <div className="flex items-center gap-6">
                    {globalError.isQuota && (
                      <button onClick={handleKeySetup} className="text-[10px] font-black text-brand uppercase hover:underline">Switch to Paid Key</button>
                    )}
                    <button onClick={() => setGlobalError(null)} className="text-[10px] font-black text-zinc-600 uppercase hover:text-white">Dismiss</button>
                  </div>
               </div>
            </div>
          )}

          {activeTab === AppState.HOME && (
            <div className="space-y-16 py-10 animate-in fade-in slide-in-from-bottom-4 duration-1000">
              <div className="space-y-4">
                <h1 className="text-8xl font-black tracking-tighter leading-none">
                  Neural <br/><span className="text-brand">Soundscapes.</span>
                </h1>
                <p className="text-zinc-500 text-lg max-w-xl font-medium">AI music synthesis for creators.</p>
              </div>
              <div className="grid grid-cols-2 gap-8">
                <button onClick={() => setActiveTab(AppState.CREATE)} className="glass p-12 rounded-[3rem] text-left hover:border-brand/40 transition-all group relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-8 text-6xl opacity-10 group-hover:scale-125 transition-transform duration-700">✨</div>
                  <h3 className="text-3xl font-black mb-3">Initiate Project</h3>
                  <p className="text-zinc-500 text-sm font-medium">Construct new audio signatures.</p>
                </button>
                <button onClick={() => setActiveTab(AppState.DASHBOARD)} className="glass p-12 rounded-[3rem] text-left hover:border-brand/40 transition-all group relative overflow-hidden">
                   <div className="absolute top-0 right-0 p-8 text-6xl opacity-10 group-hover:scale-125 transition-transform duration-700">📊</div>
                  <h3 className="text-3xl font-black mb-3">Workspace</h3>
                  <p className="text-zinc-500 text-sm font-medium">Manage existing productions.</p>
                </button>
              </div>
            </div>
          )}

          {activeTab === AppState.CREATE && (
            <div className={`space-y-16 animate-in fade-in duration-700 ${isProcessing ? 'pointer-events-none' : ''}`}>
              <header className="flex justify-between items-end border-b border-white/5 pb-10">
                <div>
                  <h2 className="text-5xl font-black tracking-tighter">Production Deck</h2>
                  <p className="text-zinc-500 font-bold uppercase text-[10px] tracking-[0.4em] mt-2">New Neural Synthesis Intent</p>
                </div>
                {isProcessing && (
                  <div className="flex items-center gap-4 bg-brand/10 border border-brand/20 px-6 py-3 rounded-2xl">
                    <span className="w-2 h-2 rounded-full bg-brand animate-ping"></span>
                    <span className="text-[10px] font-black text-brand uppercase tracking-widest">Synthesizing...</span>
                  </div>
                )}
              </header>

              <div className="grid grid-cols-12 gap-16">
                <div className="col-span-12 lg:col-span-8 space-y-16">
                  <section className="space-y-6">
                    <div className="flex items-center gap-4">
                      <span className="text-[10px] font-black bg-white/5 w-6 h-6 flex items-center justify-center rounded-lg text-zinc-500">01</span>
                      <label className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-600">Creation Logic</label>
                    </div>
                    <div className="flex gap-4">
                      {[CreationMode.SINGLE, CreationMode.ALBUM].map(m => (
                        <button key={m} onClick={() => setMode(m)} className={`flex-1 px-8 py-5 rounded-2xl border font-black text-xs uppercase tracking-widest transition-all ${mode === m ? 'border-brand bg-brand/5 text-white shadow-lg shadow-brand/5' : 'border-white/5 text-zinc-700 bg-surface hover:bg-white/[0.02]'}`}>
                          {m}
                        </button>
                      ))}
                    </div>
                    {mode === CreationMode.ALBUM && (
                      <div className="pt-4 flex items-center justify-between bg-surface/50 p-6 rounded-2xl border border-white/5">
                        <label className="text-sm font-black text-zinc-400">Tracks</label>
                        <div className="flex items-center gap-4">
                           <input type="number" min="2" max="15" value={numSongs} onChange={e => setNumSongs(parseInt(e.target.value))} className="bg-black border border-white/10 rounded-xl px-4 py-2 w-20 text-center font-mono text-brand focus:outline-none focus:border-brand" />
                           <button onClick={() => requestSuggestion('numSongs', numSongs.toString())} className="text-[9px] font-black text-brand/40 hover:text-brand">✨ AI</button>
                        </div>
                      </div>
                    )}
                  </section>

                  <section className="space-y-10">
                    <Field label="Project Title" value={title} onChange={setTitle} onSuggest={() => requestSuggestion('title', title)} suggesting={suggestingField === 'title'} placeholder="e.g. Midnight Drift" />
                    <Field label="Creative Brief" isTextArea value={prompt} onChange={setPrompt} onSuggest={() => requestSuggestion('prompt', prompt)} suggesting={suggestingField === 'prompt'} placeholder="Describe the sonic atmosphere..." />
                  </section>

                  <section className="space-y-8">
                    <div className="flex items-center gap-4">
                      <span className="text-[10px] font-black bg-white/5 w-6 h-6 flex items-center justify-center rounded-lg text-zinc-500">03</span>
                      <label className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-600">Genres</label>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {GENRES.map(g => (
                        <button key={g} onClick={() => setSelectedGenres(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g])} className={`px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${selectedGenres.includes(g) ? 'bg-brand border-brand text-white' : 'border-white/5 text-zinc-700 hover:text-zinc-400'}`}>
                          {g}
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="grid grid-cols-2 gap-8">
                    <div className="space-y-6">
                      <label className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-600 px-1">Linguistic Bias</label>
                      <div className="grid grid-cols-2 gap-2">
                        {LANGUAGES.map(l => (
                          <button key={l} onClick={() => setVocalLangs(prev => prev.includes(l) ? prev.filter(x => x !== l) : [...prev, l])} className={`px-4 py-4 rounded-xl border text-[9px] font-black uppercase transition-all tracking-tighter ${vocalLangs.includes(l) ? 'border-brand bg-brand/5 text-white' : 'border-white/5 text-zinc-800'}`}>
                            {l}
                          </button>
                        ))}
                      </div>
                    </div>
                    <Field label="Vocal Narrative / Lyrics" isTextArea value={lyrics} onChange={setLyrics} onSuggest={() => requestSuggestion('lyrics', lyrics)} suggesting={suggestingField === 'lyrics'} />
                  </section>
                </div>

                <div className="col-span-12 lg:col-span-4 space-y-12">
                   <section className="glass p-10 rounded-[2.5rem] space-y-8">
                      <div className="flex justify-between items-end">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600">Signal Duration</label>
                        <div className="text-3xl font-black text-brand tracking-tighter">{Math.floor(duration/60)}<span className="text-xs text-zinc-700 ml-1 uppercase">min</span> {duration%60}<span className="text-xs text-zinc-700 ml-1 uppercase">sec</span></div>
                      </div>
                      <input type="range" min="30" max="600" step="10" value={duration} onChange={e => setDuration(parseInt(e.target.value))} className="w-full h-1.5 bg-white/5 accent-brand rounded-full cursor-none appearance-none hover:accent-brand transition-all" />
                   </section>

                   <section className={`glass p-10 rounded-[2.5rem] space-y-8 transition-all ${videoEnabled ? 'border-brand/20 bg-brand/[0.02]' : 'border-white/5'}`}>
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <h4 className="font-black text-sm uppercase tracking-widest">Visual Module</h4>
                          <p className="text-[10px] text-zinc-600 font-bold">Neural Cinematic</p>
                        </div>
                        <button onClick={() => setVideoEnabled(!videoEnabled)} className={`w-14 h-8 rounded-full transition-all relative ${videoEnabled ? 'bg-brand' : 'bg-white/10'}`}>
                          <div className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-all ${videoEnabled ? 'left-7 shadow-lg' : 'left-1'}`} />
                        </button>
                      </div>
                      {videoEnabled && (
                        <Field label="Visual Style" value={videoStyle} onChange={setVideoStyle} onSuggest={() => requestSuggestion('videoStyle', videoStyle)} suggesting={suggestingField === 'videoStyle'} placeholder="e.g. Noir Cityscape" />
                      )}
                   </section>

                   <div className="pt-10">
                      <button onClick={startGeneration} disabled={isProcessing} className="w-full bg-brand py-8 rounded-[2rem] text-sm font-black uppercase tracking-[0.3em] shadow-2xl shadow-brand/40 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-20 flex items-center justify-center gap-4">
                        {isProcessing ? (
                          <>
                             <span className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></span>
                             <span>Synthesizing...</span>
                          </>
                        ) : (
                          <span>Synthesize Audio</span>
                        )}
                      </button>
                   </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === AppState.DASHBOARD && (
            <div className="space-y-16 py-10 animate-in fade-in duration-700">
              <header className="flex justify-between items-end border-b border-white/5 pb-10">
                <div>
                  <h2 className="text-5xl font-black tracking-tighter">Archive</h2>
                  <p className="text-zinc-500 font-bold uppercase text-[10px] tracking-[0.4em] mt-2">Vault of Completed Signatures</p>
                </div>
              </header>

              {projects.length === 0 ? (
                <div className="text-center py-48 border-4 border-dashed border-white/5 rounded-[4rem]">
                  <p className="text-zinc-800 text-sm font-black uppercase tracking-[0.5em]">Empty Workspace</p>
                  <button onClick={() => setActiveTab(AppState.CREATE)} className="mt-8 text-brand text-[10px] font-black uppercase tracking-widest hover:underline">Begin First Synthesis →</button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-6">
                  {projects.map(p => (
                    <div key={p.id} className="glass p-10 rounded-[3rem] border border-white/5 hover:border-white/10 transition-all group">
                      <div className="flex items-start justify-between mb-10">
                        <div className="space-y-2">
                          <div className="flex items-center gap-4">
                            <h4 className="text-3xl font-black tracking-tighter text-white">{p.title}</h4>
                            <span className={`text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-widest ${p.status === Status.COMPLETED ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>{p.status}</span>
                          </div>
                          <div className="flex gap-4 text-[10px] font-bold text-zinc-600 uppercase tracking-widest">
                             <span>{p.mode}</span>
                             <span>•</span>
                             <span>{p.genres.join(', ')}</span>
                             <span>•</span>
                             <span>{new Date(p.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                        {p.metadata && (
                           <div className="text-right space-y-1">
                              <p className="text-brand font-black text-xs uppercase tracking-widest">{p.metadata.mood}</p>
                              <p className="text-[10px] text-zinc-700 font-bold uppercase">Energy: {p.metadata.energyLevel}%</p>
                           </div>
                        )}
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {p.tracks.map((t) => (
                          <div key={t.id} className="bg-black/40 border border-white/5 p-6 rounded-[2rem] space-y-6">
                             <div className="aspect-video bg-zinc-900 rounded-2xl overflow-hidden relative group/video border border-white/5">
                                {t.videoUrl ? (
                                  <video src={t.videoUrl} className="w-full h-full object-cover" loop muted onMouseEnter={e => e.currentTarget.play()} onMouseLeave={e => e.currentTarget.pause()} />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center opacity-10">
                                    <span className="text-4xl">🎵</span>
                                  </div>
                                )}
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/video:opacity-100 transition-opacity flex items-center justify-center">
                                   <button onClick={() => {
                                      const audio = new Audio(t.audioUrl);
                                      audio.play();
                                   }} className="w-14 h-14 rounded-full bg-brand text-white flex items-center justify-center text-xl shadow-xl shadow-brand/40">▶</button>
                                </div>
                             </div>
                             <div className="space-y-4">
                               <p className="text-[10px] font-black uppercase text-white truncate px-1">{t.title}</p>
                               <div className="flex gap-2">
                                  <a href={t.audioUrl} download={`${t.title}.wav`} className="flex-1 bg-white/5 py-3 rounded-xl text-[9px] font-black uppercase text-zinc-500 hover:text-white hover:bg-white/10 text-center transition-all">Audio</a>
                                  {t.videoUrl && <a href={t.videoUrl} download={`${t.title}.mp4`} className="flex-1 bg-brand/10 py-3 rounded-xl text-[9px] font-black uppercase text-brand hover:bg-brand hover:text-white text-center transition-all">Video</a>}
                               </div>
                             </div>
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

      {suggestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-deep/90 backdrop-blur-md animate-in fade-in duration-300">
          <div className="glass w-full max-w-2xl p-12 rounded-[3rem] border border-white/10 shadow-2xl space-y-10">
            <div className="space-y-2">
              <span className="text-brand text-[10px] font-black uppercase tracking-[0.5em]">Neural Optimization</span>
              <h3 className="text-4xl font-black tracking-tighter">Verify Field Update</h3>
            </div>
            <div className="grid grid-cols-2 gap-8">
              <div className="space-y-4">
                <label className="text-[10px] font-black uppercase text-zinc-700 tracking-widest">Original Input</label>
                <div className="p-6 bg-white/[0.02] border border-white/5 rounded-2xl min-h-[100px] text-zinc-500 text-sm italic font-medium">
                  {suggestion.original || '(Empty)'}
                </div>
              </div>
              <div className="space-y-4">
                <label className="text-[10px] font-black uppercase text-brand tracking-widest">AI Proposal</label>
                <div className="p-6 bg-brand/[0.03] border border-brand/20 rounded-2xl min-h-[100px] text-white text-sm font-bold shadow-inner shadow-brand/5">
                  {suggestion.suggested}
                </div>
              </div>
            </div>
            <div className="flex gap-4">
               <button onClick={applySuggestion} className="flex-1 bg-brand py-6 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-brand/20 hover:brightness-110 active:scale-95 transition-all">Accept Change</button>
               <button onClick={() => setSuggestion(null)} className="flex-1 bg-white/5 py-6 rounded-2xl font-black text-xs uppercase tracking-[0.2em] text-zinc-500 hover:text-white hover:bg-white/10 transition-all">Discard</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const NavItem = ({ active, onClick, icon, label }: any) => (
  <button onClick={onClick} className={`w-full flex items-center gap-5 px-6 py-5 rounded-2xl transition-all font-black text-xs uppercase tracking-widest ${active ? 'bg-brand text-white shadow-lg shadow-brand/20 translate-x-1' : 'text-zinc-700 hover:bg-white/[0.03] hover:text-zinc-400'}`}>
    <span className="text-xl opacity-60 grayscale group-hover:grayscale-0 transition-all">{icon}</span>
    <span>{label}</span>
  </button>
);

const Field = ({ label, value, onChange, onSuggest, suggesting, isTextArea, placeholder }: any) => {
  const Component = isTextArea ? 'textarea' : 'input';
  return (
    <div className="space-y-4 group">
      <div className="flex justify-between items-center px-1">
        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-700 group-focus-within:text-brand transition-colors">{label}</label>
        <button onClick={onSuggest} disabled={suggesting} className="text-[9px] font-black text-brand/30 hover:text-brand transition-all flex items-center gap-2 disabled:opacity-50">
          {suggesting ? (
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-brand animate-pulse"></span>
              Thinking...
            </span>
          ) : '✨ AI Suggest'}
        </button>
      </div>
      <div className="relative">
        <Component 
          value={value} 
          onChange={(e: any) => onChange(e.target.value)} 
          placeholder={suggesting ? "Analyzing creative landscape..." : placeholder}
          className={`w-full bg-surface/50 border border-white/5 rounded-[1.5rem] px-6 py-5 text-white text-sm font-medium focus:outline-none focus:border-brand/40 transition-all placeholder:text-zinc-900 ${isTextArea ? 'min-h-[160px] resize-none leading-relaxed' : ''} ${suggesting ? 'opacity-30' : ''}`}
        />
      </div>
    </div>
  );
};

export default App;
