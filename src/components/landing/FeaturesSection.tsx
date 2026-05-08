import { useLandingContent } from "@/hooks/useLandingContent";
import { SectionHeader } from "./shared/SectionHeader";
import { motion } from "framer-motion";
import { safeMap } from "@/lib/safe-data";

export function FeaturesSection() {
  const { features } = useLandingContent();

  if (!features || !Array.isArray(features.items)) return null;

  return (
    <section className="py-32 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-white/[0.01] to-background" />
      
      {/* Structural visual guides */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-full bg-gradient-to-b from-white/5 via-white/[0.02] to-transparent" />

      <div className="relative max-w-7xl mx-auto px-6 lg:px-8">
        <SectionHeader title={features.title} subtitle={features.subtitle} />
        
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-10 max-w-7xl mx-auto stagger-visible">
          {safeMap(features.items, (item, index) => {
            const Icon = item.icon;
            return (
              <motion.div 
                key={index} 
                className="group relative p-10 rounded-[2.5rem] glass-card border-white/5 shadow-premium hover:border-cta-positive/40 transition-all duration-700 ease-premium"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1, duration: 0.8 }}
              >
                <div className="absolute inset-0 premium-gradient rounded-[2.5rem] opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
                
                <div className="relative z-10">
                  <div className="w-16 h-16 bg-cta-positive/10 rounded-2xl flex items-center justify-center mb-8 group-hover:bg-cta-positive/20 group-hover:scale-110 group-hover:-rotate-3 transition-all duration-700 ease-premium shadow-glow">
                    {Icon ? (
                      <Icon className="w-8 h-8 text-cta-positive brightness-125" />
                    ) : (
                      <div className="w-8 h-8 bg-cta-positive/20 rounded-lg animate-pulse" />
                    )}
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-4 tracking-tight leading-tight">{item.title}</h3>
                  <p className="text-base text-white/40 leading-relaxed font-medium group-hover:text-white/60 transition-colors duration-500">{item.description}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
