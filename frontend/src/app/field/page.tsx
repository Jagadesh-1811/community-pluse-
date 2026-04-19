'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import IntakeForm from '@/components/intake/IntakeForm';
import StatusTracker from '@/components/status/StatusTracker';
import ChatPanel from '@/components/chat/ChatPanel';
import { Shield, ArrowLeft, LogOut, Lock, Terminal, ArrowRight, Signal, Loader2, Activity } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

const FieldMap = dynamic(() => import('@/components/map/FieldMap'), { ssr: false });

export default function FieldIntakePage() {
  const { user, role, loading: authLoading, signOut } = useAuth();
  const router = useRouter();

  const [localCoords, setLocalCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [submittedNeedId, setSubmittedNeedId] = useState<string | null>(null);
  const [volunteerCoords, setVolunteerCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Auth Gateway State
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail ] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [diagText, setDiagText] = useState<string[]>([]);

  useEffect(() => {
    const diags = [
        "Scanning frequencies...",
        "Establishing field uplink...",
        "Cryptographic handshake...",
        "Broadcast link ready."
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
    setIsProcessing(true);
    setError(null);
    try {
        if (authMode === 'signup') {
            if (password !== confirmPassword) throw new Error("Passwords do not match");
            const { error: signUpError } = await supabase.auth.signUp({
                email,
                password,
                options: { data: { role: 'REPORTER' } }
            });
            if (signUpError) throw signUpError;
            setDiagText(prev => [...prev.slice(-3), "SIGNAL ESTABLISHED: Verify email."]);
            setAuthMode('signin');
        } else {
            const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
            if (signInError) throw signInError;
            setDiagText(prev => [...prev.slice(-3), "CONNECTED: Channel open..."]);
        }
    } catch (err: any) {
        setError(err.message);
        setDiagText(prev => [...prev.slice(-3), `SIGNAL LOST: ${err.message}`]);
    } finally {
        setIsProcessing(false);
    }
  };

  if (authLoading) {
    return (
        <div className="fixed inset-0 z-[200] bg-slate-950 flex flex-col items-center justify-center gap-10">
            <div className="p-10 bg-success rounded-[3.5rem] shadow-[0_40px_80px_rgba(0,230,118,0.2)] animate-pulse border border-white/10 text-slate-900">
                <Activity size={80} />
            </div>
        </div>
    );
  }

  // IF NOT AUTHENTICATED -> SHOW FIELD GATEWAY
  if (!user || (role !== 'REPORTER' && role !== 'VOLUNTEER')) {
    return (
        <main className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 font-inter relative overflow-hidden">
            <div className="absolute inset-0 z-0 opacity-10 pointer-events-none">
                <div className="absolute top-1/2 left-0 w-full h-px bg-gradient-to-r from-transparent via-success to-transparent animate-pulse"></div>
            </div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm z-10">
                <div className="text-center mb-10">
                    <div className="w-20 h-20 bg-success/10 rounded-3xl mx-auto mb-6 flex items-center justify-center border border-success/20 shadow-[0_0_40px_rgba(0,230,118,0.1)] text-success">
                        <Signal size={40} />
                    </div>
                    <h1 className="text-3xl font-black text-white font-outfit uppercase tracking-tighter mb-1">Field<span className="text-success">Ops</span></h1>
                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.3em]">Direct Reporting Protocol</p>
                </div>

                <div className="glass-dark border border-white/10 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-full bg-white/[0.02] border-l border-white/5 p-3 flex flex-col gap-2 font-mono text-[6px] text-slate-600 uppercase pointer-events-none">
                        <Terminal size={10} className="opacity-30 mb-2" />
                        {diagText.map((t, idx) => (
                            <div key={idx} className={cn(t?.includes('SIGNAL LOST') ? 'text-emergency' : t?.includes('SIGNAL ESTABLISHED') ? 'text-success' : '')}>
                                :: {t || ''}
                            </div>
                        ))}
                    </div>

                    <div className="max-w-[calc(100%-80px)]">
                        <form onSubmit={handleAuth} className="space-y-5">
                            <div>
                                <label className="block text-[9px] text-slate-500 font-black uppercase tracking-widest mb-2 ml-1">Personnel ID</label>
                                <input 
                                    type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-white text-xs focus:ring-2 focus:ring-success/40 outline-none transition-all placeholder:text-slate-700"
                                    placeholder="id_operative@local.net"
                                />
                            </div>
                            <div>
                                <label className="block text-[9px] text-slate-500 font-black uppercase tracking-widest mb-2 ml-1">Access Pass</label>
                                <div className="relative">
                                    <input 
                                        type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-white text-xs focus:ring-2 focus:ring-success/40 outline-none transition-all placeholder:text-slate-700"
                                        placeholder="••••••••"
                                    />
                                    <Lock size={12} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-700" />
                                </div>
                            </div>

                            {authMode === 'signup' && (
                                <div>
                                    <label className="block text-[9px] text-slate-500 font-black uppercase tracking-widest mb-2 ml-1">Confirm identity</label>
                                    <input 
                                        type="password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-white text-xs focus:ring-2 focus:ring-success/40 outline-none transition-all placeholder:text-slate-700"
                                        placeholder="••••••••"
                                    />
                                </div>
                            )}

                            {error && <p className="text-[10px] text-emergency font-bold uppercase tracking-widest bg-emergency/10 p-2 rounded-lg border border-emergency/20">{error}</p>}

                            <button 
                                type="submit" disabled={isProcessing}
                                className="w-full bg-success hover:bg-success/90 text-slate-950 font-black uppercase tracking-[0.2em] text-[10px] py-4 rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-2"
                            >
                                {isProcessing ? <Loader2 className="animate-spin" size={16} /> : (
                                    <>
                                        {authMode === 'signin' ? 'Initiate Link' : 'Register Signal'}
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
                                {authMode === 'signin' ? "No ID? Register Signal" : "Have ID? Initiate Link"}
                            </button>
                        </div>
                    </div>
                </div>
            </motion.div>
        </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--background)] flex flex-col md:flex-row overflow-hidden font-roboto -mt-20 pt-20">
      {/* 
        Left Panel: Intake Form + Post-Submission Status Hub
      */}
      <div className="w-full md:w-[450px] flex-shrink-0 z-10 glass border-r border-[var(--border-color)] shadow-2xl relative overflow-y-auto">
        {!submittedNeedId ? (
          <IntakeForm 
            localCoords={localCoords}
            setLocalCoords={setLocalCoords}
            onRefresh={(needId?: string) => {
              if (needId) {
                setSubmittedNeedId(needId);
              } else {
                setLocalCoords(null);
              }
            }}
          />
        ) : (
          /* Post-Submission: Status Tracker + Chat + Volunteer Info */
          <div className="flex flex-col h-full p-8 gap-6">
            {/* Header */}
            <div className="flex items-center gap-4 mb-2">
                <button 
                    onClick={() => { setSubmittedNeedId(null); setLocalCoords(null); }}
                    className="p-3 bg-[var(--foreground)]/5 hover:bg-[var(--foreground)]/10 rounded-2xl transition-all text-[var(--foreground)]/60 hover:text-[var(--foreground)]"
                >
                    <ArrowLeft size={20} />
                </button>
                <div className="flex items-center gap-3 flex-1">
                    <div className="p-2.5 bg-yellow rounded-xl border border-black/10 shadow-lg">
                        <Shield className="text-black" size={20} />
                    </div>
                    <div>
                        <h3 className="text-2xl font-anton text-[var(--foreground)] uppercase tracking-wide">Mission Control</h3>
                        <p className="text-[10px] text-[var(--foreground)]/60 font-bold uppercase tracking-widest">Report #{submittedNeedId.slice(0, 8)}</p>
                    </div>
                </div>

                <button 
                    onClick={() => signOut()}
                    className="p-3 bg-white/5 hover:bg-emergency/10 rounded-2xl transition-all text-slate-500 hover:text-emergency"
                    title="Terminate Session"
                >
                    <LogOut size={18} />
                </button>
            </div>

            {/* Status Tracker */}
            <StatusTracker 
              needId={submittedNeedId} 
              onVolunteerLocationUpdate={setVolunteerCoords}
            />

            {/* Chat Panel */}
            <div className="flex-1 min-h-[300px]">
                <ChatPanel needId={submittedNeedId} role="user" />
            </div>
          </div>
        )}
      </div>

      {/* 
        Right Panel: GPS Map
      */}
      <div className="flex-1 relative bg-[var(--background)] hidden md:block brutalist-grid">
        <div className="absolute inset-0 z-0 opacity-50 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-yellow/10 via-transparent to-[var(--background)]"></div>
        <div className="absolute inset-6 z-10 glass !p-0 rounded-[2rem] overflow-hidden">
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
