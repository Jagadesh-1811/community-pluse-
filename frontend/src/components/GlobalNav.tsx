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
    <nav className="fixed top-0 left-0 right-0 h-20 bg-[var(--background)]/90 backdrop-blur-md border-b border-[var(--border-color)] z-[100] flex items-center justify-between px-8 md:px-16 transition-all duration-300">
      <Link href="/" className="flex items-baseline group">
        <span className="font-anton text-3xl uppercase tracking-normal">COMMUNITY PULSE</span>
        <span className="font-anton text-3xl text-yellow group-hover:scale-110 transition-transform origin-bottom-left">.</span>
      </Link>

      <div className="hidden md:flex items-center gap-8 font-outfit font-medium text-sm text-[var(--foreground)] mt-1">
        <Link href="/field" className="hover:text-yellow transition-colors duration-200">Field Reporter</Link>
        <Link href="/volunteer" className="hover:text-yellow transition-colors duration-200">Command Center</Link>
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

        <Link href="/login" className="font-outfit font-medium text-sm hover:text-yellow transition-colors">
          Login
        </Link>
        <Link href="/signup" className="bg-[var(--foreground)] text-[var(--background)] px-6 py-2.5 rounded-full font-outfit font-medium text-sm hover:scale-105 active:scale-95 transition-all shadow-md">
          Join Network
        </Link>
      </div>
    </nav>
  );
}
