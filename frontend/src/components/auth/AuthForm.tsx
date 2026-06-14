'use client';
import Link from 'next/link';

import { useState } from 'react';
import { auth, rtdb } from '@/lib/firebase';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  sendEmailVerification,
} from 'firebase/auth';
import { ref, set, get } from 'firebase/database';
import { Shield, ArrowRight, Loader2, FingerprintIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

export type AuthMode = 'signin' | 'signup';

interface AuthFormProps {
  initialMode?: AuthMode;
}

export default function AuthForm({ initialMode = 'signin' }: AuthFormProps) {
  const router = useRouter();
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || 'http://localhost:8000';
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const role: string = 'REPORTER';
  const [domain, setDomain] = useState<'human' | 'animal'>('human');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [volunteerCode, setVolunteerCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleGoogleAuth = async () => {
    setLoading(true);
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(auth, provider);
      const user = userCredential.user;

      // Check if role exists
      const snapshot = await get(ref(rtdb, `users/${user.uid}`));
      const userData = snapshot.val();
      let userRole = userData?.role;

      if (!userRole) {
        // New user via Google
        if (role === 'VOLUNTEER') {
          const res = await fetch(`${apiBaseUrl}/auth/verify-code`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: volunteerCode, role }),
          });
          if (!res.ok) {
            throw new Error(
              'INVALID ACCESS CODE: You do not have volunteer clearance. Please log in as a Reporter.',
            );
          }
        }

        userRole = role;
        if (role === 'VOLUNTEER' && volunteerCode === 'PULSE_ADMIN_1') {
          userRole = 'ADMIN';
        }
        await set(ref(rtdb, `users/${user.uid}`), {
          email: user.email,
          role: userRole,
          domain: userRole === 'VOLUNTEER' ? domain : null,
          created_at: new Date().toISOString(),
        });
      }

      router.push(
        userRole === 'ADMIN' ? '/admin' : userRole === 'VOLUNTEER' ? '/volunteer' : '/field',
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (mode === 'signup') {
        if (role === 'VOLUNTEER') {
          const res = await fetch(`${apiBaseUrl}/auth/verify-code`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: volunteerCode, role }),
          });
          if (!res.ok) {
            throw new Error(
              'INVALID ACCESS CODE: Volunteer commissioning requires a valid tactical code.',
            );
          }
        }

        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Send verification email with redirect back to the app
        const actionCodeSettings = {
          url: window.location.origin + '/login',
          handleCodeInApp: true,
        };
        await sendEmailVerification(user, actionCodeSettings);

        let userRole = role;
        if (role === 'VOLUNTEER' && volunteerCode === 'PULSE_ADMIN_1') {
          userRole = 'ADMIN';
        }

        await set(ref(rtdb, `users/${user.uid}`), {
          email,
          role: userRole,
          domain: userRole === 'VOLUNTEER' ? domain : null,
          created_at: new Date().toISOString(),
        });

        setSuccess('TACTICAL LINK DISPATCHED: Please verify your email before logging in.');
        setMode('signin');
      } else {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        if (!user.emailVerified) {
          setError('ACCESS DENIED: Please verify your email first. Check your inbox.');
          // Resend verification with redirect
          const actionCodeSettings = {
            url: window.location.origin + '/login',
            handleCodeInApp: true,
          };
          await sendEmailVerification(user, actionCodeSettings);
          return;
        }

        const snapshot = await get(ref(rtdb, `users/${user.uid}`));
        const userData = snapshot.val();
        const userRole = userData?.role || 'REPORTER';

        router.push(
          userRole === 'ADMIN' ? '/admin' : userRole === 'VOLUNTEER' ? '/volunteer' : '/field',
        );
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col lg:flex-row gap-12 items-start z-10">
      {/* LEFT: Brand */}
      <div className="lg:w-1/2 flex flex-col justify-center pt-4">
        <div className="mb-10 text-left">
          <div className="w-20 h-20 bg-charcoal rounded-xl mb-8 flex items-center justify-center brutalist-border shadow-2xl transform -rotate-3">
            <FingerprintIcon className="text-yellow" size={40} />
          </div>
          <h1 className="text-6xl md:text-8xl font-anton uppercase tracking-normal leading-[0.9] mb-4 text-(--foreground)">
            Secure
            <br />
            <span className="text-yellow">Gateway</span>
          </h1>
          <p className="text-sm text-(--foreground) opacity-50 font-outfit font-bold uppercase tracking-[0.2em] mt-6">
            CommunityPulse Authentication
          </p>
        </div>
      </div>

      {/* RIGHT: Auth Card */}
      <div className="lg:w-1/2 w-full bg-(--background) border border-(--border-color) rounded-2xl p-8 lg:p-12 shadow-2xl brutalist-border">
        {/* Mode Heading */}
        <h2 className="text-4xl font-anton uppercase text-(--foreground) mb-8 tracking-wide">
          {mode === 'signin' ? 'Log In' : 'Create Account'}
        </h2>

        {/* Volunteer Redirection Info */}
        <div className="mb-8 p-4 bg-yellow/5 border border-yellow/15 rounded-xl text-center">
          <p className="text-xs text-sage uppercase font-bold tracking-wider">
            Are you a volunteer? Use the{' '}
            <Link href="/volunteer" className="text-yellow hover:underline font-black">
              Volunteer Gateway
            </Link>
          </p>
        </div>

        {/* Domain Selection for Volunteers during Signup */}
        {mode === 'signup' && role === 'VOLUNTEER' && (
          <div className="mb-8 space-y-4 p-5 bg-yellow/5 border border-yellow/20 rounded-2xl">
            <label className="block text-[10px] text-yellow font-black uppercase tracking-[0.3em] pl-1">
              Assign Operational Domain
            </label>
            <div className="flex gap-4 p-1 bg-black/5 dark:bg-white/5 rounded-xl border border-black/5 dark:border-white/5">
              <button
                type="button"
                onClick={() => setDomain('human')}
                className={cn(
                  'flex-1 py-2.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all',
                  domain === 'human'
                    ? 'bg-yellow text-charcoal shadow-md'
                    : 'text-(--foreground) opacity-40 hover:opacity-100',
                )}
              >
                Human Health
              </button>
              <button
                type="button"
                onClick={() => setDomain('animal')}
                className={cn(
                  'flex-1 py-2.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all',
                  domain === 'animal'
                    ? 'bg-blue-500 text-white shadow-md'
                    : 'text-(--foreground) opacity-40 hover:opacity-100',
                )}
              >
                Animal Health
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleAuth} className="space-y-6">
          <div>
            <label className="block text-xs text-(--foreground) font-bold uppercase tracking-widest mb-2.5 font-outfit opacity-60">
              Personnel ID (Email)
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-(--background) border border-(--border-color) rounded-xl px-5 py-4 text-(--foreground) text-lg focus:outline-none focus:border-(--foreground) transition-all placeholder:opacity-30 font-outfit font-medium"
              placeholder={`id_${role.toLowerCase()}@emergency.net`}
            />
          </div>

          <div>
            <label className="block text-xs text-(--foreground) font-bold uppercase tracking-widest mb-2.5 font-outfit opacity-60">
              Access Token (Password)
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-(--background) border border-(--border-color) rounded-xl px-5 py-4 text-(--foreground) text-lg focus:outline-none focus:border-(--foreground) transition-all placeholder:opacity-30 font-outfit font-medium tracking-widest"
              placeholder="••••••••••••"
            />
          </div>

          {role === 'VOLUNTEER' && (
            <div className="animate-in fade-in slide-in-from-top-2 duration-300">
              <label className="block text-xs text-yellow font-black uppercase tracking-widest mb-2.5 font-outfit">
                Volunteer Authorization Code
              </label>
              <input
                type="text"
                required
                value={volunteerCode}
                onChange={(e) => setVolunteerCode(e.target.value)}
                className="w-full bg-yellow/5 border border-yellow/30 rounded-xl px-5 py-4 text-yellow text-lg focus:outline-none focus:border-yellow transition-all placeholder:text-yellow/20 font-outfit font-black tracking-[0.2em]"
                placeholder="ENTER TAC-CODE"
              />
              <p className="text-[9px] text-yellow/60 mt-2 uppercase font-black tracking-widest">
                Required for mission-level clearance
              </p>
            </div>
          )}

          {error && (
            <div className="text-red-500 font-bold text-sm text-center bg-red-500/10 py-3 rounded-lg border border-red-500/20 font-outfit animate-in fade-in zoom-in duration-300">
              {error}
            </div>
          )}

          {success && (
            <div className="text-emerald-500 font-bold text-sm text-center bg-emerald-500/10 py-3 rounded-lg border border-emerald-500/20 font-outfit animate-in fade-in zoom-in duration-300">
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-yellow text-charcoal font-anton uppercase tracking-widest text-2xl py-6 rounded-xl shadow-lg hover:-translate-y-1 active:translate-y-1 transition-all flex items-center justify-center gap-3 mt-4"
          >
            {loading ? (
              <Loader2 className="animate-spin" size={24} />
            ) : (
              <>
                {mode === 'signin' ? 'Verify Identity' : 'Commission Account'}
                <ArrowRight size={24} strokeWidth={3} />
              </>
            )}
          </button>

          {!(mode === 'signup' && role === 'VOLUNTEER') && (
            <>
              <div className="flex items-center gap-4 my-6">
                <div className="h-px flex-1 bg-(--foreground)/10"></div>
                <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-30">
                  OR
                </span>
                <div className="h-px flex-1 bg-(--foreground)/10"></div>
              </div>

              <button
                onClick={handleGoogleAuth}
                type="button"
                disabled={loading}
                className="w-full bg-white dark:bg-white/5 border border-black/10 dark:border-white/10 text-(--foreground) py-4 rounded-xl font-roboto font-bold text-sm uppercase tracking-widest hover:bg-black/5 active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Continue with Verified Google Account
              </button>
            </>
          )}
        </form>

        <div className="mt-8 text-center border-t border-(--border-color) pt-8">
          <button
            type="button"
            onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
            className="text-sm text-(--foreground) opacity-50 font-bold uppercase tracking-wider hover:opacity-100 transition-opacity font-outfit"
          >
            {mode === 'signin'
              ? 'No clearance? Request Access →'
              : 'Already commissioned? Log In →'}
          </button>
        </div>

        {/* Trust Badges */}
        <div className="mt-8 flex items-center justify-center gap-8 opacity-30">
          <div className="flex items-center gap-2">
            <Shield size={12} className="text-(--foreground)" />
            <span className="text-[9px] font-black uppercase tracking-widest text-(--foreground) font-outfit">
              Secure Node
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
            <span className="text-[9px] font-black uppercase tracking-widest text-(--foreground) font-outfit">
              SSL Active
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
