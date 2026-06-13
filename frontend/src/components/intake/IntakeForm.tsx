"use client";

import { useState, useEffect } from "react";
import { push, ref, serverTimestamp, set } from "firebase/database";
import { X, Send, Heart, Phone, MapPin, Target, Camera } from "lucide-react";
import { rtdb } from "@/lib/firebase";
import { cn } from "@/lib/utils";
import { VoiceAgentButton } from "@/components/voice/VoiceAgentButton";
import { useAuth } from "@/lib/auth-context";



import Image from "next/image";
import { useCallback } from "react";
import { ConversationEntry } from "@/hooks/useRealtimeNeeds";

interface IntakeFormProps {
  pickedLocation?: { lat: number; lng: number } | null;
  onPickModeToggle?: (active: boolean) => void;
  onClose?: () => void;
  /** Called with (needId, aiHeading) after a successful submit */
  onRefresh?: (needId?: string, aiHeading?: string) => void;
  localCoords?: { lat: number; lng: number } | null;
  setLocalCoords?: (coords: { lat: number; lng: number } | null) => void;
}

interface OfflineReport {
  id: string;
  text: string;
  source: string;
  phone: string | null;
  lat: number;
  lng: number;
  domain: string;
  reporter_email: string | null;
  image_base64: string | null;
  image_name: string | null;
  created_at: number;
}

