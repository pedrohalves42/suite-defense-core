import { ContactForm } from "@/components/ContactForm";
import { LANDING_CONTENT } from "@/constants/landing-content";

export function ContactSection() {
  const { contact } = LANDING_CONTENT;

  return (
    <section id="contato" className="py-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl md:text-4xl font-bold mb-6 text-center">
          {contact.title}
        </h2>
        <ContactForm />
      </div>
    </section>
  );
}
