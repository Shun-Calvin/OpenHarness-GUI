import { Terminal, Menu, Command } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import styles from '../styles/Header.module.css';

export function Header() {
  const { connected, connecting, sessionState, toggleSidebar, setCommandPaletteOpen } = useAppStore();

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <button 
          className={styles.menuButton}
          onClick={toggleSidebar}
          aria-label="Toggle sidebar"
        >
          <Menu size={20} />
        </button>
        <div className={styles.logo}>
          <Terminal size={24} />
          <span>OpenHarness</span>
        </div>
      </div>
      
      <div className={styles.center}>
        <div className={styles.statusBadge}>
          <span className={`${styles.statusDot} ${connected ? styles.connected : connecting ? styles.connecting : styles.disconnected}`} />
          {connected ? 'Connected' : connecting ? 'Connecting...' : 'Disconnected'}
        </div>
      </div>
      
      <div className={styles.right}>
        {sessionState?.model && (
          <span className={styles.modelInfo}>{sessionState.model}</span>
        )}
        {sessionState?.permission_mode && (
          <span className={styles.modeInfo}>
            Mode: {sessionState.permission_mode}
          </span>
        )}
        <button 
          className={styles.commandButton}
          onClick={() => setCommandPaletteOpen(true)}
          title="Command Palette (Ctrl+K)"
          aria-label="Open command palette"
        >
          <Command size={18} />
          <span className={styles.shortcutHint}>Ctrl+K</span>
        </button>
      </div>
    </header>
  );
}