export default function IntakeForm({
  pickedLocation,
  onPickModeToggle,
  onClose,
  onRefresh,
  localCoords,
  setLocalCoords,
}: IntakeFormProps) {
  const { user } = useAuth();
  const apiBaseUrl =
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ||
    "http://localhost:8000";
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [report, setReport] = useState("");
  const [phone, setPhone] = useState("");
  const [domain, setDomain] = useState<"human" | "animal">("human");
  const [glitchingDomain, setGlitchingDomain] = useState<"human" | "animal" | null>(null);
  const [webrtcConversation, setWebrtcConversation] = useState<ConversationEntry[]>([]);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const flushOfflineQueue = useCallback(async () => {
    const queueStr = localStorage.getItem("communitypulse_offline_queue");
    if (!queueStr) return;
    try {
      const queue = JSON.parse(queueStr) as OfflineReport[];
      if (queue.length === 0) return;
      console.log(`Flushing ${queue.length} offline reports...`);
      
      const remaining: OfflineReport[] = [];
      for (const item of queue) {
        try {
          let response;
          if (item.image_base64) {
            const blob = await fetch(item.image_base64).then(r => r.blob());
            const file = new File([blob], item.image_name || "offline_upload.jpg", { type: blob.type });
            const formData = new FormData();
            formData.append("text", item.text);
            formData.append("source", item.source);
            formData.append("phone", item.phone || "");
            formData.append("lat", String(item.lat));
            formData.append("lng", String(item.lng));
            formData.append("domain", item.domain);
            formData.append("reporter_email", item.reporter_email || "");
            formData.append("image", file);
            
            response = await fetch(`${apiBaseUrl}/intake/image`, {
              method: "POST",
              body: formData,
            });
          } else {
            response = await fetch(`${apiBaseUrl}/intake`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                text: item.text,
                source: item.source,
                phone: item.phone,
                lat: parseFloat(String(item.lat)),
                lng: parseFloat(String(item.lng)),
                domain: item.domain,
                reporter_email: item.reporter_email,
              }),
            });
          }
          if (!response.ok) {
            remaining.push(item);
          }
        } catch (err) {
          console.error("Failed to sync offline item:", err);
          remaining.push(item);
        }
      }
      if (remaining.length > 0) {
        localStorage.setItem("communitypulse_offline_queue", JSON.stringify(remaining));
      } else {
        localStorage.removeItem("communitypulse_offline_queue");
        alert("✅ All offline reports have been synchronized with the command center!");
      }
    } catch (e) {
      console.error("Error flushing queue", e);
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const handleOnline = () => {
        flushOfflineQueue();
      };
      
      window.addEventListener("online", handleOnline);
      return () => {
        window.removeEventListener("online", handleOnline);
      };
    }
  }, [flushOfflineQueue]);

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

  const handleVoiceCallEnd = async (conversation: ConversationEntry[]) => {
    if (!conversation || conversation.length === 0) return;

    // Filter to retrieve user's dialogue and construct full report text
    const userMessages = conversation
      .filter((entry) => entry.role === "user")
      .map((entry) => entry.text)
      .join(" ");

    if (!userMessages.trim()) return;

    setReport(userMessages);

    let finalLat = activeCoords?.lat;
    let finalLng = activeCoords?.lng;

    // Fetch coords or fall back to standard coordinates (New Delhi) to prevent validation error
    if (!finalLat || !finalLng) {
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 3000 });
        });
        finalLat = position.coords.latitude;
        finalLng = position.coords.longitude;
      } catch {
        finalLat = 28.6139;
        finalLng = 77.2090;
      }
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${apiBaseUrl}/intake`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: userMessages,
          source: "voice_agent",
          phone: phone || null,
          lat: finalLat,
          lng: finalLng,
          domain: domain,
          reporter_email: user?.email || null,
          webrtc_conversation: conversation,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        const needId = result?.data?.id ?? result?.id ?? null;
        if (needId) {
          // Generate AI heading if possible
          let aiHeading: string | undefined;
          try {
            const headingRes = await fetch(`${apiBaseUrl}/ai/heading`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ text: userMessages.trim(), sender: "reporter" }),
            });
            if (headingRes.ok) {
              const headingData = await headingRes.json();
              aiHeading = headingData?.heading ?? undefined;
            }
          } catch {
            // ignore fallback
          }

          setReport("");
          setPhone("");
          setWebrtcConversation([]);
          updateLocalCoords(null);
          if (onPickModeToggle) onPickModeToggle(false);
          if (onRefresh) onRefresh(needId, aiHeading);
          if (onClose) onClose();
        }
      }
    } catch (err) {
      console.error("Failed to auto-submit WebRTC need:", err);
    } finally {
      setIsSubmitting(false);
    }
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

      if (typeof window !== "undefined" && !navigator.onLine) {
        let imageBase64: string | null = null;
        if (selectedImage && imagePreview) {
          imageBase64 = imagePreview;
        }
        
        const offlineReport = {
          id: `offline-${Date.now()}`,
          text: report,
          source: webrtcConversation.length > 0 ? "voice_agent" : "web",
          phone: phone || null,
          lat: lat,
          lng: lng,
          domain: domain,
          reporter_email: user?.email || null,
          image_base64: imageBase64,
          image_name: selectedImage?.name || null,
          created_at: Date.now()
        };
        
        const queueStr = localStorage.getItem("communitypulse_offline_queue");
        const queue = queueStr ? JSON.parse(queueStr) : [];
        queue.push(offlineReport);
        localStorage.setItem("communitypulse_offline_queue", JSON.stringify(queue));
        
        alert("⚠️ OFFLINE DETECTED: Incident saved locally. It will auto-synchronize with the Command Center once network connectivity is restored.");
        
        setReport("");
        setPhone("");
        setSelectedImage(null);
        setImagePreview(null);
        setWebrtcConversation([]);
        updateLocalCoords(null);
        if (onPickModeToggle) onPickModeToggle(false);
        if (onClose) onClose();
        setIsSubmitting(false);
        return;
      }

      let needId: string | null = null;

      try {
        let response;
        if (selectedImage) {
          const formData = new FormData();
          formData.append("text", report);
          formData.append("source", webrtcConversation.length > 0 ? "voice_agent" : "web");
          formData.append("phone", phone || "");
          formData.append("lat", String(lat));
          formData.append("lng", String(lng));
          formData.append("domain", domain);
          formData.append("reporter_email", user?.email || "");
          formData.append("image", selectedImage);

          response = await fetch(`${apiBaseUrl}/intake/image`, {
            method: "POST",
            body: formData,
          });
        } else {
          response = await fetch(`${apiBaseUrl}/intake`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: report,
              source: webrtcConversation.length > 0 ? "voice_agent" : "web",
              phone: phone || null,
              lat: lat,
              lng: lng,
              domain: domain,
              reporter_email: user?.email || null,
              webrtc_conversation: webrtcConversation.length > 0 ? webrtcConversation : null,
            }),
          });
        }

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
          source: webrtcConversation.length > 0 ? "voice_agent" : "web",
          phone: phone || null,
          reporter_email: user?.email || null,
          webrtc_conversation: webrtcConversation.length > 0 ? webrtcConversation : null,
          created_at: serverTimestamp(),
        });


        needId = newNeedRef.key;
      }

      if (needId) {
        // Generate an AI heading based on the submitted report text
        let aiHeading: string | undefined;
        try {
          const headingRes = await fetch(`${apiBaseUrl}/ai/heading`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: report.trim(), sender: "reporter" }),
          });
          if (headingRes.ok) {
            const headingData = await headingRes.json();
            aiHeading = headingData?.heading ?? undefined;
          }
        } catch {
          // Non-critical — heading will fall back to default in parent
        }

        setReport("");
        setPhone("");
        setSelectedImage(null);
        setImagePreview(null);
        setWebrtcConversation([]);
        updateLocalCoords(null);
        if (onPickModeToggle) onPickModeToggle(false);
        if (onRefresh) onRefresh(needId, aiHeading);
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
          <label className="text-[10px] font-black text-(--foreground) uppercase tracking-widest pl-1 flex justify-between items-center font-roboto">
            <span>Incident Damage Photo</span>
            {imagePreview && (
              <button
                type="button"
                onClick={() => {
                  setSelectedImage(null);
                  setImagePreview(null);
                }}
                className="text-[9px] text-red-500 font-black hover:underline uppercase tracking-widest cursor-pointer"
              >
                Clear
              </button>
            )}
          </label>
          {!imagePreview ? (
            <label className="flex flex-col items-center justify-center w-full h-32 bg-(--background) hover:bg-(--foreground)/5 border border-(--border-color) border-dashed rounded-3xl cursor-pointer transition-all group p-4 text-center">
              <div className="flex flex-col items-center justify-center pt-2 pb-2">
                <Camera className="text-(--foreground)/40 group-hover:scale-110 transition-transform mb-2" size={24} />
                <p className="text-[10px] font-bold uppercase tracking-widest text-(--foreground)/60">Upload Field Photo</p>
                <p className="text-[9px] text-(--foreground)/40 font-mono mt-1">PNG, JPG, or WEBP up to 5MB</p>
              </div>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    const file = e.target.files[0];
                    setSelectedImage(file);
                    const reader = new FileReader();
                    reader.onloadend = () => {
                      setImagePreview(reader.result as string);
                    };
                    reader.readAsDataURL(file);
                  }
                }}
              />
            </label>
          ) : (
            <div className="relative aspect-video w-full rounded-3xl overflow-hidden border border-(--border-color) bg-black/40">
              <Image
                src={imagePreview}
                alt="Upload preview"
                width={368}
                height={207}
                unoptimized
                className="w-full h-full object-cover"
              />
            </div>
          )}
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
              onClick={() => {
                setDomain("human");
                setGlitchingDomain("human");
                setTimeout(() => setGlitchingDomain(null), 450);
              }}
              className={cn(
                "flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                glitchingDomain === "human" ? "animate-glitch-bw" :
                domain === "human"
                  ? "bg-(--foreground) text-(--background) shadow-lg"
                  : "text-(--foreground) hover:text-(--foreground)",
              )}>
              Human Health
            </button>
            <button
              type="button"
              onClick={() => {
                setDomain("animal");
                setGlitchingDomain("animal");
                setTimeout(() => setGlitchingDomain(null), 450);
              }}
              className={cn(
                "flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                glitchingDomain === "animal" ? "animate-glitch-bw" :
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
            <VoiceAgentButton 
              onTranscriptUpdate={(transcript) => {
                if (transcript && transcript.trim()) {
                  setReport(transcript);
                }
              }}
              onConversationUpdate={(conv) => {
                setWebrtcConversation(conv);
              }}
              onCallEnd={handleVoiceCallEnd}
            />
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
            <a
              href="tel:+19482229326"
              className="flex items-center gap-4 p-4 bg-(--foreground)/5 rounded-2xl border border-(--border-color) hover:bg-(--foreground)/10 transition-all group cursor-pointer">
              <div className="w-10 h-10 rounded-xl bg-(--background) border border-(--border-color) flex items-center justify-center text-emerald-400">
                <Phone size={18} />
              </div>
              <div className="flex-1">
                <p className="text-[8px] font-black text-(--foreground) uppercase tracking-[0.2em]">
                  Vapi Telephony Hotline
                </p>
                <p className="text-sm font-black text-(--foreground)">
                  +1 (948) 222-9326
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
