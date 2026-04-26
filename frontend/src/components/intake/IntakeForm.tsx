"use client";

import { useState } from "react";
import { push, ref, serverTimestamp, set } from "firebase/database";

import { X, Send, Heart, Phone, MapPin, Target } from "lucide-react";
import { rtdb } from "@/lib/firebase";
import { cn } from "@/lib/utils";

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
  const apiBaseUrl =
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ||
    "http://localhost:8000";
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [report, setReport] = useState("");
  const [phone, setPhone] = useState("");
  const [domain, setDomain] = useState<"human" | "animal">("human");
  const [internalLocalCoords, setInternalLocalCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  const activeLocalCoords =
    localCoords !== undefined ? localCoords : internalLocalCoords;
  const updateLocalCoords = setLocalCoords || setInternalLocalCoords;

  const activeCoords = pickedLocation || activeLocalCoords;
  const hasValidActiveCoords =
    activeCoords !== null &&
    activeCoords !== undefined &&
    Number.isFinite(activeCoords.lat) &&
    Number.isFinite(activeCoords.lng);

  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;

        // Validate coordinates
        if (!isFinite(latitude) || !isFinite(longitude)) {
          alert("Invalid location data received. Please try again.");
          return;
        }

        // Warn if accuracy is poor (> 100m)
        if (accuracy > 100) {
          console.warn(`Location accuracy is poor: ${Math.round(accuracy)}m`);
        }

        updateLocalCoords({
          lat: latitude,
          lng: longitude,
        });
      },
      (error) => {
        let errorMsg = "Unable to retrieve your exact location. ";
        if (error.code === 1)
          errorMsg +=
            "Permission denied. Please allow location access in your browser settings.";
        if (error.code === 2)
          errorMsg += "Position unavailable. Enable GPS on your device.";
        if (error.code === 3)
          errorMsg +=
            "Location request timed out. GPS disabled or weak signal. Try again.";
        alert(errorMsg);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000, // Increased from 10s to 15s for GPS lock
        maximumAge: 0,
      },
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const lat = activeCoords?.lat;
      const lng = activeCoords?.lng;

      // Validate coordinates are valid numbers
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        alert(
          "Location is required. Please click 'Detect GPS' or 'Pick on Map' to set your coordinates.",
        );
        setIsSubmitting(false);
        return;
      }

      // Validate report text is not empty
      if (!report.trim()) {
        alert("Please describe the situation.");
        setIsSubmitting(false);
        return;
      }

      let needId: string | null = null;

      try {
        const response = await fetch(`${apiBaseUrl}/intake`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: report,
            source: "web",
            phone: phone || null,
            lat: lat,
            lng: lng,
            domain: domain,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.detail || `Server error: ${response.status}`,
          );
        }

        const result = await response.json();
        needId = result?.data?.id ?? result?.id ?? null;
      } catch (apiError) {
        console.warn(
          "Backend intake failed. Falling back to direct Firebase submit.",
          apiError,
        );

        const needsRef = ref(rtdb, "needs");
        const newNeedRef = push(needsRef);

        if (!newNeedRef.key) {
          throw new Error("Failed to create a report ID");
        }

        await set(newNeedRef, {
          id: newNeedRef.key,
          raw_text: report.trim(),
          need_type: domain === "animal" ? "animal" : "safety",
          domain,
          location_name: "Reporter GPS location",
          lat,
          lng,
          urgency_score: 5,
          emotional_signal: "concerned",
          status: "open",
          source: "web",
          phone: phone || null,
          created_at: serverTimestamp(),
        });

        needId = newNeedRef.key;
      }

      if (needId) {
        setReport("");
        setPhone("");
        updateLocalCoords(null);
        if (onPickModeToggle) onPickModeToggle(false);
        if (onRefresh) onRefresh(needId);
        if (onClose) onClose();
      } else {
        throw new Error("No need ID returned from server");
      }
    } catch (error: unknown) {
      console.error("Failed to submit report:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to submit report";
      alert(`Error: ${errorMessage}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-[400px] glass border-r border-(--border-color) p-10 overflow-hidden shadow-2xl">
      <div className="flex justify-between items-center mb-10">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-emergency rounded-2xl border border-black/10 shadow-lg shadow-emergency/20">
            <Heart className="text-white fill-current" size={24} />
          </div>
          <div>
            <h3 className="text-2xl font-anton text-(--foreground) tracking-widest">
              Transmit
            </h3>
            <p className="text-(--foreground) font-medium uppercase text-[10px] tracking-[0.3em] mb-4">
              Signal Intelligence
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-3 bg-(--foreground)/5 hover:bg-(--foreground)/10 rounded-2xl transition-all text-(--foreground)/50 hover:text-(--foreground)">
          <X size={20} />
        </button>
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex-1 space-y-8 overflow-y-auto pr-2 custom-scrollbar font-roboto">
        <div className="space-y-3">
          <label className="text-[10px] font-black text-(--foreground) uppercase tracking-widest pl-1">
            Describe the Situation
          </label>
          <textarea
            required
            value={report}
            onChange={(e) => setReport(e.target.value)}
            placeholder="e.g. 50 people need water in Sector 7..."
            className="w-full bg-(--background) border border-(--border-color) rounded-3xl p-6 text-(--foreground) font-medium placeholder:text-(--foreground)/40 focus:outline-none focus:border-yellow focus:ring-4 focus:ring-yellow/10 min-h-[160px] transition-all resize-none leading-relaxed shadow-inner"
          />
        </div>

        <div className="space-y-3">
          <label className="text-[10px] font-black text-(--foreground) uppercase tracking-widest pl-1">
            Your Contact Profile
          </label>
          <div className="relative">
            <Phone
              className="absolute left-6 top-1/2 -translate-y-1/2 text-(--foreground)"
              size={18}
            />
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91..."
              className="w-full bg-(--background) border border-(--border-color) rounded-2xl py-5 pl-14 pr-6 text-(--foreground) font-medium focus:outline-none focus:border-yellow focus:ring-4 focus:ring-yellow/10 transition-all shadow-inner"
            />
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-[10px] font-black text-(--foreground) uppercase tracking-widest pl-1">
            Operational Domain
          </label>
          <div className="flex gap-4 p-1 bg-(--foreground)/5 rounded-2xl border border-(--border-color)">
            <button
              type="button"
              onClick={() => setDomain("human")}
              className={cn(
                "flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                domain === "human"
                  ? "bg-(--foreground) text-(--background) shadow-lg"
                  : "text-(--foreground) hover:text-(--foreground)",
              )}>
              Human Health
            </button>
            <button
              type="button"
              onClick={() => setDomain("animal")}
              className={cn(
                "flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                domain === "animal"
                  ? "bg-blue-500 text-white shadow-lg"
                  : "text-(--foreground) hover:text-blue-400",
              )}>
              Animal Health
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <label className="text-[10px] font-black text-(--foreground) uppercase tracking-widest pl-1">
            Geospatial Tagging
          </label>
          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={handleDetectLocation}
              className={cn(
                "flex flex-col items-center justify-center gap-3 py-6 rounded-2xl border transition-all group shadow-sm",
                activeLocalCoords
                  ? "bg-(--foreground) border-(--border-color) text-(--background) shadow-inner"
                  : "bg-(--background) border-(--border-color) text-(--foreground) hover:bg-(--foreground)/5",
              )}>
              <MapPin
                size={24}
                className={cn(
                  activeLocalCoords
                    ? "text-(--background)"
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
                "flex flex-col items-center justify-center gap-3 py-6 rounded-2xl border transition-all group shadow-sm",
                pickedLocation
                  ? "bg-emergency/20 border-emergency/50 text-(--foreground)"
                  : "bg-(--background) border-(--border-color) text-(--foreground) hover:bg-(--foreground)/5",
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
          {hasValidActiveCoords && activeCoords && (
            <div className="p-4 bg-(--background) rounded-2xl border border-(--border-color) text-center shadow-inner">
              <p className="text-(--foreground) font-medium uppercase text-[10px] tracking-[0.3em] mb-4">
                Tactical Coordinates
              </p>
              Lat: {activeCoords.lat.toFixed(6)} | Lng:{" "}
              {activeCoords.lng.toFixed(6)}
            </div>
          )}
        </div>

        <div className="space-y-4 pt-4 border-t border-(--border-color)">
          <label className="text-[10px] font-black text-(--foreground) uppercase tracking-widest pl-1">
            Rapid Response Channels
          </label>
          <div className="grid grid-cols-1 gap-3">
            <div className="flex items-center gap-4 p-4 bg-(--foreground)/5 rounded-2xl border border-(--border-color) group">
              <div className="w-10 h-10 rounded-xl bg-(--background) border border-(--border-color) flex items-center justify-center text-emergency">
                <Phone size={18} />
              </div>
              <div>
                <p className="text-[8px] font-black text-(--foreground) uppercase tracking-[0.2em]">
                  Voice Agent Line
                </p>
                <p className="text-sm font-black text-(--foreground)">
                  +91 70936 91626
                </p>
              </div>
            </div>
            <a
              href="https://t.me/CPFieldBot"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 p-4 bg-(--foreground)/5 rounded-2xl border border-(--border-color) hover:bg-(--foreground)/10 transition-all group cursor-pointer">
              <div className="w-10 h-10 rounded-xl bg-(--background) border border-(--border-color) flex items-center justify-center text-blue-500">
                <Send size={18} />
              </div>
              <div className="flex-1">
                <p className="text-[8px] font-black text-(--foreground) uppercase tracking-[0.2em]">
                  Telegram Intelligence
                </p>
                <p className="text-sm font-black text-(--foreground)">
                  @Community_Pulse_Bot
                </p>
              </div>
            </a>
          </div>
        </div>

        <button
          disabled={isSubmitting}
          className={cn(
            "w-full py-6 bg-linear-to-r from-emergency to-orange-600 text-white font-black rounded-3xl uppercase tracking-widest text-sm flex items-center justify-center gap-3 transition-all mt-6 shadow-2xl shadow-emergency/20",
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
