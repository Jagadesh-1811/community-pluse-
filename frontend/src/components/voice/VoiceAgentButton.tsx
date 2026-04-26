"use client";

import { useState, useEffect, useRef } from "react";
import { Mic, PhoneOff, Loader2 } from "lucide-react";
import Vapi from "@vapi-ai/web";
import { cn } from "@/lib/utils";

export function VoiceAgentButton() {
  const [isActive, setIsActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  // Type as Vapi to bypass strict TypeScript checks for the SDK if types are missing
  const vapiRef = useRef<Vapi | null>(null);

  useEffect(() => {
    // Only initialize on the client side
    const vapi = new Vapi(process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY || "dummy-key");
    vapiRef.current = vapi;

    vapi.on("call-start", () => {
      setIsActive(true);
      setIsConnecting(false);
    });

    vapi.on("call-end", () => {
      setIsActive(false);
      setIsConnecting(false);
    });

    vapi.on("error", (e: unknown) => {
      console.error("Vapi Error:", e);
      setIsActive(false);
      setIsConnecting(false);
    });

    return () => {
      vapi.stop();
      vapi.removeAllListeners();
    };
  }, []);

  const toggleCall = async () => {
    if (isActive) {
      vapiRef.current?.stop();
    } else {
      setIsConnecting(true);
      try {
        const assistantId = process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID;
        if (!assistantId) {
          alert("Error: Missing NEXT_PUBLIC_VAPI_ASSISTANT_ID in frontend .env");
          setIsConnecting(false);
          return;
        }
        await vapiRef.current?.start(assistantId);
      } catch (err) {
        console.error("Failed to start Vapi call", err);
        setIsConnecting(false);
      }
    }
  };

  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        toggleCall();
      }}
      disabled={isConnecting}
      className={cn(
        "flex items-center gap-4 p-4 rounded-2xl border transition-all group w-full text-left",
        isActive
          ? "bg-emergency/10 border-emergency/30"
          : "bg-(--foreground)/5 border-(--border-color) hover:bg-(--foreground)/10 cursor-pointer"
      )}
    >
      <div
        className={cn(
          "w-10 h-10 rounded-xl flex items-center justify-center border",
          isActive
            ? "bg-emergency text-white border-emergency/50 animate-pulse"
            : "bg-(--background) text-emerald-500 border-(--border-color)"
        )}
      >
        {isConnecting ? (
          <Loader2 size={18} className="animate-spin" />
        ) : isActive ? (
          <PhoneOff size={18} />
        ) : (
          <Mic size={18} />
        )}
      </div>
      <div>
        <p
          className={cn(
            "text-[8px] font-black uppercase tracking-[0.2em]",
            isActive ? "text-emergency" : "text-(--foreground)"
          )}
        >
          {isActive ? "Live Call Connected" : "Web Voice Agent"}
        </p>
        <p className="text-sm font-black text-(--foreground)">
          {isConnecting ? "Connecting..." : isActive ? "Tap to End Call" : "Tap to Speak to AI"}
        </p>
      </div>
    </button>
  );
}
