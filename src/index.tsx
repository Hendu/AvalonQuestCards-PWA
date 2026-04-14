import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { WAITING_PULSE_KEYFRAMES } from './utils/theme';

// Inject global keyframes for waiting pulse animation
const styleEl = document.createElement('style');
styleEl.textContent = WAITING_PULSE_KEYFRAMES;
document.head.appendChild(styleEl);

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(<App />);
