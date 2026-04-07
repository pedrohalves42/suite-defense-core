import { useState, useEffect, useMemo } from 'react';
import { differenceInSeconds, differenceInMinutes, differenceInHours } from 'date-fns';

interface CountdownResult {
  text: string;
  seconds: number;
  minutes: number;
  hours: number;
  isExpired: boolean;
  urgency: 'normal' | 'warning' | 'danger' | 'expired';
}

export function useRealTimeCountdown(expiresAt: string | null): CountdownResult {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    if (!expiresAt) return;

    // Stop ticking once expired to avoid unnecessary re-renders
    const expiryTime = new Date(expiresAt).getTime();
    if (Date.now() >= expiryTime) return;
    
    const interval = setInterval(() => {
      const current = new Date();
      setNow(current);
      // Auto-stop once expired
      if (current.getTime() >= expiryTime) {
        clearInterval(interval);
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [expiresAt]);

  return useMemo(() => {
    if (!expiresAt) {
      return {
        text: '--',
        seconds: 0,
        minutes: 0,
        hours: 0,
        isExpired: true,
        urgency: 'expired' as const,
      };
    }

    const expiryDate = new Date(expiresAt);
    const totalSeconds = differenceInSeconds(expiryDate, now);
    const totalMinutes = differenceInMinutes(expiryDate, now);
    const totalHours = differenceInHours(expiryDate, now);

    if (totalSeconds <= 0) {
      return {
        text: 'Expirado',
        seconds: 0,
        minutes: 0,
        hours: 0,
        isExpired: true,
        urgency: 'expired' as const,
      };
    }

    let urgency: 'normal' | 'warning' | 'danger' | 'expired' = 'normal';
    if (totalMinutes < 60) {
      urgency = 'danger';
    } else if (totalHours < 6) {
      urgency = 'warning';
    }

    let text: string;
    if (totalHours >= 1) {
      const remainingMinutes = totalMinutes % 60;
      text = `${totalHours}h ${remainingMinutes}m`;
    } else if (totalMinutes >= 1) {
      const remainingSeconds = totalSeconds % 60;
      text = `${totalMinutes}m ${remainingSeconds}s`;
    } else {
      text = `${totalSeconds}s`;
    }

    return {
      text,
      seconds: totalSeconds,
      minutes: totalMinutes,
      hours: totalHours,
      isExpired: false,
      urgency,
    };
  }, [expiresAt, now]);
}

export function formatCountdownText(countdown: CountdownResult): string {
  return countdown.text;
}
