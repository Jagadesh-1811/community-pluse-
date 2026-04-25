'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { ArrowLeft, Shield, LogOut } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import IntakeForm from '@/components/intake/IntakeForm';
import StatusTracker from '@/components/status/StatusTracker';
import ChatPanel from '@/components/chat/ChatPanel';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';






const FieldMap = dynamic(() => import('@/components/map/FieldMap'), { ssr: false });

export default function FieldIntakePage() {
  const { user, role, loading: authLoading, signOut } = useAuth();
  const router = useRouter();

  // AUTH PROTECTION
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    } else if (!authLoading && user && role === 'VOLUNTEER') {
      router.push('/volunteer');
    }
  }, [user, role, authLoading, router]);





  const [localCoords, setLocalCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [submittedNeedId, setSubmittedNeedId] = useState<string | null>(null);
  const [volunteerCoords, setVolunteerCoords] = useState<{ lat: number; lng: number } | null>(null);

  if (authLoading || !user || role !== 'REPORTER') {
    return (
        <div className="fixed inset-0 z-200 bg-(--background) brutalist-grid flex flex-col items-center justify-center gap-10">
            <div className="relative animate-pulse">
                <div className="absolute inset-x-[-10px] inset-y-[10px] bg-yellow -rotate-3 scale-105 z-[-1]"></div>
                <div className="p-8 bg-(--background) border border-(--border-color) shadow-2xl relative z-10 glass">
                  <Shield className="text-yellow" size={80} />
                </div>
            </div>
            <p className="text-sm font-black uppercase tracking-[0.3em] text-(--foreground) font-roboto">Verifying Permissions...</p>
        </div>
    );
  }


  return (
    <main className="min-h-screen bg-(--background) flex flex-col md:flex-row overflow-hidden font-roboto -mt-20 pt-20">
      {/* 
        Left Panel: Intake Form + Post-Submission Status Hub
      */}
      <div className="w-full md:w-[450px] shrink-0 z-10 glass border-r border-(--border-color) shadow-2xl relative overflow-y-auto">
        {!submittedNeedId ? (
          <IntakeForm 
            localCoords={localCoords}
            setLocalCoords={setLocalCoords}
            onRefresh={(needId?: string) => {
              if (needId) {
                setSubmittedNeedId(needId);
              } else {
                setLocalCoords(null);
              }
            }}
          />
        ) : (
          /* Post-Submission: Status Tracker + Chat + Volunteer Info */
          <div className="flex flex-col h-full p-8 gap-6">
            {/* Header */}
            <div className="flex items-center gap-4 mb-2">
                <button 
                    onClick={() => { setSubmittedNeedId(null); setLocalCoords(null); }}
                    className="p-3 bg-(--foreground)/5 hover:bg-(--foreground)/10 rounded-2xl transition-all text-(--foreground)"
                >
                    <ArrowLeft size={20} />
                </button>
                <div className="flex items-center gap-3 flex-1">
                    <div className="p-2.5 bg-yellow rounded-xl border border-black/10 shadow-lg">
                        <Shield className="text-black" size={20} />
                    </div>
                    <div>
                        <h3 className="text-2xl font-anton text-(--foreground) uppercase tracking-wide">Mission Control</h3>
                        <p className="text-[10px] text-(--foreground) font-bold uppercase tracking-widest">Report #{submittedNeedId.slice(0, 8)}</p>
                    </div>
                </div>

                <button 
                    onClick={() => signOut()}
                    className="p-3 bg-white/5 hover:bg-emergency/10 rounded-2xl transition-all text-sage hover:text-emergency"
                    title="Terminate Session"
                >
                    <LogOut size={18} />
                </button>
            </div>

            {/* Status Tracker */}
            <StatusTracker 
              needId={submittedNeedId} 
              onVolunteerLocationUpdate={setVolunteerCoords}
            />

            {/* Chat Panel */}
            <div className="flex-1 min-h-[300px]">
                <ChatPanel needId={submittedNeedId} role="reporter" />
            </div>
          </div>
        )}
      </div>

      {/* 
        Right Panel: GPS Map
      */}
      <div className="flex-1 relative bg-(--background) hidden md:block brutalist-grid">
        <div className="absolute inset-0 z-0 opacity-50 bg-[radial-gradient(ellipse_at_center,var(--tw-gradient-stops))] from-yellow/10 via-transparent to-(--background)"></div>
        <div className="absolute inset-6 z-10 glass p-0! rounded-4xl overflow-hidden">
            <FieldMap location={localCoords} volunteerLocation={volunteerCoords} />
        </div>
      </div>

      {/* Mobile Map Preview */}
      {localCoords && (
        <div className="fixed inset-x-4 top-4 h-48 z-0 md:hidden rounded-3xl overflow-hidden shadow-2xl">
           <FieldMap location={localCoords} volunteerLocation={volunteerCoords} />
        </div>
      )}
    </main>
  );
}

