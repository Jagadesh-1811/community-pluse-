'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { CheckCircle2, Truck, Clock, ShieldCheck } from 'lucide-react';

interface StatusTrackerProps {
    needId: string;
    onVolunteerLocationUpdate?: (location: { lat: number; lng: number } | null) => void;
}

const STAGES = [
    { key: 'open', label: 'Report Filed', sublabel: 'Awaiting response', icon: Clock, color: 'text-slate-400' },
    { key: 'in-progress', label: 'Dispatched', sublabel: 'Volunteer en route', icon: Truck, color: 'text-orange-400' },
    { key: 'resolved', label: 'Resolved', sublabel: 'Mission complete', icon: ShieldCheck, color: 'text-emerald-400' },
];

export default function StatusTracker({ needId, onVolunteerLocationUpdate }: StatusTrackerProps) {
    const [status, setStatus] = useState('open');

    useEffect(() => {
        // Fetch initial status and location
        const fetchNeedData = async () => {
            const { data } = await supabase
                .from('needs')
                .select('status, volunteer_lat, volunteer_lng')
                .eq('id', needId)
                .single();
            if (data) {
                setStatus(data.status);
                if (data.volunteer_lat && data.volunteer_lng && onVolunteerLocationUpdate) {
                    onVolunteerLocationUpdate({ lat: data.volunteer_lat, lng: data.volunteer_lng });
                }
            }
        };
        fetchNeedData();

        // Listen for realtime updates on this specific need
        const channel = supabase
            .channel(`need-updates-${needId}`)
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'needs', filter: `id=eq.${needId}` },
                (payload) => {
                    const newData = payload.new as any;
                    setStatus(newData.status);
                    
                    if (newData.volunteer_lat && newData.volunteer_lng && onVolunteerLocationUpdate) {
                        onVolunteerLocationUpdate({ lat: newData.volunteer_lat, lng: newData.volunteer_lng });
                    }
                }
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [needId, onVolunteerLocationUpdate]);

    const currentIndex = STAGES.findIndex(s => s.key === status);

    return (
        <div className="w-full bg-white/5 rounded-[2.5rem] border border-white/10 p-8 backdrop-blur-sm">
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-8 flex items-center gap-2">
                <CheckCircle2 size={14} className="text-primary" /> Dispatch Status Tracker
            </h3>

            {/* Progress Bar */}
            <div className="relative mb-8">
                <div className="absolute top-5 left-0 right-0 h-1 bg-white/5 rounded-full" />
                <div 
                    className="absolute top-5 left-0 h-1 bg-gradient-to-r from-primary via-orange-400 to-emerald-400 rounded-full transition-all duration-1000 ease-out"
                    style={{ width: `${((currentIndex) / (STAGES.length - 1)) * 100}%` }}
                />
                <div className="relative flex justify-between">
                    {STAGES.map((stage, idx) => {
                        const isActive = idx <= currentIndex;
                        const isCurrent = idx === currentIndex;
                        const Icon = stage.icon;
                        return (
                            <div key={stage.key} className="flex flex-col items-center gap-3 z-10">
                                <div className={cn(
                                    "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-500",
                                    isCurrent ? "bg-white/10 border-white scale-110 shadow-[0_0_20px_rgba(255,255,255,0.15)]" :
                                    isActive ? "bg-white/10 border-emerald-400/50" : "bg-white/5 border-white/10"
                                )}>
                                    <Icon size={18} className={cn(
                                        "transition-colors duration-500",
                                        isCurrent ? "text-white" : isActive ? "text-emerald-400" : "text-slate-600"
                                    )} />
                                </div>
                                <div className="text-center">
                                    <p className={cn(
                                        "text-[11px] font-black uppercase tracking-wider transition-colors",
                                        isCurrent ? "text-white" : isActive ? "text-slate-300" : "text-slate-600"
                                    )}>{stage.label}</p>
                                    <p className={cn(
                                        "text-[9px] font-medium mt-0.5 transition-colors",
                                        isCurrent ? "text-slate-400" : "text-slate-700"
                                    )}>{stage.sublabel}</p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Live Status Badge */}
            <div className={cn(
                "flex items-center justify-center gap-3 py-4 rounded-2xl border transition-all duration-500",
                status === 'open' ? "bg-slate-800/50 border-slate-700/50" :
                status === 'in-progress' ? "bg-orange-500/10 border-orange-500/20" :
                "bg-emerald-500/10 border-emerald-500/20"
            )}>
                <div className={cn(
                    "w-2.5 h-2.5 rounded-full animate-pulse",
                    status === 'open' ? "bg-slate-400" :
                    status === 'in-progress' ? "bg-orange-400" : "bg-emerald-400"
                )} />
                <span className={cn(
                    "text-xs font-black uppercase tracking-widest",
                    status === 'open' ? "text-slate-400" :
                    status === 'in-progress' ? "text-orange-400" : "text-emerald-400"
                )}>
                    {status === 'open' ? 'Waiting for Volunteer...' :
                     status === 'in-progress' ? 'Volunteer Dispatched — Help is on the way!' :
                     'Mission Resolved ✓'}
                </span>
            </div>
        </div>
    );
}
