import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Filter, Shield, FileText, Loader2 } from 'lucide-react';
import type { StatusFilter, VersionFilter } from './types';

interface AgentFiltersProps {
  searchTerm: string;
  onSearchChange: (v: string) => void;
  statusFilter: StatusFilter;
  onStatusFilter: (v: StatusFilter) => void;
  versionFilter: VersionFilter;
  onVersionFilter: (v: VersionFilter) => void;
  generatingGroupReport: boolean;
  onGroupReport: () => void;
  filteredCount: number;
}

export function AgentFilters({
  searchTerm, onSearchChange,
  statusFilter, onStatusFilter,
  versionFilter, onVersionFilter,
  generatingGroupReport, onGroupReport, filteredCount,
}: AgentFiltersProps) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('agentManagementPage.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => onStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="w-full md:w-[180px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('agentManagementPage.allStatus')}</SelectItem>
              <SelectItem value="online">{t('agentManagementPage.online')}</SelectItem>
              <SelectItem value="offline">{t('agentManagementPage.offline')}</SelectItem>
              <SelectItem value="pending">{t('agentManagementPage.pending')}</SelectItem>
              <SelectItem value="disabled">{t('agentManagementPage.disabled')}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={versionFilter} onValueChange={(v) => onVersionFilter(v as VersionFilter)}>
            <SelectTrigger className="w-full md:w-[180px]">
              <Shield className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Versão" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('agentManagementPage.allVersions')}</SelectItem>
              <SelectItem value="outdated">{t('agentManagementPage.outdated')}</SelectItem>
              <SelectItem value="current">{t('agentManagementPage.current')}</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={onGroupReport}
            disabled={generatingGroupReport || filteredCount === 0}
            className="w-full md:w-auto"
          >
            {generatingGroupReport ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
            {generatingGroupReport ? 'Gerando...' : `Relatório Forense (${filteredCount})`}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
