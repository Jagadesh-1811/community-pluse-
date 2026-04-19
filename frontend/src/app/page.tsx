'use client';

import { ArrowRight, ShieldAlert, Signal, MapPin, Bot, CheckCircle, XIcon } from 'lucide-react';
import Link from 'next/link';
import { motion } from 'framer-motion';

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[var(--background)] flex flex-col font-roboto relative overflow-x-hidden pt-10">
      
      {/* 1. HERO SECTION */}
      <section className="relative w-full min-h-[90vh] flex flex-col items-center justify-center brutalist-grid p-6 text-center">
        <div className="absolute top-10 flex items-center justify-center gap-3 glass px-5 py-2 rounded-full border-black/10 dark:border-white/10 uppercase font-black text-xs tracking-widest text-[var(--foreground)] mb-8 shadow-sm">
           <div className="w-2.5 h-2.5 bg-yellow rounded-full shadow-[0_0_10px_#ffe17c] animate-pulse"></div>
           Pulse Protocol Online
        </div>
        
        <h1 className="text-6xl md:text-8xl lg:text-9xl font-anton uppercase leading-[0.9] text-[var(--foreground)] mt-20 md:mt-10 mx-auto max-w-[90vw] tracking-normal mb-8">
            Intelligent Field <br/> 
            <span className="relative inline-block mt-4 md:mt-2">
                <span className="absolute inset-x-[-10px] inset-y-[10px] bg-yellow -rotate-[3deg] scale-105 z-[-1] hidden md:block"></span>
                <span className="relative z-10 text-[var(--background)] md:text-[var(--foreground)] drop-shadow-md">COORDINATION</span>
            </span>
        </h1>
        
        <p className="text-lg md:text-2xl font-medium text-[var(--foreground)] opacity-70 max-w-2xl mx-auto mb-14 leading-relaxed">
            Real-time telemetry, AI-driven communications, and decentralized reporting. Move faster when seconds matter.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 items-center w-full max-w-md mx-auto">
            <Link href="/field" className="w-full bg-yellow text-[var(--foreground)] !text-[#171e19] px-8 py-5 rounded-2xl font-anton text-2xl md:text-3xl uppercase tracking-wide hover:-translate-y-2 hover:shadow-[0_20px_0_var(--border-color)] active:translate-y-2 active:shadow-none transition-all flex justify-center items-center gap-3">
                Report Incident <ArrowRight size={28} strokeWidth={3} />
            </Link>
        </div>
      </section>

      {/* 2. PROBLEM vs SOLUTION */}
      <section className="w-full flex flex-col lg:flex-row border-y border-[var(--border-color)]">
        {/* The Old Way */}
        <div className="flex-1 bg-[#171e19] text-white p-12 md:p-24 flex flex-col justify-start">
            <h2 className="text-5xl md:text-7xl font-anton uppercase text-white/50 mb-10">The Old Way</h2>
            <ul className="space-y-8 font-medium text-lg md:text-xl text-[#b7c6c2]">
                <li className="flex items-start gap-4">
                    <XIcon className="text-red-500 shrink-0 mt-1" size={24} strokeWidth={3} />
                    Disjointed communication lines and dropped calls.
                </li>
                <li className="flex items-start gap-4">
                    <XIcon className="text-red-500 shrink-0 mt-1" size={24} strokeWidth={3} />
                    Responders arriving without crucial live location telemetry.
                </li>
                <li className="flex items-start gap-4">
                    <XIcon className="text-red-500 shrink-0 mt-1" size={24} strokeWidth={3} />
                    Chaotic dispatch prioritizing the wrong missions.
                </li>
            </ul>
        </div>
        {/* The Pulse Way */}
        <div className="flex-1 bg-[#272727] text-white p-12 md:p-24 border-t-8 lg:border-t-0 lg:border-l-[12px] border-yellow flex flex-col justify-start shadow-inner relative overflow-hidden">
            <h2 className="text-5xl md:text-7xl font-anton uppercase text-white drop-shadow-lg mb-10 relative z-10">The Pulse Way</h2>
            <ul className="space-y-8 font-medium text-lg md:text-xl text-white relative z-10">
                <li className="flex items-start gap-4">
                    <CheckCircle className="text-yellow shrink-0 mt-1 shadow-[0_0_15px_rgba(255,225,124,0.4)] rounded-full" size={28} strokeWidth={3} />
                    Instant encrypted web portals with dynamic location sync.
                </li>
                <li className="flex items-start gap-4">
                    <CheckCircle className="text-yellow shrink-0 mt-1 shadow-[0_0_15px_rgba(255,225,124,0.4)] rounded-full" size={28} strokeWidth={3} />
                    AI triage automatically scores urgency and flags crises.
                </li>
                <li className="flex items-start gap-4">
                    <CheckCircle className="text-yellow shrink-0 mt-1 shadow-[0_0_15px_rgba(255,225,124,0.4)] rounded-full" size={28} strokeWidth={3} />
                    Centralized command center mapping real-time operational flows.
                </li>
            </ul>
            {/* Background Decor */}
            <div className="absolute right-0 bottom-0 text-9xl text-yellow/5 translate-y-12 translate-x-12">
               <Bot size={400} />
            </div>
        </div>
      </section>

      {/* 3. BENTO GRID */}
      <section className="w-full py-24 md:py-36 px-6 md:px-12 max-w-[1600px] mx-auto">
        <div className="mb-20">
            <h2 className="text-6xl md:text-8xl font-anton uppercase leading-none text-[var(--foreground)] mb-6">Unrivaled <br/> Operations</h2>
            <p className="text-xl font-medium opacity-60 max-w-lg">Everything you need to orchestrate mass field actions, neatly packed into a glassmorphic command center.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 auto-rows-[400px]">
            {/* Main Feature - Spans 2 */}
            <div className="lg:col-span-2 glass rounded-[2.5rem] p-10 flex flex-col relative overflow-hidden group hover:shadow-[0_30px_60px_-15px_rgba(0,0,0,0.3)] transition-all duration-300">
                <div className="absolute top-0 right-0 p-8 opacity-20 group-hover:scale-110 transition-transform duration-700">
                   <Signal size={120} className="text-[var(--foreground)]" />
                </div>
                <h3 className="text-4xl md:text-5xl font-anton uppercase text-[var(--foreground)] mb-4">Command Dashboard</h3>
                <p className="text-lg opacity-70 mb-auto max-w-sm">Assign, track, and resolve massive influxes of reports with an AI-augmented command center.</p>
                
                {/* Abstract UI Mockup */}
                <div className="w-full h-48 bg-[#171e19] brutalist-border rounded-t-xl mt-8 absolute bottom-0 right-0 shadow-[0_-20px_50px_rgba(0,0,0,0.1)] flex overflow-hidden">
                    <div className="w-16 h-full border-r border-white/10 bg-black/40 flex flex-col gap-3 p-4">
                        <div className="w-6 h-6 rounded bg-yellow flex items-center justify-center text-[10px] font-anton text-black">CP</div>
                        <div className="w-6 h-6 rounded bg-white/10"></div>
                        <div className="w-6 h-6 rounded bg-white/10"></div>
                    </div>
                    <div className="flex-1 p-6 relative">
                        <div className="w-48 h-8 bg-white/10 rounded mb-4"></div>
                        <div className="flex gap-4">
                            <div className="w-1/2 h-20 bg-white/5 rounded border border-white/10 relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-1 h-full bg-yellow"></div>
                            </div>
                            <div className="w-1/2 h-20 bg-white/5 rounded border border-white/10"></div>
                        </div>
                    </div>
                </div>
            </div>

            {/* AI Sidekick */}
            <div className="glass rounded-[2.5rem] p-10 flex flex-col bg-[#171e19] hover:shadow-[0_30px_60px_-15px_rgba(0,0,0,0.3)] transition-all duration-300 group text-white">
                <h3 className="text-4xl font-anton uppercase text-yellow mb-4">AI Watchdog</h3>
                <p className="text-sm opacity-80 text-[#b7c6c2]">Automated transcription and urgency scoring algorithms.</p>
                
                <div className="mt-auto bg-black/40 rounded-xl p-4 border border-white/10 font-mono text-xs text-green-400 space-y-2 group-hover:-translate-y-2 transition-transform duration-300">
                    <div>&gt; incoming_signal...</div>
                    <div className="text-yellow">&gt; calculating_urgency()</div>
                    <div className="text-white bg-red-500/20 px-2 py-1 rounded inline-block">Score: 9.9 CRITICAL</div>
                </div>
            </div>

            {/* GPS Tracking */}
            <div className="glass rounded-[2.5rem] p-10 flex flex-col hover:shadow-[0_30px_60px_-15px_rgba(0,0,0,0.3)] transition-all duration-300 relative overflow-hidden group">
                <h3 className="text-4xl md:text-5xl font-anton text-[var(--foreground)] uppercase mb-4 z-10 relative">Live GPS Lock</h3>
                <p className="text-lg opacity-70 mb-auto max-w-xs z-10 relative">Haversine-based location sharing without mobile app installation.</p>

                <div className="absolute -bottom-10 -right-10 w-64 h-64 border-4 border-yellow/20 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform duration-500">
                    <div className="w-48 h-48 border-4 border-yellow/40 rounded-full flex items-center justify-center animate-spin" style={{animationDuration: '10s'}}>
                        <div className="w-24 h-24 bg-yellow/20 rounded-full backdrop-blur-md border border-yellow flex items-center justify-center">
                            <MapPin size={32} className="text-yellow drop-shadow-[0_0_10px_rgba(255,225,124,1)]" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Security */}
            <div className="lg:col-span-2 glass rounded-[2.5rem] p-10 flex items-center justify-center bg-yellow text-[#171e19] brutalist-grid group overflow-hidden relative">
                <div className="z-10 relative text-center">
                    <ShieldAlert size={64} className="mx-auto mb-6" />
                    <h3 className="text-5xl md:text-6xl font-anton uppercase drop-shadow-md">Military-Grade Tunnel</h3>
                    <p className="text-xl font-bold mt-2 opacity-80 font-roboto">End-to-End Supabase / Firebase Encryption</p>
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-[rgba(255,225,124,1)] to-transparent pointer-events-none"></div>
            </div>
        </div>
      </section>

      {/* 4. HOW IT WORKS */}
      <section className="w-full bg-[var(--foreground)] text-[var(--background)] py-24 md:py-36 px-6 md:px-12 border-y border-[var(--border-color)]">
         <div className="max-w-[1600px] mx-auto flex flex-col lg:flex-row gap-20">
            {/* Sticky Header */}
            <div className="lg:w-1/3">
                <div className="sticky top-32">
                    <h2 className="text-7xl md:text-8xl font-anton uppercase leading-none mb-6 text-[var(--background)]">
                        Action <br/> Protocol
                    </h2>
                    <p className="text-xl font-medium opacity-70">Three steps to orchestrating flawless operations.</p>
                </div>
            </div>

            {/* Steps Stack */}
            <div className="lg:w-2/3 flex flex-col gap-24">
                {[
                    {num: '01', title: 'Submit Sitrep', desc: 'Reporters scan a QR code or tap a link to instantly open the field gateway. No app downloads required.'},
                    {num: '02', title: 'AI Triage', desc: 'The Command Center receives a sanitized, prioritized alert complete with real-time GPS coordinates and context.'},
                    {num: '03', title: 'Dispatch & Resolve', desc: 'Responders accept the ticket, lock their GPS to the map, and physically secure the location.'}
                ].map((step, i) => (
                   <div key={i} className="flex gap-8 md:gap-12 group cursor-default">
                       <span className="text-8xl md:text-9xl font-anton text-[#171e19]/20 dark:text-[#b7c6c2]/20 group-hover:text-yellow transition-colors duration-500 leading-none">
                           {step.num}
                       </span>
                       <div className="pt-4">
                           <h3 className="text-4xl md:text-5xl font-anton uppercase mb-4 text-[var(--background)]">{step.title}</h3>
                           <p className="text-xl md:text-2xl font-medium opacity-80 max-w-xl leading-relaxed">{step.desc}</p>
                       </div>
                   </div> 
                ))}
            </div>
         </div>
      </section>

      {/* 5. FINAL CTA */}
      <section className="relative w-full py-40 flex flex-col items-center justify-center overflow-hidden bg-yellow">
        {/* Massive Overlay Text */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex whitespace-nowrap overflow-hidden z-0 pointer-events-none opacity-[0.03]">
             <span className="text-[300px] font-anton uppercase leading-none text-black">COMMUNITY PULSE </span>
             <span className="text-[300px] font-anton uppercase leading-none text-black ml-10">COMMUNITY PULSE</span>
        </div>

        <div className="relative z-10 text-center px-6">
            <h2 className="text-7xl md:text-9xl font-anton uppercase text-black leading-[0.8] mb-6 drop-shadow-sm">
                INITIATE<br/>PROTOCOL
            </h2>
            <p className="text-2xl font-black text-black/60 max-w-2xl mx-auto mb-16 uppercase tracking-[0.2em] font-roboto">
                The Field Is Waiting. Secure the perimeter.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 items-center justify-center max-w-2xl mx-auto p-4 md:p-8 bg-white/20 backdrop-blur-2xl rounded-[3rem] border border-black/10 shadow-[0_40px_80px_rgba(0,0,0,0.2)] hover:scale-[1.02] transition-transform duration-500">
                <input 
                    type="email" 
                    placeholder="Enter Operation ID or Email" 
                    className="w-full bg-white px-8 py-5 rounded-2xl font-bold text-[#171e19] outline-none border-2 border-transparent focus:border-black transition-colors"
                />
                <Link href="/volunteer" className="w-full sm:w-auto shrink-0 bg-[#171e19] text-white px-10 py-5 rounded-2xl font-anton text-2xl uppercase tracking-widest hover:bg-[#272727] active:scale-95 transition-all text-center">
                    Enter Link
                </Link>
            </div>
        </div>
      </section>
    </main>
  );
}
