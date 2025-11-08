import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Shield, Loader2 } from "lucide-react";

export const ContactForm = () => {
  const [loading, setLoading] = useState(false);
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

    try {
      const { error } = await supabase.from("sales_contacts").insert({
        name: formData.name,
        email: formData.email,
        company: formData.company,
        phone: formData.phone,
        endpoints: formData.endpoints ? parseInt(formData.endpoints) : null,
        message: formData.message,
      });

      if (error) throw error;

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
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
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
                className="bg-background/50 border-border/50 focus:border-primary transition-colors"
              />
            </div>
            <div>
              <Input
                name="email"
                type="email"
                placeholder="Email corporativo *"
                value={formData.email}
                onChange={handleChange}
                required
                className="bg-background/50 border-border/50 focus:border-primary transition-colors"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Input
                name="company"
                placeholder="Empresa"
                value={formData.company}
                onChange={handleChange}
                className="bg-background/50 border-border/50 focus:border-primary transition-colors"
              />
            </div>
            <div>
              <Input
                name="phone"
                placeholder="Telefone"
                value={formData.phone}
                onChange={handleChange}
                className="bg-background/50 border-border/50 focus:border-primary transition-colors"
              />
            </div>
          </div>

          <div>
            <Input
              name="endpoints"
              type="number"
              placeholder="Número de endpoints"
              value={formData.endpoints}
              onChange={handleChange}
              className="bg-background/50 border-border/50 focus:border-primary transition-colors"
            />
          </div>

          <div>
            <Textarea
              name="message"
              placeholder="Mensagem (opcional)"
              value={formData.message}
              onChange={handleChange}
              rows={4}
              className="bg-background/50 border-border/50 focus:border-primary transition-colors resize-none"
            />
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
