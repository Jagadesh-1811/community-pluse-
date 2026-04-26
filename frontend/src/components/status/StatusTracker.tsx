'use client';

import { useEffect, useState } from 'react';
import { rtdb } from '@/lib/firebase';
import { ref, onValue, get } from 'firebase/database';
import { cn } from '@/lib/utils';
import { CheckCircle2, Truck, Clock, ShieldCheck } from 'lucide-react';
interface StatusTrackerProps {
    needId: string | null;
    onVolunteerLocationUpdate?: (loc: { lat: number; lng: number }) => void;
}

const toFiniteCoordinate = (value: unknown): number | null => {
    const parsed = typeof value === 'string' ? Number(value) : value;
    return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null;
};

const STAGES = [
    { key: 'open', label: 'Processing', sublabel: 'System AI Intake', icon: Clock },
    { key: 'in-progress', label: 'Dispatched', sublabel: 'Volunteer En Route', icon: Truck },
    { key: 'resolved', label: 'Resolved', sublabel: 'Mission Completed', icon: ShieldCheck }
];
export default function StatusTracker({ needId, onVolunteerLocationUpdate }: StatusTrackerProps) {
    const [status, setStatus] = useState('open');

    useEffect(() => {
        if (!needId) return;

        const needRef = ref(rtdb, `needs/${needId}`);

        const publishVolunteerLocation = (data: Record<string, unknown>) => {
            if (!onVolunteerLocationUpdate) return;

            const lat = toFiniteCoordinate(data.volunteer_lat);
            const lng = toFiniteCoordinate(data.volunteer_lng);

            if (lat !== null && lng !== null) {
                onVolunteerLocationUpdate({ lat, lng });
            }
        };

        // Fetch initial status and location
        const fetchNeedData = async () => {
            const snapshot = await get(needRef);
            if (snapshot.exists()) {
                const data = snapshot.val();
                setStatus(data.status);
                publishVolunteerLocation(data);
            }
        };
        fetchNeedData();

        // Listen for realtime updates on this specific need
        const unsubscribe = onValue(needRef, (snapshot) => {
            if (snapshot.exists()) {
                const newData = snapshot.val();
                setStatus(newData.status);

                publishVolunteerLocation(newData);
            }
        });

        return () => unsubscribe();
    }, [needId, onVolunteerLocationUpdate]);

    const currentIndex = STAGES.findIndex(s => s.key === status);

    return (
        <div className="w-full bg-(--card-bg) rounded-[2.5rem] border border-(--border-color) p-8 backdrop-blur-sm">
            <h3 className="text-xs font-black text-(--foreground) uppercase tracking-widest mb-8 flex items-center gap-2">
                <CheckCircle2 size={14} className="text-yellow" /> Dispatch Status Tracker
            </h3>

            {/* Progress Bar */}
            <div className="relative mb-8">
                <div className="absolute top-5 left-0 right-0 h-1 bg-(--foreground)/5 rounded-full" />
                <div 
                    className="absolute top-5 left-0 h-1 bg-linear-to-r from-primary via-orange-400 to-emerald-400 rounded-full transition-all duration-1000 ease-out"
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
                                    isCurrent ? "bg-(--foreground)/10 border-(--foreground) scale-110 shadow-[0_0_20px_var(--color-primary-glow)]" :
                                    isActive ? "bg-(--foreground)/10 border-emerald-400/50" : "bg-(--background) border-(--border-color)"
                                )}>
                                    <Icon size={18} className={cn(
                                        "transition-colors duration-500",
                                        isCurrent ? "text-(--foreground)" : isActive ? "text-emerald-400" : "text-(--foreground)"
                                    )} />
                                </div>
                                <div className="text-center">
                                    <p className={cn(
                                        "text-[11px] font-black uppercase tracking-wider transition-colors",
                                        isCurrent ? "text-(--foreground)" : isActive ? "text-emerald-500" : "text-(--foreground)"
                                    )}>{stage.label}</p>
                                    <p className={cn(
                                        "text-[9px] font-medium mt-0.5 transition-colors",
                                        isCurrent ? "text-(--foreground)" : "text-(--foreground)"
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
                status === 'open' ? "bg-(--foreground)/5 border-(--border-color)" :
                status === 'in-progress' ? "bg-orange-500/10 border-orange-500/20" :
                "bg-emerald-500/10 border-emerald-500/20"
            )}>
                <div className={cn(
                    "w-2.5 h-2.5 rounded-full animate-pulse",
                    status === 'open' ? "bg-(--foreground)" :
                    status === 'in-progress' ? "bg-orange-400" : "bg-emerald-400"
                )} />
                <span className={cn(
                    "text-xs font-black uppercase tracking-widest",
                    status === 'open' ? "text-(--foreground)" :
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
