import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { LANDING_CONTENT } from "@/constants/landing-content";
import { SectionHeader } from "./shared/SectionHeader";

export function FAQSection() {
  const { faq } = LANDING_CONTENT;

  return (
    <section className="py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader 
          title={faq.title}
          subtitle={faq.subtitle}
          titleClassName="text-3xl md:text-4xl"
        />

        <Accordion type="single" collapsible className="max-w-3xl mx-auto space-y-4">
          {faq.items.map((item, index) => (
            <AccordionItem key={index} value={`q${index}`}>
              <AccordionTrigger>{item.question}</AccordionTrigger>
              <AccordionContent>{item.answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
