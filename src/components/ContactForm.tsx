import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import logoImage from '@/assets/logo-cybshield-new.png';
import { z } from "zod";
import { logger } from "@/lib/logger";
import { useTranslation } from "react-i18next";

function useContactFormSchema() {
  const { t } = useTranslation();
  return z.object({
    name: z.string()
      .min(2, t('contactForm.validation.nameShort'))
      .max(100, t('contactForm.validation.nameLong'))
      .regex(/^[a-zA-ZÀ-ÿ\s'-]+$/, t('contactForm.validation.nameInvalid')),
    email: z.string()
      .email(t('contactForm.validation.emailInvalid'))
      .max(255, t('contactForm.validation.emailLong')),
    company: z.string()
      .max(200, t('contactForm.validation.companyLong'))
      .optional(),
    phone: z.string()
      .regex(/^[\d\s()+-]*$/, t('contactForm.validation.phoneInvalid'))
      .max(20, t('contactForm.validation.phoneLong'))
      .optional(),
    endpoints: z.string()
      .refine((val) => val === "" || (!isNaN(Number(val)) && Number(val) >= 1 && Number(val) <= 100000), {
        message: t('contactForm.validation.endpointsInvalid')
      })
      .optional(),
    message: z.string()
      .max(2000, t('contactForm.validation.messageLong'))
      .optional()
  });
}

export const ContactForm = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    company: "",
    phone: "",
    endpoints: "",
    message: "",
  });
  const { toast } = useToast();
  const ContactFormSchema = useContactFormSchema();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrors({});

    try {
      const validation = ContactFormSchema.safeParse({
        ...formData,
        company: formData.company || undefined,
        phone: formData.phone || undefined,
        endpoints: formData.endpoints || undefined,
        message: formData.message || undefined,
      });

      if (!validation.success) {
        const fieldErrors: Record<string, string> = {};
        validation.error.issues.forEach((err) => {
          if (err.path[0]) {
            fieldErrors[err.path[0].toString()] = err.message;
          }
        });
        setErrors(fieldErrors);
        toast({
          title: t('contactForm.validationErrorTitle'),
          description: t('contactForm.validationErrorDescription'),
          variant: "destructive",
        });
        return;
      }

      const { error } = await supabase.functions.invoke('submit-contact', {
        body: {
          name: formData.name,
          email: formData.email,
          company: formData.company || null,
          phone: formData.phone || null,
          endpoints: formData.endpoints ? parseInt(formData.endpoints) : null,
          message: formData.message || null,
        }
      });

      if (error) {
        logger.error("Error submitting contact form", error);
        
        if (error.message?.includes('429') || error.message?.includes('Rate limit')) {
          toast({
            title: t('contactForm.rateLimitTitle'),
            description: t('contactForm.rateLimitDescription'),
            variant: "destructive",
          });
          return;
        }

        throw error;
      }

      toast({
        title: t('contactForm.successTitle'),
        description: t('contactForm.successDescription'),
      });

      setFormData({
        name: "",
        email: "",
        company: "",
        phone: "",
        endpoints: "",
        message: "",
      });
    } catch (error) {
      logger.error("Error submitting contact form", error);
      toast({
        title: t('contactForm.errorTitle'),
        description: t('contactForm.errorDescription'),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    if (errors[name]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  return (
    <div className="relative bg-gradient-to-br from-background via-background to-primary/5 p-8 rounded-2xl border border-border/50 backdrop-blur-sm">
      <div className="absolute -top-4 -left-4 w-24 h-24 bg-primary/20 rounded-full blur-3xl" />
      <div className="absolute -bottom-4 -right-4 w-32 h-32 bg-primary/10 rounded-full blur-3xl" />
      
      <div className="relative">
        <div className="flex items-center gap-3 mb-6">
          <img src={logoImage} alt="CyberShield" className="h-10 w-10 object-contain" />
          <div>
            <h3 className="text-2xl font-bold">{t('contactForm.talkToSales')}</h3>
            <p className="text-muted-foreground">{t('contactForm.responseTime')}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Input
                name="name"
                placeholder={t('contactForm.fullName')}
                value={formData.name}
                onChange={handleChange}
                required
                className={`bg-background/50 border-border/50 focus:border-primary transition-colors ${errors.name ? 'border-destructive' : ''}`}
              />
              {errors.name && <p className="text-xs text-destructive mt-1">{errors.name}</p>}
            </div>
            <div>
              <Input
                name="email"
                type="email"
                placeholder={t('contactForm.corporateEmail')}
                value={formData.email}
                onChange={handleChange}
                required
                className={`bg-background/50 border-border/50 focus:border-primary transition-colors ${errors.email ? 'border-destructive' : ''}`}
              />
              {errors.email && <p className="text-xs text-destructive mt-1">{errors.email}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Input
                name="company"
                placeholder={t('contactForm.company')}
                value={formData.company}
                onChange={handleChange}
                className={`bg-background/50 border-border/50 focus:border-primary transition-colors ${errors.company ? 'border-destructive' : ''}`}
              />
              {errors.company && <p className="text-xs text-destructive mt-1">{errors.company}</p>}
            </div>
            <div>
              <Input
                name="phone"
                placeholder={t('contactForm.phone')}
                value={formData.phone}
                onChange={handleChange}
                className={`bg-background/50 border-border/50 focus:border-primary transition-colors ${errors.phone ? 'border-destructive' : ''}`}
              />
              {errors.phone && <p className="text-xs text-destructive mt-1">{errors.phone}</p>}
            </div>
          </div>

          <div>
            <Input
              name="endpoints"
              type="number"
              placeholder={t('contactForm.endpoints')}
              value={formData.endpoints}
              onChange={handleChange}
              className={`bg-background/50 border-border/50 focus:border-primary transition-colors ${errors.endpoints ? 'border-destructive' : ''}`}
            />
            {errors.endpoints && <p className="text-xs text-destructive mt-1">{errors.endpoints}</p>}
          </div>

          <div>
            <Textarea
              name="message"
              placeholder={t('contactForm.message')}
              value={formData.message}
              onChange={handleChange}
              rows={4}
              className={`bg-background/50 border-border/50 focus:border-primary transition-colors resize-none ${errors.message ? 'border-destructive' : ''}`}
            />
            {errors.message && <p className="text-xs text-destructive mt-1">{errors.message}</p>}
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold h-12"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('contactForm.sending')}
              </>
            ) : (
              t('contactForm.submit')
            )}
          </Button>
        </form>
      </div>
    </div>
  );
};
