import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppStartup } from './AppStartup';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AppStartup />
  </React.StrictMode>
);
