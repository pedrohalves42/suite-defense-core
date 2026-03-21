import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import { useTenant } from './useTenant';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

interface OnboardingProgress {
  id: string;
  user_id: string;
  tenant_id: string | null;
  current_step: number;
  steps_completed: string[];
  started_at: string;
  completed_at: string | null;
  skipped: boolean;
}

const ONBOARDING_STEPS = [
  'welcome',
  'generate_key',
  'install_agent',
  'first_heartbeat',
  'create_job',
  'view_report'
];

export const useOnboardingProgress = () => {
  const { user } = useAuth();
  const { tenant } = useTenant();
  const [progress, setProgress] = useState<OnboardingProgress | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProgress = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('onboarding_progress')
        .select('id, user_id, tenant_id, current_step, steps_completed, skipped, completed_at, started_at, created_at, updated_at')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        logger.error('Error fetching onboarding progress:', error);
      }

      if (data) {
        setProgress({
          ...data,
          steps_completed: Array.isArray(data.steps_completed) 
            ? data.steps_completed as string[]
            : []
        });
      }
    } catch (err) {
      logger.error('Error:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchProgress();
  }, [fetchProgress]);

  const initializeOnboarding = useCallback(async () => {
    if (!user || progress) return;

    try {
      const { data, error } = await supabase
        .from('onboarding_progress')
        .insert({
          user_id: user.id,
          tenant_id: tenant?.id || null,
          current_step: 0,
          steps_completed: []
        })
        .select()
        .single();

      if (error) {
        logger.error('Error initializing onboarding:', error);
        return;
      }

      if (data) {
        setProgress({
          ...data,
          steps_completed: []
        });
      }
    } catch (err) {
      logger.error('Error:', err);
    }
  }, [user, tenant, progress]);

  const completeStep = useCallback(async (stepName: string) => {
    if (!user || !progress) return;

    const newStepsCompleted = [...(progress.steps_completed || [])];
    if (!newStepsCompleted.includes(stepName)) {
      newStepsCompleted.push(stepName);
    }

    const stepIndex = ONBOARDING_STEPS.indexOf(stepName);
    const newCurrentStep = Math.max(progress.current_step, stepIndex + 1);
    const isCompleted = newStepsCompleted.length >= ONBOARDING_STEPS.length;

    try {
      const { error } = await supabase
        .from('onboarding_progress')
        .update({
          steps_completed: newStepsCompleted,
          current_step: newCurrentStep,
          completed_at: isCompleted ? new Date().toISOString() : null,
          updated_at: new Date().toISOString()
        })
        .eq('id', progress.id);

      if (error) {
        logger.error('Error updating progress:', error);
        return;
      }

      setProgress(prev => prev ? {
        ...prev,
        steps_completed: newStepsCompleted,
        current_step: newCurrentStep,
        completed_at: isCompleted ? new Date().toISOString() : null
      } : null);
    } catch (err) {
      logger.error('Error:', err);
    }
  }, [user, progress]);

  const skipOnboarding = useCallback(async () => {
    if (!user || !progress) return;

    try {
      const { error } = await supabase
        .from('onboarding_progress')
        .update({
          skipped: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', progress.id);

      if (error) {
        logger.error('Error skipping onboarding:', error);
        return;
      }

      setProgress(prev => prev ? { ...prev, skipped: true } : null);
    } catch (err) {
      logger.error('Error:', err);
    }
  }, [user, progress]);

  const resetOnboarding = useCallback(async () => {
    if (!user || !progress) return;

    try {
      const { error } = await supabase
        .from('onboarding_progress')
        .update({
          current_step: 0,
          steps_completed: [],
          completed_at: null,
          skipped: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', progress.id);

      if (error) {
        logger.error('Error resetting onboarding:', error);
        return;
      }

      setProgress(prev => prev ? {
        ...prev,
        current_step: 0,
        steps_completed: [],
        completed_at: null,
        skipped: false
      } : null);
    } catch (err) {
      logger.error('Error:', err);
    }
  }, [user, progress]);

  const isStepCompleted = useCallback((stepName: string) => {
    return progress?.steps_completed?.includes(stepName) || false;
  }, [progress]);

  const isOnboardingComplete = progress?.completed_at !== null || progress?.skipped === true;
  const shouldShowOnboarding = !loading && user && !isOnboardingComplete;

  return {
    progress,
    loading,
    initializeOnboarding,
    completeStep,
    skipOnboarding,
    resetOnboarding,
    isStepCompleted,
    isOnboardingComplete,
    shouldShowOnboarding,
    currentStep: progress?.current_step || 0,
    totalSteps: ONBOARDING_STEPS.length,
    steps: ONBOARDING_STEPS
  };
};
