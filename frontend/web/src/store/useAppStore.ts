import { create } from 'zustand';
import type { 
  Message, 
  SessionState, 
  TaskSnapshot, 
  McpServerSnapshot, 
  BridgeSessionSnapshot,
  SwarmTeammateSnapshot,
  SwarmNotificationSnapshot,
  UploadedFile,
  ChatSession,
  McpServerConfig,
  TodoItem,
  AppSettings
} from '../types';

interface Skill {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  icon?: string;
}

interface MemoryItem {
  id: string;
  content: string;
  createdAt: number;
  type: 'fact' | 'preference' | 'context';
}

interface AppState {
  // Connection state
  connected: boolean;
  connecting: boolean;
  error: string | null;
  
  // Session data
  messages: Message[];
  sessionState: SessionState | null;
  tasks: TaskSnapshot[];
  mcpServers: McpServerSnapshot[];
  bridgeSessions: BridgeSessionSnapshot[];
  swarmTeammates: SwarmTeammateSnapshot[];
  swarmNotifications: SwarmNotificationSnapshot[];
  todoMarkdown: string;
  commands: string[];
  
  // New features state
  chatSessions: ChatSession[];
  currentChatId: string | null;
  uploadedFiles: UploadedFile[];
  availableModels: string[];
  permissionModes: { value: string; label: string }[];
  settings: AppSettings;
  mcpServerConfigs: McpServerConfig[];
  todoItems: TodoItem[];
  skills: Skill[];
  memories: MemoryItem[];
  
  // UI state
  isBusy: boolean;
  sidebarOpen: boolean;
  sidebarWidth: number;
  activePanel: 'chats' | 'tasks' | 'mcp' | 'swarm' | 'todo' | 'settings' | 'skills' | 'memory';
  terminalView: 'chat' | 'terminal';
  commandPaletteOpen: boolean;
  inputHeight: number;
  showFileUpload: boolean;
  expandedMessages: Set<string>;
  isResizingSidebar: boolean;
  isResizingInput: boolean;
  
  // Callback actions (set by hooks)
  submitPrompt: ((prompt: string) => void) | null;
  
  // Actions
  setConnected: (connected: boolean) => void;
  setConnecting: (connecting: boolean) => void;
  setError: (error: string | null) => void;
  addMessage: (message: Message) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  setSessionState: (state: Partial<SessionState>) => void;
  setTasks: (tasks: TaskSnapshot[]) => void;
  setMcpServers: (servers: McpServerSnapshot[]) => void;
  setBridgeSessions: (sessions: BridgeSessionSnapshot[]) => void;
  setSwarmTeammates: (teammates: SwarmTeammateSnapshot[]) => void;
  setSwarmNotifications: (notifications: SwarmNotificationSnapshot[]) => void;
  setTodoMarkdown: (markdown: string) => void;
  setCommands: (commands: string[]) => void;
  setBusy: (busy: boolean) => void;
  setSubmitPrompt: (fn: ((prompt: string) => void) | null) => void;
  toggleSidebar: () => void;
  setActivePanel: (panel: AppState['activePanel']) => void;
  setTerminalView: (view: AppState['terminalView']) => void;
  toggleCommandPalette: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  clearMessages: () => void;
  
  // New feature actions
  setInputHeight: (height: number) => void;
  addUploadedFile: (file: UploadedFile) => void;
  removeUploadedFile: (id: string) => void;
  clearUploadedFiles: () => void;
  setShowFileUpload: (show: boolean) => void;
  setAvailableModels: (models: string[]) => void;
  setCurrentModel: (model: string) => void;
  setPermissionMode: (mode: string) => void;
  createNewChat: (name?: string) => void;
  switchChat: (chatId: string) => void;
  deleteChat: (chatId: string) => void;
  updateSettings: (settings: Partial<AppSettings>) => void;
  addMcpServer: (config: McpServerConfig) => void;
  removeMcpServer: (name: string) => void;
  updateMcpServer: (name: string, config: Partial<McpServerConfig>) => void;
  addTodoItem: (text: string) => void;
  toggleTodoItem: (index: number) => void;
  removeTodoItem: (index: number) => void;
  updateTodoMarkdown: (markdown: string) => void;
  
  // Gemini-like features
  toggleMessageExpand: (messageId: string) => void;
  setSidebarWidth: (width: number) => void;
  setIsResizingSidebar: (resizing: boolean) => void;
  setIsResizingInput: (resizing: boolean) => void;
  addSkill: (skill: Skill) => void;
  toggleSkill: (skillId: string) => void;
  removeSkill: (skillId: string) => void;
  addMemory: (memory: MemoryItem) => void;
  removeMemory: (memoryId: string) => void;
  updateMemory: (memoryId: string, content: string) => void;
  setSkills: (skills: Skill[]) => void;
  setMemories: (memories: MemoryItem[]) => void;
}

