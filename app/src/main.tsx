import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import 'katex/dist/katex.min.css';
import 'uplot/dist/uPlot.min.css';

import App from './App';
import './styles.css';

registerSW({ immediate: true });

const root = document.getElementById('root');
if (!root) throw new Error('Application root element is missing.');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
