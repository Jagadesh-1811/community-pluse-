'use client';

import { useEffect, useState, useRef } from 'react';
import { rtdb } from '@/lib/firebase';
import { ref, push, onValue, serverTimestamp, query, orderByKey, get } from 'firebase/database';
import { cn } from '@/lib/utils';
import { Send, MessageCircle } from 'lucide-react';

interface Message {
    id?: string;
    need_id: string;
    sender: 'volunteer' | 'reporter';
    text: string;
    created_at: number;
}

interface ChatPanelProps {
    needId: string;
    role: 'volunteer' | 'reporter';
}


export default function ChatPanel({ needId, role }: ChatPanelProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!needId) return;

        const messagesRef = ref(rtdb, `messages/${needId}`);
        const q = query(messagesRef, orderByKey());

        // Realtime subscription
        const unsubscribe = onValue(q, (snapshot) => {
            const msgs: Message[] = [];
            snapshot.forEach((child) => {
                msgs.push({ id: child.key, ...child.val() } as Message);
            });
            setMessages(msgs);
        });

        return () => unsubscribe();
    }, [needId]);

    useEffect(() => {
        // Auto-scroll on new messages
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || !needId) return;
        setSending(true);

        try {
            const messagesRef = ref(rtdb, `messages/${needId}`);
            await push(messagesRef, {
                need_id: needId,
                sender: role,
                text: input.trim(),
                created_at: serverTimestamp()
            });
            setInput('');

            // NEW: Telegram Relay Bridge
            // We fetch the current need data to check if it needs a Telegram relay
            try {
                const needRef = ref(rtdb, `needs/${needId}`);
                const snapshot = await get(needRef);
                const needData = snapshot.val();

                if (needData?.source === 'telegram' && role === 'volunteer') {
                    await fetch('http://localhost:8000/notify/chat', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            need_id: needId,
                            text: input.trim(),
                            sender_name: 'Volunteer'
                        })
                    });
                }
            } catch (relayErr) {
                console.warn("Telegram relay failed:", relayErr);
            }
        } catch (error) {
            console.error("Error sending message:", error);
        } finally {
            setSending(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="flex flex-col h-full bg-(--card-bg) backdrop-blur-md rounded-[2.5rem] border border-(--border-color) overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="px-6 py-5 border-b border-(--border-color) flex items-center gap-3 bg-(--foreground)/5">
                <div className="p-2 bg-yellow/10 rounded-lg">
                    <MessageCircle size={18} className="text-yellow" />
                </div>
                <div>
                    <h4 className="text-xs font-black text-(--foreground) uppercase tracking-widest leading-none mb-1">Live Comms</h4>
                    <p className="text-[8px] font-bold text-sage uppercase tracking-widest opacity-60">Secure Channel</p>
                </div>
                <div className="ml-auto flex items-center gap-2 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest">Active</span>
                </div>
            </div>

            {/* Messages Area */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar min-h-0">
                {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full opacity-30 text-center px-4">
                        <MessageCircle size={40} className="mb-4 text-sage" />
                        <p className="text-sage text-[10px] font-black uppercase tracking-[0.2em]">Secure link established. Waiting for mission updates...</p>
                    </div>
                )}
                {messages.map((msg) => (
                    <div
                        key={msg.id}
                        className={cn(
                            "flex",
                            msg.sender === role ? "justify-end" : "justify-start"
                        )}
                    >
                        <div className={cn(
                            "max-w-[75%] px-4 py-3 rounded-2xl text-sm font-medium",
                            msg.sender === role
                                ? "bg-yellow/20 text-(--foreground) border-2 border-yellow/40 rounded-br-sm shadow-sm"
                                : "bg-(--foreground)/8 text-(--foreground) border border-(--border-color) rounded-bl-sm shadow-xs"
                        )}>
                            <p className="leading-relaxed font-bold">{msg.text}</p>
                            <p className={cn(
                                "text-[9px] font-black uppercase tracking-widest mt-1",
                                msg.sender === role ? "text-yellow/80" : "text-(--foreground)"
                            )}>
                                {msg.sender === 'volunteer' ? '🛡️ Volunteer' : '📍 Reporter'} · {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Input Bar */}
            <div className="p-4 border-t border-(--border-color) bg-(--foreground)/3 backdrop-blur-xl">
                <div className="flex items-center gap-3 bg-(--card-bg) p-1.5 rounded-2xl border border-(--border-color) focus-within:border-yellow/30 transition-all">
                    <input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Transmit message..."
                        className="flex-1 bg-transparent border-none rounded-xl px-4 py-3 text-(--foreground) text-sm placeholder:text-sage focus:outline-none"
                    />
                    <button
                        onClick={handleSend}
                        disabled={sending || !input.trim()}
                        className={cn(
                            "w-12 h-12 rounded-xl flex items-center justify-center transition-all",
                            input.trim()
                                ? "bg-yellow text-black hover:scale-105 active:scale-95 shadow-[0_0_15px_rgba(255,225,124,0.3)]"
                                : "bg-(--foreground)/5 text-sage opacity-50"
                        )}
                    >
                        <Send size={18} strokeWidth={2.5} />
                    </button>
                </div>
            </div>
        </div>
    );
}
