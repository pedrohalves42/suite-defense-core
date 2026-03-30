import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

interface CompanyTabProps {
  tenant: { id: string; name: string; slug: string; created_at: string; updated_at: string } | null;
  tenantName: string;
  setTenantName: (v: string) => void;
  canWrite: boolean;
  onSave: () => void;
  isSaving: boolean;
}

export function CompanyTab({ tenant, tenantName, setTenantName, canWrite, onSave, isSaving }: CompanyTabProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t('adminPages.settings.companyData')}</CardTitle>
          <CardDescription>{t('adminPages.settings.companyDataDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>{t('adminPages.settings.companyName')}</Label>
            <Input value={tenantName || tenant?.name || ''} onChange={(e) => setTenantName(e.target.value)} placeholder={tenant?.name} disabled={!canWrite} />
          </div>
          <div>
            <Label>{t('adminPages.settings.slug')}</Label>
            <Input value={tenant?.slug || ''} disabled className="bg-muted" />
            <p className="text-sm text-muted-foreground mt-1">{t('adminPages.settings.slugNotEditable')}</p>
          </div>
          <div>
            <Label>{t('adminPages.settings.tenantId')}</Label>
            <Input value={tenant?.id || ''} disabled className="bg-muted font-mono text-sm" />
          </div>
          {canWrite && (
            <Button onClick={onSave} disabled={isSaving || !tenantName}>
              {t('adminPages.settings.saveChanges')}
            </Button>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('adminPages.settings.systemInfo')}</CardTitle>
          <CardDescription>{t('adminPages.settings.systemInfoDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between py-2 border-b">
            <span className="text-muted-foreground">{t('adminPages.settings.createdAt')}</span>
            <span>{tenant?.created_at ? new Date(tenant.created_at).toLocaleDateString('pt-BR') : '-'}</span>
          </div>
          <div className="flex justify-between py-2 border-b">
            <span className="text-muted-foreground">{t('adminPages.settings.lastUpdate')}</span>
            <span>{tenant?.updated_at ? new Date(tenant.updated_at).toLocaleDateString('pt-BR') : '-'}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
