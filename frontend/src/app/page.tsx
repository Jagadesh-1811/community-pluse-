'use client';

import { ShieldAlert, Signal, Activity, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function LandingGateway() {
  return (
    <main className="min-h-screen bg-slate-950 flex flex-col items-center justify-center font-inter p-6 relative overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-emergency/10 rounded-full blur-[150px] opacity-50 pointer-events-none"></div>

      <div className="z-10 text-center mb-16">
        <div className="w-24 h-24 bg-emergency/10 rounded-3xl mx-auto mb-8 flex items-center justify-center border border-emergency/20 shadow-[0_0_50px_rgba(255,77,0,0.2)]">
            <Activity className="text-emergency" size={48} />
        </div>
        <h1 className="text-6xl font-black text-white font-outfit uppercase tracking-tighter mb-4">
            Community<span className="text-emergency">Pulse</span>
        </h1>
        <p className="text-slate-400 font-medium text-lg uppercase tracking-widest max-w-xl mx-auto opacity-80">
            Intelligent Field Coordination & Crisis Response Network
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-8 w-full max-w-4xl z-10">
        {/* User Route */}
        <Link href="/field" className="flex-1 group">
            <div className="h-full p-10 bg-white/5 border border-white/10 hover:border-emergency/50 rounded-[3rem] transition-all hover:bg-white/10 hover:scale-[1.02] active:scale-95 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-2 h-full bg-emergency"></div>
                <Signal size={32} className="text-emergency mb-6" />
                <h2 className="text-3xl font-black text-white uppercase tracking-tighter mb-3">Broadcast Need</h2>
                <p className="text-slate-400 font-medium leading-relaxed mb-10">I am a citizen or field reporter needing to securely transmit local intelligence, crisis data, or request immediate assistance.</p>
                <div className="flex items-center text-[11px] font-black uppercase tracking-widest text-emergency group-hover:gap-4 transition-all gap-2">
                    Open Field Protocol <ArrowRight size={14} />
                </div>
            </div>
        </Link>

        {/* Volunteer Route */}
        <Link href="/volunteer" className="flex-1 group">
            <div className="h-full p-10 bg-slate-900 border border-white/5 hover:border-primary/50 rounded-[3rem] transition-all hover:bg-white/5 hover:scale-[1.02] active:scale-95 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-2 h-full bg-primary opacity-50"></div>
                <ShieldAlert size={32} className="text-primary opacity-80 mb-6" />
                <h2 className="text-3xl font-black text-slate-200 uppercase tracking-tighter mb-3">Command Center</h2>
                <p className="text-slate-500 font-medium leading-relaxed mb-10">I am an authorized responder or volunteer returning to track real-time telemetry, analyze data, and initiate local deployments.</p>
                <div className="flex items-center text-[11px] font-black uppercase tracking-widest text-primary opacity-80 group-hover:gap-4 transition-all gap-2">
                    Access Dashboard <ArrowRight size={14} />
                </div>
            </div>
        </Link>
      </div>
    </main>
  );
}
