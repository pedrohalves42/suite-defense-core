import { useLandingContent } from "@/hooks/useLandingContent";
import { SectionHeader } from "./shared/SectionHeader";
import { motion } from "framer-motion";

export function TrustProofSection() {
  const { trustProof } = useLandingContent();

  return (
    <section className="py-24 relative overflow-hidden">
      {/* Dark premium background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[hsl(220,18%,10%)] via-[hsl(200,15%,12%)] to-[hsl(220,18%,10%)]" />
      <div className="absolute top-1/2 left-1/4 w-[400px] h-[400px] bg-cta-positive/5 rounded-full blur-[150px]" />
      
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16 space-y-4"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-white leading-tight">
            {trustProof.title}
          </h2>
          <p className="text-lg text-white/60 max-w-3xl mx-auto leading-relaxed">
            {trustProof.text}
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
          {trustProof.blocks.map((block, index) => {
            const Icon = block.icon;
            return (
              <motion.div
                key={index}
                className="p-6 rounded-2xl bg-white/5 border border-white/10 hover:border-cta-positive/30 transition-all"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <div className="w-12 h-12 bg-cta-positive/10 rounded-xl flex items-center justify-center mb-4">
                  <Icon className="w-6 h-6 text-cta-positive" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{block.title}</h3>
                <p className="text-sm text-white/50 leading-relaxed">{block.description}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
