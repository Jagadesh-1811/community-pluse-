'use client';

import { useEffect, useState } from 'react';
import { rtdb } from '@/lib/firebase';
import { ref, onValue, query } from 'firebase/database';

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
      setLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return { needs, loading, refresh: () => {} };
}
