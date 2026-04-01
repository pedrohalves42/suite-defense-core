import { CheckCircle, ArrowRight } from "lucide-react";
import { useLandingContent } from "@/hooks/useLandingContent";
import { ContactForm } from "@/components/ContactForm";
import { motion } from "framer-motion";

export function OfferFormSection() {
  const { offer } = useLandingContent();

  return (
    <section id="contato" className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-info/[0.02] to-cta-positive/[0.02]" />
      
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-16 items-start">
          {/* Left: Offer details */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="space-y-8 lg:sticky lg:top-24"
          >
            <div className="space-y-4">
              <h2 className="text-3xl md:text-4xl font-bold text-foreground leading-tight">
                {offer.title}
              </h2>
              <p className="text-lg text-muted-foreground leading-relaxed">
                {offer.text}
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-card border border-border space-y-3">
              {offer.items.map((item, index) => (
                <div key={index} className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-cta-positive shrink-0" />
                  <span className="text-foreground">{item}</span>
                </div>
              ))}
            </div>

            <p className="text-sm text-muted-foreground italic">
              {offer.microcopy}
            </p>
          </motion.div>

          {/* Right: Form */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <div className="p-8 rounded-2xl bg-card border border-border shadow-elevated">
              <ContactForm />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
