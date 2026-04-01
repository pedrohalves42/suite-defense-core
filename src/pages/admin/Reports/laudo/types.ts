import type jsPDF from 'jspdf';
import type { SecurityReport, Agent } from '../types';

export interface LaudoContext {
  doc: jsPDF;
  pageWidth: number;
  pageHeight: number;
  laudoId: string;
  dateStrFull: string;
  validUntilStr: string;
  riskScore: number;
  riskClass: { level: string; color: string; description: string };
  riskColor: [number, number, number];
  reportData: SecurityReport;
  agents: Agent[] | undefined;
  qrCodeDataUrl: string;
  logoDataUrl: string | null;
  stats: SecurityReport['statistics'];
  unprotected: { no_antivirus: number; outdated_av: number; offline_agents: number };
}
