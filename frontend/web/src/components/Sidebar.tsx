import { 
  ListTodo, 
  Puzzle, 
  Users, 
  FileCheck, 
  Settings, 
  X,
  ChevronRight,
  MessageSquare,
  Sparkles,
  Brain
} from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import styles from '../styles/Sidebar.module.css';
import { ChatSessions } from './ChatSessions';
import { McpPanel } from './McpPanel';
import { TodoPanel } from './TodoPanel';
import { SettingsPanel } from './SettingsPanel';
import { SkillsPanel } from './SkillsPanel';
import { MemoryPanel } from './MemoryPanel';

export function Sidebar() {
  const { 
    sidebarOpen, 
    activePanel, 
    setActivePanel, 
    toggleSidebar,
    tasks,
    mcpServers,
    swarmTeammates,
    sidebarWidth,
    setSidebarWidth,
    isResizingSidebar,
    setIsResizingSidebar
  } = useAppStore();
  
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Drag to resize sidebar
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingSidebar(true);
  }, [setIsResizingSidebar]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingSidebar) return;
      
      const newWidth = e.clientX;
      const clampedWidth = Math.max(200, Math.min(500, newWidth));
      setSidebarWidth(clampedWidth);
    };

    const handleMouseUp = () => {
      setIsResizingSidebar(false);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };

    if (isResizingSidebar) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingSidebar, setSidebarWidth, setIsResizingSidebar]);

  const panels = [
    { id: 'chats', label: 'Chats', icon: MessageSquare },
    { id: 'tasks', label: 'Tasks', icon: ListTodo, count: tasks.filter(t => t.status === 'running').length },
    { id: 'mcp', label: 'MCP Servers', icon: Puzzle, count: mcpServers.filter(s => s.status === 'connected').length },
    { id: 'swarm', label: 'Swarm', icon: Users, count: swarmTeammates.length },
    { id: 'skills', label: 'Skills', icon: Sparkles },
    { id: 'memory', label: 'Memory', icon: Brain },
    { id: 'todo', label: 'TODO', icon: FileCheck },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const renderPanelContent = () => {
    switch (activePanel) {
      case 'chats':
        return <ChatSessions />;
      case 'tasks':
        return (
          <div className={styles.panel}>
            <h3>Active Tasks</h3>
            {tasks.length === 0 ? (
              <p className={styles.empty}>No active tasks</p>
            ) : (
              <ul className={styles.list}>
                {tasks.map((task) => (
                  <li key={task.id} className={styles.listItem}>
                    <div className={styles.taskHeader}>
                      <span className={styles.taskName}>{task.description}</span>
                      <span className={`${styles.taskStatus} ${styles[task.status]}`}>
                        {task.status}
                      </span>
                    </div>
                    {task.progress !== undefined && (
                      <div className={styles.progressBar}>
                        <div 
                          className={styles.progressFill} 
                          style={{ width: `${task.progress}%` }}
                        />
                      </div>
                    )}
                    {task.status_note && (
                      <p className={styles.taskNote}>{task.status_note}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      case 'mcp':
        return <McpPanel />;
      case 'swarm':
        return (
          <div className={styles.panel}>
            <h3>Swarm Teammates</h3>
            {swarmTeammates.length === 0 ? (
              <p className={styles.empty}>No active teammates</p>
            ) : (
              <ul className={styles.list}>
                {swarmTeammates.map((teammate) => (
                  <li key={teammate.agent_id} className={styles.listItem}>
                    <div className={styles.teammateHeader}>
                      <span className={styles.teammateName}>{teammate.name}</span>
                      <span className={styles.teammateStatus}>{teammate.status}</span>
                    </div>
                    {teammate.task && (
                      <p className={styles.teammateTask}>{teammate.task}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      case 'skills':
        return <SkillsPanel />;
      case 'memory':
        return <MemoryPanel />;
      case 'todo':
        return <TodoPanel />;
      case 'settings':
        return <SettingsPanel />;
      default:
        return null;
    }
  };

  if (!sidebarOpen) {
    return (
      <aside className={`${styles.sidebar} ${styles.collapsed}`}>
        <button className={styles.expandButton} onClick={toggleSidebar}>
          <ChevronRight size={20} />
        </button>
      </aside>
    );
  }

  return (
    <>
      <aside 
        ref={sidebarRef}
        className={styles.sidebar}
        style={{ width: `${sidebarWidth}px` }}
      >
        <div className={styles.header}>
          <h2>Navigation</h2>
          <button className={styles.closeButton} onClick={toggleSidebar}>
            <X size={20} />
          </button>
        </div>
        
        <nav className={styles.nav}>
          {panels.map((panel) => {
            const Icon = panel.icon;
            return (
              <button
                key={panel.id}
                className={`${styles.navItem} ${activePanel === panel.id ? styles.active : ''}`}
                onClick={() => setActivePanel(panel.id as any)}
              >
                <Icon size={20} />
                <span>{panel.label}</span>
                {panel.count !== undefined && panel.count > 0 && (
                  <span className={styles.badge}>{panel.count}</span>
                )}
              </button>
            );
          })}
        </nav>

        <div className={styles.content}>
          {renderPanelContent()}
        </div>

        {/* Resize Handle */}
        <div 
          className={`${styles.resizeHandle} ${isResizingSidebar ? styles.resizing : ''}`}
          onMouseDown={handleMouseDown}
        >
          <div className={styles.resizeDots}>
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      </aside>
      
      {/* Overlay when resizing */}
      {isResizingSidebar && (
        <div className={styles.resizeOverlay} />
      )}
    </>
  );
}
