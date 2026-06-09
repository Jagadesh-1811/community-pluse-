"use client";

import { useState, useEffect, useRef } from "react";
import { Mic, PhoneOff, Loader2, AlertTriangle } from "lucide-react";
import Vapi from "@vapi-ai/web";
import { cn } from "@/lib/utils";

export function VoiceAgentButton() {
  const [isActive, setIsActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const vapiRef = useRef<Vapi | null>(null);

  useEffect(() => {
    const publicKey = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;
    if (!publicKey) return;

    const vapi = new Vapi(publicKey);
    vapiRef.current = vapi;

    vapi.on("call-start", () => {
      setIsActive(true);
      setIsConnecting(false);
      setErrorMsg(null);
    });

    vapi.on("call-end", () => {
      setIsActive(false);
      setIsConnecting(false);
    });

    // Suppress {} noise — real errors are caught in the preflight fetch below
    vapi.on("error", (e: any) => {
      // Only log if the object actually has content
      const hasContent =
        e &&
        typeof e === "object" &&
        (typeof e.message === "string" ||
          typeof e.type === "string" ||
          typeof e.error === "object");

      if (hasContent) {
        const msg =
          (typeof e.message === "string" ? e.message : null) ||
          (typeof e.type === "string" ? e.type : null) ||
          "Voice agent error";
        setErrorMsg(msg);
      }

      setIsActive(false);
      setIsConnecting(false);
    });

    return () => {
      vapi.stop();
      vapi.removeAllListeners();
    };
  }, []);

  const toggleCall = async () => {
    setErrorMsg(null);

    if (isActive) {
      vapiRef.current?.stop();
      return;
    }

    const publicKey = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;
    const assistantId = process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID;

    if (!publicKey || !assistantId) {
      setErrorMsg(
        "Missing Vapi configuration — check NEXT_PUBLIC_VAPI_PUBLIC_KEY and NEXT_PUBLIC_VAPI_ASSISTANT_ID in your .env file."
      );
      return;
    }

    // 1. Microphone permission check
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setErrorMsg(
        "Microphone access denied. Please allow microphone permissions in your browser and try again."
      );
      return;
    }

    setIsConnecting(true);

    // 2. Pre-flight: POST directly to Vapi API to get the real error message.
    //    The Vapi SDK swallows HTTP errors as un-readable Response objects ({}).
    //    By calling the endpoint ourselves first, we can read the actual error body.
    try {
      const res = await fetch("https://api.vapi.ai/call/web", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${publicKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ assistantId }),
      });

      if (!res.ok) {
        let reason = `HTTP ${res.status}`;
        try {
          const body = await res.json();
          reason =
            body?.message ||
            body?.error?.message ||
            body?.error ||
            body?.detail ||
            reason;
        } catch {
          /* non-JSON body — keep the HTTP status as reason */
        }

        const hints: Record<number, string> = {
          401: "Your Vapi public key may be invalid or expired.",
          403: "Access forbidden — check your Vapi account status at dashboard.vapi.ai.",
          404: "Assistant not found — verify the assistant ID on dashboard.vapi.ai.",
          429: "Rate limit exceeded — try again in a moment.",
        };

        const hint = hints[res.status] ?? "Check your Vapi dashboard at dashboard.vapi.ai.";
        setErrorMsg(`${reason}. ${hint}`);
        setIsConnecting(false);
        return;
      }
      // Preflight succeeded — credentials are valid, proceed to vapi.start() below
    } catch (networkErr) {
      setErrorMsg(
        "Network error: Could not reach Vapi API. Check your internet connection."
      );
      setIsConnecting(false);
      return;
    }

    // 3. Start the Vapi call — credentials already validated by preflight above
    try {
      await vapiRef.current?.start(assistantId);
    } catch (err: any) {
      const msg =
        typeof err?.message === "string" && err.message.length > 0
          ? err.message
          : "Failed to start voice call. Please try again.";
      setErrorMsg(msg);
      setIsConnecting(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 w-full">
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
            : errorMsg
            ? "bg-red-500/10 border-red-500/30"
            : "bg-(--foreground)/5 border-(--border-color) hover:bg-(--foreground)/10 cursor-pointer"
        )}
      >
        <div
          className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center border",
            isActive
              ? "bg-emergency text-white border-emergency/50 animate-pulse"
              : errorMsg
              ? "bg-red-500/20 text-red-400 border-red-500/30"
              : "bg-(--background) text-emerald-500 border-(--border-color)"
          )}
        >
          {isConnecting ? (
            <Loader2 size={18} className="animate-spin" />
          ) : isActive ? (
            <PhoneOff size={18} />
          ) : errorMsg ? (
            <AlertTriangle size={18} />
          ) : (
            <Mic size={18} />
          )}
        </div>
        <div>
          <p
            className={cn(
              "text-[8px] font-black uppercase tracking-[0.2em]",
              isActive
                ? "text-emergency"
                : errorMsg
                ? "text-red-400"
                : "text-(--foreground)"
            )}
          >
            {isActive
              ? "Live Call Connected"
              : errorMsg
              ? "Connection Failed"
              : "Web Voice Agent"}
          </p>
          <p className="text-sm font-black text-(--foreground)">
            {isConnecting
              ? "Connecting..."
              : isActive
              ? "Tap to End Call"
              : errorMsg
              ? "Tap to Retry"
              : "Tap to Speak to AI"}
          </p>
        </div>
      </button>

      {errorMsg && (
        <p className="text-xs text-red-400 px-1 flex items-start gap-1">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          {errorMsg}
        </p>
      )}
    </div>
  );
}
