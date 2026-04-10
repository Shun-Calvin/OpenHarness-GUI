"""FastAPI web server for OpenHarness frontend."""

from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path
from typing import TYPE_CHECKING
from uuid import uuid4

import socketio
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from openharness.ui.runtime import build_runtime, start_runtime, handle_line, close_runtime

if TYPE_CHECKING:
    from openharness.api.client import SupportsStreamingMessages

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

PROTOCOL_PREFIX = 'OHJSON:'


class WebBackendHost:
    """Manages the backend host session for web frontend."""
    
    def __init__(self):
        self.runtime_bundle = None
        self.clients: set[str] = set()
        self.running = False
        self._permission_requests: dict[str, asyncio.Future[bool]] = {}
        self._permission_lock = asyncio.Lock()
        self._sio: socketio.AsyncServer | None = None
        
    def set_sio(self, sio: socketio.AsyncServer) -> None:
        """Set the Socket.IO server instance."""
        self._sio = sio
        
    async def broadcast(self, message: dict):
        """Broadcast message to all connected clients."""
        if not self._sio:
            logger.warning("Socket.IO server not set")
            return
        data = f"{PROTOCOL_PREFIX}{json.dumps(message)}"
        for sid in self.clients:
            try:
                await self._sio.emit('backend_event', data, to=sid)
            except Exception as e:
                logger.warning(f"Failed to send to {sid}: {e}")
    
    async def broadcast_with_sio(self, sio: socketio.AsyncServer, message: dict):
        """Broadcast message to all connected clients using provided sio."""
        data = f"{PROTOCOL_PREFIX}{json.dumps(message)}"
        for sid in self.clients:
            try:
                await sio.emit('backend_event', data, to=sid)
            except Exception as e:
                logger.warning(f"Failed to send to {sid}: {e}")
    
    async def ask_permission(self, tool_name: str, reason: str) -> bool:
        """Ask for permission via modal request to frontend."""
        async with self._permission_lock:
            request_id = uuid4().hex
            future: asyncio.Future[bool] = asyncio.get_running_loop().create_future()
            self._permission_requests[request_id] = future
            await self.broadcast({
                'type': 'modal_request',
                'modal': {
                    'kind': 'permission',
                    'request_id': request_id,
                    'tool_name': tool_name,
                    'reason': reason,
                }
            })
            try:
                return await asyncio.wait_for(future, timeout=300)
            except asyncio.TimeoutError:
                logger.warning(f"Permission request {request_id} timed out")
                return False
            finally:
                self._permission_requests.pop(request_id, None)
    
    def handle_permission_response(self, request_id: str, allowed: bool) -> bool:
        """Handle permission response from frontend."""
        if request_id in self._permission_requests:
            future = self._permission_requests[request_id]
            if not future.done():
                future.set_result(allowed)
                return True
        return False
    
    async def handle_request(self, sio: socketio.AsyncServer, sid: str, payload: dict):
        """Handle incoming request from frontend."""
        if not self.runtime_bundle:
            await self.broadcast_with_sio(sio, {
                'type': 'error',
                'message': 'Runtime not initialized'
            })
            return
        
        request_type = payload.get('type')
        
        # Handle permission response first (doesn't require runtime_bundle)
        if request_type == 'permission_response':
            request_id = payload.get('request_id')
            allowed = payload.get('allowed', False)
            if request_id and self.handle_permission_response(request_id, allowed):
                logger.info(f"Permission response processed: {request_id} -> {allowed}")
            else:
                logger.warning(f"Permission response not found or already resolved: {request_id}")
            return
        
        if request_type == 'set_model':
            # Handle model change request from frontend
            model = payload.get('model')
            if model:
                try:
                    # Update the engine's model
                    self.runtime_bundle.engine.set_model(model)
                    # Update app state
                    self.runtime_bundle.app_state.set(model=model)
                    # Broadcast the updated state to all clients
                    state = self.runtime_bundle.app_state.get()
                    await self.broadcast_with_sio(sio, {
                        'type': 'state_snapshot',
                        'state': {
                            'model': model,
                            'permission_mode': state.permission_mode,
                            'working_directory': state.cwd,
                        }
                    })
                    logger.info(f"Model changed to: {model}")
                except Exception as e:
                    logger.exception("Error setting model")
                    await self.broadcast_with_sio(sio, {
                        'type': 'error',
                        'message': f'Failed to set model: {str(e)}'
                    })
            return
        
        if request_type == 'config_update':
            # Handle general config update
            config = payload.get('config', {})
            try:
                if 'permission_mode' in config:
                    self.runtime_bundle.app_state.set(permission_mode=config['permission_mode'])
                if 'model' in config:
                    self.runtime_bundle.engine.set_model(config['model'])
                    self.runtime_bundle.app_state.set(model=config['model'])
                
                # Broadcast updated state
                state = self.runtime_bundle.app_state.get()
                await self.broadcast_with_sio(sio, {
                    'type': 'state_snapshot',
                    'state': {
                        'model': state.model,
                        'permission_mode': state.permission_mode,
                        'working_directory': state.cwd,
                    }
                })
                logger.info(f"Config updated: {config}")
            except Exception as e:
                logger.exception("Error updating config")
                await self.broadcast_with_sio(sio, {
                    'type': 'error',
                    'message': f'Failed to update config: {str(e)}'
                })
            return
        
        if request_type == 'submit_line':
            line = payload.get('line', '')
            
            async def print_system(message: str):
                await self.broadcast_with_sio(sio, {
                    'type': 'system',
                    'message': message
                })
            
            async def render_event(event):
                from openharness.engine.stream_events import (
                    AssistantTextDelta,
                    AssistantTurnComplete,
                    ErrorEvent,
                    StatusEvent,
                    ToolExecutionCompleted,
                    ToolExecutionStarted,
                )
                
                if isinstance(event, AssistantTextDelta):
                    await self.broadcast_with_sio(sio, {
                        'type': 'assistant_delta',
                        'message': event.text
                    })
                elif isinstance(event, AssistantTurnComplete):
                    await self.broadcast_with_sio(sio, {
                        'type': 'assistant_complete',
                        'message': event.message.text.strip()
                    })
                    await self.broadcast_with_sio(sio, {
                        'type': 'line_complete'
                    })
                elif isinstance(event, ToolExecutionStarted):
                    await self.broadcast_with_sio(sio, {
                        'type': 'transcript_item',
                        'item': {
                            'role': 'tool',
                            'tool_name': event.tool_name,
                            'tool_input': event.tool_input
                        }
                    })
                elif isinstance(event, ToolExecutionCompleted):
                    await self.broadcast_with_sio(sio, {
                        'type': 'transcript_item',
                        'item': {
                            'role': 'tool_result',
                            'tool_name': event.tool_name,
                            'output': event.output,
                            'is_error': event.is_error
                        }
                    })
                elif isinstance(event, ErrorEvent):
                    await self.broadcast_with_sio(sio, {
                        'type': 'error',
                        'message': event.message,
                        'recoverable': event.recoverable
                    })
                elif isinstance(event, StatusEvent):
                    await self.broadcast_with_sio(sio, {
                        'type': 'status',
                        'message': event.message
                    })
            
            async def clear_output():
                pass
            
            try:
                await handle_line(
                    self.runtime_bundle,
                    line,
                    print_system=print_system,
                    render_event=render_event,
                    clear_output=clear_output,
                )
            except Exception as e:
                logger.exception("Error handling line")
                await self.broadcast_with_sio(sio, {
                    'type': 'error',
                    'message': str(e)
                })
        
        elif request_type == 'shutdown':
            self.running = False


