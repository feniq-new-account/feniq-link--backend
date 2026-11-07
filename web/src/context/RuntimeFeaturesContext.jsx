import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api/client';

// Standalone component consumers retain main's enabled behavior. The app's
// provider waits for the server and fails closed when it cannot refresh.
export const RuntimeFeaturesContext = createContext({ mutualRatings: true });
export const useRuntimeFeatures = () => useContext(RuntimeFeaturesContext);
export function RuntimeFeaturesProvider({ children }) {
  const [features, setFeatures] = useState({ mutualRatings: false });
  useEffect(() => {
    let live = true;
    let request = 0;
    async function refresh() {
      const current = ++request;
      try {
        const data = await api.runtimeFeatures();
        if (live && current === request) setFeatures({ mutualRatings: data.features?.mutualRatings === true });
      } catch {
        if (live && current === request) setFeatures({ mutualRatings: false });
      }
    }
    refresh();
    const timer = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => { live = false; clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);
  return <RuntimeFeaturesContext.Provider value={features}>{children}</RuntimeFeaturesContext.Provider>;
}
