'use client';

import { useEffect, useState } from 'react';
import { ref, onValue } from 'firebase/database';
import { rtdb } from '@/lib/firebase';

export default function SyncStatusBanner() {
  const [isOnline, setIsOnline] = useState(true);
  const [lastSyncedTime, setLastSyncedTime] = useState<string>('');

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Watch the special Firebase RTDB connection status node
    if (rtdb) {
      const connectedRef = ref(rtdb, '.info/connected');
      onValue(connectedRef, (snap) => {
        const connected = snap.val();
        if (connected) {
          setIsOnline(true);
          setLastSyncedTime(new Date().toLocaleTimeString());
        } else {
          setIsOnline(false);
        }
      });
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <div className="w-full bg-[#050505] border-t border-neutral-900 px-6 py-3 flex justify-between items-center text-[10px] font-mono uppercase tracking-widest text-neutral-500">
      <div className="flex items-center gap-2">
        <span
          className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`}
        ></span>
        {isOnline ? 'Database Connected' : 'Disconnected — Running Offline Mode'}
      </div>
      <div>
        {isOnline
          ? `Synced ${lastSyncedTime || 'Live'}`
          : `Last synced ${lastSyncedTime || 'Recently'} — offline mode`}
      </div>
    </div>
  );
}
