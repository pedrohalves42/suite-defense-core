import { AlertTriangle, ArrowRight, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useLandingContent } from "@/hooks/useLandingContent";
import { FeatureCard } from "./shared/FeatureCard";
import { motion } from "framer-motion";

export function PainPointsSection() {
  const { painPoints } = useLandingContent();

  return (
    <section className="py-32 relative overflow-hidden bg-background">
      {/* Refined Dark Gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-destructive/5 to-background" />
      {/* Subtle red side glow */}
      <div className="absolute top-1/2 -left-32 w-[500px] h-[500px] bg-destructive/10 rounded-full blur-[140px] opacity-30" />
      
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
              <div className="inline-flex items-center gap-3 px-5 py-2 rounded-full glass-card border-destructive/30 shadow-2xl">
                <ShieldAlert className="w-4 h-4 text-destructive animate-pulse" />
                <span className="text-[10px] font-bold tracking-[0.15em] uppercase text-destructive">{painPoints.badge}</span>
              </div>

              <div className="space-y-6">
                {painPoints.questions.map((question, index) => (
                  <motion.p 
                    key={index} 
                    className="text-2xl md:text-3xl font-display font-extrabold text-white leading-tight tracking-tight drop-shadow-sm"
                    initial={{ opacity: 0, x: -30 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.15, duration: 0.8, ease: "easeOut" }}
                  >
                    {question}
                  </motion.p>
                ))}
              </div>

              <h2 className="text-xl font-bold text-destructive/90 pt-4 font-display uppercase tracking-widest italic">
                {painPoints.conclusion}
              </h2>

              <Button 
                asChild 
                size="lg" 
                variant="cta"
                className="mt-8 h-14 px-10 shadow-[0_15px_30px_rgba(16,185,129,0.2)] hover:shadow-[0_15px_40px_rgba(16,185,129,0.4)] transition-all duration-500 rounded-full border border-white/10 interactive-hover"
              >
                <Link to="/signup">
                  {painPoints.cta}
                  <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
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