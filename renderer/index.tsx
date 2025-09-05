import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/index.css';

// Ensure we have the container element
const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container not found');
}

// Create React root and render app
const root = createRoot(container);
root.render(<App />);

// Hot module replacement for development
if ((import.meta as any).hot) {
  (import.meta as any).hot.accept();
}