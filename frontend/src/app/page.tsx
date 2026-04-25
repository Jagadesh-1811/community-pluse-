'use client';

import { ArrowRight, CheckCircle, XIcon, FingerprintIcon, MousePointer2, Settings, AlignLeft, AlignCenter, AlignRight } from 'lucide-react';
import Link from 'next/link';

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-(--background) flex flex-col font-outfit relative overflow-x-hidden pt-20">
      
      {/* 1. HERO SECTION */}
      <section className="relative w-full min-h-[90vh] flex flex-col items-center justify-center brutalist-grid p-6 text-center">
        <div className="flex items-center justify-center gap-3 border border-(--foreground)/10 px-6 py-2.5 rounded-full uppercase font-black text-xs tracking-widest text-(--foreground) mb-12 shadow-sm bg-(--background)">
           <div className="w-2.5 h-2.5 bg-yellow rounded-full shadow-[0_0_10px_var(--color-primary)] animate-pulse"></div>
           Pulse Protocol Online
        </div>
        
        <h1 className="text-6xl md:text-8xl lg:text-9xl font-anton uppercase leading-[0.9] text-(--foreground) max-w-5xl mx-auto tracking-normal mb-8 z-10">
            Intelligent Field <br/> 
            <span className="text-yellow">COORDINATION</span>
        </h1>
        
        <p className="text-lg md:text-xl font-medium text-(--foreground)/70 max-w-2xl mx-auto mb-14 leading-relaxed">
            Real-time telemetry, AI-driven communications, and decentralized reporting. Move faster when seconds matter.
        </p>

        <div className="flex flex-col sm:flex-row gap-6 items-center w-full max-w-2xl mx-auto">
            <Link href="/field" className="w-full sm:w-1/2 bg-yellow text-charcoal px-10 py-6 rounded-2xl font-anton text-3xl uppercase tracking-wide hover:-translate-y-2 active:translate-y-1 transition-all flex justify-center items-center gap-4 shadow-[0_20px_40px_rgba(255,225,124,0.3)]">
                Field <ArrowRight size={28} strokeWidth={3} />
            </Link>
            <Link href="/volunteer" className="w-full sm:w-1/2 border-2 border-(--foreground) text-(--foreground) px-10 py-6 rounded-2xl font-anton text-3xl uppercase tracking-wide hover:-translate-y-2 active:scale-95 transition-all text-center">
                Command
            </Link>
        </div>
      </section>

      {/* 2. PROBLEM vs SOLUTION */}
      <section className="w-full flex flex-col lg:flex-row border-y border-(--border-color)">
        {/* The Old Way */}
        <div className="flex-1 bg-charcoal text-white p-12 md:p-24 flex flex-col justify-start">
            <h2 className="text-5xl md:text-7xl font-anton uppercase text-sage/50 mb-12 transform -rotate-2 origin-left">The Old Way</h2>
            <ul className="space-y-10 font-medium text-lg md:text-xl text-sage">
                <li className="flex items-start gap-6">
                    <XIcon className="text-red-500 shrink-0 mt-1" size={32} strokeWidth={3} />
                    Disjointed communication lines, dropped calls, and unreliable infrastructure.
                </li>
                <li className="flex items-start gap-6">
                    <XIcon className="text-red-500 shrink-0 mt-1" size={32} strokeWidth={3} />
                    Responders arriving blindly without crucial live location telemetry.
                </li>
                <li className="flex items-start gap-6">
                    <XIcon className="text-red-500 shrink-0 mt-1" size={32} strokeWidth={3} />
                    Chaotic dispatch allocating resources to the wrong missions.
                </li>
            </ul>
        </div>
        {/* The Pulse Way */}
        <div className="flex-1 bg-dark-gray p-12 md:p-24 border-t-8 lg:border-t-0 lg:border-l-16 border-yellow flex flex-col justify-start relative overflow-hidden">
            <h2 className="text-5xl md:text-7xl font-anton uppercase text-white mb-12 relative z-10 transform -rotate-2 origin-left">The Pulse Way</h2>
            <ul className="space-y-10 font-medium text-lg md:text-xl text-white relative z-10">
                <li className="flex items-start gap-6">
                    <CheckCircle className="text-yellow shrink-0 mt-1" size={32} strokeWidth={3} />
                    Instant encrypted web portals with dynamic high-resolution location sync.
                </li>
                <li className="flex items-start gap-6">
                    <CheckCircle className="text-yellow shrink-0 mt-1" size={32} strokeWidth={3} />
                    AI triage automatically scores report urgency and flags critical crises.
                </li>
                <li className="flex items-start gap-6">
                    <CheckCircle className="text-yellow shrink-0 mt-1" size={32} strokeWidth={3} />
                    Centralized command center mapping real-time operational flows globally.
                </li>
            </ul>
        </div>
      </section>

      {/* 3. BENTO GRID */}
      <section className="w-full bg-(--background) py-24 md:py-36 px-6 md:px-12 max-w-[1600px] mx-auto">
        <div className="mb-20">
            <h2 className="text-6xl md:text-8xl font-anton uppercase leading-[0.9] text-(--foreground) mb-6">
              Tactical <br/> <span className="text-yellow bg-charcoal px-4 py-2 inline-block -rotate-2 mt-2">Advantage</span>
            </h2>
            <p className="text-xl font-medium opacity-60 max-w-lg mt-8">Everything you need to orchestrate mass field actions, seamlessly packaged into a high-performance command center.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-[450px]">
            {/* Abstract Mockup Card - Spans 2 */}
            <div className="lg:col-span-2 bg-[#f8f9fa] dark:bg-charcoal/30 brutalist-border p-10 flex flex-col relative group transition-all duration-500 hover:shadow-xl overflow-hidden">
                <h3 className="text-4xl md:text-5xl font-anton uppercase text-(--foreground) mb-4">Command Dashboard</h3>
                <p className="text-lg opacity-70 mb-8 max-w-sm">Assign, track, and resolve mass influxes of reports with crystal-clear visibility.</p>
                
                {/* Abstract UI Mockup - positioned at bottom, not overlapping text */}
                <div className="w-full h-52 mt-auto bg-white dark:bg-[#111] border border-black/10 dark:border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden transform group-hover:-translate-y-2 transition-transform duration-500">
                    <div className="h-8 border-b border-black/10 dark:border-white/10 flex items-center px-4 gap-2 bg-[#f8f9fa] dark:bg-black">
                        <div className="w-3 h-3 rounded-full bg-red-400"></div>
                        <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                        <div className="w-3 h-3 rounded-full bg-green-400"></div>
                        <span className="mx-auto text-[10px] font-black uppercase text-black/40 dark:text-white/40 tracking-widest leading-none mt-1">PULSE_OS</span>
                    </div>
                    <div className="flex flex-1">
                        <div className="w-16 border-r border-black/10 dark:border-white/10 flex flex-col items-center py-4 gap-4 bg-black/5 dark:bg-white/5">
                            <div className="w-8 h-8 rounded bg-charcoal dark:bg-white flex items-center justify-center text-yellow dark:text-charcoal font-anton text-xs shadow-sm">CP</div>
                            <div className="w-6 h-6 rounded bg-black/10 dark:bg-white/10"></div>
                            <div className="w-6 h-6 rounded bg-black/10 dark:bg-white/10"></div>
                        </div>
                        <div className="flex-1 bg-black/5 dark:bg-black/50 p-6 relative flex items-center justify-center">
                            <div className="w-48 h-32 bg-white dark:bg-charcoal border border-black/5 dark:border-white/5 rounded-lg shadow-lg relative flex flex-col p-4 transition-transform group-hover:scale-105 duration-500">
                               <div className="w-3/4 h-3 bg-black/10 dark:bg-white/10 rounded mb-2"></div>
                               <div className="w-1/2 h-3 bg-black/10 dark:bg-white/10 rounded"></div>
                               
                               <div className="absolute -bottom-3 -right-3 flex flex-col items-end gap-1">
                                  <MousePointer2 className="text-charcoal dark:text-yellow fill-charcoal dark:fill-yellow -mb-2 z-10" size={24} />
                                  <span className="bg-charcoal dark:bg-yellow text-white dark:text-black py-0.5 px-2 rounded font-mono text-[9px] uppercase tracking-wider font-bold shadow-md">Dispatcher_01</span>
                               </div>
                            </div>
                        </div>
                        <div className="w-48 border-l border-black/10 dark:border-white/10 p-4 flex flex-col gap-4 bg-white dark:bg-[#0a0a0a]">
                            <div className="font-anton text-xs uppercase text-black/40 dark:text-white/40">Properties</div>
                            <div className="w-full flex gap-2">
                                <div className="p-1 border border-black/10 dark:border-white/10 rounded"><AlignLeft size={16} className="text-black/60 dark:text-white/60"/></div>
                                <div className="p-1 border border-black/10 dark:border-white/10 rounded"><AlignCenter size={16} className="text-black/60 dark:text-white/60"/></div>
                                <div className="p-1 border border-black/10 dark:border-white/10 rounded"><AlignRight size={16} className="text-black/60 dark:text-white/60"/></div>
                            </div>
                            <div className="w-full h-8 border border-black/10 dark:border-white/10 rounded flex items-center px-2 gap-2 mt-auto">
                                <div className="w-4 h-4 rounded-full bg-[#FFE17C]"></div>
                                <span className="font-mono text-[10px] text-black/60 dark:text-white/60 font-bold uppercase">#FFE17C</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* AI Sidekick */}
            <div className="bg-charcoal text-white brutalist-border p-10 flex flex-col transition-all duration-300 hover:shadow-2xl group">
                <h3 className="text-4xl font-anton uppercase text-yellow mb-4">AI Watchdog</h3>
                <p className="text-lg opacity-80 text-sage">Automated transcription and urgency scoring algorithms.</p>
                
                <div className="mt-auto bg-[#0a0a0a] rounded-lg p-5 border border-white/5 font-mono text-xs text-sage space-y-3 group-hover:-translate-y-2 transition-transform duration-300">
                    <div>&gt; incoming_signal...</div>
                    <div className="text-yellow">&gt; calculating_urgency()</div>
                    <div className="text-white bg-red-600 px-3 py-1.5 rounded inline-block font-bold mt-2 shadow-[0_0_15px_rgba(220,38,38,0.5)]">Severity: 9.9 CRITICAL</div>
                </div>
            </div>

            {/* GPS Tracking */}
            <div className="bg-dark-gray text-white p-10 flex flex-col transition-all duration-300 hover:shadow-2xl relative overflow-hidden group">
                <h3 className="text-4xl font-anton uppercase mb-4 z-10 relative">Live GPS Lock</h3>
                <p className="text-lg opacity-70 mb-auto z-10 relative">Browser-based haversine location sharing. Zero app installation.</p>

                <div className="absolute -bottom-5 -right-5 w-64 h-64 border border-yellow/20 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform duration-500">
                    <div className="w-48 h-48 border border-yellow/40 rounded-full flex items-center justify-center animate-[spin_10s_linear_infinite]">
                        <div className="w-24 h-24 bg-yellow/10 rounded-full backdrop-blur-md border border-yellow flex items-center justify-center shadow-[0_0_20px_rgba(255,225,124,0.2)]">
                            <FingerprintIcon size={40} className="text-yellow" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Security */}
            <div className="lg:col-span-2 bg-yellow text-charcoal p-10 flex flex-col justify-center transition-all duration-300 hover:shadow-2xl brutalist-grid overflow-hidden relative">
                <div className="z-10 relative">
                    <h3 className="text-5xl md:text-7xl font-anton uppercase mb-4">Military-Grade Tunnel</h3>
                    <p className="text-xl font-bold opacity-80 max-w-md">End-to-End Encryption backed by industry-leading providers natively built into the protocol framework.</p>
                </div>
                <div className="absolute top-0 right-0 w-1/2 h-full bg-linear-to-l from-white/10 to-transparent flex items-center justify-end pr-10 border-l border-white/20">
                   <Settings className="text-charcoal/10 animate-[spin_20s_linear_infinite]" size={250} strokeWidth={1} />
                </div>
            </div>
        </div>
      </section>



      {/* 5. HOW IT WORKS */}
      <section className="w-full bg-(--foreground) text-(--background) py-24 md:py-48 px-6 md:px-12 border-y border-charcoal/10">
         <div className="max-w-[1600px] mx-auto flex flex-col lg:flex-row gap-20">
            {/* Sticky Header */}
            <div className="lg:w-1/3">
                <div className="sticky top-32">
                    <h2 className="text-7xl md:text-8xl font-anton uppercase leading-[0.9] mb-8 text-(--background)">
                        Action <br/> Protocol
                    </h2>
                    <p className="text-xl font-medium opacity-60">Three systematic steps to neutralizing chaos and orchestrating flawless emergency operations.</p>
                </div>
            </div>

            {/* Steps Stack */}
            <div className="lg:w-2/3 flex flex-col gap-32">
                {[
                    {num: '01', title: 'Submit Sitrep', desc: 'Reporters scan a QR code or tap a link to instantly open the field gateway. No app downloads required. Ever.'},
                    {num: '02', title: 'AI Triage', desc: 'The Command Center receives a sanitized, prioritized alert complete with real-time GPS coordinates and context.'},
                    {num: '03', title: 'Dispatch & Resolve', desc: 'Responders accept the ticket, lock their GPS to the live map, and physically secure the location.'}
                ].map((step, i) => (
                   <div key={i} className="flex flex-col md:flex-row gap-8 md:gap-16 group cursor-default items-start">
                       <span className="text-[120px] md:text-[180px] font-anton text-(--background) opacity-20 group-hover:opacity-100 group-hover:text-yellow transition-all duration-500 leading-none -mt-4 md:-mt-10">
                           {step.num}
                       </span>
                       <div className="pt-4 flex-1">
                           <h3 className="text-4xl md:text-6xl font-anton uppercase mb-6 text-(--background)">{step.title}</h3>
                           <p className="text-xl md:text-2xl font-medium opacity-70 max-w-xl leading-relaxed">{step.desc}</p>
                       </div>
                   </div> 
                ))}
            </div>
         </div>
      </section>

      {/* 6. FINAL CTA */}
      <section className="relative w-full py-48 flex flex-col items-center justify-center overflow-hidden bg-yellow">
        {/* Massive Overlay Text */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex whitespace-nowrap overflow-hidden z-0 pointer-events-none opacity-[0.05]">
             <span className="text-[200px] md:text-[350px] font-anton uppercase leading-none text-charcoal">COMMUNITY PULSE </span>
             <span className="text-[200px] md:text-[350px] font-anton uppercase leading-none text-charcoal ml-10">COMMUNITY PULSE</span>
        </div>

        <div className="relative z-10 flex flex-col items-center px-6 w-full">
            <h2 className="text-7xl md:text-8xl lg:text-[130px] font-anton uppercase text-charcoal leading-[0.8] mb-8 drop-shadow-sm text-center">
                INITIATE
            </h2>
            <p className="text-xl md:text-3xl font-bold text-charcoal/60 max-w-2xl text-center mb-12 tracking-wide">
                The Field Is Waiting. Secure the perimeter.
            </p>

            <div className="flex flex-col sm:flex-row gap-6 items-center justify-center w-full max-w-2xl">
                <Link href="/login" className="w-full sm:w-1/2 bg-charcoal text-white px-12 py-6 rounded-2xl font-anton text-2xl uppercase tracking-widest hover:bg-black active:scale-95 transition-all text-center shadow-2xl">
                    Sign In
                </Link>
                <Link href="/signup" className="w-full sm:w-1/2 bg-white text-charcoal px-12 py-6 rounded-2xl font-anton text-2xl uppercase tracking-widest hover:bg-[#f8f8f8] active:scale-95 transition-all text-center shadow-2xl border-2 border-charcoal">
                    Join Network
                </Link>
            </div>
        </div>
      </section>
    </main>
  );
}

