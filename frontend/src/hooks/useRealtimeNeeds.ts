'use client';

import { useEffect, useState } from 'react';
import { rtdb } from '@/lib/firebase';
import { ref, onValue, query } from 'firebase/database';
import * as Sentry from '@sentry/nextjs';

export interface ConversationEntry {
  role: "user" | "assistant";
  text: string;
  timestamp: number;
}

export interface Need {
  id: string;
  raw_text: string;
  need_type: string;
  location_name: string;
  lat: number | null;
  lng: number | null;
  people_affected: number | null;
  urgency_score: number;
  emotional_signal: string;
  status: string;
  phone: string | null;
  created_at: number;
  source?: string;
  reporter_name?: string;
  recording_url?: string;
  sentiment?: string;
  tactical_assessment?: string;
  life_threat?: boolean;
  reporter_email?: string;
  ai_heading?: string | null;
  caller_phone?: string;
  category?: string;
  webrtc_conversation?: ConversationEntry[];
  webrtc_json?: Record<string, unknown>;
  image_url?: string;
  visual_severity?: string;
  visual_hazards?: string[];
  is_major_incident?: boolean;
  parent_incident_id?: string;
  child_reports_count?: number;
  sla_escalated?: boolean;
}

export function useRealtimeNeeds() {
  const [needs, setNeeds] = useState<Need[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const needsRef = ref(rtdb, 'needs');
    // Sort by key (which is a push ID, usually chronological)
    const q = query(needsRef);
    
    const unsubscribe = onValue(q, (snapshot) => {
      const needsData: Need[] = [];
      snapshot.forEach((childSnapshot) => {
        needsData.push({ 
          id: childSnapshot.key, 
          ...childSnapshot.val() 
        } as Need);
      });
      // Sort desc (newest first)
      needsData.reverse();
      setNeeds(needsData);
      setLoading(false);
    }, (error) => {
      console.error("Error listening to needs:", error);
      Sentry.captureException(error, {
        tags: {
          listener: 'incident_realtime_listener'
        }
      });
      setLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return { needs, loading, refresh: () => {} };
}
