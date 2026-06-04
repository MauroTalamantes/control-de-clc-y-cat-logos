import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if (window.clcDialog) {
  window.alert = window.clcDialog.alert;
  window.confirm = window.clcDialog.confirm;
  window.prompt = window.clcDialog.prompt;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
