import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    const baseUrl = import.meta.env.BASE_URL || './';
    const cleanBase = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
    try {
      await navigator.serviceWorker.register(`${cleanBase}sw.js`);
    } catch {
      try {
        await navigator.serviceWorker.register('./sw.js');
      } catch (err) {
        console.warn('ServiceWorker registration failed on load:', err);
      }
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

