import { X, CheckCircle } from "lucide-react";
import { useLandingContent } from "@/hooks/useLandingContent";
import { SectionHeader } from "./shared/SectionHeader";
import { motion } from "framer-motion";

export function ComparisonSection() {
  const { comparison } = useLandingContent();

  return (
    <section className="py-32 relative overflow-hidden bg-[#020203]">
      <div className="absolute inset-0 bg-gradient-to-b from-[#020203] via-white/[0.01] to-[#020203]" />
      
      <div className="relative max-w-7xl mx-auto px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="text-center mb-20 space-y-6"
        >
          <h2 className="text-4xl md:text-5xl font-display font-extrabold text-white leading-tight tracking-tight">
            {comparison.title}
          </h2>
          <p className="text-lg text-white/50 max-w-3xl mx-auto leading-relaxed font-medium">
            {comparison.text}
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-10 max-w-5xl mx-auto">
          {/* Before */}
          <motion.div
            className="p-10 rounded-[2.5rem] glass-card border-white/5 relative overflow-hidden group"
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <div className="absolute inset-0 bg-destructive/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
            <div className="relative z-10">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-destructive/10 text-destructive text-[10px] font-bold uppercase tracking-widest rounded-full border border-destructive/20 mb-8">
                {comparison.before.label}
              </div>
              <ul className="space-y-5">
                {comparison.before.items.map((item, i) => (
                  <li key={i} className="flex items-center gap-4 text-white/40 font-medium">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-destructive/10 flex items-center justify-center">
                      <X className="w-3 h-3 text-destructive" />
                    </div>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>

          {/* After */}
          <motion.div
            className="p-10 rounded-[2.5rem] glass-card border-cta-positive/20 relative overflow-hidden group shadow-[0_20px_50px_rgba(16,185,129,0.1)]"
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <div className="absolute inset-0 bg-cta-positive/[0.03] opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
            <div className="relative z-10">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-cta-positive/10 text-cta-positive text-[10px] font-bold uppercase tracking-widest rounded-full border border-cta-positive/20 mb-8">
                {comparison.after.label}
              </div>
              <ul className="space-y-5">
                {comparison.after.items.map((item, i) => (
                  <li key={i} className="flex items-center gap-4 text-white/90 font-bold">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-cta-positive/20 flex items-center justify-center shadow-glow">
                      <CheckCircle className="w-4 h-4 text-cta-positive" />
                    </div>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
