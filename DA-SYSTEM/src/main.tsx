import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App, { type ThemeMode } from './App.tsx';

const THEME_STORAGE_KEY = 'detroit-axle-theme-mode';

function readStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'dark';

  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'white' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

function ThemeBoot() {
  const [theme, setTheme] = useState<ThemeMode>(() => readStoredTheme());

  useEffect(() => {
    document.body.dataset.theme = theme;

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // ignore storage write failures
    }
  }, [theme]);

  const themeLabel = useMemo(() => {
    return theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
  }, [theme]);

  return (
    <>
      <div className="global-theme-toolbar">
        <button
          type="button"
          className="global-theme-toggle"
          onClick={() =>
            setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
          }
          aria-label={themeLabel}
          title={themeLabel}
        >
          <span className="global-theme-toggle__label">Theme</span>
          <span className="global-theme-toggle__value">
            {theme === 'dark' ? 'White' : 'Dark'}
          </span>
        </button>
      </div>

      <div className="global-theme-app-shell">
        <App theme={theme} />
      </div>
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeBoot />
  </StrictMode>
);
