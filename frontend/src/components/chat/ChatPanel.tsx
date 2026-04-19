'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { Send, MessageCircle } from 'lucide-react';

interface Message {
    id: string;
    need_id: string;
    sender: 'user' | 'volunteer';
    text: string;
    created_at: string;
}

interface ChatPanelProps {
    needId: string;
    role: 'user' | 'volunteer';
}

export default function ChatPanel({ needId, role }: ChatPanelProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Fetch existing messages
        const fetchMessages = async () => {
            const { data } = await supabase
                .from('messages')
                .select('*')
                .eq('need_id', needId)
                .order('created_at', { ascending: true });
            if (data) setMessages(data as Message[]);
        };
        fetchMessages();

        // Realtime subscription
        const channel = supabase
            .channel(`messages-${needId}`)
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'messages', filter: `need_id=eq.${needId}` },
                (payload) => {
                    setMessages((prev) => [...prev, payload.new as Message]);
                }
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [needId]);

    useEffect(() => {
        // Auto-scroll on new messages
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim()) return;
        setSending(true);
        
        const { error } = await supabase.from('messages').insert({
            need_id: needId,
            sender: role,
            text: input.trim()
        });

        if (!error) setInput('');
        setSending(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="flex flex-col h-full bg-white/[0.02] rounded-[2rem] border border-white/10 overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-white/5 flex items-center gap-3 bg-white/[0.03]">
                <MessageCircle size={16} className="text-primary" />
                <h4 className="text-xs font-black text-white uppercase tracking-widest">Live Comms</h4>
                <div className="ml-auto flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Connected</span>
                </div>
            </div>

            {/* Messages Area */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[300px] custom-scrollbar">
                {messages.length === 0 && (
                    <div className="flex items-center justify-center h-full">
                        <p className="text-slate-600 text-xs font-medium uppercase tracking-widest">No messages yet</p>
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
                                ? "bg-primary/20 text-white border border-primary/30 rounded-br-sm" 
                                : "bg-white/5 text-slate-300 border border-white/10 rounded-bl-sm"
                        )}>
                            <p className="leading-relaxed">{msg.text}</p>
                            <p className={cn(
                                "text-[9px] font-bold uppercase tracking-widest mt-1",
                                msg.sender === role ? "text-primary/60" : "text-slate-600"
                            )}>
                                {msg.sender === 'volunteer' ? '🛡️ Volunteer' : '📍 Reporter'} · {new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            </p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Input Bar */}
            <div className="p-3 border-t border-white/5 bg-white/[0.02]">
                <div className="flex items-center gap-2">
                    <input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Type your message..."
                        className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-primary/40 transition-colors"
                    />
                    <button 
                        onClick={handleSend}
                        disabled={sending || !input.trim()}
                        className={cn(
                            "p-3 rounded-xl transition-all",
                            input.trim() ? "bg-primary text-white hover:bg-primary/80 shadow-lg shadow-primary/20" : "bg-white/5 text-slate-600"
                        )}
                    >
                        <Send size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
}