# Global backend host instance
backend_host = WebBackendHost()

# Create Socket.IO server
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*', path='/socket.io')

# Set the sio on the backend_host
backend_host.set_sio(sio)


def create_app(
    *,
    cwd: str | None = None,
    model: str | None = None,
    max_turns: int | None = None,
    base_url: str | None = None,
    system_prompt: str | None = None,
    api_key: str | None = None,
    api_format: str | None = None,
    api_client: SupportsStreamingMessages | None = None,
    permission_mode: str | None = None,
    frontend_dir: Path | None = None,
) -> FastAPI:
    """Create FastAPI application for web frontend."""
    
    app = FastAPI(title="OpenHarness Web")
    
    # Define API routes first (before catch-all static route)
    @app.get("/api/health")
    async def health_check():
        return {"status": "healthy", "connected": len(backend_host.clients)}
    
    @app.get("/api/state")
    async def get_state():
        # Get actual state from runtime if available
        if backend_host.runtime_bundle:
            try:
                state_obj = backend_host.runtime_bundle.app_state.get()
                return {
                    'permission_mode': getattr(state_obj, 'permission_mode', permission_mode or 'default'),
                    'model': getattr(state_obj, 'model', model),
                    'working_directory': getattr(state_obj, 'cwd', cwd),
                }
            except Exception as e:
                logger.warning(f"Failed to get runtime state: {e}")
        
        # Fallback to initial parameters
        return {
            'permission_mode': permission_mode or 'default',
            'model': model,
            'working_directory': cwd,
        }
    
    @app.post("/api/submit")
    async def submit_prompt(payload: dict):
        line = payload.get('line', '')
        if backend_host.runtime_bundle and line:
            asyncio.create_task(backend_host.handle_request(sio, None, {'type': 'submit_line', 'line': line}))
            return {"status": "accepted"}
        return {"status": "error", "message": "Runtime not ready"}
    
    # Mount static files if frontend directory exists
    if frontend_dir and (frontend_dir / "dist").exists():
        app.mount("/assets", StaticFiles(directory=str(frontend_dir / "dist" / "assets")), name="assets")
        
        @app.get("/")
        async def root():
            return FileResponse(frontend_dir / "dist" / "index.html")
        
        @app.get("/{path:path}")
        async def static_files(path: str):
            # Skip API routes - they're already defined above
            if path.startswith("api/"):
                from fastapi import HTTPException
                raise HTTPException(status_code=404, detail="API route not found")
            file_path = frontend_dir / "dist" / path
            if file_path.exists() and file_path.is_file():
                return FileResponse(file_path)
            return FileResponse(frontend_dir / "dist" / "index.html")
    
    # Initialize runtime on startup
    @app.on_event("startup")
    async def startup_event():
        logger.info("Starting OpenHarness web backend...")
        backend_host.running = True
        
        try:
            backend_host.runtime_bundle = await build_runtime(
                prompt=None,
                cwd=cwd,
                model=model,
                max_turns=max_turns,
                base_url=base_url,
                system_prompt=system_prompt,
                api_key=api_key,
                api_format=api_format,
                enforce_max_turns=max_turns is not None if max_turns else False,
                api_client=api_client,
                permission_mode=permission_mode,
            )
            await start_runtime(backend_host.runtime_bundle)
            logger.info("Runtime initialized successfully")
        except Exception as e:
            logger.exception("Failed to initialize runtime")
            raise
    
    @app.on_event("shutdown")
    async def shutdown_event():
        logger.info("Shutting down OpenHarness web backend...")
        backend_host.running = False
        
        if backend_host.runtime_bundle:
            await close_runtime(backend_host.runtime_bundle)
        
        backend_host.clients.clear()
    
    return app


