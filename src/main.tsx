import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Global function to hide loading screen
(window as any).hideAppLoading = () => {
  const loadingEl = document.getElementById('app-loading');
  if (loadingEl) {
    loadingEl.style.opacity = '0';
    setTimeout(() => {
      if (loadingEl.parentNode) loadingEl.remove();
    }, 500);
  }
};

const rootElement = document.getElementById('root');
if (rootElement) {
  try {
    createRoot(rootElement).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  } catch (error) {
    console.error('Failed to render app:', error);
    const loadingEl = document.getElementById('app-loading');
    if (loadingEl) {
      loadingEl.innerHTML = `
        <div style="color: #ef4444; text-align: center; padding: 20px; font-family: sans-serif;">
          <h2 style="margin-bottom: 8px;">Initialization Error</h2>
          <p style="font-size: 14px; opacity: 0.8;">${error instanceof Error ? error.message : 'Unknown error'}</p>
          <button onclick="window.location.reload(true)" style="margin-top: 16px; background: #4f46e5; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer;">RELOAD</button>
        </div>
      `;
    }
  }
}
