'use client';

import { useEffect, useState } from 'react';
import { rtdb } from '@/lib/firebase';
import { ref, onValue, query } from 'firebase/database';
import * as Sentry from '@sentry/nextjs';

export interface ConversationEntry {
  role: 'user' | 'assistant';
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
  video_recommendations?: {
    category: string;
    primary: {
      title: string;
      youtube_id: string;
      description: string;
    };
    alternatives: Array<{
      title: string;
      youtube_id: string;
      description: string;
    }>;
  };
}

export function useRealtimeNeeds() {
  const [needs, setNeeds] = useState<Need[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const needsRef = ref(rtdb, 'needs');
    // Sort by key (which is a push ID, usually chronological)
    const q = query(needsRef);

    const unsubscribe = onValue(
      q,
      (snapshot) => {
        const needsData: Need[] = [];
        snapshot.forEach((childSnapshot) => {
          const data = {
            id: childSnapshot.key,
            ...childSnapshot.val(),
          } as Need;

          // Sanitize coordinates: if not finite, set to null
          if (!Number.isFinite(data.lat)) {
            data.lat = null;
          }
          if (!Number.isFinite(data.lng)) {
            data.lng = null;
          }
          // Also sanitize urgency_score and people_affected
          if (!Number.isFinite(data.urgency_score)) {
            data.urgency_score = 5; // default
          }
          if (!Number.isFinite(data.people_affected)) {
            data.people_affected = null;
          }

          needsData.push(data);
        });
        // Sort desc (newest first)
        needsData.reverse();
        setNeeds(needsData);
        setLoading(false);
      },
      (error) => {
        console.error('Error listening to needs:', error);
        Sentry.captureException(error, {
          tags: {
            listener: 'incident_realtime_listener',
          },
        });
        setLoading(false);
      },
    );

    return () => {
      unsubscribe();
    };
  }, []);

  return { needs, loading, refresh: () => {} };
}
