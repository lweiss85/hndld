import { createContext, useContext, useCallback, useState } from 'react';

interface LiveAnnouncerContextType {
  announce: (message: string, priority?: 'polite' | 'assertive') => void;
}

const LiveAnnouncerContext = createContext<LiveAnnouncerContextType | null>(null);

export function LiveAnnouncerProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState<'polite' | 'assertive'>('polite');

  const announce = useCallback((msg: string, p: 'polite' | 'assertive' = 'polite') => {
    setMessage('');
    setPriority(p);
    setTimeout(() => setMessage(msg), 50);
  }, []);

  return (
    <LiveAnnouncerContext.Provider value={{ announce }}>
      {children}
      <div
        role="status"
        aria-live={priority}
        aria-atomic="true"
        className="sr-only"
      >
        {message}
      </div>
    </LiveAnnouncerContext.Provider>
  );
}

export function useLiveAnnouncer() {
  const context = useContext(LiveAnnouncerContext);
  if (!context) {
    throw new Error('useLiveAnnouncer must be used within LiveAnnouncerProvider');
  }
  return context;
}
