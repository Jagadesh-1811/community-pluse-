'use client';

import { useState, useEffect, useRef } from 'react';
import { Mic, PhoneOff, Loader2, AlertTriangle, Bot, User } from 'lucide-react';
import Vapi from '@vapi-ai/web';
import { cn } from '@/lib/utils';

interface ConversationEntry {
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

interface VoiceAgentButtonProps {
  onTranscriptUpdate?: (transcript: string) => void;
  onAiResponseUpdate?: (response: string) => void;
  onConversationUpdate?: (conversation: ConversationEntry[]) => void;
  onCallEnd?: (conversation: ConversationEntry[]) => void;
}

export function VoiceAgentButton({
  onTranscriptUpdate,
  onAiResponseUpdate,
  onConversationUpdate,
  onCallEnd,
}: VoiceAgentButtonProps) {
  const [isActive, setIsActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [conversation, setConversation] = useState<ConversationEntry[]>([]);
  const vapiRef = useRef<Vapi | null>(null);
  const transcriptScrollRef = useRef<HTMLDivElement | null>(null);

  // Keep conversation stable for event listeners
  const conversationRef = useRef(conversation);
  useEffect(() => {
    conversationRef.current = conversation;
  }, [conversation]);

  // Notify parent on conversation updates safely using a ref
  const onConversationUpdateRef = useRef(onConversationUpdate);
  const onCallEndRef = useRef(onCallEnd);
  const onTranscriptUpdateRef = useRef(onTranscriptUpdate);
  const onAiResponseUpdateRef = useRef(onAiResponseUpdate);

  useEffect(() => {
    onConversationUpdateRef.current = onConversationUpdate;
    onCallEndRef.current = onCallEnd;
    onTranscriptUpdateRef.current = onTranscriptUpdate;
    onAiResponseUpdateRef.current = onAiResponseUpdate;
  }, [onConversationUpdate, onCallEnd, onTranscriptUpdate, onAiResponseUpdate]);

  useEffect(() => {
    onConversationUpdateRef.current?.(conversation);
  }, [conversation]);

  // Auto-scroll transcript panel to bottom on new messages
  useEffect(() => {
    if (transcriptScrollRef.current) {
      transcriptScrollRef.current.scrollTop = transcriptScrollRef.current.scrollHeight;
    }
  }, [conversation]);

  useEffect(() => {
    const publicKey = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;
    if (!publicKey) return;

    const vapi = new Vapi(publicKey);
    vapiRef.current = vapi;

    vapi.on('call-start', () => {
      setIsActive(true);
      setIsConnecting(false);
      setErrorMsg(null);
      setConversation([]);
    });

    vapi.on('call-end', () => {
      setIsActive(false);
      setIsConnecting(false);
      // Notify parent call ended with conversation entries
      onCallEndRef.current?.(conversationRef.current);
    });

    vapi.on('message', (rawMsg: unknown) => {
      const msg = rawMsg as {
        type?: string;
        transcriptType?: string;
        transcript?: string;
        role?: string;
      } | null;
      // Capture final (non-partial) transcripts for both user and assistant
      if (msg && msg.type === 'transcript' && msg.transcriptType === 'final') {
        const text = typeof msg.transcript === 'string' ? msg.transcript.trim() : '';
        if (!text) return;

        if (msg.role === 'user') {
          // Forward user speech to the report textarea
          onTranscriptUpdateRef.current?.(text);
          setConversation((prev) => [...prev, { role: 'user', text, timestamp: Date.now() }]);
        } else if (msg.role === 'assistant') {
          //  FIX: Capture and display the AI agent's responses
          onAiResponseUpdateRef.current?.(text);
          setConversation((prev) => [...prev, { role: 'assistant', text, timestamp: Date.now() }]);
        }
      }
    });

    // Suppress {} noise — real errors are caught in the preflight fetch below
    vapi.on('error', (e: unknown) => {
      const err = e as { message?: string; type?: string; error?: unknown } | null;
      // Only log if the object actually has content
      const hasContent =
        err &&
        typeof err === 'object' &&
        (typeof err.message === 'string' ||
          typeof err.type === 'string' ||
          typeof err.error === 'object');

      if (hasContent) {
        const msg =
          (typeof err.message === 'string' ? err.message : null) ||
          (typeof err.type === 'string' ? err.type : null) ||
          'Voice agent error';
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
        'Missing Vapi configuration — check NEXT_PUBLIC_VAPI_PUBLIC_KEY and NEXT_PUBLIC_VAPI_ASSISTANT_ID in your .env file.',
      );
      return;
    }

    // 1. Microphone permission check
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setErrorMsg(
        'Microphone access denied. Please allow microphone permissions in your browser and try again.',
      );
      return;
    }

    setIsConnecting(true);

    // 2. Start the Vapi call directly
    try {
      await vapiRef.current?.start(assistantId);
    } catch (err: unknown) {
      const error = err as Error;
      const msg =
        typeof error?.message === 'string' && error.message.length > 0
          ? error.message
          : 'Failed to start voice call. Please try again.';
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
          'flex items-center gap-4 p-4 rounded-2xl border transition-all group w-full text-left',
          isActive
            ? 'bg-emergency/10 border-emergency/30'
            : errorMsg
              ? 'bg-red-500/10 border-red-500/30'
              : 'bg-(--foreground)/5 border-(--border-color) hover:bg-(--foreground)/10 cursor-pointer',
        )}
      >
        <div
          className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center border',
            isActive
              ? 'bg-emergency text-white border-emergency/50 animate-pulse'
              : errorMsg
                ? 'bg-red-500/20 text-red-400 border-red-500/30'
                : 'bg-(--background) text-emerald-500 border-(--border-color)',
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
              'text-[8px] font-black uppercase tracking-[0.2em]',
              isActive ? 'text-emergency' : errorMsg ? 'text-red-400' : 'text-(--foreground)',
            )}
          >
            {isActive ? 'Live Call Connected' : errorMsg ? 'Connection Failed' : 'Web Voice Agent'}
          </p>
          <p className="text-sm font-black text-(--foreground)">
            {isConnecting
              ? 'Connecting...'
              : isActive
                ? 'Tap to End Call'
                : errorMsg
                  ? 'Tap to Retry'
                  : 'Tap to Speak to AI'}
          </p>
        </div>
      </button>

      {errorMsg && (
        <p className="text-xs text-red-400 px-1 flex items-start gap-1">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          {errorMsg}
        </p>
      )}

      {/*  Live AI Conversation Panel — shown during and after call */}
      {(isActive || conversation.length > 0) && (
        <div className="mt-2 rounded-2xl border border-(--border-color) bg-(--background)/60 backdrop-blur-sm overflow-hidden">
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-(--border-color) bg-(--foreground)/5">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'w-2 h-2 rounded-full',
                  isActive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500',
                )}
              />
              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-(--foreground)/70">
                {isActive ? 'Live AI Conversation' : 'Call Transcript'}
              </span>
            </div>
            <span className="text-[8px] font-mono text-(--foreground)/40">
              {conversation.length} message{conversation.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Scrollable message list */}
          <div
            ref={transcriptScrollRef}
            className="flex flex-col gap-2 p-3 max-h-52 overflow-y-auto"
            style={{ scrollbarWidth: 'none' }}
          >
            {conversation.length === 0 && isActive && (
              <p className="text-[10px] text-(--foreground)/40 italic text-center py-4">
                Speak to start the conversation...
              </p>
            )}
            {conversation.map((entry, idx) => (
              <div
                key={idx}
                className={cn(
                  'flex gap-2 items-start',
                  entry.role === 'assistant' ? 'flex-row' : 'flex-row-reverse',
                )}
              >
                {/* Avatar */}
                <div
                  className={cn(
                    'w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
                    entry.role === 'assistant'
                      ? 'bg-emerald-500/20 border border-emerald-500/30'
                      : 'bg-(--foreground)/10 border border-(--border-color)',
                  )}
                >
                  {entry.role === 'assistant' ? (
                    <Bot size={12} className="text-emerald-400" />
                  ) : (
                    <User size={12} className="text-(--foreground)/70" />
                  )}
                </div>

                {/* Bubble */}
                <div
                  className={cn(
                    'px-3 py-2 rounded-xl text-xs font-medium leading-relaxed max-w-[85%]',
                    entry.role === 'assistant'
                      ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 rounded-tl-none'
                      : 'bg-(--foreground)/10 border border-(--border-color) text-(--foreground)/90 rounded-tr-none',
                  )}
                >
                  <span
                    className={cn(
                      'block text-[8px] font-black uppercase tracking-widest mb-1',
                      entry.role === 'assistant' ? 'text-emerald-400' : 'text-(--foreground)/50',
                    )}
                  >
                    {entry.role === 'assistant' ? 'AI Agent' : 'You'}
                  </span>
                  {entry.text}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
