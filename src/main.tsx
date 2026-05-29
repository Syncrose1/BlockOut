import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { applyTheme, getTheme } from './utils/theme';
import './styles/global.css';

// Apply the persisted theme before first paint to avoid a flash.
applyTheme(getTheme());

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
