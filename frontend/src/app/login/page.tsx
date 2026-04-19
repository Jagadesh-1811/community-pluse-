'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Lock, Terminal, Activity, ArrowRight, ShieldAlert, Signal, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

type AuthMode = 'signin' | 'signup';
type UserRole = 'REPORTER' | 'VOLUNTEER';

export default function LoginPage() {
    const router = useRouter();
    const [mode, setMode] = useState<AuthMode>('signin');
    const [role, setRole] = useState<UserRole>('REPORTER');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [diagText, setDiagText] = useState<string[]>([]);

    useEffect(() => {
        const diags = [
            "Initializing satellite handshake...",
            "Encrypting tunnel protocol...",
            "Validating node 78-4B-36...",
            "Securing field telemetry...",
            "Waiting for credentials..."
        ];
        let i = 0;
        const interval = setInterval(() => {
            if (i < diags.length) {
                setDiagText(prev => [...prev.slice(-4), diags[i]]);
                i++;
            }
        }, 800);
        return () => clearInterval(interval);
    }, []);

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            if (mode === 'signup') {
                const { error: signUpError } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        data: { role }
                    }
                });
                if (signUpError) throw signUpError;
                setDiagText(prev => [...prev.slice(-4), "SUCCESS: Account created. Verify email."]);
                setMode('signin');
            } else {
                const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
                if (signInError) throw signInError;
                
                setDiagText(prev => [...prev.slice(-4), "AUTHENTICATED: Establishing session..."]);
                // Redirect based on role (fetch metadata)
                const { data: { user } } = await supabase.auth.getUser();
                const userRole = user?.user_metadata?.role || 'REPORTER';
                
                router.push(userRole === 'VOLUNTEER' ? '/volunteer' : '/field');
            }
        } catch (err: any) {
            setError(err.message);
            setDiagText(prev => [...prev.slice(-4), `ERROR: ${err.message}`]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 font-inter relative overflow-hidden">
            {/* BACKGROUND MATRIX EFFECT */}
            <div className="absolute inset-0 z-0 opacity-20 pointer-events-none overflow-hidden">
                <div className="absolute top-0 left-1/4 w-px h-full bg-gradient-to-b from-transparent via-primary/50 to-transparent animate-pulse delay-75"></div>
                <div className="absolute top-0 left-2/4 w-px h-full bg-gradient-to-b from-transparent via-primary/50 to-transparent animate-pulse delay-500"></div>
                <div className="absolute top-0 left-3/4 w-px h-full bg-gradient-to-b from-transparent via-primary/50 to-transparent animate-pulse delay-1000"></div>
                <div className="absolute top-1/2 left-0 w-full h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent"></div>
            </div>

            <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-lg z-10"
            >
                {/* BRAND HEADER */}
                <div className="text-center mb-10">
                    <div className="w-16 h-16 bg-white/5 rounded-2xl mx-auto mb-6 flex items-center justify-center border border-white/10 shadow-[0_0_30px_rgba(255,255,255,0.05)]">
                        <Activity className="text-primary" size={32} />
                    </div>
                    <h1 className="text-4xl font-black text-white font-outfit uppercase tracking-tighter mb-2">
                        Technical<span className="text-primary">Gateway</span>
                    </h1>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.3em]">CommunityPulse Authentication</p>
                </div>

                {/* LOGIN CARD */}
                <div className="glass-dark border border-white/10 rounded-[2.5rem] p-10 relative overflow-hidden shadow-2xl">
                    {/* Diagnostic Sidebar (The 'Encrypted' feel) */}
                    <div className="absolute top-0 right-0 w-32 h-full bg-white/[0.02] border-l border-white/5 p-4 flex flex-col gap-3 font-mono text-[7px] text-slate-600 uppercase pointer-events-none">
                        <Terminal size={12} className="text-slate-700 opacity-50 mb-2" />
                        {diagText.map((text, idx) => (
                            <motion.div 
                                key={idx}
                                initial={{ opacity: 0, x: 5 }}
                                animate={{ opacity: 1, x: 0 }}
                                className={cn(
                                    "transition-colors",
                                    text?.startsWith('ERROR') ? 'text-emergency' : 
                                    (text?.startsWith('SUCCESS') || text?.startsWith('AUTH')) ? 'text-success' : ''
                                )}
                            >
                                [{new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}] {text || '...'}
                            </motion.div>
                        ))}
                    </div>

                    <div className="max-w-[calc(100%-120px)]">
                        {/* Role Switcher */}
                        <div className="flex bg-slate-900/50 p-1.5 rounded-[1.25rem] border border-white/5 mb-8">
                            <button 
                                onClick={() => setRole('REPORTER')}
                                className={cn(
                                    "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[0.9rem] text-[9px] font-black uppercase tracking-widest transition-all",
                                    role === 'REPORTER' ? "bg-white/10 text-white shadow-lg" : "text-slate-500 hover:text-slate-400"
                                )}
                            >
                                <Signal size={12} /> REPORTER
                            </button>
                            <button 
                                onClick={() => setRole('VOLUNTEER')}
                                className={cn(
                                    "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[0.9rem] text-[9px] font-black uppercase tracking-widest transition-all",
                                    role === 'VOLUNTEER' ? "bg-white/10 text-white shadow-lg" : "text-slate-500 hover:text-slate-400"
                                )}
                            >
                                <ShieldAlert size={12} /> VOLUNTEER
                            </button>
                        </div>

                        <form onSubmit={handleAuth} className="space-y-6">
                            <div>
                                <label className="block text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-2.5 ml-1">Personnel ID (Email)</label>
                                <div className="relative">
                                    <input 
                                        type="email" 
                                        required
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 transition-all placeholder:text-slate-700 font-medium"
                                        placeholder="id_alpha@emergency.net"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-2.5 ml-1">Access Token (Password)</label>
                                <div className="relative">
                                    <input 
                                        type="password" 
                                        required
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 transition-all placeholder:text-slate-700 font-medium font-mono"
                                        placeholder="••••••••••••"
                                    />
                                    <Lock size={14} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-700" />
                                </div>
                            </div>

                            <button 
                                type="submit"
                                disabled={loading}
                                className="w-full bg-primary hover:bg-primary-dark text-white font-black uppercase tracking-[0.2em] text-xs py-5 rounded-2xl shadow-xl shadow-primary/20 transition-all active:scale-95 flex items-center justify-center gap-3"
                            >
                                {loading ? <Loader2 className="animate-spin" size={20} /> : (
                                    <>
                                        {mode === 'signin' ? 'Verify Identity' : 'Commission Account'}
                                        <ArrowRight size={16} />
                                    </>
                                )}
                            </button>
                        </form>

                        <div className="mt-8 text-center">
                            <button 
                                onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
                                className="text-[10px] text-slate-500 font-bold uppercase tracking-wider hover:text-white transition-colors"
                            >
                                {mode === 'signin' ? "Don't have clearance? Request Access" : "Already commissioned? Log In"}
                            </button>
                        </div>
                    </div>
                </div>

                <div className="mt-10 flex items-center justify-center gap-8 opacity-30">
                    <div className="flex items-center gap-2">
                        <Shield size={12} className="text-slate-500" />
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-600">Secure Node</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-success"></div>
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-600">SSL Active</span>
                    </div>
                </div>
            </motion.div>
        </main>
    );
}
