import { useLandingContent } from "@/hooks/useLandingContent";
import { SectionHeader } from "./shared/SectionHeader";
import { motion } from "framer-motion";

export function HowItWorksSection() {
  const { howItWorks } = useLandingContent();

  const stepColors = [
    { bg: "bg-info", text: "text-white", shadow: "shadow-info/20", ring: "border-info/20" },
    { bg: "bg-warning", text: "text-warning-foreground", shadow: "shadow-warning/20", ring: "border-warning/20" },
    { bg: "bg-cta-positive", text: "text-cta-positive-foreground", shadow: "shadow-cta-positive/20", ring: "border-cta-positive/20" },
    { bg: "bg-accent", text: "text-accent-foreground", shadow: "shadow-accent/20", ring: "border-accent/20" },
  ];

  return (
    <section className="py-32 relative bg-background">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-info/5 to-background" />
      <div className="relative max-w-7xl mx-auto px-6 lg:px-8">
        <SectionHeader title={howItWorks.title} subtitle={howItWorks.subtitle} />
        <div className="max-w-6xl mx-auto relative">
          {/* Animated progress line */}
          <div className="hidden md:block absolute top-12 left-[10%] right-[10%] h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          
          <div className="grid md:grid-cols-4 gap-12">
            {howItWorks.steps.map((step, index) => {
              return (
                <motion.div 
                  key={index} 
                  className="relative text-center group" 
                  initial={{ opacity: 0, y: 30 }} 
                  whileInView={{ opacity: 1, y: 0 }} 
                  viewport={{ once: true }} 
                  transition={{ delay: index * 0.15, duration: 0.8 }}
                >
                  <div className="relative inline-flex mb-8">
                    <div className="w-20 h-20 glass-card rounded-3xl flex items-center justify-center font-display font-black text-2xl text-cta-positive shadow-2xl group-hover:scale-110 group-hover:rotate-3 transition-all duration-500 border-white/10">
                      {step.number}
                    </div>
                    <div className="absolute -inset-3 rounded-[2rem] border border-white/[0.03] scale-90 opacity-0 group-hover:scale-100 group-hover:opacity-100 transition-all duration-700" />
                  </div>
                  <h3 className="text-xl font-bold mb-3 text-white tracking-tight">{step.title}</h3>
                  <p className="text-sm text-white/40 leading-relaxed font-medium px-2">{step.description}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
