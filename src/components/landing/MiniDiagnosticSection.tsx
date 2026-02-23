import { useState } from "react";
import { Shield, ArrowRight, AlertTriangle, CheckCircle, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

const questions = [
  {
    id: "devices",
    question: "Quantos computadores sua empresa tem?",
    options: [
      { label: "1 a 10", score: 1 },
      { label: "11 a 50", score: 2 },
      { label: "51 a 200", score: 3 },
      { label: "Mais de 200", score: 4 },
    ],
  },
  {
    id: "it",
    question: "Você tem equipe de TI dedicada?",
    options: [
      { label: "Sim, equipe interna", score: 1 },
      { label: "Terceirizado / freelancer", score: 2 },
      { label: "Um funcionário acumula função", score: 3 },
      { label: "Ninguém cuida disso", score: 4 },
    ],
  },
  {
    id: "attack",
    question: "Já sofreu algum ataque ou perda de dados?",
    options: [
      { label: "Nunca", score: 1 },
      { label: "Não sei", score: 3 },
      { label: "Sim, uma vez", score: 3 },
      { label: "Sim, mais de uma vez", score: 4 },
    ],
  },
  {
    id: "lgpd",
    question: "Sua empresa precisa cumprir a LGPD?",
    options: [
      { label: "Já estamos em conformidade", score: 1 },
      { label: "Estamos trabalhando nisso", score: 2 },
      { label: "Não sei o que é", score: 4 },
      { label: "Sei que preciso, mas não comecei", score: 3 },
    ],
  },
];

function getRiskLevel(score: number) {
  if (score <= 6) return { level: "Baixo", color: "text-success", bg: "bg-success/10 border-success/20", icon: CheckCircle, message: "Sua empresa parece ter uma boa base. Mas será que está realmente coberta? Faça o diagnóstico completo." };
  if (score <= 10) return { level: "Médio", color: "text-warning", bg: "bg-warning/10 border-warning/20", icon: AlertTriangle, message: "Existem brechas que precisam de atenção. Um diagnóstico gratuito vai revelar exatamente onde agir." };
  return { level: "Alto", color: "text-destructive", bg: "bg-destructive/10 border-destructive/20", icon: AlertTriangle, message: "Sua empresa está exposta. Cada dia sem proteção é um risco real. Faça o diagnóstico agora — é gratuito." };
}

export function MiniDiagnosticSection() {
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [showResult, setShowResult] = useState(false);

  const handleAnswer = (questionId: string, score: number) => {
    const newAnswers = { ...answers, [questionId]: score };
    setAnswers(newAnswers);

    if (currentStep < questions.length - 1) {
      setTimeout(() => setCurrentStep(currentStep + 1), 300);
    } else {
      setTimeout(() => setShowResult(true), 300);
    }
  };

  const totalScore = Object.values(answers).reduce((a, b) => a + b, 0);
  const risk = getRiskLevel(totalScore);
  const RiskIcon = risk.icon;
  const progress = showResult ? 100 : (currentStep / questions.length) * 100;

  const reset = () => {
    setCurrentStep(0);
    setAnswers({});
    setShowResult(false);
  };

  return (
    <section id="mini-diagnostico" className="py-20 bg-muted/30">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 border border-accent/20 mb-4">
            <Monitor className="w-4 h-4 text-accent" />
            <span className="text-sm font-medium">Mini Diagnóstico — 30 segundos</span>
          </div>
          <h2 className="text-2xl md:text-3xl font-bold text-foreground">
            Sua empresa está protegida?
          </h2>
          <p className="text-muted-foreground mt-2">
            Responda 4 perguntas rápidas e descubra seu nível de risco
          </p>
        </div>

        <div className="card-enterprise rounded-xl p-6 md:p-8">
          {/* Progress bar */}
          <div className="w-full h-2 bg-muted rounded-full mb-6 overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>

          {!showResult ? (
            <div className="space-y-6 animate-fade-in" key={currentStep}>
              <div className="text-center">
                <span className="text-xs text-muted-foreground font-medium">
                  Pergunta {currentStep + 1} de {questions.length}
                </span>
                <h3 className="text-lg font-semibold mt-2 text-foreground">
                  {questions[currentStep].question}
                </h3>
              </div>

              <div className="grid gap-3">
                {questions[currentStep].options.map((option, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleAnswer(questions[currentStep].id, option.score)}
                    className={cn(
                      "w-full p-4 rounded-lg border text-left transition-all duration-200",
                      "hover:border-accent hover:bg-accent/5",
                      answers[questions[currentStep].id] === option.score
                        ? "border-accent bg-accent/10"
                        : "border-border bg-card"
                    )}
                  >
                    <span className="text-sm font-medium">{option.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center space-y-6 animate-fade-in">
              <div className={cn("inline-flex items-center gap-3 px-6 py-4 rounded-xl border", risk.bg)}>
                <RiskIcon className={cn("w-8 h-8", risk.color)} />
                <div className="text-left">
                  <p className="text-xs text-muted-foreground font-medium">Seu nível de risco é</p>
                  <p className={cn("text-2xl font-bold", risk.color)}>{risk.level}</p>
                </div>
              </div>

              <p className="text-muted-foreground max-w-md mx-auto">
                {risk.message}
              </p>

              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                <Button asChild size="lg" className="btn-enterprise h-12">
                  <Link to="/signup">
                    Fazer diagnóstico completo grátis
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button variant="outline" size="lg" className="h-12" onClick={reset}>
                  Refazer teste
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                Sem cartão de crédito • Resultado detalhado em até 48h
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
