import { useLandingContent } from "@/hooks/useLandingContent";
import { SectionHeader } from "./shared/SectionHeader";
import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";

export function TrustProofSection() {
  const { trustProof } = useLandingContent();

  return (
    <section className="py-32 relative overflow-hidden bg-background">
      {/* Dark premium background with more visibility */}
      <div className="absolute inset-0 bg-gradient-to-br from-background via-white/[0.01] to-background" />
      <div className="absolute top-1/2 left-1/4 w-[600px] h-[600px] bg-cta-positive/10 rounded-full blur-[160px] opacity-20" />
      
      <div className="relative max-w-7xl mx-auto px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="text-center mb-20 space-y-6"
        >
          <h2 className="text-4xl md:text-5xl font-display font-extrabold text-white leading-tight tracking-tight">
            {trustProof.title}
          </h2>
          <p className="text-lg text-white/50 max-w-3xl mx-auto leading-relaxed font-medium">
            {trustProof.text}
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-7xl mx-auto stagger-visible">
          {trustProof.blocks.map((block: any, index: number) => {
            const Icon = block.icon as LucideIcon;
            return (
              <motion.div
                key={index}
                className="group p-10 rounded-[2.5rem] glass-card border-white/5 hover:border-cta-positive/30 transition-all duration-700"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1, duration: 0.8 }}
              >
                <div className="w-16 h-16 bg-cta-positive/10 rounded-2xl flex items-center justify-center mb-8 group-hover:scale-110 transition-transform duration-700 shadow-glow">
                  <Icon className="w-8 h-8 text-cta-positive" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-4 tracking-tight">{block.title}</h3>
                <p className="text-base text-white/40 leading-relaxed font-medium group-hover:text-white/60 transition-colors duration-500">{block.description}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
