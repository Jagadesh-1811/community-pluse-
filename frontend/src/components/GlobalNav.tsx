"use client";

import Link from "next/link";
import { useTheme } from "next-themes";
import { useState, useEffect } from "react";
import { Moon, Sun } from "lucide-react";

export default function GlobalNav() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <nav className="fixed top-0 left-0 right-0 h-20 glass border-b border-[var(--border-color)] z-[100] flex items-center justify-between px-8 md:px-16 transition-all duration-300">
      <Link href="/" className="flex items-baseline gap-1 group">
        <span className="font-anton text-3xl uppercase tracking-tighter">Community</span>
        <span className="font-anton text-3xl uppercase tracking-tighter">Pulse</span>
        <div className="w-3 h-3 rounded-full bg-yellow mb-1 shadow-[0_0_15px_rgba(255,225,124,0.5)] group-hover:scale-125 transition-transform"></div>
      </Link>

      <div className="hidden md:flex items-center gap-8 font-roboto font-medium text-sm uppercase tracking-widest text-[var(--foreground)] opacity-80 mt-1">
        <Link href="/field" className="hover:text-yellow transition-colors hover:scale-105 active:scale-95 duration-200">Field Reporter</Link>
        <Link href="/volunteer" className="hover:text-yellow transition-colors hover:scale-105 active:scale-95 duration-200">Command Center</Link>
      </div>

      <div className="flex items-center gap-6">
        {mounted && (
          <button 
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="p-2 rounded-full bg-[var(--foreground)] text-[var(--background)] hover:scale-110 active:scale-90 transition-all shadow-lg hidden sm:block"
            title="Toggle Light/Dark Mode"
          >
            {theme === "dark" ? <Sun size={14} strokeWidth={3} /> : <Moon size={14} strokeWidth={3} />}
          </button>
        )}

        <Link href="/login" className="font-roboto font-bold text-sm uppercase tracking-widest hover:text-yellow transition-colors">
          Login
        </Link>
        <Link href="/signup" className="bg-[var(--foreground)] text-[var(--background)] px-6 py-2.5 rounded-full font-roboto font-black text-xs uppercase tracking-[0.2em] hover:scale-105 active:scale-95 transition-all shadow-[0_10px_20px_var(--border-color)]">
          Join Network
        </Link>
      </div>
    </nav>
  );
}
