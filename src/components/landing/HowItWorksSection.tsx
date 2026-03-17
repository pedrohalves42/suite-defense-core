import { useLandingContent } from "@/hooks/useLandingContent";
import { SectionHeader } from "./shared/SectionHeader";
import { motion } from "framer-motion";

export function HowItWorksSection() {
  const { howItWorks } = useLandingContent();

  // Color progression: blue (info) → green (action) → gold (success)
  const stepColors = [
    { bg: "bg-info", text: "text-white", shadow: "shadow-info/20", ring: "border-info/20" },
    { bg: "bg-cta-positive", text: "text-cta-positive-foreground", shadow: "shadow-cta-positive/20", ring: "border-cta-positive/20" },
    { bg: "bg-accent", text: "text-accent-foreground", shadow: "shadow-accent/20", ring: "border-accent/20" },
  ];

  return (
    <section className="py-24 relative">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-info/[0.02] to-background" />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader 
          title={howItWorks.title}
          subtitle={howItWorks.subtitle}
        />

        <div className="max-w-5xl mx-auto relative">
          {/* Connection line — gradient progression */}
          <div className="hidden md:block absolute top-16 left-[16.66%] right-[16.66%] h-px bg-gradient-to-r from-info/30 via-cta-positive/30 to-accent/30" />

          <div className="grid md:grid-cols-3 gap-12">
            {howItWorks.steps.map((step, index) => {
              const color = stepColors[index] || stepColors[0];
              return (
                <motion.div 
                  key={step.number} 
                  className="relative text-center"
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.2 }}
                >
                  <div className="relative inline-flex mb-8">
                    <div className={`w-16 h-16 ${color.bg} ${color.text} rounded-2xl flex items-center justify-center font-bold text-2xl shadow-lg ${color.shadow}`}>
                      {step.number}
                    </div>
                    <div className={`absolute -inset-2 rounded-2xl border ${color.ring}`} />
                  </div>
                  <h3 className="text-lg font-semibold mb-3 text-foreground">{step.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}