# Socket.IO event handlers
@sio.event
async def connect(sid, environ, auth):
    """Handle new Socket.IO connection."""
    logger.info(f"Client connected: {sid}")
    backend_host.clients.add(sid)
    
    # Get actual state from runtime if available
    app_state = None
    commands = [
        'provider', 'model', 'theme', 'output-style',
        'permissions', 'resume', 'effort', 'passes',
        'turns', 'fast', 'vim', 'voice'
    ]
    
    if backend_host.runtime_bundle:
        try:
            state_obj = backend_host.runtime_bundle.app_state.get()
            app_state = {
                'permission_mode': getattr(state_obj, 'permission_mode', 'default'),
                'model': getattr(state_obj, 'model', None),
                'working_directory': getattr(state_obj, 'cwd', None),
            }
            # Get available commands from runtime
            try:
                commands = [f"/{cmd.name}" for cmd in backend_host.runtime_bundle.commands.list_commands()]
            except Exception:
                pass
        except Exception as e:
            logger.warning(f"Failed to get runtime state: {e}")
            app_state = {
                'permission_mode': 'default',
                'model': None,
                'working_directory': None,
            }
    else:
        app_state = {
            'permission_mode': 'default',
            'model': None,
            'working_directory': None,
        }
    
    # Send ready event with actual state
    state = {
        'type': 'ready',
        'state': app_state,
        'commands': commands,
        'tasks': [],
        'mcp_servers': [],
        'bridge_sessions': [],
    }
    await sio.emit('backend_event', PROTOCOL_PREFIX + json.dumps(state), to=sid)


