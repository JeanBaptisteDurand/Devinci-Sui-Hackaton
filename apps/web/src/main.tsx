import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { useSuiClientContext } from '@mysten/dapp-kit';
import { isEnokiNetwork, registerEnokiWallets } from '@mysten/enoki';
import App from './App.tsx';
import './index.css';

// 🔑 Component to register Enoki wallets (Google zkLogin)
function RegisterEnokiWallets() {
  const { client, network } = useSuiClientContext();

  useEffect(() => {
    if (!isEnokiNetwork(network)) return;

    const { unregister } = registerEnokiWallets({
      apiKey: import.meta.env.VITE_ENOKI_PUBLIC_KEY || 'enoki_public_c3fe41d6ea28023237de44114c4411af',
      providers: {
        google: {
          clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
        },
      },
      client: client as any,
      network,
    });

    return unregister;
  }, [client, network]);

  return null;
}

// Wrap App with RegisterEnokiWallets inside the SuiClientProvider context
function AppWithEnoki() {
  return (
    <>
      <RegisterEnokiWallets />
      <App />
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppWithEnoki />
  </React.StrictMode>,
);

