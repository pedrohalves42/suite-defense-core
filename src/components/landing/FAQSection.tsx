import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useLandingContent } from "@/hooks/useLandingContent";
import { SectionHeader } from "./shared/SectionHeader";

export function FAQSection() {
  const { faq } = useLandingContent();

  return (
    <section id="faq" className="py-20">
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
