import { CheckCircle, ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLandingContent } from "@/hooks/useLandingContent";
import { motion } from "framer-motion";

export function AssessmentSection() {
  const { assessment } = useLandingContent();

  return (
    <section className="py-32 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-cta-positive/[0.02] to-background" />
      
      <div className="relative max-w-7xl mx-auto px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-20 items-center">
          {/* Left: Text */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="space-y-8"
          >
            <div className="inline-flex items-center gap-3 px-5 py-2 rounded-full glass-card border-white/10 shadow-2xl">
              <Sparkles className="w-4 h-4 text-cta-positive" />
              <span className="text-[10px] font-bold tracking-[0.15em] uppercase text-cta-positive">Diagnóstico Profundo</span>
            </div>
            
            <h2 className="text-4xl md:text-5xl font-display font-extrabold text-white leading-tight tracking-tight">
              {assessment.title}
            </h2>
            <p className="text-lg text-white/50 leading-relaxed font-medium">
              {assessment.text}
            </p>
          </motion.div>

          {/* Right: Checklist */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <div className="p-10 rounded-[2.5rem] glass-card border-white/5 shadow-premium space-y-6 relative overflow-hidden group hover:border-cta-positive/20 transition-colors duration-700">
              <div className="absolute inset-0 bg-gradient-to-br from-cta-positive/[0.05] via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
              
              <div className="relative space-y-5">
                {assessment.items.map((item, index) => (
                  <motion.div
                    key={index}
                    className="flex items-center gap-4 p-4 rounded-2xl bg-white/[0.02] border border-white/5 group/item hover:bg-white/[0.04] transition-all duration-300"
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.2 + index * 0.1 }}
                  >
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-cta-positive/20 flex items-center justify-center group-hover/item:scale-110 transition-transform">
                      <CheckCircle className="w-4 h-4 text-cta-positive" />
                    </div>
                    <span className="text-white/80 font-medium">{item}</span>
                  </motion.div>
                ))}
              </div>

              <Button
                size="lg"
                variant="cta"
                className="w-full h-16 text-lg font-bold rounded-full shadow-[0_20px_40px_rgba(16,185,129,0.2)] hover:shadow-[0_20px_50px_rgba(16,185,129,0.4)] transition-all duration-500 border border-white/10 relative z-10"
                onClick={() => document.getElementById('contato')?.scrollIntoView({ behavior: 'smooth' })}
              >
                {assessment.cta}
                <ArrowRight className="ml-2 h-6 w-6 group-hover:translate-x-1 transition-transform" />
              </Button>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
