import { CheckCircle, ArrowRight } from "lucide-react";
import { useLandingContent } from "@/hooks/useLandingContent";
import { ContactForm } from "@/components/ContactForm";
import { motion } from "framer-motion";

export function OfferFormSection() {
  const { offer } = useLandingContent();

  return (
    <section id="contato" className="py-32 relative overflow-hidden bg-[#020203]">
      <div className="absolute inset-0 bg-gradient-to-b from-[#020203] via-cta-positive/[0.02] to-[#020203]" />
      
      <div className="relative max-w-7xl mx-auto px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-20 items-start">
          {/* Left: Offer details */}
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="space-y-10 lg:sticky lg:top-32"
          >
            <div className="space-y-6">
              <h2 className="text-4xl md:text-5xl font-display font-extrabold text-white leading-tight tracking-tight">
                {offer.title}
              </h2>
              <p className="text-lg text-white/50 leading-relaxed font-medium">
                {offer.text}
              </p>
            </div>

            <div className="p-10 rounded-[2.5rem] glass-card border-white/5 space-y-6 shadow-premium relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-cta-positive/[0.05] via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
              <div className="relative space-y-5">
                {offer.items.map((item, index) => (
                  <div key={index} className="flex items-center gap-4 group/item">
                    <div className="w-6 h-6 rounded-full bg-cta-positive/20 flex items-center justify-center group-hover/item:scale-110 transition-transform">
                      <CheckCircle className="w-4 h-4 text-cta-positive" />
                    </div>
                    <span className="text-white/80 font-medium">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-sm text-white/30 font-bold uppercase tracking-widest italic flex items-center gap-3">
              <span className="w-8 h-px bg-white/10" />
              {offer.microcopy}
            </p>
          </motion.div>

          {/* Right: Form */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <div className="p-10 rounded-[3rem] glass-card border-white/5 shadow-2xl relative">
              <div className="absolute -top-10 -right-10 w-40 h-40 bg-cta-positive/10 rounded-full blur-[80px]" />
              <ContactForm />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
