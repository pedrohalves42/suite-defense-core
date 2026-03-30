/**
 * HTML email report generation.
 */
import type { ReportData } from './report-data-fetcher.ts';

interface ScheduledReport {
  name: string;
  include_vulnerabilities: boolean;
  include_agents_summary: boolean;
  include_web_activity: boolean;
  schedule: string;
  day_of_week: number;
  hour: number;
}

export function generateReportHtml(data: ReportData, report: ScheduledReport, tenantName: string): string {
  const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR');
  const today = new Date().toLocaleDateString('pt-BR');

  const onlineAgents = data.agents.filter(a => {
    if (!a.last_heartbeat) return false;
    const diff = Date.now() - new Date(a.last_heartbeat as string).getTime();
    return diff < 30 * 60 * 1000;
  }).length;

  const criticalVulns = data.vulnerabilities.filter(v => v.severity === 'critical').length;
  const highVulns = data.vulnerabilities.filter(v => v.severity === 'high').length;
  const threats = data.antivirus.reduce((sum, a) => sum + ((a.threats_found as number) || 0), 0);
  const blockedDomains = data.webActivity.filter(w => w.is_blocked).length;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${report.name}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 700px; margin: 0 auto; padding: 20px;">
    <tr>
      <td style="background: linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%); padding: 32px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 28px;">🛡 CyberShield</h1>
        <p style="color: #94a3b8; margin: 8px 0 0 0; font-size: 14px;">${tenantName}</p>
      </td>
    </tr>
    <tr>
      <td style="background-color: #ffffff; padding: 24px 32px; border-bottom: 1px solid #e5e7eb;">
        <h2 style="color: #111827; margin: 0; font-size: 20px;">📊 ${report.name}</h2>
        <p style="color: #6b7280; margin: 8px 0 0 0; font-size: 14px;">Periodo: ${weekAgo} - ${today}</p>
      </td>
    </tr>
    <tr>
      <td style="background-color: #ffffff; padding: 24px 32px;">
        <h3 style="color: #374151; margin: 0 0 16px 0; font-size: 16px; text-transform: uppercase; letter-spacing: 0.05em;">Resumo Executivo</h3>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
          <tr>
            <td width="25%" style="padding: 12px; background-color: #f0fdf4; border-radius: 8px; text-align: center;">
              <div style="font-size: 28px; font-weight: 700; color: #16a34a;">${onlineAgents}/${data.agents.length}</div>
              <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">🖥 Computadores Online</div>
            </td>
            <td width="25%" style="padding: 12px; background-color: ${criticalVulns > 0 ? '#fef2f2' : '#f0fdf4'}; border-radius: 8px; text-align: center;">
              <div style="font-size: 28px; font-weight: 700; color: ${criticalVulns > 0 ? '#dc2626' : '#16a34a'};">${criticalVulns}</div>
              <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">⚠ Vuln. Criticas</div>
            </td>
            <td width="25%" style="padding: 12px; background-color: ${highVulns > 0 ? '#fff7ed' : '#f0fdf4'}; border-radius: 8px; text-align: center;">
              <div style="font-size: 28px; font-weight: 700; color: ${highVulns > 0 ? '#ea580c' : '#16a34a'};">${highVulns}</div>
              <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">🔶 Vuln. Altas</div>
            </td>
            <td width="25%" style="padding: 12px; background-color: ${threats > 0 ? '#fef2f2' : '#f0fdf4'}; border-radius: 8px; text-align: center;">
              <div style="font-size: 28px; font-weight: 700; color: ${threats > 0 ? '#dc2626' : '#16a34a'};">${threats}</div>
              <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">🦠 Ameacas</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    ${renderVulnerabilities(data, report)}
    ${renderAgents(data, report)}
    ${renderWebActivity(data, report, blockedDomains)}
    <tr>
      <td style="background-color: #f9fafb; padding: 24px 32px; border-radius: 0 0 12px 12px; text-align: center;">
        <p style="color: #6b7280; margin: 0; font-size: 12px;">Relatorio gerado automaticamente em ${now}</p>
        <p style="color: #9ca3af; margin: 8px 0 0 0; font-size: 11px;">CyberShield - Protecao Inteligente para sua Empresa</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function renderVulnerabilities(data: ReportData, report: ScheduledReport): string {
  if (!report.include_vulnerabilities || data.vulnerabilities.length === 0) return '';
  return `
    <tr>
      <td style="background-color: #ffffff; padding: 24px 32px; border-top: 1px solid #e5e7eb;">
        <h3 style="color: #374151; margin: 0 0 16px 0; font-size: 16px;">🔍 Vulnerabilidades Encontradas (${data.vulnerabilities.length})</h3>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
          <tr style="background-color: #f9fafb;">
            <th style="padding: 12px; text-align: left; font-size: 12px; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Severidade</th>
            <th style="padding: 12px; text-align: left; font-size: 12px; color: #6b7280; border-bottom: 1px solid #e5e7eb;">CVE</th>
            <th style="padding: 12px; text-align: left; font-size: 12px; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Software</th>
          </tr>
          ${data.vulnerabilities.slice(0, 10).map(v => `
          <tr>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
              <span style="display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600; background-color: ${getSeverityColor(v.severity as string)}; color: white;">${getSeverityLabel(v.severity as string)}</span>
            </td>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #374151;">${v.cve_id || 'N/A'}</td>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #374151;">${v.software_name || 'Desconhecido'}</td>
          </tr>
          `).join('')}
        </table>
        ${data.vulnerabilities.length > 10 ? `<p style="color: #6b7280; font-size: 12px; margin-top: 8px;">...e mais ${data.vulnerabilities.length - 10} vulnerabilidades</p>` : ''}
      </td>
    </tr>`;
}

function renderAgents(data: ReportData, report: ScheduledReport): string {
  if (!report.include_agents_summary || data.agents.length === 0) return '';
  return `
    <tr>
      <td style="background-color: #ffffff; padding: 24px 32px; border-top: 1px solid #e5e7eb;">
        <h3 style="color: #374151; margin: 0 0 16px 0; font-size: 16px;">🖥 Status dos Computadores (${data.agents.length})</h3>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
          <tr style="background-color: #f9fafb;">
            <th style="padding: 12px; text-align: left; font-size: 12px; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Nome</th>
            <th style="padding: 12px; text-align: left; font-size: 12px; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Status</th>
            <th style="padding: 12px; text-align: left; font-size: 12px; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Versao</th>
          </tr>
          ${data.agents.slice(0, 10).map(a => {
            const isOnline = a.last_heartbeat && (Date.now() - new Date(a.last_heartbeat as string).getTime()) < 30 * 60 * 1000;
            return `
          <tr>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #374151;">${a.agent_name || a.hostname}</td>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
              <span style="font-size: 12px; color: ${isOnline ? '#16a34a' : '#dc2626'};">${isOnline ? '✅ Online' : '❌ Offline'}</span>
            </td>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">${a.agent_version || 'N/A'}</td>
          </tr>`;
          }).join('')}
        </table>
      </td>
    </tr>`;
}

function renderWebActivity(data: ReportData, report: ScheduledReport, blockedDomains: number): string {
  if (!report.include_web_activity || data.webActivity.length === 0) return '';
  return `
    <tr>
      <td style="background-color: #ffffff; padding: 24px 32px; border-top: 1px solid #e5e7eb;">
        <h3 style="color: #374151; margin: 0 0 16px 0; font-size: 16px;">🌐 Atividade Web (${data.webActivity.length} dominios)</h3>
        ${blockedDomains > 0 ? `<p style="color: #dc2626; font-size: 14px; margin: 0 0 12px 0;">⚠ ${blockedDomains} acessos bloqueados no periodo</p>` : ''}
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
          <tr style="background-color: #f9fafb;">
            <th style="padding: 12px; text-align: left; font-size: 12px; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Dominio</th>
            <th style="padding: 12px; text-align: left; font-size: 12px; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Categoria</th>
            <th style="padding: 12px; text-align: center; font-size: 12px; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Visitas</th>
          </tr>
          ${data.webActivity.slice(0, 10).map(w => `
          <tr>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #374151;">${w.domain}</td>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">${getCategoryLabel(w.category as string | null)}</td>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #374151; text-align: center;">${w.visit_count || 1}</td>
          </tr>
          `).join('')}
        </table>
      </td>
    </tr>`;
}

function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'critical': return '#dc2626';
    case 'high': return '#ea580c';
    case 'medium': return '#ca8a04';
    case 'low': return '#16a34a';
    default: return '#6b7280';
  }
}

