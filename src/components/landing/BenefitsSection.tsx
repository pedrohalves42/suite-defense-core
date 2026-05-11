import { useLandingContent } from "@/hooks/useLandingContent";
import { SectionHeader } from "./shared/SectionHeader";
import { motion } from "framer-motion";
import { safeMap } from "@/lib/safe-data";
import { LucideIcon } from "lucide-react";

export function BenefitsSection() {
  const { benefits } = useLandingContent();

  if (!benefits || !Array.isArray(benefits.cards)) return null;

  return (
    <section id="recursos" className="py-32 relative bg-background">
      {/* Refined gradient layer */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-cta-positive/[0.03] to-background" />
      
      <div className="relative max-w-7xl mx-auto px-6 lg:px-8">
        <SectionHeader 
          title={benefits.title}
          subtitle={benefits.subtitle}
        />

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-7xl mx-auto stagger-visible">
          {safeMap(benefits.cards, (card: any, index: number) => {
            const Icon = card.icon as LucideIcon;
            return (
              <motion.div 
                key={index}
                className="group relative p-10 rounded-[2.5rem] glass-card border-white/5 hover:border-cta-positive/30 transition-all duration-700 hover:shadow-premium"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1, duration: 0.8 }}
              >
                {/* Visual Depth Glow */}
                <div className="absolute inset-0 rounded-[2.5rem] bg-gradient-to-br from-cta-positive/[0.05] via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                
                <div className="relative z-10">
                  <div className="w-20 h-20 bg-cta-positive/10 rounded-[2rem] flex items-center justify-center mb-8 group-hover:scale-110 group-hover:rotate-6 transition-all duration-700 ease-premium shadow-glow">
                    <Icon className="w-10 h-10 text-cta-positive" />
                  </div>
                  <h3 className="text-2xl font-bold mb-4 text-white tracking-tight leading-tight">{card.title}</h3>
                  <p className="text-base text-white/40 leading-relaxed font-medium group-hover:text-white/60 transition-colors duration-500">{card.description}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}