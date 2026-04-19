'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

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

  const fetchNeeds = async () => {
    const { data, error } = await supabase
      .from('needs')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (!error && data) {
      setNeeds(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchNeeds();

    // 2. Realtime Listener
    const channel = supabase
      .channel('public:needs')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'needs' },
        (payload) => {
          setNeeds((prev) => [payload.new as Need, ...prev]);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'needs' },
        (payload) => {
          setNeeds((prev) =>
            prev.map((item) => (item.id === payload.new.id ? (payload.new as Need) : item))
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { needs, loading, refresh: fetchNeeds };
}
