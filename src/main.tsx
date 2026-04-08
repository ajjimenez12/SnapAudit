import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Global error handlers for debugging
window.addEventListener('error', (event) => {
  console.error('Global error caught:', event.error);
});
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});

// Polyfill for crypto.randomUUID if it's missing in some environments
if (typeof window !== 'undefined') {
  if (typeof window.crypto === 'undefined') {
    (window as any).crypto = {} as any;
  }
  if (!(window.crypto as any).randomUUID) {
    (window.crypto as any).randomUUID = () => {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    };
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
