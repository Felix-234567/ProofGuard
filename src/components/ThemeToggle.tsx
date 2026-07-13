'use client';

import { useState, useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';

export default function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  // Load initial theme from DOM on mount (client-side only)
  useEffect(() => {
    const currentTheme = document.documentElement.getAttribute('data-theme') as 'light' | 'dark';
    if (currentTheme) {
      setTheme(currentTheme);
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('pg_theme', newTheme);
  };

  return (
    <button
      onClick={toggleTheme}
      className="btn btn-secondary"
      aria-label="Toggle Theme"
      title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
      style={{
        borderRadius: '50%',
        width: '36px',
        height: '36px',
        padding: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        border: '1px solid var(--panel-border-light)'
      }}
    >
      {theme === 'light' ? (
        <Moon size={16} style={{ color: 'var(--text-secondary)' }} />
      ) : (
        <Sun size={16} style={{ color: 'var(--accent-green)' }} />
      )}
    </button>
  );
}
