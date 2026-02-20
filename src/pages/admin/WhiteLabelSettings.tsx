import { useState } from 'react';
import { useTenantBranding } from '@/hooks/useTenantBranding';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Palette, Building2, FileText, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function WhiteLabelSettings() {
  const { branding, isLoading, saveBranding } = useTenantBranding();
  const [form, setForm] = useState({
    company_name: '',
    company_cnpj: '',
    company_address: '',
    company_phone: '',
    company_email: '',
    company_website: '',
    primary_color: '#1e40af',
    secondary_color: '#3b82f6',
    accent_color: '#0ea5e9',
    logo_url: '',
    report_header_text: '',
    report_footer_text: '',
  });
  const [initialized, setInitialized] = useState(false);

  // Initialize form with existing data
  if (branding && !initialized) {
    setForm({
      company_name: branding.company_name || '',
      company_cnpj: branding.company_cnpj || '',
      company_address: branding.company_address || '',
      company_phone: branding.company_phone || '',
      company_email: branding.company_email || '',
      company_website: branding.company_website || '',
      primary_color: branding.primary_color || '#1e40af',
      secondary_color: branding.secondary_color || '#3b82f6',
      accent_color: branding.accent_color || '#0ea5e9',
      logo_url: branding.logo_url || '',
      report_header_text: branding.report_header_text || '',
      report_footer_text: branding.report_footer_text || '',
    });
    setInitialized(true);
  }

  const handleSave = () => {
    saveBranding.mutate(form);
  };

  const updateField = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Palette className="h-6 w-6 text-primary" />
          White-Label & Branding
        </h1>
        <p className="text-muted-foreground mt-1">
          Personalize relatórios e documentos com a identidade da sua empresa
        </p>
      </div>

      {/* Company Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Dados da Empresa
          </CardTitle>
          <CardDescription>Informações exibidas nos relatórios e documentos de compliance</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome da Empresa</Label>
              <Input value={form.company_name} onChange={e => updateField('company_name', e.target.value)} placeholder="Sua Empresa Ltda." />
            </div>
            <div className="space-y-2">
              <Label>CNPJ</Label>
              <Input value={form.company_cnpj} onChange={e => updateField('company_cnpj', e.target.value)} placeholder="00.000.000/0000-00" />
            </div>
            <div className="space-y-2">
              <Label>Endereço</Label>
              <Input value={form.company_address} onChange={e => updateField('company_address', e.target.value)} placeholder="Rua Exemplo, 123" />
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input value={form.company_phone} onChange={e => updateField('company_phone', e.target.value)} placeholder="+55 11 99999-0000" />
            </div>
            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input type="email" value={form.company_email} onChange={e => updateField('company_email', e.target.value)} placeholder="contato@empresa.com" />
            </div>
            <div className="space-y-2">
              <Label>Website</Label>
              <Input value={form.company_website} onChange={e => updateField('company_website', e.target.value)} placeholder="https://www.empresa.com" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Branding Colors */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Cores da Marca
          </CardTitle>
          <CardDescription>Defina as cores que serão utilizadas nos relatórios PDF</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {([
              { key: 'primary_color', label: 'Cor Primária' },
              { key: 'secondary_color', label: 'Cor Secundária' },
              { key: 'accent_color', label: 'Cor de Destaque' },
            ] as const).map(({ key, label }) => (
              <div key={key} className="space-y-2">
                <Label>{label}</Label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={form[key]}
                    onChange={e => updateField(key, e.target.value)}
                    className="w-10 h-10 rounded border cursor-pointer"
                  />
                  <Input
                    value={form[key]}
                    onChange={e => updateField(key, e.target.value)}
                    placeholder="#000000"
                    className="flex-1"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Preview */}
          <div className="mt-6 p-4 rounded-lg border">
            <p className="text-sm font-medium mb-3 text-foreground">Prévia das Cores</p>
            <div className="flex gap-3">
              <div className="h-12 flex-1 rounded" style={{ backgroundColor: form.primary_color }} />
              <div className="h-12 flex-1 rounded" style={{ backgroundColor: form.secondary_color }} />
              <div className="h-12 flex-1 rounded" style={{ backgroundColor: form.accent_color }} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Logo */}
      <Card>
        <CardHeader>
          <CardTitle>Logo da Empresa</CardTitle>
          <CardDescription>URL do logo para usar nos relatórios (formato PNG ou SVG recomendado)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>URL do Logo</Label>
            <Input value={form.logo_url} onChange={e => updateField('logo_url', e.target.value)} placeholder="https://exemplo.com/logo.png" />
          </div>
          {form.logo_url && (
            <div className="p-4 border rounded-lg bg-muted/30">
              <p className="text-xs text-muted-foreground mb-2">Prévia:</p>
              <img src={form.logo_url} alt="Logo" className="max-h-16 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Report Customization */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Personalização de Relatórios
          </CardTitle>
          <CardDescription>Textos customizados para cabeçalho e rodapé dos relatórios PDF</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Texto do Cabeçalho</Label>
            <Textarea
              value={form.report_header_text}
              onChange={e => updateField('report_header_text', e.target.value)}
              placeholder="Ex: Relatório de Segurança Cibernética - Confidencial"
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label>Texto do Rodapé</Label>
            <Textarea
              value={form.report_footer_text}
              onChange={e => updateField('report_footer_text', e.target.value)}
              placeholder="Ex: Documento confidencial. Proibida reprodução sem autorização. CNPJ 00.000.000/0000-00"
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saveBranding.isPending} size="lg">
          {saveBranding.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Salvar Configurações
        </Button>
      </div>
    </div>
  );
}
