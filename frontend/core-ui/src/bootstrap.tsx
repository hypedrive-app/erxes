import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';

import { registerRemotes } from '@module-federation/enhanced/runtime';

import { NODE_ENV, REACT_APP_API_URL } from 'erxes-ui';

import '@blocknote/shadcn/style.css';
import './styles.css';

import { App } from '@/app/components/App';
import { ClientConfigError } from '@/error-handler/components/ClientConfigError';
import { initSentry } from './sentry';
import { applyRuntimeTheme } from './theme/applyRuntimeTheme';

// Install browser error handlers as early as possible, before any rendering.
initSentry();

// Before the first paint, so the app never flashes the default accent and then
// snaps to the deployment's. styles.css is already imported above, so the
// custom properties it defines exist to be overridden by this point.
applyRuntimeTheme();

async function initFederation() {
  const root = ReactDOM.createRoot(
    document.getElementById('root') as HTMLElement,
  );

  if (NODE_ENV === 'development') {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  } else {
    fetch(`${REACT_APP_API_URL}/get-frontend-plugins`)
      .then((res) => res.json())
      .then((data) => {
        registerRemotes(data);

        root.render(<App />);
      })
      .catch((error: unknown) => {
        console.error(
          'Failed to initialize frontend plugins:',
          error instanceof Error ? error.message : String(error),
        );

        root.render(
          <ClientConfigError
            error={
              error instanceof Error
                ? error
                : new Error('Failed to initialize frontend plugins')
            }
          />,
        );
      });
  }
}

initFederation().catch((err) => {
  console.error('Failed to initialize module federation:', err);
});
