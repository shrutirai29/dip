import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';

export type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  isDark: boolean;
}

const STORAGE_KEY = 'crowdguard_theme_preference';

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored === 'dark' || stored === 'light') {
          return stored;
        }
      }
    } catch {
      // Gracefully handle unavailable or restricted storage
    }
    // Default is strictly light mode for new users per specification
    return 'light';
  });

  const applyThemeToDOM = useCallback((currentTheme: Theme) => {
    try {
      if (typeof document !== 'undefined') {
        const root = document.documentElement;
        if (currentTheme === 'dark') {
          root.classList.add('dark');
          root.classList.remove('light');
          root.setAttribute('data-theme', 'dark');
          root.style.colorScheme = 'dark';
        } else {
          root.classList.add('light');
          root.classList.remove('dark');
          root.setAttribute('data-theme', 'light');
          root.style.colorScheme = 'light';
        }
      }
    } catch {
      // Guard against headless/SSR environments
    }
  }, []);

  useEffect(() => {
    applyThemeToDOM(theme);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(STORAGE_KEY, theme);
      }
    } catch {
      // Ignore localStorage write failures
    }
  }, [theme, applyThemeToDOM]);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        toggleTheme,
        isDark: theme === 'dark',
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
