import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { userManager } from './auth/oidc';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App gestionnaire={userManager} />
  </StrictMode>,
);
