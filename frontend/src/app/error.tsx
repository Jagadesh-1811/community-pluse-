'use client';

import { useEffect } from 'react';
import { ShieldAlert, RotateCcw } from 'lucide-react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function RootError({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log exception context to monitoring services
    console.error('Unhandled Client Exception:', error);
  }, [error]);

  return (
    <main className="fixed inset-0 z-200 bg-[#000] flex flex-col items-center justify-center p-6 text-center font-mono">
      <div className="max-w-md w-full bg-[#050505] border border-red-500/30 rounded-3xl p-10 flex flex-col items-center gap-6 shadow-[0_10px_40px_rgba(239,68,68,0.1)]">
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-500">
          <ShieldAlert size={48} />
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-bold uppercase tracking-widest text-white">
            System Collision Detected
          </h2>
          <p className="text-xs text-white/50 leading-relaxed max-w-sm mx-auto">
            An unhandled runtime exception occurred in the client application shell.
          </p>
        </div>

        <div className="w-full bg-red-950/20 border border-red-500/10 rounded-xl p-4 text-left">
          <div className="text-[10px] uppercase font-bold text-red-400 mb-1 tracking-wider">
            Exception Diagnostics
          </div>
          <div className="text-xs text-red-300 font-mono break-all leading-normal">
            {error.message || 'Unknown application runtime crash.'}
          </div>
          {error.digest && (
            <div className="text-[9px] text-white/30 mt-2 font-mono">
              Trace Digest: {error.digest}
            </div>
          )}
        </div>

        <button
          onClick={() => reset()}
          className="flex items-center justify-center gap-2.5 px-6 py-3.5 bg-white hover:bg-neutral-200 text-black font-bold uppercase tracking-widest text-xs rounded-xl border border-white transition-all duration-300 active:scale-95 shadow-[0_5px_15px_rgba(255,255,255,0.1)] cursor-pointer"
        >
          <RotateCcw size={14} />
          Reset Interface
        </button>
      </div>
    </main>
  );
}