const DEFAULT_MODELS = [
  'claude-3-5-sonnet-20241022',
  'claude-3-opus-20240229',
  'claude-3-sonnet-20240229',
  'claude-3-haiku-20240307',
  'gemini-1-5-pro',
  'gemini-1-5-flash',
  'gpt-4-turbo-preview',
  'gpt-4-0125-preview',
  'gpt-3.5-turbo-0125'
];

const PERMISSION_MODES = [
  { value: 'default', label: 'Default (Auto-approve safe commands)' },
  { value: 'plan', label: 'Plan Mode (Review before execution)' }
];

const DEFAULT_SETTINGS: AppSettings = {
  apiKey: '',
  model: 'claude-3-5-sonnet-20241022',
  permissionMode: 'default',
  theme: 'dark',
  workingDirectory: '~/workspace',
  maxTurns: 100
};

const DEFAULT_SKILLS: Skill[] = [
  { id: 'code-review', name: 'Code Review', description: 'Review and suggest improvements for code', enabled: true },
  { id: 'debugging', name: 'Debugging', description: 'Help identify and fix bugs', enabled: true },
  { id: 'testing', name: 'Testing', description: 'Write and run tests', enabled: true },
  { id: 'documentation', name: 'Documentation', description: 'Generate documentation', enabled: false },
  { id: 'refactoring', name: 'Refactoring', description: 'Improve code structure', enabled: false },
];

