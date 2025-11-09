import { useState, useEffect } from 'react';
import { useAuth } from './useAuth';

const ONBOARDING_KEY = 'cybershield_onboarding_completed';

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

  const resetOnboarding = () => {
    if (user) {
      const storageKey = `${ONBOARDING_KEY}_${user.id}`;
      localStorage.removeItem(storageKey);
      setShowOnboarding(true);
    }
  };

  return {
    showOnboarding,
    isChecking,
    completeOnboarding,
    resetOnboarding,
  };
};
