'use client';

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';

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
  created_at: string;
}

export function useRealtimeNeeds() {
  const [needs, setNeeds] = useState<Need[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'needs'), orderBy('created_at', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const needsData: Need[] = [];
      snapshot.forEach((doc) => {
        needsData.push({ id: doc.id, ...doc.data() } as Need);
      });
      setNeeds(needsData);
      setLoading(false);
    }, (error) => {
      console.error("Error listening to needs:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return { needs, loading, refresh: () => {} };
}
