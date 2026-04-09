export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool' | 'tool_result';
  content: string;
  timestamp: number;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  is_error?: boolean;
}

export interface TaskSnapshot {
  id: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress?: number;
  status_note?: string;
  type: 'local_bash' | 'local_agent';
}

export interface SessionState {
  permission_mode?: string;
  model?: string;
  theme?: string;
  working_directory?: string;
  max_turns?: number;
}

export interface McpServerSnapshot {
  name: string;
  status: 'connected' | 'disconnected' | 'error';
  tools?: string[];
  config?: Record<string, unknown>;
}

export interface BridgeSessionSnapshot {
  id: string;
  name: string;
  status: string;
}

export interface BackendEvent {
  type: 'ready' | 'state_snapshot' | 'tasks_snapshot' | 'transcript_item' | 
        'assistant_delta' | 'assistant_complete' | 'line_complete' | 
        'modal_request' | 'select_request' | 'error' | 'mcp_servers' | 
        'bridge_sessions' | 'todo_updated' | 'swarm_teammates' | 
        'swarm_notifications';
  state?: Record<string, unknown>;
  tasks?: TaskSnapshot[];
  item?: TranscriptItem;
  message?: string;
  commands?: string[];
  mcp_servers?: McpServerSnapshot[];
  bridge_sessions?: BridgeSessionSnapshot[];
  modal?: Record<string, unknown>;
  select_request?: {
    title: string;
    command: string;
    options: SelectOptionPayload[];
  };
  todo_markdown?: string;
}

export interface TranscriptItem {
  role: 'user' | 'assistant' | 'system' | 'tool' | 'tool_result' | 'log';
  text?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  output?: string;
  is_error?: boolean;
}

export interface SelectOptionPayload {
  value: string;
  label: string;
  description?: string;
  active?: boolean;
}

export interface SwarmTeammateSnapshot {
  agent_id: string;
  name: string;
  status: string;
  task?: string;
}

export interface SwarmNotificationSnapshot {
  id: string;
  message: string;
  timestamp: number;
  type: 'info' | 'warning' | 'error';
}

export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  content?: string;
  status: 'pending' | 'uploading' | 'uploaded' | 'error';
}

export interface ChatSession {
  id: string;
  name: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  model?: string;
}

export interface McpServerConfig {
  name: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
}

export interface SwarmConfig {
  teamName: string;
  agents: string[];
}

export interface TodoItem {
  text: string;
  checked: boolean;
}

export interface AppSettings {
  apiKey: string;
  model: string;
  permissionMode: 'plan' | 'default';
  theme: 'dark' | 'light';
  workingDirectory: string;
  maxTurns: number;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  icon?: string;
}

export interface MemoryItem {
  id: string;
  content: string;
  createdAt: number;
  type: 'fact' | 'preference' | 'context';
}
