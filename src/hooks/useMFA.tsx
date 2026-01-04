import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { logger } from '@/lib/logger';

export interface MFAFactor {
  id: string;
  friendly_name?: string;
  factor_type: 'totp';
  status: 'verified' | 'unverified';
  created_at: string;
  updated_at: string;
}

export interface MFAEnrollmentResult {
  id: string;
  type: 'totp';
  totp: {
    qr_code: string;
    secret: string;
    uri: string;
  };
}

export const useMFA = () => {
  const { user, loading: authLoading } = useAuth();
  const [factors, setFactors] = useState<MFAFactor[]>([]);
  const [mfaLoading, setMfaLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [enrollment, setEnrollment] = useState<MFAEnrollmentResult | null>(null);

  // Loading is true while auth OR mfa is loading
  const loading = authLoading || mfaLoading;

  // Check if user has MFA enabled
  const hasMFA = factors.some(f => f.status === 'verified');

  // Fetch current MFA factors
  const fetchFactors = useCallback(async () => {
    // Don't fetch if auth is still loading or no user
    if (authLoading) {
      logger.debug('useMFA: Waiting for auth to complete before fetching factors');
      return;
    }

    if (!user) {
      setFactors([]);
      setMfaLoading(false);
      return;
    }

    try {
      logger.debug('useMFA: Fetching MFA factors', { userId: user.id });
      const { data, error } = await supabase.auth.mfa.listFactors();
      
      if (error) {
        logger.error('Failed to list MFA factors', error);
        return;
      }

      const totpFactors = data?.totp || [];
      logger.debug('useMFA: Factors fetched', { 
        count: totpFactors.length, 
        hasVerified: totpFactors.some(f => f.status === 'verified') 
      });
      setFactors(totpFactors);
    } catch (err) {
      logger.error('Error fetching MFA factors', err);
    } finally {
      setMfaLoading(false);
    }
  }, [user, authLoading]);

  // Only fetch factors when auth is complete
  useEffect(() => {
    if (!authLoading) {
      fetchFactors();
    }
  }, [authLoading, fetchFactors]);

  // Start MFA enrollment - cleans up unverified factors first
  const startEnrollment = async (friendlyName?: string): Promise<MFAEnrollmentResult | null> => {
    setEnrolling(true);
    try {
      // First, clean up any existing unverified factors to prevent "factor already exists" error
      const { data: existingFactors } = await supabase.auth.mfa.listFactors();
      const unverifiedFactors = existingFactors?.totp?.filter(f => f.status !== 'verified') || [];
      
      for (const factor of unverifiedFactors) {
        logger.info('Removing unverified MFA factor before new enrollment', { factorId: factor.id });
        await supabase.auth.mfa.unenroll({ factorId: factor.id });
      }

      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: friendlyName || 'CyberShield Authenticator',
      });

      if (error) {
        logger.error('Failed to start MFA enrollment', error);
        throw error;
      }

      setEnrollment(data);
      return data;
    } catch (err) {
      logger.error('Error starting MFA enrollment', err);
      throw err;
    } finally {
      setEnrolling(false);
    }
  };

  // Verify and complete enrollment
  const verifyEnrollment = async (factorId: string, code: string): Promise<boolean> => {
    try {
      // First challenge the factor
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId,
      });

      if (challengeError) {
        logger.error('MFA challenge failed', challengeError);
        throw challengeError;
      }

      // Then verify with the code
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code,
      });

      if (verifyError) {
        logger.error('MFA verification failed', verifyError);
        throw verifyError;
      }

      // Refresh factors list
      await fetchFactors();
      setEnrollment(null);
      return true;
    } catch (err) {
      logger.error('Error verifying MFA enrollment', err);
      throw err;
    }
  };

  // Unenroll (disable) MFA
  const unenrollFactor = async (factorId: string): Promise<boolean> => {
    try {
      const { error } = await supabase.auth.mfa.unenroll({
        factorId,
      });

      if (error) {
        logger.error('Failed to unenroll MFA factor', error);
        throw error;
      }

      await fetchFactors();
      return true;
    } catch (err) {
      logger.error('Error unenrolling MFA factor', err);
      throw err;
    }
  };

  // Verify MFA during login
  const verifyMFA = async (code: string): Promise<boolean> => {
    try {
      const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
      
      if (factorsError) throw factorsError;

      const totpFactor = factorsData?.totp?.[0];
      if (!totpFactor) {
        throw new Error('No TOTP factors found');
      }

      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: totpFactor.id,
      });

      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: totpFactor.id,
        challengeId: challengeData.id,
        code,
      });

      if (verifyError) throw verifyError;

      return true;
    } catch (err) {
      logger.error('MFA verification failed', err);
      throw err;
    }
  };

  // Cancel enrollment
  const cancelEnrollment = () => {
    setEnrollment(null);
  };

  return {
    factors,
    hasMFA,
    loading,
    enrolling,
    enrollment,
    startEnrollment,
    verifyEnrollment,
    unenrollFactor,
    verifyMFA,
    cancelEnrollment,
    refreshFactors: fetchFactors,
  };
};
