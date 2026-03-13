import { useState, useMemo } from "react";
import { Navbar } from "@/components/Navbar";
import { SEOHead } from "@/components/SEOHead";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  Search, BookOpen, Shield, Monitor, Users, Settings, FileText,
  Zap, HelpCircle, PlayCircle, ChevronRight, Clock, Star,
  AlertTriangle, Terminal, Download, Lock, BarChart3, Bell,
  Server, RefreshCw, ArrowRight, Lightbulb, CheckCircle2, Bug,
  Upload, Film
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  tutorials, faqs, categories, difficultyConfig, quickStartCards,
  tutorialVideoUrls, type Tutorial, type TroubleshootingItem
} from "@/data/tutorials-data";

const categoryIcons: Record<string, any> = {
  all: BookOpen, inicio: Zap, dashboard: Monitor, agentes: Server,
  seguranca: Shield, automacao: RefreshCw, admin: Users, relatorios: FileText,
};

const quickStartIcons = [Download, Shield, Users, BarChart3, Bell, Settings];

const VideoSection = ({ tutorialId }: { tutorialId: string }) => {
  const videoUrl = tutorialVideoUrls[tutorialId];

  if (!videoUrl) {
    return (
      <div className="mx-5 mt-5 rounded-lg border-2 border-dashed border-border bg-muted/20 flex flex-col items-center justify-center py-10 gap-3">
        <div className="w-14 h-14 rounded-full bg-muted/50 flex items-center justify-center">
          <Film className="h-7 w-7 text-muted-foreground/50" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">Nenhum vídeo configurado</p>
        <p className="text-xs text-muted-foreground/70 max-w-xs text-center">
          Adicione uma URL de vídeo em <code className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono">tutorials-data.ts</code> → <code className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono">tutorialVideoUrls["{tutorialId}"]</code>
        </p>
      </div>
    );
  }

  // YouTube embed
  if (videoUrl.includes("youtube.com/embed") || videoUrl.includes("youtu.be")) {
    const embedUrl = videoUrl.includes("youtu.be")
      ? videoUrl.replace("youtu.be/", "youtube.com/embed/")
      : videoUrl;
    return (
      <div className="mx-5 mt-5 rounded-lg overflow-hidden border border-border aspect-video">
        <iframe src={embedUrl} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen className="w-full h-full" />
      </div>
    );
  }

  // Direct video file (mp4, webm, etc.)
  return (
    <div className="mx-5 mt-5 rounded-lg overflow-hidden border border-border">
      <video src={videoUrl} controls playsInline className="w-full h-auto max-h-80 object-cover bg-black" />
    </div>
  );
};