export const useAppStore = create<AppState>((set) => ({
  // Initial state
  connected: false,
  connecting: false,
  error: null,
  messages: [],
  sessionState: null,
  tasks: [],
  mcpServers: [],
  bridgeSessions: [],
  swarmTeammates: [],
  swarmNotifications: [],
  todoMarkdown: '',
  commands: [],
  isBusy: false,
  sidebarOpen: true,
  sidebarWidth: 280,
  activePanel: 'chats',
  terminalView: 'chat',
  commandPaletteOpen: false,
  inputHeight: 140,
  showFileUpload: false,
  submitPrompt: null,
  expandedMessages: new Set(),
  isResizingSidebar: false,
  isResizingInput: false,
  
  // New features initial state
  chatSessions: [],
  currentChatId: null,
  uploadedFiles: [],
  availableModels: DEFAULT_MODELS,
  permissionModes: PERMISSION_MODES,
  settings: DEFAULT_SETTINGS,
  mcpServerConfigs: [],
  todoItems: [],
  skills: DEFAULT_SKILLS,
  memories: [],
  
  // Actions
  setConnected: (connected) => set({ connected }),
  setConnecting: (connecting) => set({ connecting }),
  setError: (error) => set({ error }),
  
  addMessage: (message) => set((state) => ({
    messages: [...state.messages, message]
  })),
  
  updateMessage: (id, updates) => set((state) => ({
    messages: state.messages.map((msg) => 
      msg.id === id ? { ...msg, ...updates } : msg
    )
  })),
  
  setSessionState: (state) => set((prev) => ({
    sessionState: { ...prev.sessionState, ...state }
  })),
  
  setTasks: (tasks) => set({ tasks }),
  setMcpServers: (servers) => set({ mcpServers: servers }),
  setBridgeSessions: (sessions) => set({ bridgeSessions: sessions }),
  setSwarmTeammates: (teammates) => set({ swarmTeammates: teammates }),
  setSwarmNotifications: (notifications) => set({ swarmNotifications: notifications }),
  setTodoMarkdown: (markdown) => set({ todoMarkdown: markdown }),
  setCommands: (commands) => set({ commands }),
  setBusy: (busy) => set({ isBusy: busy }),
  setSubmitPrompt: (fn) => set({ submitPrompt: fn }),
  
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setActivePanel: (panel) => set({ activePanel: panel }),
  setTerminalView: (view) => set({ terminalView: view }),
  toggleTerminalView: () => set((state) => ({ terminalView: state.terminalView === 'chat' ? 'terminal' : 'chat' })),
  toggleCommandPalette: () => set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen })),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  clearMessages: () => set({ messages: [] }),
  
  // New feature actions
  setInputHeight: (height) => set({ inputHeight: height }),
  
  addUploadedFile: (file) => set((state) => ({
    uploadedFiles: [...state.uploadedFiles, file]
  })),
  
  removeUploadedFile: (id) => set((state) => ({
    uploadedFiles: state.uploadedFiles.filter(f => f.id !== id)
  })),
  
  clearUploadedFiles: () => set({ uploadedFiles: [] }),
  
  setShowFileUpload: (show) => set({ showFileUpload: show }),
  
  setAvailableModels: (models) => set({ availableModels: models }),
  
  setCurrentModel: (model) => set((state) => ({
    settings: { ...state.settings, model },
    sessionState: { ...state.sessionState, model }
  })),
  
  setPermissionMode: (mode) => set((state) => ({
    settings: { ...state.settings, permissionMode: mode as 'plan' | 'default' },
    sessionState: { ...state.sessionState, permission_mode: mode }
  })),
  
  createNewChat: (name) => set((state) => {
    const newChat: ChatSession = {
      id: `chat-${Date.now()}`,
      name: name || `New Chat ${state.chatSessions.length + 1}`,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      model: state.settings.model
    };
    return {
      chatSessions: [newChat, ...state.chatSessions],
      currentChatId: newChat.id,
      messages: []
    };
  }),
  
  switchChat: (chatId) => set((state) => {
    const chat = state.chatSessions.find(c => c.id === chatId);
    if (!chat) return state;
    return {
      currentChatId: chatId,
      messages: chat.messages
    };
  }),
  
  deleteChat: (chatId) => set((state) => {
    const newSessions = state.chatSessions.filter(c => c.id !== chatId);
    const newCurrentId = state.currentChatId === chatId 
      ? (newSessions.length > 0 ? newSessions[0].id : null)
      : state.currentChatId;
    const newMessages = state.currentChatId === chatId
      ? (newSessions.length > 0 ? newSessions[0].messages : [])
      : state.messages;
    return {
      chatSessions: newSessions,
      currentChatId: newCurrentId,
      messages: newMessages
    };
  }),
  
  updateSettings: (newSettings) => set((state) => ({
    settings: { ...state.settings, ...newSettings }
  })),
  
  addMcpServer: (config) => set((state) => ({
    mcpServerConfigs: [...state.mcpServerConfigs, config]
  })),
  
  removeMcpServer: (name) => set((state) => ({
    mcpServerConfigs: state.mcpServerConfigs.filter(s => s.name !== name)
  })),
  
  updateMcpServer: (name, config) => set((state) => ({
    mcpServerConfigs: state.mcpServerConfigs.map(s => 
      s.name === name ? { ...s, ...config } : s
    )
  })),
  
  addTodoItem: (text) => set((state) => ({
    todoItems: [...state.todoItems, { text, checked: false }]
  })),
  
  toggleTodoItem: (index) => set((state) => ({
    todoItems: state.todoItems.map((item, i) => 
      i === index ? { ...item, checked: !item.checked } : item
    )
  })),
  
  removeTodoItem: (index) => set((state) => ({
    todoItems: state.todoItems.filter((_, i) => i !== index)
  })),
  
  updateTodoMarkdown: (markdown) => set({ todoMarkdown: markdown }),
  
  // Gemini-like features
  toggleMessageExpand: (messageId) => set((state) => {
    const newExpanded = new Set(state.expandedMessages);
    if (newExpanded.has(messageId)) {
      newExpanded.delete(messageId);
    } else {
      newExpanded.add(messageId);
    }
    return { expandedMessages: newExpanded };
  }),
  
  setSidebarWidth: (width) => set({ sidebarWidth: width }),
  setIsResizingSidebar: (resizing) => set({ isResizingSidebar: resizing }),
  setIsResizingInput: (resizing) => set({ isResizingInput: resizing }),
  
  addSkill: (skill) => set((state) => ({
    skills: [...state.skills, skill]
  })),
  
  toggleSkill: (skillId) => set((state) => ({
    skills: state.skills.map(s => 
      s.id === skillId ? { ...s, enabled: !s.enabled } : s
    )
  })),
  
  removeSkill: (skillId) => set((state) => ({
    skills: state.skills.filter(s => s.id !== skillId)
  })),
  
  addMemory: (memory) => set((state) => ({
    memories: [...state.memories, memory]
  })),
  
  removeMemory: (memoryId) => set((state) => ({
    memories: state.memories.filter(m => m.id !== memoryId)
  })),
  
  updateMemory: (memoryId, content) => set((state) => ({
    memories: state.memories.map(m => 
      m.id === memoryId ? { ...m, content } : m
    )
  })),
  
  setSkills: (skills) => set({ skills }),
  setMemories: (memories) => set({ memories }),
}));