@sio.event
async def disconnect(sid):
    """Handle Socket.IO disconnection."""
    logger.info(f"Client disconnected: {sid}")
    backend_host.clients.discard(sid)


@sio.event
async def frontend_request(sid, data):
    """Handle frontend request."""
    try:
        payload = json.loads(data)
        await backend_host.handle_request(sio, sid, payload)
    except json.JSONDecodeError:
        logger.warning("Invalid JSON received")
    except Exception as e:
        logger.exception("Error processing request")
        await sio.emit('backend_event', PROTOCOL_PREFIX + json.dumps({
            'type': 'error',
            'message': str(e)
        }), to=sid)


def _is_port_available(host: str, port: int) -> bool:
    """Check if a port is available for binding."""
    import socket
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            s.bind((host, port))
            return True
    except OSError:
        return False


def _find_available_port(host: str, start_port: int, max_attempts: int = 10) -> int:
    """Find an available port starting from start_port."""
    for offset in range(max_attempts):
        candidate_port = start_port + offset
        if _is_port_available(host, candidate_port):
            return candidate_port
    raise OSError(f"Could not find an available port from {start_port} to {start_port + max_attempts - 1}")


async def run_web_server(
    *,
    host: str = "0.0.0.0",
    port: int = 8080,
    cwd: str | None = None,
    model: str | None = None,
    max_turns: int | None = None,
    base_url: str | None = None,
    system_prompt: str | None = None,
    api_key: str | None = None,
    api_format: str | None = None,
    permission_mode: str | None = None,
    serve_frontend: bool = True,
) -> None:
    """Run the web server for OpenHarness frontend."""
    import uvicorn
    
    frontend_dir = None
    if serve_frontend:
        # Try to find the frontend directory
        possible_paths = [
            Path(__file__).parent.parent.parent / "frontend" / "web",
            Path.cwd() / "frontend" / "web",
        ]
        for path in possible_paths:
            if path.exists():
                frontend_dir = path
                break
    
    # Check if port is available, find alternative if needed
    original_port = port
    if not _is_port_available(host, port):
        logger.warning(f"Port {port} is already in use, finding alternative...")
        try:
            port = _find_available_port(host, port)
            logger.info(f"Using alternative port {port}")
        except OSError as e:
            logger.error(str(e))
            raise
    
    app = create_app(
        cwd=cwd,
        model=model,
        max_turns=max_turns,
        base_url=base_url,
        system_prompt=system_prompt,
        api_key=api_key,
        api_format=api_format,
        permission_mode=permission_mode,
        frontend_dir=frontend_dir,
    )
    
    # Combine FastAPI and Socket.IO
    combined_app = socketio.ASGIApp(sio, app)
    
    config = uvicorn.Config(
        combined_app,
        host=host,
        port=port,
        log_level="info",
    )
    server = uvicorn.Server(config)
    await server.serve()


__all__ = ["create_app", "run_web_server"]