function getSeverityLabel(severity: string): string {
  switch (severity) {
    case 'critical': return 'CRITICO';
    case 'high': return 'ALTO';
    case 'medium': return 'MEDIO';
    case 'low': return 'BAIXO';
    default: return severity.toUpperCase();
  }
}

function getCategoryLabel(category: string | null): string {
  const labels: Record<string, string> = {
    social: '💬 Social', video: '🎬 Video', news: '📰 Noticias', work: '💼 Trabalho',
    shopping: '🛒 Compras', email: '📧 Email', search: '🔍 Busca', games: '🎮 Jogos',
    adult: '🔞 Adulto', gambling: '🎰 Apostas',
  };
  return labels[category || ''] || category || 'Outro';
}

export function calculateNextSend(report: { schedule: string; day_of_week: number; hour: number }): Date {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(report.hour + 3, 0, 0, 0);

  if (report.schedule === 'daily') {
    if (next <= now) next.setDate(next.getDate() + 1);
  } else if (report.schedule === 'weekly') {
    const currentDay = next.getUTCDay();
    let daysUntil = report.day_of_week - currentDay;
    if (daysUntil < 0 || (daysUntil === 0 && next <= now)) daysUntil += 7;
    next.setDate(next.getDate() + daysUntil);
  } else if (report.schedule === 'monthly') {
    next.setMonth(next.getMonth() + 1);
    next.setDate(1);
  }

  return next;
}
