'use client';

import Link from 'next/link';
import { useTheme } from 'next-themes';
import { useState, useEffect } from 'react';
import { Moon, Sun, LayoutDashboard } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useRealtimeNeeds } from '@/hooks/useRealtimeNeeds';

export default function GlobalNav() {
  const { theme, setTheme } = useTheme();
  const { user, role, signOut } = useAuth();
  const { needs } = useRealtimeNeeds();
  const [mounted, setMounted] = useState(false);

  const userNeeds = needs.filter((need) => need.reporter_email === user?.email);

  useEffect(() => {
    setTimeout(() => {
      setMounted(true);
    }, 0);
  }, []);

  return (
    <nav className="sticky top-0 h-20 glass border-b border-(--border-color) z-100 flex items-center justify-between px-8 md:px-16 transition-all duration-300">
      <Link href="/" className="flex items-baseline gap-1 group">
        <span className="font-anton text-3xl uppercase tracking-tighter">Community</span>
        <span className="font-anton text-3xl uppercase tracking-tighter">Pulse</span>
        <div className="w-3 h-3 rounded-full bg-yellow mb-1 shadow-[0_0_15px_rgba(255,225,124,0.5)] group-hover:scale-125 transition-transform"></div>
      </Link>

      <div className="hidden md:flex items-center gap-8 font-roboto font-medium text-sm uppercase tracking-widest text-(--foreground) opacity-80 mt-1">
        {user ? (
          <Link
            href={role === 'ADMIN' ? '/admin' : role === 'VOLUNTEER' ? '/volunteer' : '/field'}
            className="hover:text-yellow transition-colors hover:scale-105 active:scale-95 duration-200 font-bold"
          >
            Dashboard
          </Link>
        ) : (
          <>
            <Link
              href="/field"
              className="hover:text-yellow transition-colors hover:scale-105 active:scale-95 duration-200"
            >
              Field Reporter
            </Link>
            <Link
              href="/volunteer"
              className="hover:text-yellow transition-colors hover:scale-105 active:scale-95 duration-200"
            >
              Command Center
            </Link>
          </>
        )}
      </div>

      <div className="flex items-center gap-6">
        {mounted && (
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="p-2 rounded-full bg-(--foreground) text-(--background) hover:scale-110 active:scale-90 transition-all shadow-lg hidden sm:block"
            title="Toggle Light/Dark Mode"
          >
            {theme === 'dark' ? (
              <Sun size={14} strokeWidth={3} />
            ) : (
              <Moon size={14} strokeWidth={3} />
            )}
          </button>
        )}

        {!user ? (
          <>
            <Link
              href="/login"
              className="font-roboto font-bold text-sm uppercase tracking-widest hover:text-yellow transition-colors"
            >
              Login
            </Link>
            <Link
              href="/signup"
              className="bg-(--foreground) text-(--background) px-6 py-2.5 rounded-full font-roboto font-black text-xs uppercase tracking-[0.2em] hover:scale-105 active:scale-95 transition-all shadow-[0_10px_20px_var(--border-color)]"
            >
              Join Network
            </Link>
          </>
        ) : (
          <div className="flex items-center gap-4">
            {role === 'REPORTER' && (
              <Link
                href="/field#reports"
                onClick={() => {
                  if (window.location.pathname === '/field') {
                    window.location.hash = '#reports';
                    window.dispatchEvent(new HashChangeEvent('hashchange'));
                  }
                }}
                className="flex items-center gap-2 px-4 py-2.5 bg-charcoal/80 border border-(--border-color) hover:bg-yellow hover:text-charcoal rounded-xl shadow-lg transition-all font-black text-xs uppercase tracking-widest text-yellow cursor-pointer"
              >
                <LayoutDashboard size={14} /> My Reports ({userNeeds.length})
              </Link>
            )}
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5">
                <div className="w-7 h-7 rounded-full bg-yellow flex items-center justify-center text-[10px] font-black text-black shadow-lg">
                  {user.email?.[0].toUpperCase() || 'U'}
                </div>
                <span className="text-[10px] font-bold uppercase tracking-widest opacity-60 hidden lg:block">
                  {user.email?.split('@')[0]}
                </span>
              </div>
              <span className="text-[8px] font-bold uppercase tracking-widest opacity-50 px-3">
                {role === 'REPORTER' ? 'Reporter' : role === 'VOLUNTEER' ? 'Volunteer' : '...'}
              </span>
            </div>
            <button
              onClick={() => signOut()}
              className="font-roboto font-bold text-xs uppercase tracking-widest hover:text-emergency transition-colors text-emergency/80"
            >
              Logout
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
