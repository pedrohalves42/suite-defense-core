import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Shield, Loader2 } from "lucide-react";
import { z } from "zod";

const ContactFormSchema = z.object({
  name: z.string()
    .min(2, "Nome muito curto")
    .max(100, "Nome muito longo")
    .regex(/^[a-zA-ZÀ-ÿ\s\-']+$/, "Nome contém caracteres inválidos"),
  email: z.string()
    .email("Email inválido")
    .max(255, "Email muito longo"),
  company: z.string()
    .max(200, "Nome da empresa muito longo")
    .optional(),
  phone: z.string()
    .regex(/^[\d\s\(\)\+\-]*$/, "Telefone inválido")
    .max(20, "Telefone muito longo")
    .optional(),
  endpoints: z.string()
    .refine((val) => val === "" || (!isNaN(Number(val)) && Number(val) >= 1 && Number(val) <= 100000), {
      message: "Valor deve estar entre 1 e 100.000"
    })
    .optional(),
  message: z.string()
    .max(2000, "Mensagem muito longa")
    .optional()
});

export const ContactForm = () => {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrors({});

    try {
      // Validate form data
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
          title: "Erro de validação",
          description: "Verifique os campos do formulário",
          variant: "destructive",
        });
        return;
      }

      // Call the secure edge function
      const { data, error } = await supabase.functions.invoke('submit-contact', {
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
        console.error("Error submitting contact form:", error);
        
        // Handle rate limit error
        if (error.message?.includes('429') || error.message?.includes('Rate limit')) {
          toast({
            title: "Muitas tentativas",
            description: "Aguarde um momento antes de enviar novamente.",
            variant: "destructive",
          });
          return;
        }

        throw error;
      }

      toast({
        title: "Mensagem enviada!",
        description: "Nossa equipe entrará em contato em até 24 horas.",
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
      console.error("Error submitting contact form:", error);
      toast({
        title: "Erro ao enviar",
        description: "Tente novamente ou envie um email para contato@cybershield.com.br",
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
    // Clear error for this field when user types
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
          <Shield className="w-8 h-8 text-primary" />
          <div>
            <h3 className="text-2xl font-bold">Fale com vendas</h3>
            <p className="text-muted-foreground">Resposta em até 24 horas</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Input
                name="name"
                placeholder="Nome completo *"
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
                placeholder="Email corporativo *"
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
                placeholder="Empresa"
                value={formData.company}
                onChange={handleChange}
                className={`bg-background/50 border-border/50 focus:border-primary transition-colors ${errors.company ? 'border-destructive' : ''}`}
              />
              {errors.company && <p className="text-xs text-destructive mt-1">{errors.company}</p>}
            </div>
            <div>
              <Input
                name="phone"
                placeholder="Telefone"
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
              placeholder="Número de endpoints"
              value={formData.endpoints}
              onChange={handleChange}
              className={`bg-background/50 border-border/50 focus:border-primary transition-colors ${errors.endpoints ? 'border-destructive' : ''}`}
            />
            {errors.endpoints && <p className="text-xs text-destructive mt-1">{errors.endpoints}</p>}
          </div>

          <div>
            <Textarea
              name="message"
              placeholder="Mensagem (opcional)"
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
                Enviando...
              </>
            ) : (
              "Solicitar contato"
            )}
          </Button>
        </form>
      </div>
    </div>
  );
};
