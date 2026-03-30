/**
 * Virus scanning providers (Hybrid Analysis + VirusTotal)
 */
import { logger } from '../_shared/logger.ts';
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';

const FETCH_TIMEOUT_MS = 30000;

export interface ScanResult {
  isMalicious: boolean;
  positives: number;
  totalScans: number;
  permalink?: string;
  scanDate?: string;
  scans?: unknown;
  scannerUsed: 'hybrid_analysis' | 'virustotal';
}

export async function scanWithHybridAnalysis(fileHash: string, apiKey: string): Promise<ScanResult | null> {
  try {
    logger.info(`[Hybrid Analysis] Scanning hash: ${fileHash}`);
    const reportResponse = await fetchWithTimeout(
      `https://www.hybrid-analysis.com/api/v2/report/${fileHash}/summary`,
      { timeoutMs: FETCH_TIMEOUT_MS, headers: { 'api-key': apiKey, 'User-Agent': 'CyberShield' } }
    );
    if (reportResponse.status === 404) { logger.info('[Hybrid Analysis] File not found'); return null; }
    if (!reportResponse.ok) { logger.error(`[Hybrid Analysis] API error: ${reportResponse.status}`); return null; }
    const reportData = await reportResponse.json();
    const threatScore = reportData.threat_score || 0;
    const verdict = reportData.verdict || 'no specific threat';
    const isMalicious = threatScore >= 50 || verdict.includes('malicious');
    return { isMalicious, positives: isMalicious ? threatScore : 0, totalScans: 100, permalink: `https://www.hybrid-analysis.com/sample/${fileHash}`, scanDate: reportData.analysis_start_time, scans: reportData, scannerUsed: 'hybrid_analysis' };
  } catch (error) { logger.error('[Hybrid Analysis] Scan failed:', error); return null; }
}

export async function scanWithVirusTotal(fileHash: string, apiKey: string): Promise<ScanResult | null> {
  try {
    logger.info(`[VirusTotal] Scanning hash: ${fileHash}`);
    const vtResponse = await fetchWithTimeout(`https://www.virustotal.com/vtapi/v2/file/report?apikey=${apiKey}&resource=${fileHash}`);
    if (!vtResponse.ok) { logger.error(`[VirusTotal] API error: ${vtResponse.status}`); return null; }
    const vtData = await vtResponse.json();
    if (vtData.response_code === 0 || vtData.response_code === -2) return null;
    const positives = vtData.positives || 0;
    const total = vtData.total || 0;
    return { isMalicious: positives > 0, positives, totalScans: total, permalink: vtData.permalink, scanDate: vtData.scan_date, scans: vtData.scans, scannerUsed: 'virustotal' };
  } catch (error) { logger.error('[VirusTotal] Scan failed:', error); return null; }
}
