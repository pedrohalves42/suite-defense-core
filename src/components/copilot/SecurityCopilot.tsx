import { useState, useRef, useEffect, useCallback } from 'react';
import { Bot, X, Send, Loader2, Trash2, Sparkles, Shield, AlertTriangle, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';

type Message = { role: 'user' | 'assistant'; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-security-copilot`;

const SUGGESTIONS = [
  'Qual é o status geral de segurança?',
  'Quais alertas críticos estão abertos?',
  'Resumo de vulnerabilidades encontradas',
  'Quais agentes estão offline?',
];

/**
 * Renders markdown with rich styling for security context.
 * Detects section headers, severity keywords, and structured data.
 */
const CopilotMarkdown = ({ content }: { content: string }) => {
  return (
    <div className="copilot-markdown text-sm leading-relaxed">
      <ReactMarkdown
        components={{
          h1: ({ children }) => (
            <h1 className="text-base font-bold text-foreground mt-3 mb-1.5 pb-1 border-b border-border/50 flex items-center gap-1.5">
              <Shield className="h-4 w-4 text-cta-positive shrink-0" />
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-sm font-bold text-foreground mt-3 mb-1 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-semibold text-foreground mt-2 mb-1">
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p className="text-muted-foreground mb-1.5 last:mb-0">{children}</p>
          ),
          strong: ({ children }) => {
            const text = String(children).toLowerCase();
            // Color-code severity keywords
            if (text.includes('crítico') || text.includes('critical') || text.includes('alto risco')) {
              return <strong className="text-red-400 font-semibold">{children}</strong>;
            }
            if (text.includes('atenção') || text.includes('warning') || text.includes('médio')) {
              return <strong className="text-amber-400 font-semibold">{children}</strong>;
            }
            if (text.includes('ok') || text.includes('estável') || text.includes('excelente') || text.includes('saudável')) {
              return <strong className="text-emerald-400 font-semibold">{children}</strong>;
            }
            return <strong className="text-foreground font-semibold">{children}</strong>;
          },
          ul: ({ children }) => (
            <ul className="space-y-0.5 mb-2 ml-1">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="space-y-1 mb-2 ml-1 list-none counter-reset-item">{children}</ol>
          ),
          li: ({ children, ...props }) => {
            const ordered = (props as any).ordered;
            const index = (props as any).index;
            return (
              <li className="flex items-start gap-1.5 text-muted-foreground">
                {ordered ? (
                  <span className="text-primary font-bold text-xs mt-0.5 shrink-0 min-w-[1.2rem]">{(Number(index ?? 0)) + 1}.</span>
                ) : (
                  <span className="text-primary mt-1.5 shrink-0">•</span>
                )}
                <span className="flex-1">{children}</span>
              </li>
            );
          },
          code: ({ children, className }) => {
            const isBlock = className?.includes('language-');
            if (isBlock) {
              return (
                <code className="block bg-background/80 border border-border/50 rounded-md p-2 my-1.5 text-xs font-mono text-foreground overflow-x-auto">
                  {children}
                </code>
              );
            }
            return (
              <code className="bg-background/60 border border-border/40 rounded px-1 py-0.5 text-xs font-mono text-primary">
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="my-1.5 overflow-x-auto">{children}</pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-primary/50 pl-3 my-2 text-muted-foreground italic">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="border-border/50 my-2" />,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:text-primary/80">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export const SecurityCopilot = () => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  const streamChat = useCallback(async (allMessages: Message[]) => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error('Você precisa estar logado para usar o Copilot');

    const resp = await fetch(CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ messages: allMessages }),
    });

    if (!resp.ok || !resp.body) {
      const errData = await resp.json().catch(() => ({ error: 'Erro de conexão' }));
      throw new Error(errData.error || `Erro ${resp.status}`);
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let assistantContent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIdx: number;
      while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
        let line = buffer.slice(0, newlineIdx);
        buffer = buffer.slice(newlineIdx + 1);
        if (line.endsWith('\r')) line = line.slice(0, -1);
        if (!line.startsWith('data: ') || line.trim() === '') continue;
        const jsonStr = line.slice(6).trim();
        if (jsonStr === '[DONE]') break;
        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            assistantContent += content;
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last?.role === 'assistant') {
                return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantContent } : m);
              }
              return [...prev, { role: 'assistant', content: assistantContent }];
            });
          }
        } catch { /* partial JSON, ignore */ }
      }
    }
  }, []);

  const send = async (text: string) => {
    if (!text.trim() || isLoading) return;
    const userMsg: Message = { role: 'user', content: text.trim() };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput('');
    setIsLoading(true);

    try {
      await streamChat(updated);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ ${e instanceof Error ? e.message : 'Erro desconhecido'}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  return (
    <>
      {/* FAB Button */}
      <AnimatePresence>
        {!open && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-50"
          >
            <Button
              onClick={() => setOpen(true)}
              size="lg"
              className="rounded-full w-14 h-14 shadow-lg bg-primary hover:bg-primary/90 p-0"
            >
              <Bot className="h-6 w-6" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-50 w-[calc(100vw-2rem)] md:w-[460px] h-[520px] md:h-[600px] bg-card border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <span className="font-semibold text-sm text-foreground block leading-tight">Security Copilot</span>
                  <span className="text-[10px] text-muted-foreground leading-tight">Assistente de segurança AI</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMessages([])}>
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)}>
                  <X className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-2">
                  <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <Bot className="h-7 w-7 text-primary/60" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground mb-1">Olá! Sou o Copilot de Segurança</p>
                    <p className="text-xs text-muted-foreground">
                      Pergunte sobre alertas, vulnerabilidades, agentes ou postura de segurança do seu ambiente.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5 justify-center">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => send(s)}
                        className="text-xs px-3 py-1.5 rounded-full border border-border bg-muted/50 text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15 }}
                  className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}
                >
                  {msg.role === 'assistant' && (
                    <div className="h-6 w-6 rounded-md bg-primary/10 flex items-center justify-center shrink-0 mr-2 mt-0.5">
                      <Sparkles className="h-3 w-3 text-primary" />
                    </div>
                  )}
                  <div className={cn(
                    'max-w-[85%] rounded-xl px-3.5 py-2.5',
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-br-sm'
                      : 'bg-muted/60 border border-border/40 text-foreground rounded-bl-sm'
                  )}>
                    {msg.role === 'assistant' ? (
                      <CopilotMarkdown content={msg.content} />
                    ) : (
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>
                </motion.div>
              ))}

              {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
                <div className="flex justify-start">
                  <div className="h-6 w-6 rounded-md bg-primary/10 flex items-center justify-center shrink-0 mr-2">
                    <Sparkles className="h-3 w-3 text-primary" />
                  </div>
                  <div className="bg-muted/60 border border-border/40 rounded-xl rounded-bl-sm px-3.5 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                      <span className="text-xs text-muted-foreground">Analisando...</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="border-t border-border px-3 py-2.5 bg-muted/20">
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Pergunte sobre segurança..."
                  rows={1}
                  className="flex-1 resize-none bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
                  style={{ maxHeight: '80px' }}
                />
                <Button
                  onClick={() => send(input)}
                  disabled={!input.trim() || isLoading}
                  size="icon"
                  className="h-9 w-9 shrink-0 rounded-lg"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
