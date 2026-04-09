import { useEffect, useCallback, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAppStore } from '../store/useAppStore';
import type { BackendEvent, TranscriptItem, Message } from '../types';

export function useBackendConnection() {
  const socketRef = useRef<Socket | null>(null);
  const connectAttemptedRef = useRef(false);
  const streamingMessageRef = useRef<Message | null>(null);
  
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
    connected,
    connecting,
    error,
  } = useAppStore();
  
  const connect = useCallback(() => {
    if (socketRef.current?.connected) {
      console.log('[WS] Already connected, skipping');
      return;
    }
    
    if (connectAttemptedRef.current) {
      console.log('[WS] Connection already attempted, skipping');
      return;
    }
    
    connectAttemptedRef.current = true;

    console.log('[WS] Connecting to backend...');
    setConnecting(true);
    setError(null);

    // Use current origin - backend serves the frontend
    const connectionUrl = window.location.origin;
    console.log('[WS] Connection URL:', connectionUrl);

    const socket = io(connectionUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      path: '/socket.io',
    });

    socket.on('connect', () => {
      console.log('[WS] ✅ Connected to OpenHarness backend');
      setConnected(true);
      setConnecting(false);
    });

    socket.on('disconnect', () => {
      console.log('[WS] ❌ Disconnected from OpenHarness backend');
      setConnected(false);
    });

    socket.on('connect_error', (err) => {
      console.error('[WS] ❌ Connection error:', err);
      setError(`Connection failed: ${err.message}`);
      setConnecting(false);
      setConnected(false);
    });

    socket.on('backend_event', (data: string) => {
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
              setSessionState(event.state as any);
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
            // Add welcome message
            const welcomeMsg: Message = {
              id: crypto.randomUUID(),
              role: 'system',
              content: 'Connected to OpenHarness backend. Ready to assist!',
              timestamp: Date.now(),
            };
            addMessage(welcomeMsg);
            break;

          case 'transcript_item':
            if (event.item) {
              const item = event.item as TranscriptItem;
              const message: Message = {
                id: crypto.randomUUID(),
                role: item.role as any,
                content: item.text || item.output || '',
                timestamp: Date.now(),
                tool_name: item.tool_name,
                tool_input: item.tool_input,
                is_error: item.is_error,
              };
              addMessage(message);
            }
            break;

          case 'assistant_delta':
            // Handle streaming assistant response
            if (event.message) {
              if (!streamingMessageRef.current) {
                // Start new streaming message
                streamingMessageRef.current = {
                  id: crypto.randomUUID(),
                  role: 'assistant',
                  content: event.message,
                  timestamp: Date.now(),
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
            // Reset streaming message
            streamingMessageRef.current = null;
            setBusy(false);
            break;

          case 'error':
            setError(event.message || 'Unknown error');
            break;

          case 'state_snapshot':
            if (event.state) {
              setSessionState(event.state as any);
            }
            break;

          case 'tasks_snapshot':
            if (event.tasks) {
              setTasks(event.tasks);
            }
            break;

          default:
            console.log('[WS] Unhandled event type:', event.type);
        }
      } catch (err) {
        console.error('[WS] Failed to parse backend event:', err);
      }
    });

    socketRef.current = socket;
  }, [
    setConnected,
    setConnecting,
    setError,
    addMessage,
    setSessionState,
    setTasks,
    setMcpServers,
    setBridgeSessions,
    setBusy,
    setCommands,
  ]);

  const sendMessage = useCallback((payload: Record<string, unknown>) => {
    if (socketRef.current?.connected) {
      console.log('[WS] Sending message:', payload);
      socketRef.current.emit('frontend_request', JSON.stringify(payload));
    } else {
      console.warn('[WS] Cannot send message - not connected');
    }
  }, []);

  const submitPrompt = useCallback((prompt: string) => {
    console.log('[WS] Submitting prompt:', prompt);
    sendMessage({ type: 'submit_line', line: prompt });
    setBusy(true);
  }, [sendMessage, setBusy]);

  // Connect once on mount
  useEffect(() => {
    if (!socketRef.current) {
      connect();
    }
    
    return () => {
      // Cleanup on unmount
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setSubmitPrompt(null);
    };
  }, []); // Empty dependency array - only run once

  // Update submitPrompt in store when connected
  useEffect(() => {
    if (connected && socketRef.current?.connected) {
      setSubmitPrompt(submitPrompt);
    }
  }, [connected, submitPrompt, setSubmitPrompt]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setConnected(false);
    setSubmitPrompt(null);
    connectAttemptedRef.current = false;
  }, [setConnected, setSubmitPrompt]);

  return {
    connect,
    disconnect,
    sendMessage,
    submitPrompt,
    connected,
    connecting,
    error,
  };
}
