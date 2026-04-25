'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useRealtimeNeeds, Need } from '@/hooks/useRealtimeNeeds';

const LiveMap = dynamic(() => import('@/components/map/LiveMap'), { ssr: false });
import { LayoutDashboard, ShieldAlert, Truck, CheckCircle2, Activity, MapPin, Phone, Navigation2, X, Signal, LogOut, Bot } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { rtdb } from '@/lib/firebase';
import { ref, update, onValue, query, limitToLast } from 'firebase/database';
import ChatPanel from '@/components/chat/ChatPanel';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';


export default function Home() {
  const { needs, loading: needsLoading, refresh } = useRealtimeNeeds();
  const { user, role, domain, loading: authLoading, signOut } = useAuth();
  const router = useRouter();

  // AUTH PROTECTION
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    } else if (!authLoading && user && role !== 'VOLUNTEER') {
      router.push('/field');
    }
  }, [user, role, authLoading, router]);





  const [selectedNeed, setSelectedNeed] = useState<Need | null>(null);
  const [activeTab, setActiveTab] = useState<'map' | 'alerts' | 'dispatched' | 'resolved' | 'comms' | 'intel'>('map');
  const [manualSector, setManualSector] = useState<'all' | 'human' | 'animal'>('all');
  
  // Derived state: Use domain if locked, otherwise use manual selection
  const activeSector = domain || manualSector;
  const [volunteerLocation, setVolunteerLocation] = useState<{lat: number; lng: number; accuracy?: number} | null>(null);
  const [locationStatus, setLocationStatus] = useState<'detecting' | 'found' | 'denied' | 'idle'>('idle');
  const [showLocationToast, setShowLocationToast] = useState(false);
  const [isManualMode, setIsManualMode] = useState(false);
  const [watchId] = useState<number | null>(null);
  const [trackingNeedId, setTrackingNeedId] = useState<string | null>(null);

  const formatDate = (ts: number | string | null | undefined) => {
      if (!ts) return 'Unknown Time';
      const d = new Date(ts);
      if (isNaN(d.getTime())) return 'Invalid Date';
      return d.toLocaleString('en-IN', {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
      });
  };
interface CommMessage {
  id: string;
  need_id: string;
  type: string;
  body: string;
  status: string;
  created_at: number;
}

