'use client';

import { useState } from 'react';

import { X, Send, Heart, Phone, MapPin, Target } from 'lucide-react';
import { cn } from '@/lib/utils';

interface IntakeFormProps {
    pickedLocation?: { lat: number; lng: number } | null;
    onPickModeToggle?: (active: boolean) => void;
    onClose?: () => void;
    onRefresh?: (needId?: string) => void;
    localCoords?: { lat: number; lng: number } | null;
    setLocalCoords?: (coords: { lat: number; lng: number } | null) => void;
}

export default function IntakeForm({ pickedLocation, onPickModeToggle, onClose, onRefresh, localCoords, setLocalCoords }: IntakeFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [report, setReport] = useState('');
  const [phone, setPhone] = useState('');
  const [internalLocalCoords, setInternalLocalCoords] = useState<{ lat: number; lng: number } | null>(null);
  
  const activeLocalCoords = localCoords !== undefined ? localCoords : internalLocalCoords;
  const updateLocalCoords = setLocalCoords || setInternalLocalCoords;

  const activeCoords = pickedLocation || activeLocalCoords;

  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
        alert("Geolocation is not supported by your browser");
        return;
    }
    
    navigator.geolocation.getCurrentPosition(
        (position) => {
            updateLocalCoords({
                lat: position.coords.latitude,
                lng: position.coords.longitude
            });
        },
        (error) => {
            let errorMsg = "Unable to retrieve your exact location. ";
            if (error.code === 1) errorMsg += "Permission denied. Please allow location access in your browser.";
            if (error.code === 2) errorMsg += "Position unavailable (No hardware/network available).";
            if (error.code === 3) errorMsg += "The request strictly timed out.";
            alert(errorMsg);
        },
        { 
            enableHighAccuracy: true, 
            timeout: 10000, 
            maximumAge: 0 
        }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const response = await fetch('http://localhost:8001/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: report,
          source: 'web',
          phone: phone || null,
          lat: activeCoords?.lat || null,
          lng: activeCoords?.lng || null
        }),
      });

      if (response.ok) {
        const result = await response.json();
        const needId = result?.data?.id;
        setReport('');
        setPhone('');
        updateLocalCoords(null);
        if (onPickModeToggle) onPickModeToggle(false);
        if (onRefresh) onRefresh(needId);
        if (onClose) onClose();
      }
    } catch (error) {
      console.error('Failed to submit report:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-[400px] glass-dark border-r border-white/10 p-10 overflow-hidden shadow-2xl">
      <div className="flex justify-between items-center mb-10">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-emergency rounded-2xl shadow-lg shadow-emergency/20">
            <Heart className="text-white fill-current" size={24} />
          </div>
          <div>
            <h3 className="text-xl font-black text-white uppercase tracking-tighter">Transmit Need</h3>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest pl-0.5">Ground Intelligence</p>
          </div>
        </div>
        <button 
          onClick={onClose} 
          className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl transition-all text-slate-400 hover:text-white"
        >
          <X size={20} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 space-y-8 overflow-y-auto pr-2 custom-scrollbar">
          <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-1">Describe the Situation</label>
              <textarea
                  required
                  value={report}
                  onChange={(e) => setReport(e.target.value)}
                  placeholder="e.g. 50 people need water in Sector 7..."
                  className="w-full bg-white/5 border border-white/10 rounded-3xl p-6 text-white placeholder:text-slate-600 focus:outline-none focus:border-emergency/50 min-h-[160px] transition-all resize-none leading-relaxed"
              />
          </div>

          <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-1">Your Contact Profile</label>
              <div className="relative">
                  <Phone className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                  <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+91..."
                      className="w-full bg-white/5 border border-white/10 rounded-2xl py-5 pl-14 pr-6 text-white text-sm focus:outline-none focus:border-primary/50"
                  />
              </div>
          </div>

          <div className="space-y-4">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-1">Geospatial Tagging</label>
              <div className="grid grid-cols-2 gap-4">
                  <button
                      type="button"
                      onClick={handleDetectLocation}
                      className={cn(
                          "flex flex-col items-center justify-center gap-3 py-6 rounded-[2rem] border border-white/10 transition-all group",
                          activeLocalCoords ? "bg-primary/20 border-primary/50 text-white" : "bg-white/5 text-slate-500 hover:bg-white/10"
                      )}
                  >
                      <MapPin size={24} className={cn(activeLocalCoords ? "text-primary" : "group-hover:scale-110 transition-transform")} />
                      <span className="text-[10px] font-bold uppercase tracking-widest">{activeLocalCoords ? "GPS Active" : "Detect GPS"}</span>
                  </button>
                  <button
                      type="button"
                      onClick={() => onPickModeToggle?.(true)}
                      className={cn(
                          "flex flex-col items-center justify-center gap-3 py-6 rounded-[2rem] border border-white/10 transition-all group",
                          pickedLocation ? "bg-emergency/20 border-emergency/50 text-white" : "bg-white/5 text-slate-500 hover:bg-white/10"
                      )}
                  >
                      <Target size={24} className={cn(pickedLocation ? "text-emergency" : "group-hover:scale-110 transition-transform")} />
                      <span className="text-[10px] font-bold uppercase tracking-widest">{pickedLocation ? "Point Saved" : "Pick on Map"}</span>
                  </button>
              </div>
              {activeCoords && (
                  <div className="p-4 bg-white/5 rounded-2xl border border-white/5 text-center">
                    <p className="text-[10px] text-slate-500 font-mono uppercase tracking-tighter">
                        Lat: {activeCoords.lat.toFixed(6)} | Lng: {activeCoords.lng.toFixed(6)}
                    </p>
                  </div>
              )}
          </div>

          <button
              disabled={isSubmitting}
              className={cn(
                  "w-full py-6 bg-gradient-to-r from-emergency to-orange-600 text-white font-black rounded-3xl uppercase tracking-widest text-sm flex items-center justify-center gap-3 transition-all mt-6 shadow-2xl shadow-emergency/20",
                  isSubmitting ? "opacity-50 cursor-not-allowed" : "hover:brightness-110 active:scale-[0.98]"
              )}
          >
              {isSubmitting ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                  <>
                      <Send size={20} />
                      Broadcast Intelligence
                  </>
              )}
          </button>
      </form>
    </div>
  );
}
