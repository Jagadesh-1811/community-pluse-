'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useRealtimeNeeds, Need } from '@/hooks/useRealtimeNeeds';

const LiveMap = dynamic(() => import('@/components/map/LiveMap'), { ssr: false });
import { LayoutDashboard, ShieldAlert, TrendingUp, Activity, MapPin, Bot, Phone, Navigation2, X, Lock, Terminal, ArrowRight, Signal, Loader2, LogOut } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import ChatPanel from '@/components/chat/ChatPanel';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';

export default function Home() {
  const { needs, loading: needsLoading, refresh } = useRealtimeNeeds();
  const { user, role, loading: authLoading, signOut } = useAuth();
  const router = useRouter();

  const [selectedNeed, setSelectedNeed] = useState<Need | null>(null);
  const [activeTab, setActiveTab] = useState<'map' | 'alerts' | 'analytics' | 'comms'>('map');
  const [volunteerLocation, setVolunteerLocation] = useState<{lat: number; lng: number; accuracy?: number} | null>(null);
  const [locationStatus, setLocationStatus] = useState<'detecting' | 'found' | 'denied' | 'idle'>('idle');
  const [showLocationToast, setShowLocationToast] = useState(false);
  const [isManualMode, setIsManualMode] = useState(false);
  const [watchId, setWatchId] = useState<number | null>(null);
  const [trackingNeedId, setTrackingNeedId] = useState<string | null>(null);
  const [commsMessages, setCommsMessages] = useState<any[]>([]);

  // Auth Gateway State
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [diagText, setDiagText] = useState<string[]>([]);

  useEffect(() => {
    const diags = [
        "Initializing command link...",
        "Securing bridge tunnel...",
        "Validating officer credentials...",
        "Awaiting satellite lock..."
    ];
    let i = 0;
    const interval = setInterval(() => {
        if (i < diags.length && !user) {
            setDiagText(prev => [...prev.slice(-3), diags[i]]);
            i++;
        }
    }, 1000);
    return () => clearInterval(interval);
  }, [user]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError(null);
    try {
        if (authMode === 'signup') {
            if (loginPassword !== confirmPassword) throw new Error("Passwords do not match");
            const { error: signUpError } = await supabase.auth.signUp({
                email: loginEmail,
                password: loginPassword,
                options: { data: { role: 'VOLUNTEER' } }
            });
            if (signUpError) throw signUpError;
            setDiagText(prev => [...prev.slice(-3), "ACCOUNT CREATED: Verify email."]);
            setAuthMode('signin');
        } else {
            const { error: signInError } = await supabase.auth.signInWithPassword({ 
                email: loginEmail, 
                password: loginPassword 
            });
            if (signInError) throw signInError;
            setDiagText(prev => [...prev.slice(-3), "AUTHENTICATED: Establishing session..."]);
        }
    } catch (err: any) {
        setLoginError(err.message);
        setDiagText(prev => [...prev.slice(-3), `ERROR: ${err.message}`]);
    } finally {
        setIsLoggingIn(false);
    }
  };

  useEffect(() => {
      if (isManualMode) {
          if (watchId !== null) {
              navigator.geolocation.clearWatch(watchId);
              setWatchId(null);
          }
          return;
      }

      // 1. Hardware Geolocation Hook
      if ("geolocation" in navigator) {
          if (locationStatus === 'idle') {
              setLocationStatus('detecting');
              setShowLocationToast(true);
          }
          
          const id = navigator.geolocation.watchPosition((position) => {
              setVolunteerLocation({
                  lat: position.coords.latitude,
                  lng: position.coords.longitude,
                  accuracy: position.coords.accuracy,
              });
              setLocationStatus('found');
              // Auto-hide toast after 3s if it was just found
              if (showLocationToast) {
                  setTimeout(() => setShowLocationToast(false), 3000);
              }
          }, async (err) => {
              console.warn("Volunteer GPS error:", err);
              // Only fallback to IP if we haven't found a location yet and error is permission/timeout
              if (locationStatus !== 'found') {
                  // 2. IP-based Geolocation Fallback
                  try {
                      const res = await fetch('https://ipapi.co/json/');
                      const data = await res.json();
                      if (data.latitude && data.longitude) {
                          setVolunteerLocation({
                              lat: data.latitude,
                              lng: data.longitude,
                              accuracy: 5000,
                          });
                          setLocationStatus('found');
                          setTimeout(() => setShowLocationToast(false), 4000);
                          return;
                      }
                  } catch (ipErr) {
                      console.warn("IP geolocation also failed.", ipErr);
                  }
                  setLocationStatus('denied');
                  setTimeout(() => setShowLocationToast(false), 4000);
              }
          }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });

          setWatchId(id);

          return () => {
              navigator.geolocation.clearWatch(id);
          };
      }
  }, [isManualMode]);

  const handleManualLocationSet = (lat: number, lng: number) => {
      setVolunteerLocation({ lat, lng, accuracy: 0 });
      setLocationStatus('found');
      setIsManualMode(true);
      setShowLocationToast(true);
      setTimeout(() => setShowLocationToast(false), 2000);
  };

  const clearManualOverride = () => {
      setIsManualMode(false);
      setLocationStatus('idle');
  };


  // Haversine Distance Formula
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
      const R = 6371; // Earth Radius in km
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
                Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      return (R * c).toFixed(1);
  };

  // SYNC VOLUNTEER LOCATION TO SUPABASE
  // This allows the reporter (user) to see the volunteer's live position on their map
  useEffect(() => {
    if (trackingNeedId && volunteerLocation) {
        const syncLocation = async () => {
            await supabase
                .from('needs')
                .update({
                    volunteer_lat: volunteerLocation.lat,
                    volunteer_lng: volunteerLocation.lng
                })
                .eq('id', trackingNeedId);
        };
        
        // Sync every 3 seconds or on location change
        const interval = setInterval(syncLocation, 3000);
        syncLocation(); // immediate initial sync
        
        return () => clearInterval(interval);
    }
  }, [trackingNeedId, volunteerLocation]);

  const handleDeploy = async (needId: string, status: string) => {
      const { error } = await supabase.from('needs').update({ status }).eq('id', needId);
      if (!error) {
          if (status === 'in-progress') {
              setTrackingNeedId(needId);
              // Trigger automated dispatch notification
              try {
                  fetch('http://localhost:8000/notify/dispatch', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ need_id: needId })
                  });
              } catch (err) {
                  console.error("Failed to notify dispatch:", err);
              }
          } else if (status === 'resolved' || status === 'open') {
              setTrackingNeedId(null);
          }
          setSelectedNeed(null);
          refresh();
      }
  };

  // FETCH & LISTEN FOR COMMUNICATIONS LOGS
  useEffect(() => {
    const fetchMessages = async () => {
        const { data } = await supabase
            .from('messages')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);
        if (data) setCommsMessages(data);
    };

    fetchMessages();

    const channel = supabase
        .channel('realtime-messages')
        .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'messages' },
            (payload) => {
                setCommsMessages(prev => [payload.new, ...prev.slice(0, 49)]);
            }
        )
        .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Sort needs by urgency for the "Priority Queue"
  const sortedNeeds = [...needs].sort((a, b) => b.urgency_score - a.urgency_score);

  if (authLoading) {
    return (
        <div className="fixed inset-0 z-[200] bg-slate-950 flex flex-col items-center justify-center gap-10">
            <div className="p-10 bg-primary rounded-[3.5rem] shadow-[0_40px_80px_rgba(37,99,235,0.4)] animate-pulse border border-white/10 text-white">
                <Activity size={80} />
            </div>
        </div>
    );
  }

  // IF NOT AUTHENTICATED AS VOLUNTEER -> SHOW GATEWAY
  if (!user || role !== 'VOLUNTEER') {
    return (
        <main className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 font-inter relative overflow-hidden">
            {/* BACKGROUND MATRIX */}
            <div className="absolute inset-0 z-0 opacity-10 pointer-events-none">
                <div className="absolute top-0 left-1/4 w-px h-full bg-gradient-to-b from-transparent via-primary to-transparent animate-pulse"></div>
                <div className="absolute top-0 left-3/4 w-px h-full bg-gradient-to-b from-transparent via-primary to-transparent animate-pulse delay-500"></div>
            </div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm z-10">
                <div className="text-center mb-10">
                    <div className="w-20 h-20 bg-primary/10 rounded-3xl mx-auto mb-6 flex items-center justify-center border border-primary/20 shadow-[0_0_40px_rgba(37,99,235,0.1)] text-primary">
                        <ShieldAlert size={40} />
                    </div>
                    <h1 className="text-3xl font-black text-white font-outfit uppercase tracking-tighter mb-1">Command<span className="text-primary">Access</span></h1>
                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.3em]">Volunteer Coordination Hub</p>
                </div>

                <div className="glass-dark border border-white/10 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden">
                    {/* Tiny Sidebar Logs */}
                    <div className="absolute top-0 right-0 w-24 h-full bg-white/[0.02] border-l border-white/5 p-3 flex flex-col gap-2 font-mono text-[6px] text-slate-600 uppercase pointer-events-none">
                        <Terminal size={10} className="opacity-30 mb-2" />
                        {diagText.map((t, idx) => (
                            <div key={idx} className={cn(t?.includes('ERROR') ? 'text-emergency' : t?.includes('AUTH') ? 'text-success' : '')}>
                                &gt; {t || ''}
                            </div>
                        ))}
                    </div>

                    <div className="max-w-[calc(100%-80px)]">
                        <form onSubmit={handleAuth} className="space-y-5">
                            <div>
                                <label className="block text-[9px] text-slate-500 font-black uppercase tracking-widest mb-2 ml-1">Officer Identity</label>
                                <input 
                                    type="email" required value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-white text-xs focus:ring-2 focus:ring-primary/40 outline-none transition-all placeholder:text-slate-700"
                                    placeholder="id_officer@bridge.net"
                                />
                            </div>
                            <div>
                                <label className="block text-[9px] text-slate-500 font-black uppercase tracking-widest mb-2 ml-1">Bridge Key</label>
                                <div className="relative">
                                    <input 
                                        type="password" required value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-white text-xs focus:ring-2 focus:ring-primary/40 outline-none transition-all placeholder:text-slate-700"
                                        placeholder="••••••••"
                                    />
                                    <Lock size={12} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-700" />
                                </div>
                            </div>

                            {authMode === 'signup' && (
                                <div>
                                    <label className="block text-[9px] text-slate-500 font-black uppercase tracking-widest mb-2 ml-1">Confirm Key</label>
                                    <input 
                                        type="password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-white text-xs focus:ring-2 focus:ring-primary/40 outline-none transition-all placeholder:text-slate-700"
                                        placeholder="••••••••"
                                    />
                                </div>
                            )}

                            {loginError && <p className="text-[10px] text-emergency font-bold uppercase tracking-widest bg-emergency/10 p-2 rounded-lg border border-emergency/20">{loginError}</p>}

                            <button 
                                type="submit" disabled={isLoggingIn}
                                className="w-full bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-[0.2em] text-[10px] py-4 rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-2"
                            >
                                {isLoggingIn ? <Loader2 className="animate-spin" size={16} /> : (
                                    <>
                                        {authMode === 'signin' ? 'Verify Identity' : 'Commission Account'} 
                                        <ArrowRight size={14} />
                                    </>
                                )}
                            </button>
                        </form>

                        <div className="mt-6 text-center">
                            <button 
                                onClick={() => setAuthMode(authMode === 'signin' ? 'signup' : 'signin')}
                                className="text-[8px] font-black text-slate-500 uppercase tracking-widest hover:text-white transition-colors"
                            >
                                {authMode === 'signin' ? "Request Commission (Signup)" : "Existing Officer? Sign In"}
                            </button>
                        </div>
                    </div>
                </div>

                <div className="mt-8 text-center text-[9px] font-black uppercase tracking-[0.2em] text-slate-700">
                    Personnel Only • Authorized Clearance Required
                </div>
            </motion.div>
        </main>
    );
  }

  return (
    <main className="relative min-h-screen bg-[var(--background)] overflow-hidden flex font-roboto -mt-20 pt-20">
      {/* 
          UNIFIED SIDEBAR SYSTEM 
          Contains both Navigation icons and the expandable Intake Form
      */}
      <aside 
        className="fixed left-0 top-20 bottom-0 z-40 flex transition-all duration-500 ease-out translate-x-0"
      >
        {/* Persistent Nav Strip */}
        <nav className="h-full w-24 flex flex-col items-center gap-8 py-10 glass border-r border-[var(--border-color)] border-t-0 relative z-20 brutalist-grid">
            {/* Dashboard Icon */}
            <div className="relative group">
                <button 
                    onClick={() => setActiveTab('map')}
                    className={cn(
                        "p-4 rounded-2xl transition-all border border-transparent",
                        activeTab === 'map' ? "bg-yellow text-black border-black/10 shadow-[0_5px_15px_rgba(255,225,124,0.3)]" : "text-[var(--foreground)]/60 hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/10"
                    )}
                >
                    <LayoutDashboard size={24} />
                </button>
            </div>

            <div className="w-8 h-px bg-white/10 my-4"></div>

            {/* Priority Intelligence Icon */}
            <div className="relative group">
                <button 
                    onClick={() => setActiveTab('alerts')}
                    className={cn(
                        "p-4 rounded-2xl transition-all relative",
                        activeTab === 'alerts' ? "bg-emergency text-white shadow-lg shadow-emergency/20" : "text-slate-500 hover:text-white hover:bg-white/5"
                    )}
                >
                    <ShieldAlert size={24} />
                    {needs.filter(n => n.urgency_score >= 8).length > 0 && (
                        <div className="absolute top-3 right-3 w-2.5 h-2.5 bg-white rounded-full animate-pulse border-2 border-emergency"></div>
                    )}
                </button>
            </div>

            {/* Analytics Icon */}
            <div className="relative group">
                <button 
                    onClick={() => setActiveTab('analytics')}
                    className={cn(
                        "p-4 rounded-2xl transition-all",
                        activeTab === 'analytics' ? "bg-success text-white shadow-lg shadow-success/20" : "text-slate-500 hover:text-white hover:bg-white/5"
                    )}
                >
                    <TrendingUp size={24} />
                </button>
            </div>

            <div className="mt-auto flex flex-col items-center gap-6">
                <button 
                    onClick={() => setActiveTab('comms')}
                    className={cn(
                        "p-4 transition-all rounded-2xl",
                        activeTab === 'comms' ? "bg-white/10 text-white shadow-lg" : "text-slate-500 hover:text-white hover:bg-white/5"
                    )}
                >
                    <Bot size={24} />
                </button>

                <div className="w-10 h-px bg-white/5"></div>

                <button 
                    onClick={() => signOut()}
                    className="p-4 rounded-2xl text-slate-500 hover:text-emergency hover:bg-emergency/10 transition-all group relative"
                    title="Terminate Session"
                >
                    <LogOut size={20} />
                </button>
            </div>
        </nav>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 transition-all duration-500 ease-out h-[calc(100vh-80px)] relative flex flex-col pl-24">
        {/* Header */}
        <header className="px-12 py-8 flex justify-between items-center border-b border-[var(--border-color)] glass z-30">
          <div className="flex items-center gap-6">
            <div className="p-3 bg-emergency rounded-[1.25rem] border border-black/10 shadow-lg shadow-emergency/20">
              <Activity className="text-white" size={28} />
            </div>
            <div>
              <h1 className="text-4xl font-anton text-[var(--foreground)] tracking-wide uppercase leading-none mb-1 shadow-sm">
                  {activeTab === 'map' ? 'Operational Hub' : activeTab === 'alerts' ? 'Priority Queue' : activeTab === 'comms' ? 'AI Watch Chatbot' : 'Analytics Engine'}
              </h1>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest pl-0.5">CommunityPulse Response Network</p>
            </div>
          </div>

          <div className="flex items-center gap-10">
            {/* Volunteer GPS Status */}
            <div className="flex flex-col items-end border-r border-[var(--border-color)] pr-10">
              <span className="text-[10px] text-[var(--foreground)]/60 font-black uppercase tracking-widest mb-1 flex items-center gap-1.5">
                <Navigation2 size={9} />
                Your Position
              </span>
              {volunteerLocation ? (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shadow-[0_0_6px_rgba(96,165,250,0.8)]"></div>
                  <span className="text-sm font-black text-blue-400 font-mono tracking-tighter tabular-nums">
                    {volunteerLocation.lat.toFixed(4)}, {volunteerLocation.lng.toFixed(4)}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-slate-600 animate-pulse"></div>
                  <span className="text-sm font-black text-slate-500 uppercase tracking-widest">Locating...</span>
                </div>
              )}
            </div>
            <div className="flex gap-10 border-r border-[var(--border-color)] pr-10">
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-[var(--foreground)]/60 font-black uppercase tracking-widest mb-1">Life Threats</span>
                <span className="text-3xl font-anton text-emergency tracking-widest tabular-nums">
                    {needs.filter(n => n.urgency_score >= 8).length}
                </span>
              </div>
              <div className="flex flex-col items-end pl-4">
                <span className="text-[10px] text-[var(--foreground)]/60 font-black uppercase tracking-widest mb-1">Active Feed</span>
                <span className="text-3xl font-anton text-success tracking-widest tabular-nums">{needs.length}</span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-r from-yellow to-yellow border border-[var(--border-color)] shadow-lg p-0.5">
                <div className="w-full h-full rounded-[0.9rem] bg-[var(--background)]/80 backdrop-blur-sm"></div>
            </div>
          </div>
        </header>

        {/* View Selection Content */}
        <div className="flex-1 p-12 overflow-hidden relative">
          <AnimatePresence mode="wait">
              {activeTab === 'map' ? (
                  <motion.div 
                      key="map-view"
                      initial={{ opacity: 0, scale: 0.99 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 1.01 }}
                      className="absolute inset-12 overflow-hidden rounded-[3rem] border border-white/10 shadow-3xl"
                  >
                      <LiveMap 
                          needs={needs} 
                          onMarkerClick={setSelectedNeed} 
                          volunteerLocation={volunteerLocation}
                          focusNeed={selectedNeed}
                          onRecenter={() => {}}
                          isManualMode={isManualMode}
                          onManualLocationSet={handleManualLocationSet}
                      />

                      {/* Manual Mode Toggle & Status */}
                      <div className="absolute top-6 right-6 z-50 flex flex-col items-end gap-3">
                        {!isManualMode ? (
                          <button 
                            onClick={() => setIsManualMode(true)}
                            className="px-4 py-2 bg-slate-900/80 backdrop-blur-md border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white hover:border-primary/50 transition-all flex items-center gap-2 shadow-xl"
                          >
                            <MapPin size={12} className="text-primary" />
                            Correct Location
                          </button>
                        ) : (
                          <div className="flex flex-col items-end gap-2">
                             <div className="px-4 py-2 bg-primary/20 backdrop-blur-md border border-primary/50 rounded-xl text-[10px] font-black uppercase tracking-widest text-white flex items-center gap-2 shadow-xl">
                                <div className="w-2 h-2 rounded-full bg-white animate-pulse"></div>
                                Placement Mode: Click Map
                             </div>
                             <button 
                                onClick={clearManualOverride}
                                className="px-3 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[8px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition-all"
                             >
                                Use GPS Logic
                             </button>
                          </div>
                        )}
                      </div>

                      {/* GPS Location Detection Toast */}
                      <AnimatePresence>
                        {showLocationToast && (
                          <motion.div
                            initial={{ opacity: 0, y: -20, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -20, scale: 0.95 }}
                            transition={{ type: 'spring', damping: 20, stiffness: 200 }}
                            className="absolute top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl border shadow-2xl backdrop-blur-xl"
                            style={{
                              background: locationStatus === 'found' ? 'rgba(0,230,118,0.12)' : locationStatus === 'denied' ? 'rgba(255,77,0,0.12)' : 'rgba(59,130,246,0.12)',
                              borderColor: locationStatus === 'found' ? 'rgba(0,230,118,0.3)' : locationStatus === 'denied' ? 'rgba(255,77,0,0.3)' : 'rgba(59,130,246,0.3)',
                            }}
                          >
                            {locationStatus === 'detecting' && (
                              <>
                                <div className="w-3.5 h-3.5 rounded-full bg-blue-500 animate-ping"></div>
                                <span className="text-xs font-black text-blue-400 uppercase tracking-widest">Detecting your location...</span>
                              </>
                            )}
                            {locationStatus === 'found' && (
                              <>
                                <div className="w-3.5 h-3.5 rounded-full bg-success shadow-[0_0_10px_rgba(0,230,118,0.5)]"></div>
                                <span className="text-xs font-black text-success uppercase tracking-widest">
                                  {isManualMode ? 'Location Overridden Manually' : 'Location locked — map centered on you'}
                                </span>
                              </>
                            )}
                            {locationStatus === 'denied' && (
                              <>
                                <div className="w-3.5 h-3.5 rounded-full bg-emergency shadow-[0_0_10px_rgba(255,77,0,0.5)]"></div>
                                <span className="text-xs font-black text-emergency uppercase tracking-widest">Location access denied</span>
                              </>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                  </motion.div>
              ) : activeTab === 'alerts' || activeTab === 'analytics' ? (
                  <motion.div 
                      key="alerts-view"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="h-full glass-dark rounded-[3rem] p-12 overflow-y-auto no-scrollbar border border-white/5 shadow-2xl"
                  >
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-32">
                          {sortedNeeds.map((need) => (
                              <div 
                                  key={need.id} 
                                  onClick={() => { setSelectedNeed(need); setActiveTab('map'); }}
                                  className="group relative p-6 bg-white/5 rounded-[2rem] border border-white/10 hover:border-emergency/30 hover:bg-white/[0.08] cursor-pointer transition-all duration-500 shadow-xl flex flex-col"
                              >
                                  <div className="flex justify-between items-start mb-4">
                                      <div className={cn(
                                          "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest",
                                          need.urgency_score >= 8 ? "bg-emergency/20 text-emergency border border-emergency/30" : 
                                          need.urgency_score >= 5 ? "bg-orange-500/20 text-orange-500 border border-orange-500/30" : 
                                          "bg-success/20 text-success border border-success/30"
                                      )}>
                                          {need.urgency_score >= 8 ? 'CRITICAL' : need.urgency_score >= 5 ? 'URGENT' : 'STABLE'}
                                      </div>
                                      <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest font-mono">
                                          #{need.id.slice(0, 5)}
                                      </span>
                                  </div>
                                  <h4 className="text-lg font-black text-white mb-1 group-hover:text-emergency transition-colors leading-tight">
                                      {need.location_name || 'Unspecified Sector'}
                                  </h4>
                                  {need.lat && need.lng && (
                                      <div className="flex flex-wrap items-center gap-1.5 mb-2">
                                          <span className="text-[9px] font-mono font-bold text-slate-500 bg-white/5 py-0.5 px-2 rounded">
                                              {need.lat.toFixed(4)}, {need.lng.toFixed(4)}
                                          </span>
                                          {volunteerLocation && (
                                              <span className="text-[9px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 py-0.5 px-2 rounded flex items-center gap-1">
                                                  <Navigation2 size={9} /> 
                                                  {calculateDistance(volunteerLocation.lat, volunteerLocation.lng, need.lat, need.lng)} km
                                              </span>
                                          )}
                                      </div>
                                  )}
                                  <p className="text-slate-400 text-sm italic line-clamp-2 mb-4 leading-relaxed font-medium flex-1">&ldquo;{need.raw_text}&rdquo;</p>
                                  <div className="flex items-center justify-between border-t border-white/5 pt-4 mt-auto">
                                      <div className="flex items-center gap-2 text-[9px] text-slate-500 font-black uppercase tracking-widest">
                                          <Activity size={10} className="text-emergency" />
                                          {need.need_type || 'general'}
                                      </div>
                                      <div className="flex items-center gap-3">
                                          <button
                                              onClick={(e) => { e.stopPropagation(); setSelectedNeed(need); setActiveTab('map'); }}
                                              className="px-2.5 py-1 bg-white/5 hover:bg-white/10 rounded-full text-[8px] font-black uppercase tracking-widest text-primary flex items-center gap-1 transition-colors border border-white/5"
                                          >
                                              <MapPin size={9} /> Locate
                                          </button>
                                          <span className="text-xl font-black text-white italic">{need.urgency_score}</span>
                                      </div>
                                  </div>
                              </div>
                          ))}
                      </div>
                  </motion.div>
              ) : activeTab === 'comms' ? (
                  <motion.div 
                      key="comms-view"
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      className="h-full glass-dark rounded-[3rem] p-8 overflow-hidden border border-white/5 shadow-2xl flex flex-col relative"
                  >
                        <div className="flex items-center justify-between mb-8 px-4">
                            <div>
                                <h2 className="text-3xl font-black text-white uppercase tracking-tighter font-outfit">Comms Hub</h2>
                                <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mt-1">Satellite Transmission Log & AI Response Feed</p>
                            </div>
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                                <span className="text-[8px] font-black text-emerald-500 uppercase tracking-widest">Realtime Feed Active</span>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto no-scrollbar space-y-4 px-4 pb-20">
                            {commsMessages.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
                                    <Bot size={48} className="text-slate-600 mb-4" />
                                    <p className="text-xs font-bold text-slate-600 uppercase tracking-[0.2em]">Awaiting first transmission...</p>
                                </div>
                            ) : (
                                commsMessages.map((msg) => (
                                    <motion.div 
                                        key={msg.id}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        className="bg-white/5 border border-white/5 rounded-2xl p-5 flex gap-5 hover:bg-white/[0.08] transition-colors"
                                    >
                                        <div className="w-10 h-10 rounded-xl bg-slate-900 border border-white/10 flex items-center justify-center flex-shrink-0">
                                            <Signal size={18} className="text-primary" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-start mb-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-black text-white uppercase tracking-widest">{msg.type}</span>
                                                    <span className="text-[8px] font-mono text-slate-500">#{msg.need_id.slice(0, 8)}</span>
                                                </div>
                                                <span className="text-[8px] font-mono text-slate-600">
                                                    {new Date(msg.created_at).toLocaleTimeString()}
                                                </span>
                                            </div>
                                            <p className="text-slate-400 text-xs font-medium leading-relaxed">{msg.body}</p>
                                            <div className="mt-2 flex items-center gap-2">
                                                <div className={cn(
                                                    "px-2 py-0.5 rounded text-[7px] font-black uppercase tracking-tighter",
                                                    msg.status === 'sent' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-orange-500/20 text-orange-500'
                                                )}>
                                                    Status: {msg.status}
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                ))
                            )}
                        </div>

                        {/* Aesthetic HUD Overlay */}
                        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-slate-950 to-transparent pointer-events-none"></div>
                  </motion.div>
              ) : null}
          </AnimatePresence>
        </div>
      </div>

      {/* Summary Panel Overlay (Bottom Slide) */}
      <AnimatePresence>
        {selectedNeed && (
          <motion.aside
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed bottom-0 left-24 right-0 z-50 p-6"
          >
            <div className="max-w-5xl mx-auto bg-slate-950 rounded-t-[2.5rem] overflow-hidden overflow-y-auto max-h-[85vh] border-t border-white/20 shadow-[0_-20px_100px_rgba(0,0,0,0.95)]">
              <div className="p-10">
                <div className="flex justify-between items-start mb-10">
                  <div>
                    <h2 className="text-4xl font-black text-white flex items-center gap-5 font-outfit uppercase tracking-tighter">
                      <MapPin className="text-emergency" size={38} />
                      {selectedNeed.location_name}
                    </h2>
                    <p className="text-slate-400 font-black uppercase text-[10px] tracking-widest ml-14 mt-1 opacity-60">Intelligence Dossier Report</p>
                  </div>
                  <button 
                    onClick={() => setSelectedNeed(null)}
                    className="p-5 bg-white/5 hover:bg-white/10 rounded-2xl transition-all border border-white/5"
                  >
                    <X size={26} className="text-slate-400" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                  <div className="space-y-8">
                    <div className="p-8 bg-white/5 rounded-[3rem] border border-white/10 relative overflow-hidden group">
                      <div className="absolute top-0 left-0 w-2 h-full bg-emergency"></div>
                      <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                        <Activity size={16} className="text-emergency" /> Raw Transmission
                      </h3>
                      <p className="text-slate-200 text-2xl font-medium italic leading-relaxed">
                        &ldquo;{selectedNeed.raw_text}&rdquo;
                      </p>
                    </div>

                    <div className="flex gap-8">
                      <div className="flex-1 p-8 bg-emergency/10 rounded-[2.5rem] border border-emergency/20 text-center backdrop-blur-sm">
                        <span className="text-[10px] text-emergency font-black uppercase tracking-widest block mb-1">Urgency Score</span>
                        <span className="text-5xl font-black text-white italic leading-none">{selectedNeed.urgency_score}</span>
                      </div>
                      <div className="flex-1 p-8 bg-success/10 rounded-[2.5rem] border border-success/20 text-center backdrop-blur-sm">
                        <span className="text-[10px] text-success font-black uppercase tracking-widest block mb-1">Impact Load</span>
                        <span className="text-4xl font-black text-white italic leading-none">{selectedNeed.people_affected || 'Unknown'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-8 flex flex-col justify-end">
                    <div className="p-8 bg-slate-900 rounded-[2.5rem] border border-white/10 shadow-inner">
                        <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-6 border-b border-white/5 pb-4">Real-time Telemetry</h3>
                        <div className="flex items-center gap-5">
                            <div className="w-4 h-4 rounded-full bg-emergency animate-pulse shadow-[0_0_15px_rgba(255,77,0,0.5)]"></div>
                            <span className="text-xl font-black text-slate-100 uppercase tracking-tighter italic">
                                {selectedNeed.need_type} Operation Required
                            </span>
                        </div>
                        <div className="flex items-center gap-5 mt-4">
                            <div className="w-4 h-4 flex items-center justify-center"><Phone size={14} className="text-primary"/></div>
                            <span className="text-lg font-bold text-slate-300 font-mono tracking-tighter">
                                {selectedNeed.phone || "No Contact Provided"}
                            </span>
                        </div>
                        <div className="flex items-center gap-5 mt-4">
                            <div className="w-4 h-4 flex items-center justify-center"><MapPin size={14} className="text-primary"/></div>
                            <span className="text-lg font-bold text-slate-300 font-mono tracking-tighter">
                                {selectedNeed.lat ? `${selectedNeed.lat.toFixed(6)}, ${selectedNeed.lng?.toFixed(6)}` : "GPS Signal Lost"}
                            </span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-6 font-mono font-bold uppercase tracking-widest opacity-60">
                            Logged: {new Date(selectedNeed.created_at).toLocaleString()}
                        </p>
                    </div>
                    <div className="flex flex-col gap-3">
                      <h4 className="text-[10px] text-slate-500 font-black uppercase tracking-widest text-center mb-1">Dispatch Action Protocol</h4>
                      <button 
                        onClick={() => handleDeploy(selectedNeed.id, 'in-progress')}
                        className="w-full py-5 bg-orange-500 hover:bg-orange-400 text-white font-black rounded-[1.5rem] hover:scale-[0.99] active:scale-95 transition-all shadow-[0_10px_30px_rgba(249,115,22,0.2)] flex items-center justify-center gap-3 text-sm uppercase tracking-widest"
                      >
                        Dispatched (I&apos;m coming)
                      </button>
                      <button 
                        onClick={() => handleDeploy(selectedNeed.id, 'resolved')}
                        className="w-full py-5 bg-success hover:bg-green-400 text-slate-900 font-black rounded-[1.5rem] hover:scale-[0.99] active:scale-95 transition-all shadow-[0_10px_30px_rgba(0,230,118,0.2)] flex items-center justify-center gap-3 text-sm uppercase tracking-widest"
                      >
                        Resolved (Finished)
                      </button>
                    </div>

                    {/* Live Chat with Reporter */}
                    <div className="h-[280px]">
                        <ChatPanel needId={selectedNeed.id} role="volunteer" />
                    </div>
                  </div>
                </div>
              </div>
              <div className="h-3 w-full bg-gradient-to-r from-emergency via-primary to-success"></div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>



      {/* Loading Overlay (Fullscreen Boot) */}
      <AnimatePresence>
        {(needsLoading || authLoading) && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-slate-950 flex flex-col items-center justify-center gap-10"
          >
            <div className="p-10 bg-emergency rounded-[3.5rem] shadow-[0_40px_80px_rgba(255,77,0,0.4)] animate-bounce border border-white/10">
              <Activity className="text-white" size={80} />
            </div>
            <div className="text-center">
                <h2 className="text-5xl font-black text-white font-outfit uppercase tracking-tighter leading-none mb-4">CommunityPulse</h2>
                <div className="flex flex-col items-center gap-3">
                    <p className="text-slate-500 font-black uppercase tracking-[0.3em] text-[12px]">Optimizing Ground Logic...</p>
                    <div className="w-48 h-1 bg-white/5 rounded-full overflow-hidden border border-white/5">
                        <motion.div 
                            className="h-full bg-emergency shadow-[0_0_10px_#FF4D00]"
                            initial={{ width: 0 }}
                            animate={{ width: '100%' }}
                            transition={{ duration: 2, repeat: Infinity }}
                        ></motion.div>
                    </div>
                </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

