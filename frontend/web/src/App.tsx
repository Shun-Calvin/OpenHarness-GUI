import React from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { ChatView } from './components/ChatView';
import { TerminalView } from './components/TerminalView';
import { CommandPalette } from './components/CommandPalette';
import { useBackendConnection } from './hooks/useBackendConnection';
import { useAppStore } from './store/useAppStore';
import styles from './styles/App.module.css';

export function App() {
  const { connect, connected, connecting, error } = useBackendConnection();
  const { terminalView } = useAppStore();

  React.useEffect(() => {
    connect();
  }, [connect]);

  return (
    <div className={styles.app}>
      <CommandPalette />
      <Header />
      <div className={styles.main}>
        <Sidebar />
        <main className={styles.content}>
          {!connected && !connecting && (
            <div className={styles.connectionError}>
              <h2>Connection Lost</h2>
              <p>{error || 'Unable to connect to OpenHarness backend'}</p>
              <button onClick={() => connect()} className={styles.reconnectButton}>
                Reconnect
              </button>
            </div>
          )}
          {connecting && (
            <div className={styles.connecting}>
              <div className={styles.spinner} />
              <p>Connecting to OpenHarness...</p>
            </div>
          )}
          {connected && (
            <>
              {terminalView === 'chat' ? <ChatView /> : <TerminalView />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
