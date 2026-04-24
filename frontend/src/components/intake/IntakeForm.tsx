"use client";

import { useState } from "react";
import { X, Send, Heart, Phone, MapPin, Target, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  reverseGeocode,
  isAccuracyAcceptable,
  getAccuracyDescription,
} from "@/lib/geolocation-utils";

interface IntakeFormProps {
  pickedLocation?: { lat: number; lng: number } | null;
  onPickModeToggle?: (active: boolean) => void;
  onClose?: () => void;
  onRefresh?: (needId?: string) => void;
  localCoords?: { lat: number; lng: number } | null;
  setLocalCoords?: (coords: { lat: number; lng: number } | null) => void;
}

export default function IntakeForm({
  pickedLocation,
  onPickModeToggle,
  onClose,
  onRefresh,
  localCoords,
  setLocalCoords,
}: IntakeFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [report, setReport] = useState("");
  const [phone, setPhone] = useState("");
  const [internalLocalCoords, setInternalLocalCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [locationAddress, setLocationAddress] = useState<string | null>(null);
  const [isGeocodingAddress, setIsGeocodingAddress] = useState(false);
  const [locationAccuracy, setLocationAccuracy] = useState<
    number | undefined
  >();

  const activeLocalCoords =
    localCoords !== undefined ? localCoords : internalLocalCoords;
  const updateLocalCoords = setLocalCoords || setInternalLocalCoords;

  const activeCoords = pickedLocation || activeLocalCoords;

  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const coords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setLocationAccuracy(position.coords.accuracy);
        updateLocalCoords(coords);

        // Reverse geocode to get address
        setIsGeocodingAddress(true);
        const geocoded = await reverseGeocode(coords.lat, coords.lng);
        setLocationAddress(geocoded.address);
        setIsGeocodingAddress(false);
      },
      (error) => {
        let errorMsg = "Unable to retrieve your exact location. ";
        if (error.code === 1)
          errorMsg +=
            "Permission denied. Please allow location access in your browser.";
        if (error.code === 2)
          errorMsg += "Position unavailable (No hardware/network available).";
        if (error.code === 3) errorMsg += "The request strictly timed out.";
        alert(errorMsg);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      },
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await fetch("http://localhost:8001/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: report,
          source: "web",
          phone: phone || null,
          lat: activeCoords?.lat || null,
          lng: activeCoords?.lng || null,
          location_address: locationAddress || null,
          location_accuracy: locationAccuracy || null,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        const needId = result?.data?.id;
        setReport("");
        setPhone("");
        updateLocalCoords(null);
        setLocationAddress(null);
        setLocationAccuracy(undefined);
        if (onPickModeToggle) onPickModeToggle(false);
        if (onRefresh) onRefresh(needId);
        if (onClose) onClose();
      }
    } catch (error) {
      console.error("Failed to submit report:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-[400px] glass border-r border-[var(--border-color)] p-10 overflow-hidden shadow-2xl">
      <div className="flex justify-between items-center mb-10">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-emergency rounded-2xl border border-black/10 shadow-lg shadow-emergency/20">
            <Heart className="text-white fill-current" size={24} />
          </div>
          <div>
            <h3 className="text-2xl font-anton text-[var(--foreground)] uppercase tracking-widest">
              Transmit Need
            </h3>
            <p className="text-[10px] text-[var(--foreground)]/60 font-bold uppercase tracking-widest pl-0.25">
              Ground Intelligence
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-3 bg-[var(--foreground)]/5 hover:bg-[var(--foreground)]/10 rounded-2xl transition-all text-[var(--foreground)]/50 hover:text-[var(--foreground)]">
          <X size={20} />
        </button>
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex-1 space-y-8 overflow-y-auto pr-2 custom-scrollbar font-roboto">
        <div className="space-y-3">
          <label className="text-[10px] font-black text-[var(--foreground)]/60 uppercase tracking-widest pl-1">
            Describe the Situation
          </label>
          <textarea
            required
            value={report}
            onChange={(e) => setReport(e.target.value)}
            placeholder="e.g. 50 people need water in Sector 7..."
            className="w-full bg-[var(--background)] border border-[var(--border-color)] rounded-3xl p-6 text-[var(--foreground)] font-medium placeholder:text-[var(--foreground)]/40 focus:outline-none focus:border-yellow focus:ring-4 focus:ring-yellow/10 min-h-[160px] transition-all resize-none leading-relaxed shadow-inner"
          />
        </div>

        <div className="space-y-3">
          <label className="text-[10px] font-black text-[var(--foreground)]/60 uppercase tracking-widest pl-1">
            Your Contact Profile
          </label>
          <div className="relative">
            <Phone
              className="absolute left-6 top-1/2 -translate-y-1/2 text-[var(--foreground)]/40"
              size={18}
            />
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91..."
              className="w-full bg-[var(--background)] border border-[var(--border-color)] rounded-2xl py-5 pl-14 pr-6 text-[var(--foreground)] font-medium focus:outline-none focus:border-yellow focus:ring-4 focus:ring-yellow/10 transition-all shadow-inner"
            />
          </div>
        </div>

        <div className="space-y-4">
          <label className="text-[10px] font-black text-[var(--foreground)]/60 uppercase tracking-widest pl-1">
            Geospatial Tagging
          </label>

          {(!activeCoords || (locationAccuracy && locationAccuracy > 1000)) && (
            <div className="p-3 bg-blue-500/10 border border-blue-400/50 rounded-2xl">
              <p className="text-[9px] text-blue-600 font-bold">
                💡 Tip: If GPS isn't working accurately, click "Pick on Map" to
                manually select the location on satellite view for perfect
                accuracy.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={handleDetectLocation}
              className={cn(
                "flex flex-col items-center justify-center gap-3 py-6 rounded-[2rem] border transition-all group shadow-sm",
                activeLocalCoords
                  ? "bg-[var(--foreground)] border-[var(--border-color)] text-[var(--background)] shadow-inner"
                  : "bg-[var(--background)] border-[var(--border-color)] text-[var(--foreground)]/60 hover:bg-[var(--foreground)]/5",
              )}>
              <MapPin
                size={24}
                className={cn(
                  activeLocalCoords
                    ? "text-[var(--background)]"
                    : "group-hover:scale-110 transition-transform",
                )}
              />
              <span className="text-[10px] font-bold uppercase tracking-widest">
                {activeLocalCoords ? "GPS Active" : "Detect GPS"}
              </span>
            </button>
            <button
              type="button"
              onClick={() => onPickModeToggle?.(true)}
              className={cn(
                "flex flex-col items-center justify-center gap-3 py-6 rounded-[2rem] border transition-all group shadow-sm",
                pickedLocation
                  ? "bg-emergency/20 border-emergency/50 text-[var(--foreground)]"
                  : "bg-[var(--background)] border-[var(--border-color)] text-[var(--foreground)]/60 hover:bg-[var(--foreground)]/5",
              )}>
              <Target
                size={24}
                className={cn(
                  pickedLocation
                    ? "text-emergency"
                    : "group-hover:scale-110 transition-transform",
                )}
              />
              <span className="text-[10px] font-bold uppercase tracking-widest">
                {pickedLocation ? "Point Saved" : "Pick on Map"}
              </span>
            </button>
          </div>
          {activeCoords && (
            <div className="space-y-3">
              {locationAddress && !isGeocodingAddress && (
                <div className="p-4 bg-primary/20 rounded-2xl border border-primary/50 shadow-lg">
                  <p className="text-[9px] text-primary/60 font-bold uppercase tracking-widest mb-1">
                    📍 Location Name
                  </p>
                  <p className="text-[13px] text-primary font-black leading-tight break-words">
                    {locationAddress}
                  </p>
                </div>
              )}

              <div className="p-4 bg-[var(--background)] rounded-2xl border border-[var(--border-color)] shadow-inner">
                <p className="text-[10px] text-[var(--foreground)]/60 font-mono uppercase tracking-widest mb-2">
                  Coordinates
                </p>
                <p className="text-[10px] text-[var(--foreground)] font-mono">
                  Lat: {activeCoords.lat.toFixed(6)}
                </p>
                <p className="text-[10px] text-[var(--foreground)] font-mono">
                  Lng: {activeCoords.lng.toFixed(6)}
                </p>
                {isGeocodingAddress && (
                  <div className="flex items-center gap-2 text-[9px] text-[var(--foreground)]/50 mt-2">
                    <Loader2 size={12} className="animate-spin" />
                    Verifying address...
                  </div>
                )}
              </div>

              {locationAccuracy !== undefined && (
                <div
                  className={cn(
                    "p-3 rounded-2xl border text-center shadow-inner",
                    locationAccuracy <= 30
                      ? "bg-emerald-500/10 border-emerald-400/50"
                      : locationAccuracy <= 50
                        ? "bg-blue-500/10 border-blue-400/50"
                        : locationAccuracy <= 100
                          ? "bg-orange-500/10 border-orange-400/50"
                          : "bg-emergency/20 border-emergency/50",
                  )}>
                  <p
                    className={cn(
                      "text-[9px] font-black uppercase tracking-widest",
                      locationAccuracy <= 30
                        ? "text-emerald-600"
                        : locationAccuracy <= 50
                          ? "text-blue-600"
                          : locationAccuracy <= 100
                            ? "text-orange-600"
                            : "text-emergency",
                    )}>
                    {locationAccuracy <= 30
                      ? "✓ Excellent Precision"
                      : locationAccuracy <= 50
                        ? "✓ Good Accuracy"
                        : locationAccuracy <= 100
                          ? "⚠ Lower Accuracy"
                          : "🚨 VERY LOW PRECISION"}
                  </p>
                  <p className="text-[8px] text-[var(--foreground)]/70 mt-1">
                    ±{Math.round(locationAccuracy)}m
                  </p>
                  {locationAccuracy > 1000 && (
                    <p className="text-[7px] text-emergency font-bold mt-2 leading-tight">
                      ⚠️ This accuracy is too poor. Please use "Pick on Map" to
                      manually select the exact location.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <button
          disabled={isSubmitting}
          className={cn(
            "w-full py-6 bg-gradient-to-r from-emergency to-orange-600 text-white font-black rounded-3xl uppercase tracking-widest text-sm flex items-center justify-center gap-3 transition-all mt-6 shadow-2xl shadow-emergency/20",
            isSubmitting
              ? "opacity-50 cursor-not-allowed"
              : "hover:brightness-110 active:scale-[0.98]",
          )}>
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
