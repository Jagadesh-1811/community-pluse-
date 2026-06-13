'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { ArrowLeft, Shield, LogOut, Sparkles, LayoutDashboard } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import IntakeForm from '@/components/intake/IntakeForm';
import StatusTracker from '@/components/status/StatusTracker';
import ChatPanel from '@/components/chat/ChatPanel';
import { useRouter } from 'next/navigation';
import { useRealtimeNeeds, Need } from '@/hooks/useRealtimeNeeds';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';






const FieldMap = dynamic(() => import('@/components/map/FieldMap'), { ssr: false });

export default function FieldIntakePage() {
  const { user, role, loading: authLoading, signOut } = useAuth();
  const router = useRouter();

  // AUTH PROTECTION
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    } else if (!authLoading && user && role === 'VOLUNTEER') {
      router.push('/volunteer');
    }
  }, [user, role, authLoading, router]);





  const [localCoords, setLocalCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [submittedNeedId, setSubmittedNeedId] = useState<string | null>(null);
  const [volunteerCoords, setVolunteerCoords] = useState<{ lat: number; lng: number } | null>(null);
  /** AI-generated heading for the post-submission response screen */
  const [aiReportHeading, setAiReportHeading] = useState<string | null>(null);

  const { needs } = useRealtimeNeeds();
  const [showDashboard, setShowDashboard] = useState(false);

  // Filter needs submitted by the current reporter
  const userNeeds = needs.filter(need => need.reporter_email === user?.email);
  const selectedNeed = needs.find(need => need.id === submittedNeedId);

  // Listen for hash changes to trigger opening the My Reports dashboard drawer
  useEffect(() => {
    const handleHash = () => {
      if (window.location.hash === '#reports') {
        setShowDashboard(true);
      }
    };
    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  useEffect(() => {
    if (!showDashboard && window.location.hash === '#reports') {
      window.location.hash = '';
    }
  }, [showDashboard]);

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

  if (authLoading || !user || role !== 'REPORTER') {
    return (
        <div className="fixed inset-0 z-200 bg-(--background) brutalist-grid flex flex-col items-center justify-center gap-10">
            <div className="relative animate-pulse">
                <div className="absolute inset-x-[-10px] inset-y-[10px] bg-yellow -rotate-3 scale-105 z-[-1]"></div>
                <div className="p-8 bg-(--background) border border-(--border-color) shadow-2xl relative z-10 glass">
                  <Shield className="text-yellow" size={80} />
                </div>
            </div>
            <p className="text-sm font-black uppercase tracking-[0.3em] text-(--foreground) font-roboto">Verifying Permissions...</p>
        </div>
    );
  }


  return (
    <main className="h-[calc(100vh-5rem)] w-full bg-(--background) flex flex-col md:flex-row overflow-hidden font-roboto relative">
      {/* Floating HUD Controls in Top-Right */}
      <div className="absolute top-24 right-10 z-40 hidden md:flex items-center gap-3">
      </div>

      {/* Mobile Floating HUD Button */}
      <div className="fixed bottom-6 right-6 z-40 md:hidden flex flex-col gap-2">
        <button
          onClick={() => setShowDashboard(true)}
          className="p-4 bg-yellow text-charcoal rounded-full shadow-2xl border border-black/10 flex items-center justify-center cursor-pointer"
        >
          <LayoutDashboard size={20} />
        </button>
      </div>

      {/* Sliding My Reports Drawer/Panel */}
      <AnimatePresence>
        {showDashboard && (
          <>
            {/* Backdrop click to close */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDashboard(false)}
              className="fixed inset-0 bg-black z-45"
            />
            
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 w-full md:w-[450px] bg-(--background) z-110 shadow-2xl border-r border-(--border-color) flex flex-col p-8 lg:p-10 pt-8"
            >
              {/* Header */}
              <div className="flex items-center gap-4 mb-8 border-b border-(--border-color) pb-6">
                <button 
                  onClick={() => setShowDashboard(false)}
                  className="p-3 bg-(--foreground)/5 hover:bg-(--foreground)/10 rounded-2xl transition-all text-(--foreground) cursor-pointer"
                >
                  <ArrowLeft size={20} />
                </button>
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-yellow rounded-xl border border-black/10 shadow-lg">
                    <LayoutDashboard className="text-black" size={20} />
                  </div>
                  <h3 className="text-2xl font-anton text-(--foreground) uppercase tracking-wide">
                    My Reports Log
                  </h3>
                </div>
              </div>

              {/* List of User's Needs */}
              <div className="flex-1 overflow-y-auto no-scrollbar space-y-4 pr-1">
                {userNeeds.length === 0 ? (
                  <div className="text-center py-12 px-6 bg-(--foreground)/5 rounded-3xl border border-(--border-color) italic text-sm text-sage">
                    You have not broadcasted any reports from this terminal yet.
                  </div>
                ) : (
                  userNeeds.map((need) => (
                    <button
                      key={need.id}
                      onClick={() => {
                        setSubmittedNeedId(need.id);
                        setAiReportHeading(need.ai_heading || null);
                        setLocalCoords({ lat: need.lat || 0, lng: need.lng || 0 });
                        setShowDashboard(false);
                      }}
                      className={cn(
                        "w-full p-5 rounded-3xl border transition-all cursor-pointer hover:bg-(--foreground)/5 flex flex-col gap-3 text-left",
                        submittedNeedId === need.id
                          ? "bg-yellow/10 border-yellow/45"
                          : "bg-black/20 border-(--border-color)"
                      )}
                    >
                      <div className="flex justify-between items-center">
                        <span className={cn(
                          "px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider",
                          need.status === "resolved"
                            ? "bg-success/20 text-success border border-success/30"
                            : need.status === "in-progress"
                            ? "bg-orange-500/20 text-orange-400 border border-orange-500/30"
                            : "bg-yellow/20 text-yellow border border-yellow/30"
                        )}>
                          {need.status || "open"}
                        </span>
                        <span className="text-[9px] font-mono text-sage opacity-75">
                          #{need.id.slice(0, 8)}
                        </span>
                      </div>

                      <h4 className="text-sm font-black text-(--foreground) leading-tight uppercase">
                        {need.ai_heading || "Field Incident Report"}
                      </h4>
                      
                      <p className="text-xs text-sage italic line-clamp-2">
                        &ldquo;{need.raw_text}&rdquo;
                      </p>

                      <div className="flex justify-between items-center border-t border-(--border-color)/50 pt-3 text-[9px] font-bold text-sage/60 uppercase tracking-widest">
                        <span>Urgency: {need.urgency_score}/10</span>
                        <span>{formatDate(need.created_at)}</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 
        Left Panel: Intake Form + Post-Submission Status Hub
      */}
      <div className="w-full md:w-[450px] h-full shrink-0 z-10 glass border-r border-(--border-color) shadow-2xl relative overflow-y-auto">
        {!submittedNeedId ? (
          <IntakeForm 
            localCoords={localCoords}
            setLocalCoords={setLocalCoords}
            onRefresh={(needId?: string, aiHeading?: string) => {
              if (needId) {
                setSubmittedNeedId(needId);
                setAiReportHeading(aiHeading ?? null); // null triggers shimmer until AI resolves
              } else {
                setLocalCoords(null);
              }
            }}
          />
        ) : (
          /* Post-Submission: Status Tracker + Chat + Volunteer Info */
          <div className="flex flex-col p-8 gap-6">
            {/* Header */}
            <div className="flex items-center gap-4 mb-2">
                <button 
                    onClick={() => { setSubmittedNeedId(null); setLocalCoords(null); setAiReportHeading(null); }}
                    className="p-3 bg-(--foreground)/5 hover:bg-(--foreground)/10 rounded-2xl transition-all text-(--foreground) cursor-pointer"
                >
                    <ArrowLeft size={20} />
                </button>
                <div className="flex items-center gap-3 flex-1">
                    <div className="p-2.5 bg-yellow rounded-xl border border-black/10 shadow-lg">
                        <Shield className="text-black" size={20} />
                    </div>
                    <div>
                        {/* AI-generated heading — shimmers while loading */}
                        {aiReportHeading ? (
                          <div className="flex items-center gap-2">
                            <Sparkles size={14} className="text-yellow shrink-0" />
                            <h3 className="text-xl font-anton text-(--foreground) uppercase tracking-wide leading-tight">
                              {aiReportHeading}
                            </h3>
                          </div>
                        ) : (
                          /* Shimmer placeholder while Gemini generates the heading */
                          <div className="flex items-center gap-2">
                            <Sparkles size={14} className="text-yellow/40 shrink-0 animate-pulse" />
                            <div className="h-5 w-36 rounded-lg bg-(--foreground)/10 animate-pulse" />
                          </div>
                        )}
                        <p className="text-[10px] text-(--foreground) font-bold uppercase tracking-widest mt-1">
                          Report #{submittedNeedId.slice(0, 8)}
                        </p>
                    </div>
                </div>

                <button 
                    onClick={() => signOut()}
                    className="p-3 bg-white/5 hover:bg-emergency/10 rounded-2xl transition-all text-sage hover:text-emergency cursor-pointer md:hidden"
                    title="Terminate Session"
                >
                    <LogOut size={18} />
                </button>
            </div>

            {/* Incident Request Card */}
            {selectedNeed && (
              <div className="w-full bg-(--foreground)/5 border border-(--border-color) rounded-[2rem] p-6 flex flex-col gap-4 shadow-md">
                <div className="flex justify-between items-center border-b border-(--border-color)/30 pb-3">
                  <span className="px-3 py-1 bg-yellow/15 text-yellow rounded-full text-[10px] font-black uppercase tracking-wider border border-yellow/20">
                    {selectedNeed.need_type || 'General'}
                  </span>
                  <span className="text-[10px] font-mono text-sage opacity-75">
                    #{selectedNeed.id.slice(0, 8)}
                  </span>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-[9px] font-bold text-sage uppercase tracking-widest opacity-60">
                    REPORTED DESCRIPTION
                  </span>
                  <p className="text-sm font-semibold text-(--foreground) leading-relaxed">
                    &ldquo;{selectedNeed.raw_text}&rdquo;
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4 border-t border-(--border-color)/30 pt-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] font-bold text-sage uppercase tracking-widest opacity-60">Location</span>
                    <span className="text-xs font-bold text-(--foreground) truncate" title={selectedNeed.location_name}>
                      {selectedNeed.location_name || 'Telemetry Coordinates'}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] font-bold text-sage uppercase tracking-widest opacity-60">Urgency</span>
                    <span className="text-xs font-black text-red-500 uppercase">
                      Level {selectedNeed.urgency_score || 5}/10
                    </span>
                  </div>
                </div>

                {selectedNeed.people_affected && (
                  <div className="text-[10px] font-bold text-sage uppercase tracking-widest">
                    People Affected: <span className="text-(--foreground) font-black">{selectedNeed.people_affected}</span>
                  </div>
                )}
                
                {selectedNeed.phone && (
                  <div className="text-[10px] font-bold text-sage uppercase tracking-widest">
                    Emergency Contact: <span className="text-(--foreground) font-black">{selectedNeed.phone}</span>
                  </div>
                )}

                <div className="flex justify-between items-center border-t border-(--border-color)/30 pt-3 text-[10px] font-bold text-sage uppercase tracking-widest">
                  <span>Dispatch Action:</span>
                  <span className={cn(
                    "font-black",
                    selectedNeed.status === 'resolved' ? "text-emerald-400" :
                    selectedNeed.status === 'in-progress' ? "text-orange-400 animate-pulse" :
                    "text-yellow"
                  )}>
                    {selectedNeed.status === 'resolved' ? 'Resolved ✓' :
                     selectedNeed.status === 'in-progress' ? 'Volunteer Dispatched' :
                     'Awaiting Dispatch'}
                  </span>
                </div>
              </div>
            )}

            {/* Status Tracker */}
            <StatusTracker 
              needId={submittedNeedId} 
              onVolunteerLocationUpdate={setVolunteerCoords}
            />

            {/* Chat Panel */}
            <div className="flex-1 min-h-[300px]">
                <ChatPanel needId={submittedNeedId} role="reporter" />
            </div>
          </div>
        )}
      </div>

      {/* 
        Right Panel: GPS Map
      */}
      <div className="flex-1 relative bg-(--background) hidden md:block brutalist-grid h-full">
        <div className="absolute inset-0 z-0 opacity-50 bg-[radial-gradient(ellipse_at_center,var(--tw-gradient-stops))] from-yellow/10 via-transparent to-(--background)"></div>
        <div className="absolute inset-6 z-10 glass rounded-4xl overflow-hidden">
            <FieldMap location={localCoords} volunteerLocation={volunteerCoords} />
        </div>
      </div>

      {/* Mobile Map Preview */}
      {localCoords && (
        <div className="fixed inset-x-4 top-4 h-48 z-0 md:hidden rounded-3xl overflow-hidden shadow-2xl">
           <FieldMap location={localCoords} volunteerLocation={volunteerCoords} />
        </div>
      )}
    </main>
  );
}

