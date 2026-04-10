import { useEffect, useCallback, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import type { BackendEvent, TranscriptItem, Message, ModalRequest } from '../types';
import {
  getSocketInstance,
  createSocket,
  disconnectSocket,
  isConnectionAttempted,
} from '../utils/socketManager';

export function useBackendConnection() {
  const streamingMessageRef = useRef<Message | null>(null);
  const userMessageTimestampRef = useRef<number | null>(null);
  const listenersSetupRef = useRef(false);
  
  // Get store actions once - these are stable
  const {
    setConnected,
    setConnecting,
    setError,
    addMessage,
    updateMessage,
    setSessionState,
    setTasks,
    setMcpServers,
    setBridgeSessions,
    setBusy,
    setCommands,
    setSubmitPrompt,
    setSendPermissionResponse,
    setSkills,
    setAvailableModels,
    setCurrentModel,
    updateSettings,
    setActiveModal,
    connected,
    connecting,
    error,
  } = useAppStore();

  // Handle backend events - defined once
  const handleBackendEvent = useCallback((data: string) => {
    console.log('[WS] 📩 Raw event received:', data.substring(0, 200));
    try {
      // Strip protocol prefix if present
      const jsonStr = data.startsWith('OHJSON:') ? data.slice(7) : data;
      const event = JSON.parse(jsonStr) as BackendEvent;
      console.log('[WS] 📩 Event type:', event.type);
      
      // Handle event
      switch (event.type) {
        case 'ready':
          console.log('[WS] Handling ready event');
          if (event.state) {
            const state = event.state as Record<string, unknown>;
            setSessionState(state as any);
            
            // Sync settings from backend
            if (state.model) {
              setCurrentModel(state.model as string);
            }
            if (state.permission_mode) {
              updateSettings({ permissionMode: state.permission_mode as 'plan' | 'default' | 'auto' });
            }
            if (state.working_directory) {
              updateSettings({ workingDirectory: state.working_directory as string });
            }
            if (state.max_turns) {
              updateSettings({ maxTurns: state.max_turns as number });
            }
            
            // Sync skills from backend if available
            if (state.skills && Array.isArray(state.skills)) {
              setSkills(state.skills.map((s: any) => ({
                id: s.id || s.name?.toLowerCase().replace(/\s+/g, '-'),
                name: s.name || s.id,
                description: s.description || '',
                enabled: s.enabled !== false,
              })));
            }
            
            // Sync available models from backend if available
            if (state.available_models && Array.isArray(state.available_models)) {
              setAvailableModels(state.available_models);
            }
          }
          if (event.commands) {
            setCommands(event.commands);
          }
          if (event.mcp_servers) {
            setMcpServers(event.mcp_servers);
          }
          if (event.bridge_sessions) {
            setBridgeSessions(event.bridge_sessions);
          }
          if (event.tasks) {
            setTasks(event.tasks);
          }
          break;

        case 'transcript_item':
          if (event.item) {
            const item = event.item as TranscriptItem;
            const now = Date.now();
            const message: Message = {
              id: crypto.randomUUID(),
              role: item.role as any,
              content: item.text || item.output || '',
              timestamp: now,
              tool_name: item.tool_name,
              tool_input: item.tool_input,
              is_error: item.is_error,
              tokenUsage: item.token_usage,
              responseTime: item.response_time || (item.role === 'assistant' && userMessageTimestampRef.current ? now - userMessageTimestampRef.current : undefined),
            };
            // Calculate response time for assistant messages
            if (item.role === 'assistant' && userMessageTimestampRef.current && !item.response_time) {
              message.responseTime = now - userMessageTimestampRef.current;
              userMessageTimestampRef.current = null;
            }
            // Record user message timestamp for response time calculation
            if (item.role === 'user') {
              userMessageTimestampRef.current = now;
            }
            addMessage(message);
          }
          break;
        
        case 'token_usage':
          // Handle token usage event from backend
          if (event.token_usage && streamingMessageRef.current) {
            updateMessage(streamingMessageRef.current.id, {
              tokenUsage: event.token_usage,
            });
          }
          break;

        case 'assistant_delta':
          // Handle streaming assistant response
          if (event.message) {
            const now = Date.now();
            if (!streamingMessageRef.current) {
              // Start new streaming message
              streamingMessageRef.current = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: event.message,
                timestamp: now,
                responseTime: userMessageTimestampRef.current ? now - userMessageTimestampRef.current : undefined,
              };
              addMessage(streamingMessageRef.current);
            } else {
              // Append to existing streaming message
              streamingMessageRef.current.content += event.message;
              updateMessage(streamingMessageRef.current.id, {
                content: streamingMessageRef.current.content,
              });
            }
          }
          break;

        case 'assistant_complete':
        case 'line_complete':
          // Calculate final response time and update message
          if (streamingMessageRef.current) {
            const responseTime = userMessageTimestampRef.current 
              ? Date.now() - userMessageTimestampRef.current 
              : streamingMessageRef.current.responseTime;
            
            updateMessage(streamingMessageRef.current.id, {
              responseTime,
              // Include token usage if provided in the event
              ...(event.token_usage && { tokenUsage: event.token_usage }),
            });
            userMessageTimestampRef.current = null;
          }
          // Reset streaming message
          streamingMessageRef.current = null;
          setBusy(false);
          break;

        case 'error':
          setError(event.message || 'Unknown error');
          break;

        case 'state_snapshot':
          if (event.state) {
            const state = event.state as Record<string, unknown>;
            setSessionState(state as any);
            
            // Sync model if it changed from backend
            if (state.model && typeof state.model === 'string') {
              setCurrentModel(state.model);
            }
            // Sync permission mode
            if (state.permission_mode && typeof state.permission_mode === 'string') {
              updateSettings({ permissionMode: state.permission_mode as 'plan' | 'default' | 'auto' });
            }
            // Sync working directory
            if (state.working_directory && typeof state.working_directory === 'string') {
              updateSettings({ workingDirectory: state.working_directory as string });
            }
            // Sync max turns
            if (state.max_turns && typeof state.max_turns === 'number') {
              updateSettings({ maxTurns: state.max_turns as number });
            }
          }
          break;

        case 'tasks_snapshot':
          if (event.tasks) {
            setTasks(event.tasks);
          }
          break;

        case 'modal_request':
          // Handle permission/question modal requests
          if (event.modal) {
            console.log('[WS] Modal request received:', event.modal);
            setActiveModal(event.modal as ModalRequest);
          }
          break;

        case 'state_update':
          // Handle state update events (e.g., permission mode changes)
          if (event.permission_mode) {
            updateSettings({ permissionMode: event.permission_mode as 'plan' | 'default' | 'auto' });
          }
          if (event.state) {
            const state = event.state as Record<string, unknown>;
            setSessionState(state as any);
          }
          break;

        default:
          console.log('[WS] Unhandled event type:', event.type);
      }
    } catch (err) {
      console.error('[WS] Failed to parse backend event:', err);
    }
  }, [
    setSessionState,
    setCurrentModel,
    updateSettings,
    setSkills,
    setAvailableModels,
    setCommands,
    setMcpServers,
    setBridgeSessions,
    setTasks,
    addMessage,
    updateMessage,
    setBusy,
    setError,
    setActiveModal,
  ]);

  // Setup socket event listeners
  const setupListeners = useCallback((socket: ReturnType<typeof getSocketInstance>) => {
    if (!socket || listenersSetupRef.current) return;
    
    socket.on('connect', () => {
      console.log('[WS] ✅ Connected to OpenHarness backend');
      setConnected(true);
      setConnecting(false);
    });

    socket.on('disconnect', () => {
      console.log('[WS] ❌ Disconnected from OpenHarness backend');
      setConnected(false);
    });

    socket.on('connect_error', (err: Error) => {
      console.error('[WS] ❌ Connection error:', err);
      setError(`Connection failed: ${err.message}`);
      setConnecting(false);
      setConnected(false);
    });

    socket.on('backend_event', handleBackendEvent);
    
    listenersSetupRef.current = true;
  }, [handleBackendEvent, setConnected, setConnecting, setError]);

  // Connect to backend - singleton pattern
  const connect = useCallback(() => {
    const existingSocket = getSocketInstance();
    
    if (existingSocket?.connected) {
      console.log('[WS] Already connected, skipping');
      return;
    }
    
    if (isConnectionAttempted() && existingSocket) {
      console.log('[WS] Connection already attempted, checking state');
      // Socket might be reconnecting
      if (!existingSocket.connected) {
        setConnecting(true);
      }
      return;
    }
    
    console.log('[WS] Connecting to backend...');
    setConnecting(true);
    setError(null);

    // Use current origin - backend serves the frontend
    const connectionUrl = window.location.origin;
    console.log('[WS] Connection URL:', connectionUrl);

    const socket = createSocket(connectionUrl);
    setupListeners(socket);
  }, [setupListeners, setConnecting, setError]);

  const sendMessage = useCallback((payload: Record<string, unknown>) => {
    const socket = getSocketInstance();
    if (socket?.connected) {
      console.log('[WS] Sending message:', payload);
      socket.emit('frontend_request', JSON.stringify(payload));
    } else {
      console.warn('[WS] Cannot send message - not connected');
    }
  }, []);

  const submitPrompt = useCallback((prompt: string) => {
    console.log('[WS] Submitting prompt:', prompt);
    userMessageTimestampRef.current = Date.now(); // Record when user sends message
    sendMessage({ type: 'submit_line', line: prompt });
    setBusy(true);
  }, [sendMessage, setBusy]);

  // Send permission response to backend
  const sendPermissionResponse = useCallback((requestId: string, allowed: boolean) => {
    console.log('[WS] Sending permission response:', requestId, allowed);
    sendMessage({ type: 'permission_response', request_id: requestId, allowed });
  }, [sendMessage]);

  // Send configuration update to backend
  const sendConfig = useCallback((config: Record<string, unknown>) => {
    console.log('[WS] Sending config update:', config);
    sendMessage({ type: 'config_update', config });
  }, [sendMessage]);

  // Request skills refresh from backend
  const refreshSkills = useCallback(() => {
    sendMessage({ type: 'get_skills' });
  }, [sendMessage]);

  // Request settings refresh from backend
  const refreshSettings = useCallback(() => {
    sendMessage({ type: 'get_settings' });
  }, [sendMessage]);

  // Only initialize connection once per app lifecycle (not per component)
  // This effect runs in App.tsx which is the root component
  useEffect(() => {
    // Only connect if this is the first mount (no existing socket)
    if (!isConnectionAttempted()) {
      connect();
    }
    
    // Setup listeners if socket exists but listeners aren't setup
    const socket = getSocketInstance();
    if (socket && !listenersSetupRef.current) {
      setupListeners(socket);
    }
    
    // No cleanup here - we want to keep the connection alive across page navigation
    // Cleanup should only happen when the entire app unmounts (handled elsewhere)
  }, []); // Empty deps - only run once

  // Update submitPrompt and sendPermissionResponse in store when connected
  useEffect(() => {
    if (connected) {
      setSubmitPrompt(submitPrompt);
      setSendPermissionResponse(sendPermissionResponse);
    }
  }, [connected, submitPrompt, sendPermissionResponse, setSubmitPrompt, setSendPermissionResponse]);

  const disconnect = useCallback(() => {
    disconnectSocket();
    setConnected(false);
    setSubmitPrompt(null);
    setSendPermissionResponse(null);
    listenersSetupRef.current = false;
  }, [setConnected, setSubmitPrompt, setSendPermissionResponse]);

  return {
    connect,
    disconnect,
    sendMessage,
    submitPrompt,
    sendPermissionResponse,
    sendConfig,
    refreshSkills,
    refreshSettings,
    connected,
    connecting,
    error,
  };
}