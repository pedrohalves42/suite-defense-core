import { useState, useEffect } from 'react';
import { useAuth } from './useAuth';

const ONBOARDING_KEY = 'cybershield_onboarding_completed';
const ONBOARDING_DISMISS_KEY = 'cybershield_onboarding_dismissed_until';

export const useOnboarding = () => {
  const { user } = useAuth();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    if (!user) {
      setIsChecking(false);
      return;
    }

    // Check if user has completed onboarding
    const storageKey = `${ONBOARDING_KEY}_${user.id}`;
    const completed = localStorage.getItem(storageKey);

    // Check if dismissed for 7 days
    const dismissKey = `${ONBOARDING_DISMISS_KEY}_${user.id}`;
    const dismissedUntil = localStorage.getItem(dismissKey);
    
    if (dismissedUntil && Date.now() < parseInt(dismissedUntil, 10)) {
      // Still within dismissal period
      setIsChecking(false);
      return;
    }

    if (!completed) {
      // Small delay to ensure user is fully loaded
      setTimeout(() => {
        setShowOnboarding(true);
        setIsChecking(false);
      }, 1000);
    } else {
      setIsChecking(false);
    }
  }, [user]);

  const completeOnboarding = () => {
    if (user) {
      const storageKey = `${ONBOARDING_KEY}_${user.id}`;
      localStorage.setItem(storageKey, 'true');
      setShowOnboarding(false);
    }
  };

  const dismissFor7Days = () => {
    if (user) {
      const dismissKey = `${ONBOARDING_DISMISS_KEY}_${user.id}`;
      const dismissUntil = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 days in ms
      localStorage.setItem(dismissKey, dismissUntil.toString());
      setShowOnboarding(false);
    }
  };

  const resetOnboarding = () => {
    if (user) {
      const storageKey = `${ONBOARDING_KEY}_${user.id}`;
      const dismissKey = `${ONBOARDING_DISMISS_KEY}_${user.id}`;
      localStorage.removeItem(storageKey);
      localStorage.removeItem(dismissKey);
      setShowOnboarding(true);
    }
  };

  return {
    showOnboarding,
    isChecking,
    completeOnboarding,
    dismissFor7Days,
    resetOnboarding,
  };
};
