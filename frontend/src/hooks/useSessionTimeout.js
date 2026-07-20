import { useState, useEffect, useCallback } from 'react';

export function useSessionTimeout(timeoutMs = 30 * 60 * 1000, warningMs = 60 * 1000) {
  const [showWarning, setShowWarning] = useState(false);
  const [countdown, setCountdown] = useState(warningMs / 1000);

  const resetTimer = useCallback(() => {
    setShowWarning(false);
    setCountdown(warningMs / 1000);
  }, [warningMs]);

  useEffect(() => {
    let timeoutId;
    let countdownIntervalId;
    
    const handleActivity = () => {
      if (!showWarning) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => setShowWarning(true), timeoutMs - warningMs);
      }
    };

    if (showWarning) {
      countdownIntervalId = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(countdownIntervalId);
            localStorage.removeItem('destek_token');
            localStorage.removeItem('destek_user');
            window.location.href = '/';
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      timeoutId = setTimeout(() => setShowWarning(true), timeoutMs - warningMs);
    }

    const events = ['mousemove', 'keydown', 'click', 'scroll'];
    events.forEach(event => window.addEventListener(event, handleActivity));

    return () => {
      clearTimeout(timeoutId);
      clearInterval(countdownIntervalId);
      events.forEach(event => window.removeEventListener(event, handleActivity));
    };
  }, [showWarning, timeoutMs, warningMs]);

  return { showWarning, countdown, resetTimer };
}
