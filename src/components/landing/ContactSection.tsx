import { ContactForm } from "@/components/ContactForm";
import { useLandingContent } from "@/hooks/useLandingContent";
import { motion } from "framer-motion";

export function ContactSection() {
  const { contact } = useLandingContent();

  return (
    <section id="contato" className="py-24 relative">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-cta-positive/[0.03] to-muted/20" />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-8 text-center text-foreground">
            {contact.title}
          </h2>
          <ContactForm />
        </motion.div>
      </div>
    </section>
  );
}
