'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { motion } from 'framer-motion';
import { Terminal, Shield, ArrowRight, Loader2, Signal, ShieldAlert, FingerprintIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

export type AuthMode = 'signin' | 'signup';
type UserRole = 'REPORTER' | 'VOLUNTEER';

interface AuthFormProps {
    initialMode?: AuthMode;
}

export default function AuthForm({ initialMode = 'signin' }: AuthFormProps) {
    const router = useRouter();
    const [mode, setMode] = useState<AuthMode>(initialMode);
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
                    options: { data: { role } }
                });
                if (signUpError) throw signUpError;
                setDiagText(prev => [...prev.slice(-4), "SUCCESS: Account created. Verify email."]);
                setMode('signin');
            } else {
                const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
                if (signInError) throw signInError;
                setDiagText(prev => [...prev.slice(-4), "AUTHENTICATED: Establishing session..."]);
                const { data: { user } } = await supabase.auth.getUser();
                const userRole = user?.user_metadata?.role || 'REPORTER';
                router.push(userRole === 'VOLUNTEER' ? '/volunteer' : '/field');
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'An error occurred';
            setError(message);
            setDiagText(prev => [...prev.slice(-4), `ERROR: ${message}`]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="w-full max-w-5xl mx-auto flex flex-col lg:flex-row gap-12 items-start z-10">
            {/* LEFT: Brand + Terminal */}
            <div className="lg:w-1/2 flex flex-col justify-center pt-4">
                <div className="mb-10 text-left">
                    <div className="w-20 h-20 bg-[#171e19] rounded-xl mb-8 flex items-center justify-center brutalist-border shadow-2xl transform -rotate-3">
                        <FingerprintIcon className="text-[#ffe17c]" size={40} />
                    </div>
                    <h1 className="text-6xl md:text-8xl font-anton uppercase tracking-normal leading-[0.9] mb-4 text-[var(--foreground)]">
                        Secure<br/>
                        <span className="text-[#ffe17c]">Gateway</span>
                    </h1>
                    <p className="text-sm text-[var(--foreground)] opacity-50 font-outfit font-bold uppercase tracking-[0.2em] mt-6">CommunityPulse Authentication</p>
                </div>

                {/* Encrypted Terminal Console */}
                <div className="w-full bg-[#171e19] border border-white/10 rounded-xl p-6 font-mono text-[10px] text-white/50 uppercase brutalist-border shadow-2xl">
                    <div className="flex items-center gap-3 mb-4 border-b border-white/10 pb-4">
                        <Terminal size={16} className="text-[#ffe17c]" />
                        <span className="text-[#ffe17c] tracking-widest font-bold text-xs">Encrypted Terminal [PULSE_OS]</span>
                    </div>
                    <div className="space-y-3">
                        {diagText.map((text, idx) => (
                            <motion.div
                                key={idx}
                                initial={{ opacity: 0, x: -5 }}
                                animate={{ opacity: 1, x: 0 }}
                                className={cn(
                                    "transition-colors flex gap-3 text-[11px]",
                                    text?.startsWith('ERROR') ? 'text-red-500' :
                                    (text?.startsWith('SUCCESS') || text?.startsWith('AUTH')) ? 'text-green-400' : ''
                                )}
                            >
                                <span className="opacity-50">[{new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}]</span>
                                <span>{text || '...'}</span>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </div>

            {/* RIGHT: Auth Card */}
            <div className="lg:w-1/2 w-full bg-[var(--background)] border border-[var(--border-color)] rounded-2xl p-8 lg:p-12 shadow-2xl brutalist-border">

                {/* Mode Heading */}
                <h2 className="text-4xl font-anton uppercase text-[var(--foreground)] mb-8 tracking-wide">
                    {mode === 'signin' ? 'Log In' : 'Create Account'}
                </h2>

                {/* Role Switcher */}
                <div className="flex bg-black/5 dark:bg-white/5 p-1.5 rounded-xl border border-black/5 dark:border-white/5 mb-8">
                    <button
                        onClick={() => setRole('REPORTER')}
                        type="button"
                        className={cn(
                            "flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-anton uppercase tracking-widest transition-all",
                            role === 'REPORTER'
                                ? "bg-[var(--foreground)] text-[var(--background)] shadow-md"
                                : "text-[var(--foreground)] opacity-40 hover:opacity-80"
                        )}
                    >
                        <Signal size={16} /> Reporter
                    </button>
                    <button
                        onClick={() => setRole('VOLUNTEER')}
                        type="button"
                        className={cn(
                            "flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-anton uppercase tracking-widest transition-all",
                            role === 'VOLUNTEER'
                                ? "bg-[var(--foreground)] text-[var(--background)] shadow-md"
                                : "text-[var(--foreground)] opacity-40 hover:opacity-80"
                        )}
                    >
                        <ShieldAlert size={16} /> Volunteer
                    </button>
                </div>

                <form onSubmit={handleAuth} className="space-y-6">
                    <div>
                        <label className="block text-xs text-[var(--foreground)] font-bold uppercase tracking-widest mb-2.5 font-outfit opacity-60">
                            Personnel ID (Email)
                        </label>
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-[var(--background)] border border-[var(--border-color)] rounded-xl px-5 py-4 text-[var(--foreground)] text-lg focus:outline-none focus:border-[var(--foreground)] transition-all placeholder:opacity-30 font-outfit font-medium"
                            placeholder={`id_${role.toLowerCase()}@emergency.net`}
                        />
                    </div>

                    <div>
                        <label className="block text-xs text-[var(--foreground)] font-bold uppercase tracking-widest mb-2.5 font-outfit opacity-60">
                            Access Token (Password)
                        </label>
                        <input
                            type="password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-[var(--background)] border border-[var(--border-color)] rounded-xl px-5 py-4 text-[var(--foreground)] text-lg focus:outline-none focus:border-[var(--foreground)] transition-all placeholder:opacity-30 font-outfit font-medium tracking-widest"
                            placeholder="••••••••••••"
                        />
                    </div>

                    {error && (
                        <div className="text-red-500 font-bold text-sm text-center bg-red-500/10 py-3 rounded-lg border border-red-500/20 font-outfit">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-[#ffe17c] text-[#171e19] font-anton uppercase tracking-widest text-2xl py-6 rounded-xl shadow-lg hover:-translate-y-1 active:translate-y-1 transition-all flex items-center justify-center gap-3 mt-4"
                    >
                        {loading ? <Loader2 className="animate-spin" size={24} /> : (
                            <>
                                {mode === 'signin' ? 'Verify Identity' : 'Commission Account'}
                                <ArrowRight size={24} strokeWidth={3} />
                            </>
                        )}
                    </button>
                </form>

                <div className="mt-8 text-center border-t border-[var(--border-color)] pt-8">
                    <button
                        type="button"
                        onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
                        className="text-sm text-[var(--foreground)] opacity-50 font-bold uppercase tracking-wider hover:opacity-100 transition-opacity font-outfit"
                    >
                        {mode === 'signin' ? "No clearance? Request Access →" : "Already commissioned? Log In →"}
                    </button>
                </div>

                {/* Trust Badges */}
                <div className="mt-8 flex items-center justify-center gap-8 opacity-30">
                    <div className="flex items-center gap-2">
                        <Shield size={12} className="text-[var(--foreground)]" />
                        <span className="text-[9px] font-black uppercase tracking-widest text-[var(--foreground)] font-outfit">Secure Node</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                        <span className="text-[9px] font-black uppercase tracking-widest text-[var(--foreground)] font-outfit">SSL Active</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
