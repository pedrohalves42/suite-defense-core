import { useEffect, useState, useCallback } from "react";
import { logger } from "@/lib/logger";

interface WebVitalsMetrics {
  lcp: number | null; // Largest Contentful Paint
  fid: number | null; // First Input Delay
  cls: number | null; // Cumulative Layout Shift
  ttfb: number | null; // Time to First Byte
  fcp: number | null; // First Contentful Paint
  score: "good" | "needs-improvement" | "poor" | null;
}

function getScore(lcp: number | null, cls: number | null): WebVitalsMetrics["score"] {
  if (lcp === null || cls === null) return null;
  if (lcp <= 2500 && cls <= 0.1) return "good";
  if (lcp <= 4000 && cls <= 0.25) return "needs-improvement";
  return "poor";
}

/**
 * Hook that monitors Core Web Vitals using PerformanceObserver.
 * Collects LCP, FID, CLS, TTFB, and FCP metrics.
 */
export function useWebVitals(): WebVitalsMetrics {
  const [metrics, setMetrics] = useState<WebVitalsMetrics>({
    lcp: null, fid: null, cls: null, ttfb: null, fcp: null, score: null,
  });

  const updateMetric = useCallback((key: keyof WebVitalsMetrics, value: number) => {
    setMetrics(prev => {
      const updated = { ...prev, [key]: value };
      updated.score = getScore(updated.lcp, updated.cls);
      return updated;
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("PerformanceObserver" in window)) return;

    const observers: PerformanceObserver[] = [];

    try {
      // LCP
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1];
        if (last) {
          updateMetric("lcp", last.startTime);
          logger.info(`[WebVitals] LCP: ${last.startTime.toFixed(0)}ms`);
        }
      });
      lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
      observers.push(lcpObserver);

      // FID
      const fidObserver = new PerformanceObserver((list) => {
        const entry = list.getEntries()[0] as PerformanceEventTiming;
        if (entry) {
          const fid = entry.processingStart - entry.startTime;
          updateMetric("fid", fid);
          logger.info(`[WebVitals] FID: ${fid.toFixed(0)}ms`);
        }
      });
      fidObserver.observe({ type: "first-input", buffered: true });
      observers.push(fidObserver);

      // CLS
      let clsValue = 0;
      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as any[]) {
          if (!entry.hadRecentInput) {
            clsValue += entry.value;
            updateMetric("cls", clsValue);
          }
        }
      });
      clsObserver.observe({ type: "layout-shift", buffered: true });
      observers.push(clsObserver);

      // FCP
      const fcpObserver = new PerformanceObserver((list) => {
        const entry = list.getEntries().find(e => e.name === "first-contentful-paint");
        if (entry) {
          updateMetric("fcp", entry.startTime);
          logger.info(`[WebVitals] FCP: ${entry.startTime.toFixed(0)}ms`);
        }
      });
      fcpObserver.observe({ type: "paint", buffered: true });
      observers.push(fcpObserver);

      // TTFB
      const navEntries = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
      if (navEntries.length > 0) {
        const ttfb = navEntries[0].responseStart - navEntries[0].requestStart;
        updateMetric("ttfb", ttfb);
        logger.info(`[WebVitals] TTFB: ${ttfb.toFixed(0)}ms`);
      }
    } catch (e) {
      logger.warn("[WebVitals] Failed to initialize observers", e);
    }

    return () => observers.forEach(o => o.disconnect());
  }, [updateMetric]);

  return metrics;
}
