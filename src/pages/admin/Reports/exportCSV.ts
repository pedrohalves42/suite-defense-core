import { formatBrazilDateTime } from '@/lib/date-utils';
import type { SecurityReport } from './types';

export function exportCSV(reportData: SecurityReport, selectedAgent: string) {
  let csvContent = '';

  csvContent += 'RELATÓRIO DE SEGURANÇA CYBERSHIELD\n';
  csvContent += `Data de Geração:,${formatBrazilDateTime(reportData.generated_at, 'full')}\n`;
  csvContent += `Filtro:,${reportData.agent_filter === 'all' ? 'Todos os Agentes' : reportData.agent_filter}\n\n`;

  csvContent += 'ESTATÍSTICAS GERAIS\n';
  csvContent += `Agentes Ativos:,${reportData.statistics.total_agents}\n`;
  csvContent += `Software Inventariado:,${reportData.statistics.total_software}\n`;
  csvContent += `Vulnerabilidades Total:,${reportData.statistics.total_vulnerabilities}\n`;
  csvContent += `Vulnerabilidades Críticas:,${reportData.statistics.critical_vulnerabilities}\n`;
  csvContent += `Vulnerabilidades Altas:,${reportData.statistics.high_vulnerabilities}\n`;
  csvContent += `Engines Antivírus:,${reportData.statistics.antivirus_engines}\n`;
  csvContent += `Ameaças Detectadas:,${reportData.statistics.threats_found}\n`;
  csvContent += `Domínios Únicos:,${reportData.statistics.unique_domains}\n`;
  csvContent += `Scans Maliciosos:,${reportData.statistics.malicious_scans}/${reportData.statistics.total_scans}\n`;
  csvContent += `Eventos de Segurança:,${reportData.statistics.security_events}\n\n`;

  if (reportData.data?.software_inventory && reportData.data.software_inventory.length > 0) {
    csvContent += 'INVENTÁRIO DE SOFTWARE\n';
    csvContent += 'Nome,Versão,Fornecedor,Nível de Risco,Última Atualização\n';
    reportData.data.software_inventory.forEach((sw) => {
      csvContent += `"${sw.name || ''}","${sw.version || ''}","${sw.vendor || ''}","${sw.risk_level || ''}","${sw.last_seen_at || ''}"\n`;
    });
    csvContent += '\n';
  }

  if (reportData.data?.vulnerabilities && reportData.data.vulnerabilities.length > 0) {
    csvContent += 'VULNERABILIDADES\n';
    csvContent += 'Severidade,Título,Descrição,Remediação\n';
    reportData.data.vulnerabilities.forEach((vuln) => {
      csvContent += `"${vuln.severity || ''}","${vuln.title || vuln.check_key || ''}","${(String(vuln.description || '')).replace(/"/g, '""')}","${(String(vuln.remediation || '')).replace(/"/g, '""')}"\n`;
    });
    csvContent += '\n';
  }

  if (reportData.data?.antivirus_status && reportData.data.antivirus_status.length > 0) {
    csvContent += 'STATUS DO ANTIVÍRUS\n';
    csvContent += 'Engine,Versão,Status,Última Atualização,Ameaças Encontradas\n';
    reportData.data.antivirus_status.forEach((av) => {
      csvContent += `"${av.engine_name || ''}","${av.engine_version || ''}","${av.status || ''}","${av.last_update_at || ''}","${av.threats_found || 0}"\n`;
    });
    csvContent += '\n';
  }

  if (reportData.data?.web_activity && reportData.data.web_activity.length > 0) {
    csvContent += 'ATIVIDADE WEB (Últimos 50)\n';
    csvContent += 'Domínio,URL,Visitado Em,Fonte\n';
    reportData.data.web_activity.slice(0, 50).forEach((web) => {
      csvContent += `"${web.domain || ''}","${web.url || ''}","${web.visited_at || ''}","${web.source || ''}"\n`;
    });
    csvContent += '\n';
  }

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `relatorio-seguranca-${selectedAgent}-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
