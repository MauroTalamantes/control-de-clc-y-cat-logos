import {Component, StrictMode, type ErrorInfo, type ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if (window.clcDialog) {
  window.alert = window.clcDialog.alert;
  window.confirm = window.clcDialog.confirm;
  window.prompt = window.clcDialog.prompt;
}

const reportRendererError = (error: unknown, source: string) => {
  const normalized = error instanceof Error ? error : new Error(String(error));
  window.clcDiagnostics?.reportError({
    message: normalized.message,
    stack: normalized.stack,
    source,
  });
};

window.addEventListener('error', event => {
  reportRendererError(event.error || event.message, 'window.error');
});

window.addEventListener('unhandledrejection', event => {
  reportRendererError(event.reason, 'window.unhandledrejection');
});

class RootErrorBoundary extends Component<{children: ReactNode}, {error: Error | null}> {
  declare readonly props: Readonly<{children: ReactNode}>;
  state = {error: null as Error | null};

  static getDerivedStateFromError(error: Error) {
    return {error};
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    window.clcDiagnostics?.reportError({
      message: error.message,
      stack: `${error.stack || ''}\n${info.componentStack || ''}`,
      source: 'react.error-boundary',
    });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main style={{fontFamily: 'system-ui', margin: '48px auto', maxWidth: 720, padding: 24}}>
        <h1>Control de CLC no pudo mostrar la interfaz</h1>
        <p>El error quedo registrado. Puedes abrir la carpeta de diagnostico y volver a intentar.</p>
        <button type="button" onClick={() => void window.clcDiagnostics?.openFolder()}>
          Abrir diagnosticos
        </button>
      </main>
    );
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </StrictMode>,
);