const Tutorials = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [expandedTutorial, setExpandedTutorial] = useState<string | null>(null);
  const [completedSteps, setCompletedSteps] = useState<Record<string, number[]>>({});
  const [showTroubleshooting, setShowTroubleshooting] = useState<Record<string, boolean>>({});

  const filteredTutorials = useMemo(() => {
    return tutorials.filter((t) => {
      const matchesCategory = activeCategory === "all" || t.category === activeCategory;
      const q = searchQuery.toLowerCase();
      const matchesSearch = !q || t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.tags.some((tag) => tag.includes(q));
      return matchesCategory && matchesSearch;
    });
  }, [searchQuery, activeCategory]);

  const filteredFaqs = useMemo(() => {
    if (!searchQuery) return faqs;
    const q = searchQuery.toLowerCase();
    return faqs.filter((f) => f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q));
  }, [searchQuery]);

  const toggleStep = (tutorialId: string, stepIndex: number) => {
    setCompletedSteps(prev => {
      const current = prev[tutorialId] || [];
      return { ...prev, [tutorialId]: current.includes(stepIndex) ? current.filter(i => i !== stepIndex) : [...current, stepIndex] };
    });
  };

  const getProgress = (tutorialId: string, totalSteps: number) => {
    return Math.round(((completedSteps[tutorialId] || []).length / totalSteps) * 100);
  };


  return (
    <>
      <SEOHead title="Tutoriais & Base de Conhecimento — CyberShield" description="Guias completos, vídeos e FAQ para dominar o CyberShield." canonicalUrl="/tutorials" />
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="pt-24 pb-16">
          {/* Hero */}
          <section className="max-w-6xl mx-auto px-4 sm:px-6 text-center mb-12">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 text-accent mb-6">
                <BookOpen className="h-4 w-4" />
                <span className="text-sm font-medium">Central de Aprendizado</span>
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4">Tutoriais & Base de Conhecimento</h1>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
                {tutorials.length} guias detalhados com vídeos, {faqs.length} FAQs, cenários reais e troubleshooting técnico.
              </p>
              <div className="relative max-w-xl mx-auto">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Pesquisar tutoriais, artigos e perguntas..." className="pl-12 h-12 text-base bg-card border-border" />
              </div>
            </motion.div>
          </section>

          {/* Quick Start */}
          {!searchQuery && activeCategory === "all" && (
            <section className="max-w-6xl mx-auto px-4 sm:px-6 mb-12">
              <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2"><Zap className="h-5 w-5 text-accent" />Início Rápido</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {quickStartCards.map((card, i) => {
                  const Icon = quickStartIcons[i] || BookOpen;
                  return (
                    <motion.button key={card.tutorialId} whileHover={{ y: -2 }} onClick={() => { setExpandedTutorial(card.tutorialId); setTimeout(() => document.getElementById(`tutorial-${card.tutorialId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 100); }}
                      className="bg-card border border-border rounded-xl p-4 text-left hover:border-accent/40 hover:bg-accent/5 transition-all group">
                      <Icon className="h-5 w-5 text-accent mb-2" />
                      <h3 className="text-xs font-semibold text-foreground mb-1">{card.title}</h3>
                      <p className="text-[10px] text-muted-foreground leading-tight">{card.desc}</p>
                    </motion.button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Tabs */}
          <section className="max-w-6xl mx-auto px-4 sm:px-6">
            <Tabs defaultValue="tutorials" className="w-full">
              <TabsList className="grid w-full max-w-md mx-auto grid-cols-2 mb-8">
                <TabsTrigger value="tutorials" className="gap-2"><PlayCircle className="h-4 w-4" />Tutoriais ({tutorials.length})</TabsTrigger>
                <TabsTrigger value="faq" className="gap-2"><HelpCircle className="h-4 w-4" />FAQ ({faqs.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="tutorials">
                {/* Category Filter */}
                <div className="flex flex-wrap gap-2 mb-8 justify-center">
                  {categories.map((cat) => {
                    const Icon = categoryIcons[cat.id] || BookOpen;
                    const count = cat.id === "all" ? tutorials.length : tutorials.filter(t => t.category === cat.id).length;
                    return (
                      <button key={cat.id} onClick={() => setActiveCategory(cat.id)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border
                          ${activeCategory === cat.id ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border hover:text-foreground hover:border-foreground/30"}`}>
                        <Icon className="h-3.5 w-3.5" />{cat.label}<span className="opacity-60">({count})</span>
                      </button>
                    );
                  })}
                </div>

                {filteredTutorials.length === 0 ? (
                  <div className="text-center py-16"><Search className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" /><p className="text-muted-foreground">Nenhum tutorial encontrado para "{searchQuery}"</p></div>
                ) : (
                  <div className="grid gap-4">
                    {filteredTutorials.map((tutorial, index) => {
                      const isExpanded = expandedTutorial === tutorial.id;
                      const progress = getProgress(tutorial.id, tutorial.steps.length);
                      const videoSrc = getVideoSrc(tutorial);
                      const hasTroubleshooting = tutorial.troubleshooting && tutorial.troubleshooting.length > 0;
                      const showTS = showTroubleshooting[tutorial.id];

                      return (
                        <motion.div key={tutorial.id} id={`tutorial-${tutorial.id}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.02 }}>
                          <div className={`bg-card border border-border rounded-xl overflow-hidden transition-all ${isExpanded ? "ring-2 ring-accent/30" : "hover:border-foreground/20"}`}>
                            {/* Header */}
                            <button onClick={() => setExpandedTutorial(isExpanded ? null : tutorial.id)} className="w-full flex items-start gap-4 p-5 text-left">
                              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center mt-0.5"><BookOpen className="h-5 w-5 text-accent" /></div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <h3 className="text-base font-semibold text-foreground">{tutorial.title}</h3>
                                  <Badge variant="outline" className={`text-xs ${difficultyConfig[tutorial.difficulty].color}`}>{difficultyConfig[tutorial.difficulty].label}</Badge>
                                  {videoSrc && <Badge variant="outline" className="text-xs bg-purple-500/10 text-purple-400 border-purple-500/20"><PlayCircle className="h-3 w-3 mr-1" />Vídeo</Badge>}
                                  {hasTroubleshooting && <Badge variant="outline" className="text-xs bg-orange-500/10 text-orange-400 border-orange-500/20"><Bug className="h-3 w-3 mr-1" />Troubleshoot</Badge>}
                                </div>
                                <p className="text-sm text-muted-foreground line-clamp-2">{tutorial.description}</p>
                                <div className="flex items-center gap-4 mt-2 flex-wrap">
                                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3 w-3" />{tutorial.estimatedTime}</span>
                                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Star className="h-3 w-3" />{tutorial.steps.length} etapas</span>
                                  {progress > 0 && <span className="inline-flex items-center gap-1 text-xs text-accent font-medium"><CheckCircle2 className="h-3 w-3" />{progress}%</span>}
                                </div>
                                {tutorial.prerequisites && tutorial.prerequisites.length > 0 && (
                                  <div className="flex items-center gap-1 mt-1.5 text-xs text-muted-foreground/70"><Lock className="h-3 w-3" />Pré-requisitos: {tutorial.prerequisites.map(p => tutorials.find(t => t.id === p)?.title || p).join(", ")}</div>
                                )}
                              </div>
                              <ChevronRight className={`h-5 w-5 text-muted-foreground flex-shrink-0 mt-2 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                            </button>

                            {/* Expanded Content */}
                            <AnimatePresence>
                              {isExpanded && (
                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3 }} className="border-t border-border overflow-hidden">
                                  {/* Video */}
                                  {videoSrc && (
                                    <div className="mx-5 mt-5 rounded-lg overflow-hidden border border-border">
                                      <video src={videoSrc} autoPlay loop muted playsInline className="w-full h-auto max-h-64 object-cover bg-black" />
                                    </div>
                                  )}

                                  {/* Real-world scenarios */}
                                  {tutorial.realWorldScenarios && tutorial.realWorldScenarios.length > 0 && (
                                    <div className="mx-5 mt-4 grid gap-2 sm:grid-cols-2">
                                      {tutorial.realWorldScenarios.map((s, i) => (
                                        <div key={i} className="p-3 rounded-lg bg-accent/5 border border-accent/10">
                                          <p className="text-xs font-semibold text-accent mb-1">📋 {s.title}</p>
                                          <p className="text-xs text-muted-foreground leading-relaxed">{s.description}</p>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {/* Progress bar */}
                                  <div className="mx-5 mt-4 flex items-center gap-3">
                                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${progress}%` }} /></div>
                                    <span className="text-xs text-muted-foreground font-medium">{progress}%</span>
                                  </div>

                                  {/* Steps */}
                                  <div className="p-5 space-y-5">
                                    {tutorial.steps.map((step, stepIndex) => {
                                      const isChecked = (completedSteps[tutorial.id] || []).includes(stepIndex);
                                      return (
                                        <div key={stepIndex} className="flex gap-4">
                                          <button onClick={() => toggleStep(tutorial.id, stepIndex)}
                                            className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${isChecked ? "bg-accent text-accent-foreground" : "bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20"}`}>
                                            {isChecked ? <CheckCircle2 className="h-4 w-4" /> : stepIndex + 1}
                                          </button>
                                          <div className="flex-1 min-w-0">
                                            <h4 className={`text-sm font-semibold mb-1 ${isChecked ? "text-muted-foreground line-through" : "text-foreground"}`}>{step.title}</h4>
                                            <p className="text-sm text-muted-foreground leading-relaxed">{step.content}</p>
                                            {step.scenario && (
                                              <div className="mt-2 p-3 rounded-lg bg-muted/30 border border-border"><p className="text-xs text-muted-foreground leading-relaxed">🎯 <strong>Cenário real:</strong> {step.scenario}</p></div>
                                            )}
                                            {step.tip && (
                                              <div className="mt-2 flex gap-2 p-3 rounded-lg bg-accent/5 border border-accent/20"><Lightbulb className="h-4 w-4 text-accent flex-shrink-0 mt-0.5" /><p className="text-xs text-accent leading-relaxed"><strong>Dica:</strong> {step.tip}</p></div>
                                            )}
                                            {step.warning && (
                                              <div className="mt-2 flex gap-2 p-3 rounded-lg bg-destructive/5 border border-destructive/20"><AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" /><p className="text-xs text-destructive leading-relaxed"><strong>Atenção:</strong> {step.warning}</p></div>
                                            )}
                                            {step.code && (
                                              <div className="mt-2 rounded-lg bg-muted/50 border border-border overflow-hidden">
                                                <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/80 border-b border-border"><Terminal className="h-3 w-3 text-muted-foreground" /><span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Comando</span></div>
                                                <pre className="p-3 text-xs text-foreground/80 overflow-x-auto font-mono leading-relaxed whitespace-pre-wrap">{step.code}</pre>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>

                                  {/* Troubleshooting */}
                                  {hasTroubleshooting && (
                                    <div className="mx-5 mb-5">
                                      <button onClick={() => setShowTroubleshooting(p => ({ ...p, [tutorial.id]: !p[tutorial.id] }))}
                                        className="w-full flex items-center gap-2 p-3 rounded-lg bg-orange-500/5 border border-orange-500/20 text-orange-400 text-sm font-medium hover:bg-orange-500/10 transition-colors">
                                        <Bug className="h-4 w-4" />Troubleshooting ({tutorial.troubleshooting!.length} problemas comuns)
                                        <ChevronRight className={`h-4 w-4 ml-auto transition-transform ${showTS ? "rotate-90" : ""}`} />
                                      </button>
                                      {showTS && (
                                        <div className="mt-3 space-y-3">
                                          {tutorial.troubleshooting!.map((ts, i) => (
                                            <div key={i} className="p-4 rounded-lg bg-card border border-border">
                                              <p className="text-sm font-semibold text-destructive mb-1">❌ {ts.problem}</p>
                                              <p className="text-xs text-muted-foreground mb-1"><strong>Causa:</strong> {ts.cause}</p>
                                              <p className="text-xs text-foreground/80 leading-relaxed"><strong>Solução:</strong> {ts.solution}</p>
                                              {ts.code && (
                                                <pre className="mt-2 p-3 rounded bg-muted/50 border border-border text-xs font-mono overflow-x-auto whitespace-pre-wrap">{ts.code}</pre>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>

              {/* FAQ */}
              <TabsContent value="faq">
                {filteredFaqs.length === 0 ? (
                  <div className="text-center py-16"><HelpCircle className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" /><p className="text-muted-foreground">Nenhuma pergunta encontrada</p></div>
                ) : (
                  <div className="max-w-3xl mx-auto">
                    <Accordion type="multiple" className="space-y-3">
                      {filteredFaqs.map((faq, index) => (
                        <AccordionItem key={index} value={`faq-${index}`} className="bg-card border border-border rounded-xl px-5 data-[state=open]:ring-2 data-[state=open]:ring-accent/20">
                          <AccordionTrigger className="text-left text-sm font-medium text-foreground hover:no-underline py-4">{faq.question}</AccordionTrigger>
                          <AccordionContent className="text-sm text-muted-foreground pb-4 leading-relaxed">{faq.answer}</AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </section>
        </main>
      </div>
    </>
  );
};

export default Tutorials;
