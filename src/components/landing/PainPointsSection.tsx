import { AlertTriangle, ArrowRight, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useLandingContent } from "@/hooks/useLandingContent";
import { FeatureCard } from "./shared/FeatureCard";
import { motion } from "framer-motion";

export function PainPointsSection() {
  const { painPoints } = useLandingContent();

  return (
    <section className="py-24 relative overflow-hidden">
      {/* Red gradient — danger, urgency, fear (psicologia: vermelho = alerta) */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-destructive/[0.04] to-background" />
      {/* Subtle red side glow */}
      <div className="absolute top-1/2 -left-32 w-[300px] h-[300px] bg-destructive/5 rounded-full blur-[100px]" />
      
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left: Questions — red = urgency */}
          <div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="space-y-6"
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-destructive/10 border border-destructive/20">
                <ShieldAlert className="w-4 h-4 text-destructive" />
                <span className="text-sm font-medium text-destructive">{painPoints.badge}</span>
              </div>

              <div className="space-y-4">
                {painPoints.questions.map((question, index) => (
                  <motion.p 
                    key={index} 
                    className="text-xl md:text-2xl font-bold text-foreground leading-snug"
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.1 }}
                  >
                    {question}
                  </motion.p>
                ))}
              </div>

              <h2 className="text-lg font-bold text-destructive pt-2">
                {painPoints.conclusion}
              </h2>

              {/* CTA verde aqui = "escape do perigo" — contraste vermelho→verde */}
              <Button 
                asChild 
                size="lg" 
                variant="cta"
                className="mt-4 shadow-lg shadow-cta-positive/20"
              >
                <Link to="/signup">
                  {painPoints.cta}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
            </motion.div>
          </div>

          {/* Right: Stats grid — red cards = danger emphasis */}
          <div className="grid grid-cols-2 gap-4">
            {painPoints.stats.map((stat, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <FeatureCard
                  emoji={stat.emoji}
                  title={stat.title}
                  description={stat.description}
                  variant="danger"
                />
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}