interface TelegramAction {
  id: string;
  type: 'report' | 'animal' | 'start' | 'other';
  user_id: number;
  username: string;
  text: string;
  sentiment?: string;
  urgency?: number;
  created_at: number;
}

  const [commsMessages, setCommsMessages] = useState<CommMessage[]>([]);
  const [telegramActions, setTelegramActions] = useState<TelegramAction[]>([]);

  useEffect(() => {
      if (isManualMode) {
          if (watchId !== null) {
              navigator.geolocation.clearWatch(watchId);
          }
          return;
      }

      // 1. Hardware Geolocation Hook
      if ("geolocation" in navigator) {
          if (locationStatus === 'idle') {
              setTimeout(() => {
                  setLocationStatus('detecting');
                  setShowLocationToast(true);
              }, 0);
          }
          
          const id = navigator.geolocation.watchPosition((position) => {
              const { latitude, longitude, accuracy } = position.coords;
              if (!isNaN(latitude) && !isNaN(longitude)) {
                  setVolunteerLocation({
                      lat: latitude,
                      lng: longitude,
                      accuracy: accuracy,
                  });
                  setLocationStatus('found');
                  // Auto-hide toast after 3s if it was just found
                  if (showLocationToast) {
                      setTimeout(() => setShowLocationToast(false), 3000);
                  }
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

          return () => {
              navigator.geolocation.clearWatch(id);
          };
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // SYNC VOLUNTEER LOCATION TO FIREBASE
  // This allows the reporter (user) to see the volunteer's live position on their map
  useEffect(() => {
    if (trackingNeedId && volunteerLocation) {
        const syncLocation = async () => {
            const needRef = ref(rtdb, `needs/${trackingNeedId}`);
            await update(needRef, {
                volunteer_lat: volunteerLocation.lat,
                volunteer_lng: volunteerLocation.lng
            });
        };
        
        // Sync every 3 seconds or on location change
        const interval = setInterval(syncLocation, 3000);
        syncLocation(); // immediate initial sync
        
        return () => clearInterval(interval);
    }
  }, [trackingNeedId, volunteerLocation]);

  const handleDeploy = async (needId: string, status: string) => {
      try {
          const needRef = ref(rtdb, `needs/${needId}`);
          await update(needRef, { status });
          
          if (status === 'in-progress' || status === 'resolved') {
              if (status === 'in-progress') setTrackingNeedId(needId);
              else setTrackingNeedId(null);
              // Trigger automated dispatch notification
              try {
                  fetch('http://localhost:8000/notify/status', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ need_id: needId, status })
                  });
              } catch (err) {
                  console.error("Failed to notify dispatch:", err);
              }
          } else if (status === 'resolved' || status === 'open') {
              setTrackingNeedId(null);
          }
          setSelectedNeed(null);
          refresh();
      } catch (error) {
          console.error("Error updating status:", error);
      }
  };

  // FETCH & LISTEN FOR COMMUNICATIONS LOGS
  useEffect(() => {
    // In RTDB, we might want to listen to all messages for all needs if that's what was happening before
    // Or just a specific node. Let's assume a global 'all_messages' for the dashboard or listen to the messages root.
    const messagesRef = ref(rtdb, 'messages');
    const q = query(messagesRef, limitToLast(50));

    const unsubscribe = onValue(q, (snapshot) => {
        const allMsgs: CommMessage[] = [];
        snapshot.forEach((needMessages) => {
            needMessages.forEach((msg) => {
                allMsgs.push({ id: msg.key, ...msg.val() });
            });
        });
        // Sort by created_at desc
        allMsgs.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
        setCommsMessages(allMsgs.slice(0, 50));
    });

    return () => unsubscribe();
  }, []);

  // LISTEN FOR TELEGRAM ACTIONS
  useEffect(() => {
    const actionsRef = ref(rtdb, 'telegram_actions');
    const q = query(actionsRef, limitToLast(20));

    const unsubscribe = onValue(q, (snapshot) => {
        const actions: TelegramAction[] = [];
        snapshot.forEach((child) => {
            actions.push({ id: child.key, ...child.val() } as TelegramAction);
        });
        // Newest first
        setTelegramActions(actions.reverse());
    });

    return () => unsubscribe();
  }, []);

  // Filter needs by sector (Strictly locked to volunteer domain if set)
  const filteredNeeds = needs.filter(need => {
    // If a domain is assigned to the user profile, STRICTLY only show that domain
    if (domain) {
      if (domain === 'animal') return need.need_type === 'animal';
      return need.need_type !== 'animal';
    }
    
    // Fallback for cases where domain is not yet assigned (e.g. manual switching allowed)
    if (activeSector === 'all') return true;
    if (activeSector === 'animal') return need.need_type === 'animal';
    return need.need_type !== 'animal';
  });

  // Sort filtered needs by urgency
  const sortedNeeds = [...filteredNeeds].filter(n => n.status === 'open' || !n.status).sort((a, b) => b.urgency_score - a.urgency_score);
  const dispatchedNeeds = [...filteredNeeds].filter(n => n.status === 'in-progress').sort((a, b) => b.urgency_score - a.urgency_score);
  const resolvedNeeds = [...filteredNeeds].filter(n => n.status === 'resolved').sort((a, b) => b.urgency_score - a.urgency_score);

  if (authLoading || !user || role !== 'VOLUNTEER') {
    return (
        <div className="fixed inset-0 z-200 bg-(--background) brutalist-grid flex flex-col items-center justify-center gap-10">
            <div className="relative animate-pulse">
                <div className="absolute inset-x-[-10px] inset-y-[10px] bg-yellow -rotate-3 scale-105 z-[-1]"></div>
                <div className="p-8 bg-(--background) border border-(--border-color) shadow-2xl relative z-10 glass">
                  <Activity className="text-yellow" size={80} />
                </div>
            </div>
            <p className="text-sm font-black uppercase tracking-[0.3em] opacity-40 font-roboto">Verifying Credentials...</p>
        </div>
    );
  }



  return (
    <main className="relative min-h-screen bg-(--background) overflow-hidden flex font-roboto -mt-20 pt-20">
      {/* 
          UNIFIED SIDEBAR SYSTEM 
          Contains both Navigation icons and the expandable Intake Form
      */}
      <aside 
        className="fixed left-0 top-20 bottom-0 z-40 flex transition-all duration-500 ease-out translate-x-0"
      >
        {/* Persistent Nav Strip */}
        <nav className="h-full w-24 flex flex-col items-center gap-8 py-10 glass border-r border-(--border-color) border-t-0 relative z-20 brutalist-grid">
            {/* Dashboard Icon */}
            <div className="relative group">
                <button 
                    onClick={() => setActiveTab('map')}
                    className={cn(
                        "p-4 rounded-2xl transition-all border border-transparent hover:scale-105 active:scale-95",
                        activeTab === 'map' ? "bg-yellow text-black border-black/10 shadow-[0_5px_15px_rgba(255,225,124,0.3)]" : "text-(--foreground)/60 hover:text-(--foreground) hover:bg-(--foreground)/10"
                    )}
                >
                    <LayoutDashboard size={24} />
                </button>
                <div className="absolute left-full ml-4 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-(--foreground) text-(--background) font-bold text-xs uppercase tracking-widest rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-xl">
                    Operation Map
                </div>
            </div>

            <div className="w-8 h-px bg-white/10 my-4"></div>

            {/* Priority Intelligence Icon */}
            <div className="relative group">
                <button 
                    onClick={() => setActiveTab('alerts')}
                    className={cn(
                        "p-4 rounded-2xl transition-all relative hover:scale-105 active:scale-95",
                        activeTab === 'alerts' ? "bg-emergency text-(--background) border border-emergency/50 shadow-[0_0_15px_var(--color-emergency-glow)]" : "text-(--foreground)/60 hover:text-(--foreground) hover:bg-(--foreground)/10"
                    )}
                >
                    <ShieldAlert size={24} />
                    {needs.filter(n => n.urgency_score >= 8).length > 0 && (
                        <div className="absolute top-2 right-2 w-3 h-3 bg-white rounded-full animate-pulse border-2 border-emergency shadow-[0_0_10px_white]"></div>
                    )}
                </button>
                <div className="absolute left-full ml-4 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-(--foreground) text-(--background) font-bold text-xs uppercase tracking-widest rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-xl">
                    Priority Queue
                </div>
            </div>

            {/* Dispatched Icon */}
            <div className="relative group">
                <button 
                    onClick={() => setActiveTab('dispatched')}
                    className={cn(
                        "p-4 rounded-2xl transition-all hover:scale-105 active:scale-95",
                        activeTab === 'dispatched' ? "bg-orange-500 text-(--background) shadow-[0_0_15px_rgba(249,115,22,0.4)]" : "text-(--foreground)/60 hover:text-(--foreground) hover:bg-(--foreground)/10"
                    )}
                >
                    <Truck size={24} />
                </button>
                <div className="absolute left-full ml-4 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-(--foreground) text-(--background) font-bold text-xs uppercase tracking-widest rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-xl">
                    Active Dispatch
                </div>
            </div>

            {/* Resolved Icon */}
            <div className="relative group">
                <button 
                    onClick={() => setActiveTab('resolved')}
                    className={cn(
                        "p-4 rounded-2xl transition-all hover:scale-105 active:scale-95",
                        activeTab === 'resolved' ? "bg-success text-(--background) shadow-[0_0_15px_var(--color-success-glow)]" : "text-(--foreground)/60 hover:text-(--foreground) hover:bg-(--foreground)/10"
                    )}
                >
                    <CheckCircle2 size={24} />
                </button>
                <div className="absolute left-full ml-4 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-(--foreground) text-(--background) font-bold text-xs uppercase tracking-widest rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-xl">
                    Resolved Missions
                </div>
            </div>

            <div className="mt-auto flex flex-col items-center gap-6">
                <div className="relative group">
                    <button 
                        onClick={() => setActiveTab('comms')}
                        className={cn(
                            "p-4 transition-all rounded-2xl hover:scale-105 active:scale-95",
                            activeTab === 'comms' ? "bg-(--foreground) text-(--background) shadow-xl" : "text-(--foreground)/60 hover:text-(--foreground) hover:bg-(--foreground)/10"
                        )}
                    >
                        <Phone size={24} />
                    </button>
                    <div className="absolute left-full ml-4 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-(--foreground) text-(--background) font-bold text-xs uppercase tracking-widest rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-xl">
                        Comms Center
                    </div>
                </div>

                <div className="relative group">
                    <button 
                        onClick={() => setActiveTab('intel')}
                        className={cn(
                            "p-4 transition-all rounded-2xl hover:scale-105 active:scale-95",
                            activeTab === 'intel' ? "bg-yellow text-black shadow-xl" : "text-(--foreground)/60 hover:text-(--foreground) hover:bg-(--foreground)/10"
                        )}
                    >
                        <Bot size={24} />
                    </button>
                    <div className="absolute left-full ml-4 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-(--foreground) text-(--background) font-bold text-xs uppercase tracking-widest rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-xl">
                        Telegram Intel
                    </div>
                </div>

                <div className="w-10 h-px bg-(--border-color)"></div>

                <div className="relative group">
                    <button 
                        onClick={() => signOut()}
                        className="p-4 rounded-2xl text-(--foreground)/50 hover:text-(--background) hover:bg-emergency transition-all hover:scale-105 active:scale-95"
                    >
                        <LogOut size={20} />
                    </button>
                    <div className="absolute left-full ml-4 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-emergency text-(--foreground) font-bold text-xs uppercase tracking-widest rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-xl">
                        Terminate Link
                    </div>
                </div>
            </div>
        </nav>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 transition-all duration-500 ease-out h-[calc(100vh-80px)] relative flex flex-col pl-24">
        {/* Header */}
        <header className="px-12 py-8 flex justify-between items-center border-b border-(--border-color) glass z-30">
          <div className="flex items-center gap-6">
            <div className="p-3 bg-emergency rounded-[1.25rem] border border-black/10 shadow-lg shadow-emergency/20">
              <Activity className="text-(--foreground)" size={28} />
            </div>
            <div>
              <h1 className="text-4xl font-anton text-(--foreground) tracking-wide uppercase leading-none mb-1 shadow-sm">
                  {activeTab === 'map' ? 'Operational Hub' : activeTab === 'alerts' ? 'Priority Queue' : activeTab === 'dispatched' ? 'Active Dispatch' : activeTab === 'resolved' ? 'Mission Archive' : activeTab === 'comms' ? 'AI Watch Chatbot' : activeTab === 'intel' ? 'Signals Intel' : 'Command Center'}
              </h1>
              <div className="flex items-center gap-4">
                <p className="text-[10px] text-sage font-bold uppercase tracking-widest pl-0.5">CommunityPulse Response Network</p>
                <div className="flex bg-white/5 p-1 rounded-lg border border-white/10 ml-2">
                    {/* If domain is assigned, only show that specific domain and hide others */}
                    {domain ? (
                        <div className={cn(
                            "px-4 py-1.5 rounded-md text-[9px] font-black uppercase tracking-[0.3em] shadow-lg",
                            domain === 'human' ? "bg-yellow text-black" : "bg-blue-500 text-white"
                        )}>
                            Locked Domain: {domain === 'human' ? 'Human Health' : 'Animal Health'}
                        </div>
                    ) : (
                        <>
                            <button 
                                onClick={() => setManualSector('human')}
                                className={cn(
                                    "px-3 py-1 rounded-md text-[9px] font-black uppercase tracking-widest transition-all",
                                    activeSector === 'human' ? "bg-yellow text-black" : "text-sage hover:text-yellow"
                                )}
                            >
                                Human Health
                            </button>
                            <button 
                                onClick={() => setManualSector('animal')}
                                className={cn(
                                    "px-3 py-1 rounded-md text-[9px] font-black uppercase tracking-widest transition-all",
                                    activeSector === 'animal' ? "bg-blue-500 text-white" : "text-sage hover:text-blue-400"
                                )}
                            >
                                Animal Health
                            </button>
                            <button 
                                onClick={() => setManualSector('all')}
                                className={cn(
                                    "px-3 py-1 rounded-md text-[9px] font-black uppercase tracking-widest transition-all",
                                    activeSector === 'all' ? "bg-white/10 text-(--foreground)" : "text-sage hover:text-(--foreground)"
                                )}
                            >
                                All
                            </button>
                        </>
                    )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-10">
            {/* Volunteer GPS Status */}
            <div className="flex flex-col items-end border-r border-(--border-color) pr-10">
              <span className="text-[10px] text-(--foreground)/60 font-black uppercase tracking-widest mb-1 flex items-center gap-1.5">
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
                  <span className="text-sm font-black text-sage uppercase tracking-widest">Locating...</span>
                </div>
              )}
            </div>
            <div className="flex gap-10 border-r border-(--border-color) pr-10">
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-(--foreground)/60 font-black uppercase tracking-widest mb-1">Life Threats</span>
                <span className="text-3xl font-anton text-emergency tracking-widest tabular-nums">
                    {needs.filter(n => n.urgency_score >= 8).length}
                </span>
              </div>
              <div className="flex flex-col items-end pl-4">
                <span className="text-[10px] text-(--foreground)/60 font-black uppercase tracking-widest mb-1">Active Feed</span>
                <span className="text-3xl font-anton text-success tracking-widest tabular-nums">{filteredNeeds.length}</span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-linear-to-r from-yellow to-yellow border border-(--border-color) shadow-lg p-0.5">
                <div className="w-full h-full rounded-[0.9rem] bg-(--background)/80 backdrop-blur-sm"></div>
            </div>
          </div>
        </header>

        {/* View Selection Content */}
        <div className="flex-1 p-6 lg:p-12 overflow-hidden relative flex flex-col">
          <AnimatePresence mode="wait">
              {activeTab === 'map' ? (
                  <motion.div 
                      key="map-view"
                      initial={{ opacity: 0, scale: 0.99 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 1.01 }}
                      className="w-full flex-1 overflow-hidden rounded-4xl border border-(--border-color) shadow-2xl glass brutalist-grid"
                  >
                      <LiveMap 
                          needs={filteredNeeds} 
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
                            className="px-4 py-2 bg-dark-gray/80 backdrop-blur-md border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-sage/80 hover:text-(--foreground) hover:border-yellow/50 transition-all flex items-center gap-2 shadow-xl"
                          >
                            <MapPin size={12} className="text-yellow" />
                            Correct Location
                          </button>
                        ) : (
                          <div className="flex flex-col items-end gap-2">
                             <div className="px-4 py-2 bg-yellow/20 backdrop-blur-md border border-yellow/50 rounded-xl text-[10px] font-black uppercase tracking-widest text-(--foreground) flex items-center gap-2 shadow-xl">
                                <div className="w-2 h-2 rounded-full bg-white animate-pulse"></div>
                                Placement Mode: Click Map
                             </div>
                             <button 
                                onClick={clearManualOverride}
                                className="px-3 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[8px] font-black uppercase tracking-widest text-sage hover:text-(--foreground) transition-all"
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
              ) : (activeTab === 'alerts' || activeTab === 'dispatched' || activeTab === 'resolved') ? (
                  <motion.div 
                      key={`${activeTab}-view`}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="h-full glass rounded-[3rem] p-12 overflow-y-auto no-scrollbar shadow-2xl"
                  >
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-32">
                          {(activeTab === 'alerts' ? sortedNeeds : activeTab === 'dispatched' ? dispatchedNeeds : resolvedNeeds).map((need) => (
                              <div 
                                  key={need.id} 
                                  onClick={() => { setSelectedNeed(need); setActiveTab('map'); }}
                                  className="group relative p-6 bg-(--card-bg) rounded-4xl border border-(--border-color) hover:border-emergency/30 hover:bg-(--foreground)/5 cursor-pointer transition-all duration-500 shadow-xl flex flex-col"
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
                                      <div className="flex items-center gap-2">
                                          {need.source === 'telegram' && (
                                              <div className="flex flex-col items-end gap-1">
                                                  <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 text-[8px] font-black rounded uppercase tracking-widest border border-blue-500/20">
                                                      via Telegram
                                                  </span>
                                                  <span className="text-[7px] font-black text-(--foreground) opacity-60 uppercase">
                                                      {formatDate(need.created_at)}
                                                  </span>
                                              </div>
                                          )}
                                          <span className="text-[10px] font-bold text-(--foreground) uppercase tracking-widest font-mono">
                                              #{need.id.slice(0, 5)}
                                          </span>
                                      </div>
                                  </div>
                                  <h4 className="text-lg font-black text-(--foreground) mb-1 group-hover:text-emergency transition-colors leading-tight">
                                      {need.location_name || 'Unspecified Sector'}
                                  </h4>
                                  {need.lat && need.lng && (
                                      <div className="flex flex-wrap items-center gap-1.5 mb-2">
                                          <span className="text-[9px] font-mono font-bold text-(--foreground) bg-(--foreground)/5 py-0.5 px-2 rounded">
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
                                  <p className="text-(--foreground)/70 text-sm italic line-clamp-2 mb-4 leading-relaxed font-medium flex-1">&ldquo;{need.raw_text}&rdquo;</p>
                                  <div className="flex items-center justify-between border-t border-(--border-color) pt-4 mt-auto">
                                      <div className="flex flex-col gap-1">
                                         <div className="flex items-center gap-2 text-[9px] text-(--foreground) font-black uppercase tracking-widest">
                                             <Activity size={10} className="text-emergency" />
                                             {need.need_type || 'general'}
                                         </div>
                                         <div className="text-[8px] font-black text-(--foreground) uppercase tracking-widest opacity-70">
                                             {formatDate(need.created_at)}
                                         </div>
                                      </div>
                                      <div className="flex items-center gap-3">
                                          <button
                                              onClick={(e) => { e.stopPropagation(); setSelectedNeed(need); setActiveTab('map'); }}
                                              className="px-2.5 py-1 bg-(--foreground)/5 hover:bg-(--foreground)/10 rounded-full text-[8px] font-black uppercase tracking-widest text-yellow flex items-center gap-1 transition-colors border border-(--border-color)"
                                          >
                                              <MapPin size={9} /> Locate
                                          </button>
                                          <span className="text-xl font-black text-(--foreground) italic">{need.urgency_score}</span>{need.life_threat && <ShieldAlert size={16} className="text-emergency" />}
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
                      className="h-full glass rounded-[3rem] p-8 overflow-hidden shadow-2xl flex flex-col relative"
                  >
                        <div className="flex items-center justify-between mb-8 px-4">
                            <div>
                                <h2 className="text-3xl font-black text-(--foreground) uppercase tracking-tighter font-outfit">Comms Hub</h2>
                                <div className="flex items-center gap-4 mt-1">
                                    <p className="text-[10px] text-sage font-black uppercase tracking-widest">Satellite Transmission Log & AI Response Feed</p>
                                    <div className="flex items-center gap-3">
                                        <a 
                                            href="https://t.me/Community_Pulse_Bot" 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="text-[9px] font-black text-blue-400 hover:text-blue-300 transition-colors uppercase tracking-[0.2em] bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20"
                                        >
                                            Connect Bot
                                        </a>
                                        <div className="text-[9px] font-black text-emergency uppercase tracking-[0.2em] bg-emergency/10 px-2 py-0.5 rounded border border-emergency/20">
                                            Voice Agent: +91 91705 60759
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                                <span className="text-[8px] font-black text-emerald-500 uppercase tracking-widest">Realtime Feed Active</span>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto no-scrollbar space-y-4 px-4 pb-20">
                            {commsMessages.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
                                    <Bot size={48} className="text-sage mb-4" />
                                    <p className="text-xs font-bold text-sage uppercase tracking-[0.2em]">Awaiting first transmission...</p>
                                </div>
                            ) : (
                                commsMessages.map((msg) => (
                                    <motion.div 
                                        key={msg.id}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        className="bg-(--card-bg) border border-(--border-color) rounded-2xl p-5 flex gap-5 hover:bg-(--foreground)/5 transition-colors"
                                    >
                                        <div className="w-10 h-10 rounded-xl bg-dark-gray border border-white/10 flex items-center justify-center shrink-0">
                                            <Signal size={18} className="text-yellow" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-start mb-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-black text-(--foreground) uppercase tracking-widest">{msg.type}</span>
                                                    <span className="text-[8px] font-mono text-(--foreground) font-bold">#{msg.need_id.slice(0, 8)}</span>
                                                </div>
                                                <span className="text-[8px] font-mono text-(--foreground) font-bold">
                                                    {formatDate(msg.created_at)}
                                                </span>
                                            </div>
                                            <p className="text-(--foreground)/80 text-xs font-medium leading-relaxed">{msg.body}</p>
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
                        <div className="absolute bottom-0 left-0 right-0 h-32 bg-linear-to-t from-slate-950 to-transparent pointer-events-none"></div>
                  </motion.div>
               ) : activeTab === 'intel' ? (
                   <motion.div 
                       key="intel-view"
                       initial={{ opacity: 0, x: -20 }}
                       animate={{ opacity: 1, x: 0 }}
                       exit={{ opacity: 0, x: 20 }}
                       className="h-full glass rounded-[3rem] p-8 overflow-hidden shadow-2xl flex flex-col"
                   >
                        <div className="flex items-center justify-between mb-8 px-4">
                            <div>
                                <h2 className="text-3xl font-black text-(--foreground) uppercase tracking-tighter font-outfit">Signals Intel</h2>
                                <p className="text-[10px] text-sage font-black uppercase tracking-widest mt-1">AI-Decoded Ground Reports & Emotional Sentiment Feed</p>
                            </div>
                            <div className="px-4 py-2 bg-yellow/10 border border-yellow/20 rounded-2xl flex items-center gap-3">
                                <Bot size={16} className="text-yellow" />
                                <span className="text-[10px] font-black text-yellow uppercase tracking-widest">Ollama Pipeline Active</span>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto no-scrollbar space-y-4 px-4 pb-20">
                            {telegramActions.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-center opacity-30">
                                    <Signal size={48} className="text-sage mb-4 animate-pulse" />
                                    <p className="text-xs font-bold text-sage uppercase tracking-[0.2em]">Listening for field signals...</p>
                                </div>
                            ) : (
                                telegramActions.map((action) => (
                                    <motion.div 
                                        key={action.id}
                                        className="bg-(--card-bg) border border-(--border-color) rounded-3xl p-6 hover:bg-(--foreground)/5 transition-all group"
                                    >
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-2xl bg-black/40 flex items-center justify-center border border-white/10 group-hover:border-yellow/50 transition-colors">
                                                    <Bot size={20} className="text-yellow" />
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-black text-(--foreground) uppercase tracking-wide">@{action.username}</span>
                                                        <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 text-[8px] font-black rounded uppercase tracking-widest border border-blue-500/20">
                                                            via Telegram
                                                        </span>
                                                    </div>
                                                    <p className="text-[9px] text-(--foreground) font-black uppercase tracking-widest mt-0.5">
                                                        {formatDate(action.created_at)}
                                                    </p>
                                                </div>
                                            </div>
                                            {action.urgency && (
                                                <div className={cn(
                                                    "px-3 py-1 rounded-xl text-[10px] font-black border",
                                                    action.urgency >= 8 ? "bg-emergency/20 text-emergency border-emergency/30" : "bg-orange-500/10 text-orange-400 border-orange-500/20"
                                                )}>
                                                    PRIORITY {action.urgency}/10
                                                </div>
                                            )}
                                        </div>

                                        <p className="text-sm font-medium text-(--foreground) leading-relaxed mb-4 bg-(--foreground)/5 p-4 rounded-2xl border border-(--border-color) italic">
                                            &ldquo;{action.text}&rdquo;
                                        </p>

                                        {action.sentiment && (
                                            <div className="flex items-center gap-4">
                                                <div className="flex-1 flex items-center gap-3 bg-(--foreground)/5 px-4 py-2 rounded-xl border border-(--border-color)">
                                                    <Activity size={14} className="text-(--foreground) opacity-50" />
                                                    <span className="text-[10px] font-black text-(--foreground) uppercase tracking-widest">Sentiment:</span>
                                                    <span className="text-[10px] font-black text-white uppercase tracking-widest bg-yellow/20 px-2 py-0.5 rounded italic">
                                                        {action.sentiment}
                                                    </span>
                                                </div>
                                            </div>
                                        )}
                                    </motion.div>
                                ))
                            )}
                        </div>
                   </motion.div>
               ) : null}
          </AnimatePresence>
        </div>
      </div>
      {/* Summary Panel Overlay (Full-Width Tactical Slide) */}
      <AnimatePresence>
        {selectedNeed && (
          <motion.aside
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 250 }}
            className="fixed bottom-0 left-24 right-0 z-50 flex flex-col"
          >
            <div className="w-full bg-(--background) rounded-t-5xl overflow-hidden border-t border-(--border-color) shadow-[0_-30px_80px_rgba(0,0,0,0.4)] relative no-scrollbar">
              {/* Header Accents */}
              <div className={cn(
                "h-1.5 w-full",
                selectedNeed.urgency_score >= 8 ? "bg-emergency shadow-[0_0_15px_var(--color-emergency-glow)]" : "bg-primary"
              )}></div>

              <div className="p-8 lg:p-12 max-h-[85vh] overflow-y-auto no-scrollbar">
                <div className="flex justify-between items-start mb-10">
                  <div className="flex items-center gap-6">
                    <div className="p-4 bg-(--foreground)/5 rounded-3xl border border-(--border-color)">
                       <MapPin className={cn(
                         selectedNeed.urgency_score >= 8 ? "text-emergency" : "text-yellow"
                       )} size={32} />
                    </div>
                    <div>
                      <h2 className="text-4xl font-black text-(--foreground) font-anton uppercase tracking-tight flex items-center gap-3">
                        {selectedNeed.source === 'telegram' ? 'Signal Extraction' : 'Intake Incident'}
                        <span className="text-sage text-xl font-mono">#{selectedNeed.id.slice(0, 8)}</span>
                      </h2>
                      <p className="text-sage font-black uppercase text-[10px] tracking-[0.3em] mt-1">Tactical Intelligence Dossier • Sector: {selectedNeed.location_name || 'Global'}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setSelectedNeed(null)}
                    className="p-4 bg-(--foreground)/5 hover:bg-emergency hover:text-white rounded-2xl transition-all border border-(--border-color) group"
                  >
                    <X size={24} className="group-hover:scale-110 transition-transform" />
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 pb-10">
                  {/* Left Column: Intelligence Data & Chat */}
                  <div className="lg:col-span-7 space-y-8">
                    {/* Raw Message */}
                    <div className="p-10 bg-(--card-bg) rounded-4xl border border-(--border-color) relative overflow-hidden group">
                      <div className="absolute top-0 left-0 w-2 h-full bg-linear-to-b from-emergency to-orange-500"></div>
                      <h3 className="text-xs font-black text-sage uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                        <Activity size={16} className="text-emergency animate-pulse" /> Raw Transmission Feed
                      </h3>
                      <p className="text-(--foreground) text-3xl font-medium italic leading-relaxed font-outfit">
                        &ldquo;{selectedNeed.raw_text}&rdquo;
                      </p>
                    </div>

                    <div className="flex gap-6">
                      {/* Urgency Score with Definition */}
                      <div className="flex-1 p-8 bg-emergency/10 rounded-4xl border border-emergency/20 relative backdrop-blur-sm shadow-inner group">
                        <div className="absolute top-4 right-4 text-[7px] font-black text-emergency border border-emergency/30 px-1.5 py-0.5 rounded opacity-40 group-hover:opacity-100 transition-opacity">INTEL-01</div>
                        <span className="text-[10px] text-emergency font-black uppercase tracking-[0.2em] block mb-2">Urgency Score</span>
                        <div className="flex items-end gap-2 mb-4">
                          <span className="text-6xl font-black text-(--foreground) italic leading-none">{selectedNeed.urgency_score}</span>
                          <span className="text-xl font-bold text-emergency/40 pb-1">/10</span>
                        </div>
                        <div className="pl-3 border-l-2 border-emergency/30">
                           <p className="text-[9px] font-bold text-emergency uppercase leading-tight tracking-tighter opacity-80">
                             What this means: AI-calculated priority. Scores 8+ indicate active life-threat keywords detected.
                           </p>
                        </div>
                      </div>

                      {/* Impact Score with Definition */}
                      <div className="flex-1 p-8 bg-success/10 rounded-4xl border border-success/20 relative backdrop-blur-sm shadow-inner group">
                        <div className="absolute top-4 right-4 text-[7px] font-black text-success border border-success/30 px-1.5 py-0.5 rounded opacity-40 group-hover:opacity-100 transition-opacity">INTEL-02</div>
                        <span className="text-[10px] text-success font-black uppercase tracking-[0.2em] block mb-2">Impact Load</span>
                        <div className="flex items-end gap-2 mb-4">
                          <span className="text-5xl font-black text-(--foreground) italic leading-none">{selectedNeed.people_affected || 'N/A'}</span>
                        </div>
                        <div className="pl-3 border-l-2 border-success/30">
                           <p className="text-[9px] font-bold text-success uppercase leading-tight tracking-tighter opacity-80">
                             What this means: Estimated population (human or animal) requiring immediate extraction or medical aid.
                           </p>
                        </div>
                      </div>
                    </div>

                    {/* Chat Hub (Now on the Left Side) */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between px-4">
                            <h3 className="text-xs font-black text-sage uppercase tracking-[0.3em] flex items-center gap-2">
                                <Signal size={16} className="text-yellow animate-pulse" /> Live Comms Channel
                            </h3>
                            <span className="text-[8px] font-mono text-sage">SECURE END-TO-END LINK</span>
                        </div>
                        <div className="h-[380px] rounded-5xl overflow-hidden border border-(--border-color) shadow-2xl bg-(--background)">
                            <ChatPanel needId={selectedNeed.id} role="volunteer" />
                        </div>
                        <p className="text-[9px] font-black text-(--foreground) uppercase tracking-widest px-6 italic">
                           Instruction: Use this channel to verify GPS precision and status updates with the reporter.
                        </p>
                    </div>
                  </div>

                  {/* Right Column: Deployment Actions & AI Intel */}
                  <div className="lg:col-span-5 space-y-8 flex flex-col">
                    {/* Tactical Assessment */}
                    {selectedNeed.tactical_assessment && (
                      <div className="p-10 bg-linear-to-br from-yellow/10 to-transparent rounded-4xl border border-yellow/20 relative overflow-hidden group shadow-xl">
                        <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-30 transition-opacity">
                          <Bot size={60} />
                        </div>
                        <h3 className="text-xs font-black text-yellow uppercase tracking-[0.3em] mb-6 flex items-center gap-2">
                          <Bot size={16} /> AI Tactical Intelligence Analysis
                        </h3>
                        <p className="text-(--foreground) text-xl font-bold leading-relaxed mb-6 font-outfit">
                          {selectedNeed.tactical_assessment}
                        </p>
                        <div className="flex gap-3">
                           <div className="px-4 py-2 bg-(--foreground)/5 rounded-full text-[10px] font-black uppercase text-sage border border-(--border-color) tracking-widest">
                               Sentiment: <span className="text-yellow">{selectedNeed.sentiment || 'NEUTRAL'}</span>
                           </div>
                        </div>
                      </div>
                    )}

                    {/* Telemetry Info */}
                    <div className="p-10 bg-(--card-bg) rounded-4xl border border-(--border-color) shadow-inner">
                        <h3 className="text-[10px] font-black text-sage uppercase tracking-[0.3em] mb-8 border-b border-(--border-color) pb-4">Live Operational Telemetry</h3>
                        
                        <div className="space-y-6">
                          <div className="flex items-center gap-5">
                              <div className="w-5 h-5 rounded-full bg-emergency animate-pulse shadow-[0_0_20px_var(--color-emergency-glow)]"></div>
                              <span className="text-2xl font-black text-(--foreground) uppercase tracking-tighter italic">
                                  {selectedNeed.need_type} Response Protocol
                              </span>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 bg-(--foreground)/5 rounded-2xl border border-(--border-color)">
                               <span className="text-[8px] font-black text-sage uppercase tracking-widest block mb-1">Source Logic</span>
                               <div className="flex items-center gap-2 text-xs font-black text-(--foreground)">
                                  {selectedNeed.source === 'telegram' ? <Bot size={14} className="text-blue-400" /> : <Phone size={14} className="text-yellow"/>}
                                  <span className="truncate">{selectedNeed.source === 'telegram' ? 'Telegram' : 'Direct'}</span>
                               </div>
                            </div>
                            <div className="p-4 bg-(--foreground)/5 rounded-2xl border border-(--border-color)">
                               <span className="text-[8px] font-black text-sage uppercase tracking-widest block mb-1">GPS Lock</span>
                               <div className="flex items-center gap-2 text-xs font-mono font-bold text-(--foreground)">
                                  <MapPin size={14} className="text-yellow" />
                                  <span>{selectedNeed.lat?.toFixed(4)}, {selectedNeed.lng?.toFixed(4)}</span>
                               </div>
                            </div>
                          </div>
                        </div>
                    </div>

                    {/* Action Buttons with Definitions */}
                    <div className="flex flex-col gap-4 mt-auto">
                      <div className="flex items-center justify-between px-4">
                        <h4 className="text-[11px] text-(--foreground) font-black uppercase tracking-[0.3em]">Watch these buttons ↓</h4>
                        <span className="text-[9px] text-sage font-bold italic">Critical Protocol</span>
                      </div>
                      
                      <div className="space-y-4">
                        <div className="group relative">
                          <button 
                            onClick={() => handleDeploy(selectedNeed.id, 'in-progress')}
                            className="w-full py-6 bg-orange-500 hover:bg-orange-400 text-black font-black rounded-3xl hover:scale-[0.99] active:scale-95 transition-all shadow-[0_15px_40px_rgba(249,115,22,0.3)] flex items-center justify-center gap-3 text-sm uppercase tracking-[0.2em]"
                          >
                            <Truck size={20} /> INITIATE DISPATCH
                          </button>
                          <div className="mt-2 px-6 border-l-2 border-orange-500/40">
                             <p className="text-[9px] font-black text-orange-500/80 uppercase tracking-widest leading-tight">
                               Definition: En-route status. Locks your live GPS for the reporter to see your ETA.
                             </p>
                          </div>
                        </div>

                        <div className="group relative">
                          <button 
                            onClick={() => handleDeploy(selectedNeed.id, 'resolved')}
                            className="w-full py-6 bg-success hover:bg-green-400 text-black font-black rounded-3xl hover:scale-[0.99] active:scale-95 transition-all shadow-[0_15px_40px_rgba(0,230,118,0.3)] flex items-center justify-center gap-3 text-sm uppercase tracking-[0.2em]"
                          >
                            <CheckCircle2 size={20} /> MARK AS RESOLVED
                          </button>
                          <div className="mt-2 px-6 border-l-2 border-success/40">
                             <p className="text-[9px] font-black text-success/80 uppercase tracking-widest leading-tight">
                               Definition: Mission complete. Finalizes report and archives data to history.
                             </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Audio recording if exists */}
                    {selectedNeed.source === 'voice_agent' && selectedNeed.recording_url && (
                      <div className="bg-(--foreground)/5 p-6 rounded-4xl border border-(--border-color) space-y-4">
                        <div className="flex items-center gap-3">
                          <Activity size={16} className="text-emerald-400" />
                          <h4 className="text-[10px] font-black text-sage uppercase tracking-widest">Tactical Audio</h4>
                        </div>
                        <audio controls src={selectedNeed.recording_url} className="w-full h-10 filter invert opacity-80" />
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="h-3 w-full bg-linear-to-r from-emergency via-primary to-success"></div>
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
            className="fixed inset-0 z-200 bg-(--background) brutalist-grid flex flex-col items-center justify-center gap-10"
          >
            <div className="relative group">
                <div className="absolute inset-x-[-10px] inset-y-[10px] bg-yellow -rotate-3 scale-105 z-[-1] animate-pulse"></div>
                <div className="p-8 bg-(--background) border border-(--border-color) shadow-2xl relative z-10 glass">
                  <Activity className="text-yellow" size={80} />
                </div>
            </div>
            <div className="text-center relative z-10 mt-6">
                <h2 className="text-6xl md:text-8xl font-anton text-(--foreground) uppercase tracking-wide leading-none mb-6 drop-shadow-sm">COMMUNITYPULSE</h2>
                <div className="flex flex-col items-center gap-4">
                    <p className="text-(--foreground) font-black uppercase tracking-[0.3em] text-[12px] font-roboto">Optimizing Ground Logic...</p>
                    <div className="w-64 h-1.5 bg-(--foreground)/10 overflow-hidden border border-(--border-color)">
                        <motion.div 
                            className="h-full bg-yellow"
                            initial={{ width: 0 }}
                            animate={{ width: '100%' }}
                            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
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




