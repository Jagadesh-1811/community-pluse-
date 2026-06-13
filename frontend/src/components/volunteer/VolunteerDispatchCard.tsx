'use client';

import { useEffect, useState } from 'react';
import { ref, onValue, off } from 'firebase/database';
import { rtdb } from '@/lib/firebase';
import { cn } from '@/lib/utils';

interface Incident {
  id: string;
  category: string;
  summary: string;
  urgency_score: number;
  message: string;
  status: 'open' | 'accepted' | 'resolved';
  accepted_by?: string;
  accepted_by_name?: string;
  accepted_at?: number;
}

interface Volunteer {
  id: string;
  name: string;
}

interface DispatchCardProps {
  incidentId: string;
  currentVolunteer: Volunteer;
  onAcceptSuccess?: () => void;
  onAcceptFailure?: (errorMsg: string) => void;
}

export default function VolunteerDispatchCard({
  incidentId,
  currentVolunteer,
  onAcceptSuccess,
  onAcceptFailure,
}: DispatchCardProps) {
  const [incident, setIncident] = useState<Incident | null>(null);
  const [isAccepting, setIsAccepting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  useEffect(() => {
    if (!rtdb) return;
    const incidentRef = ref(rtdb, `incidents/${incidentId}`);

    onValue(incidentRef, (snapshot) => {
      if (snapshot.exists()) {
        setIncident({ id: incidentId, ...snapshot.val() });
      }
    });

    return () => {
      off(incidentRef);
    };
  }, [incidentId]);

  const handleAcceptMission = async () => {
    setIsAccepting(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`${apiBaseUrl}/incidents/${incidentId}/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          volunteer_id: currentVolunteer.id,
          volunteer_name: currentVolunteer.name,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Failed to accept mission.');
      }

      if (onAcceptSuccess) onAcceptSuccess();
    } catch (err: any) {
      setErrorMessage(err.message);
      if (onAcceptFailure) onAcceptFailure(err.message);
      setIsAccepting(false);
    }
  };

  if (!incident) {
    return (
      <div className="w-full bg-[#030303] border border-white/10 rounded-2xl p-6 animate-pulse text-white/50 text-xs font-mono">
        LOADING DISPATCH METRIC...
      </div>
    );
  }

  const isAcceptedByMe = incident.status === 'accepted' && incident.accepted_by === currentVolunteer.id;
  const isAcceptedByOther = incident.status === 'accepted' && incident.accepted_by !== currentVolunteer.id;
  
  return (
    <div className="w-full bg-[#050505] border border-white/5 rounded-2xl p-6 shadow-2xl relative overflow-hidden transition-all duration-300">
      <div 
        className={cn(
          "absolute top-0 left-0 w-full h-[3px]",
          incident.urgency_score >= 8 ? "bg-[#FF4D00]" : incident.urgency_score >= 5 ? "bg-orange-500" : "bg-emerald-500"
        )}
      />

      <div className="flex justify-between items-center mb-4 mt-2">
        <span className="text-[10px] font-black uppercase tracking-widest text-white/40 font-mono">
          Sector {incident.category ? incident.category.toUpperCase() : 'GENERAL'}
        </span>
        <span 
          className={cn(
            "text-xs px-2.5 py-0.5 rounded-full font-black font-mono",
            incident.urgency_score >= 8 ? "bg-[#FF4D00]/10 text-[#FF4D00]" : "bg-orange-500/10 text-orange-500"
          )}
        >
          PRIORITY {incident.urgency_score}/10
        </span>
      </div>

      <h3 className="text-lg font-black text-white leading-tight mb-2 tracking-tight">
        {incident.summary}
      </h3>
      <p className="text-xs text-white/60 mb-6 line-clamp-3 leading-relaxed font-sans">
        {incident.message}
      </p>

      <div className="mt-4">
        {isAcceptedByMe ? (
          <div className="w-full bg-emerald-950/20 border border-emerald-500/30 text-emerald-400 rounded-xl p-4 flex items-center justify-center gap-3">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-xs font-black uppercase tracking-widest font-mono">
              You accepted this mission
            </span>
          </div>
        ) : isAcceptedByOther ? (
          <div className="w-full bg-orange-950/25 border border-orange-500/20 text-orange-400 rounded-xl p-4 flex items-center justify-center gap-3">
            <span className="text-xs font-black uppercase tracking-widest font-mono text-center">
              Accepted by {incident.accepted_by_name}
            </span>
          </div>
        ) : (
          <button
            onClick={handleAcceptMission}
            disabled={isAccepting}
            className={cn(
              "w-full py-3.5 rounded-xl font-black uppercase tracking-widest text-xs font-mono transition-all duration-300",
              isAccepting 
                ? "bg-white/5 border border-white/10 text-white/30 cursor-not-allowed" 
                : "bg-white text-black hover:bg-neutral-200 border border-white active:scale-95 shadow-[0_4px_20px_rgba(255,255,255,0.1)]"
            )}
          >
            {isAccepting ? 'ACQUIRING DISPATCH LOCK...' : 'ACCEPT MISSION'}
          </button>
        )}
      </div>

      {errorMessage && (
        <div className="mt-3 text-[10px] text-red-500 font-mono text-center">
          ⚠️ CONFLICT: {errorMessage.toUpperCase()}
        </div>
      )}
    </div>
  );
}
