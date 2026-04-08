"""
Server Monitor Dashboard - Backend API
FastAPI application with WebSocket support
"""

import asyncio
import json
import os
import threading
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
from pydantic import BaseModel


# Data storage
class ServerStore:
    """In-memory server data storage."""
    
    def __init__(self, offline_timeout_seconds: int = 60):
        self.servers: dict[str, dict] = {}
        self.connections: dict[str, list[WebSocket]] = {}
        self.metrics_history: dict[str, list[dict]] = {}
        self.command_results: dict[str, dict] = {}
        self.offline_timeout = offline_timeout_seconds
    
    def add_server(self, server_id: str, hostname: str, system: str):
        """Register a new server."""
        if server_id not in self.servers:
            self.servers[server_id] = {
                "server_id": server_id,
                "hostname": hostname,
                "system": system,
                "registered_at": datetime.now().isoformat(),
                "last_seen": datetime.now().isoformat(),
                "status": "online",
                "current_metrics": None
            }
            self.connections[server_id] = []
            self.metrics_history[server_id] = []
    
    def update_metrics(self, server_id: str, metrics: dict):
        """Update server metrics."""
        if server_id in self.servers:
            self.servers[server_id]["last_seen"] = datetime.now().isoformat()
            self.servers[server_id]["current_metrics"] = metrics
            self.servers[server_id]["status"] = "online"
            
            # Keep history
            self.metrics_history[server_id].append({
                "timestamp": datetime.now().isoformat(),
                "metrics": metrics
            })
            if len(self.metrics_history[server_id]) > 100:
                self.metrics_history[server_id] = self.metrics_history[server_id][-100:]
    
    def get_server(self, server_id: str) -> Optional[dict]:
        """Get server by ID."""
        return self.servers.get(server_id)
    
    def get_all_servers(self) -> list[dict]:
        """Get all servers."""
        self._cleanup_offline_servers()
        return list(self.servers.values())
    
    def _cleanup_offline_servers(self):
        """Mark servers as offline if not seen within timeout period."""
        now = datetime.now()
        for server_id, server in list(self.servers.items()):
            last_seen = datetime.fromisoformat(server.get("last_seen", now.isoformat()))
            seconds_offline = (now - last_seen).total_seconds()
            if seconds_offline > self.offline_timeout:
                server["status"] = "offline"
    
    def cleanup_all_offline(self) -> int:
        """Remove all offline servers. Returns count of removed servers."""
        self._cleanup_offline_servers()
        offline_ids = [sid for sid, s in self.servers.items() if s.get("status") == "offline"]
        for sid in offline_ids:
            self.remove_server(sid)
        return len(offline_ids)
    
    def remove_server(self, server_id: str):
        """Remove a server."""
        if server_id in self.servers:
            del self.servers[server_id]
        if server_id in self.connections:
            del self.connections[server_id]
        if server_id in self.metrics_history:
            del self.metrics_history[server_id]
    
    def get_metrics_history(self, server_id: str, limit: int = 100) -> list[dict]:
        """Get metrics history for a server."""
        history = self.metrics_history.get(server_id, [])
        return history[-limit:]
    
    def add_connection(self, server_id: str, websocket: WebSocket):
        """Add WebSocket connection for a server."""
        if server_id not in self.connections:
            self.connections[server_id] = []
        self.connections[server_id].append(websocket)
    
    def remove_connection(self, server_id: str, websocket: WebSocket):
        """Remove WebSocket connection."""
        if server_id in self.connections:
            try:
                self.connections[server_id].remove(websocket)
            except ValueError:
                pass
    
    async def broadcast_to_server(self, server_id: str, message: dict):
        """Broadcast message to all connections for a server."""
        if server_id in self.connections:
            dead_connections = []
            for conn in self.connections[server_id]:
                try:
                    await conn.send_json(message)
                except Exception:
                    dead_connections.append(conn)
            
            for conn in dead_connections:
                self.remove_connection(server_id, conn)
    
    def store_command_result(self, command_id: str, result: dict):
        """Store command execution result."""
        self.command_results[command_id] = {
            "result": result,
            "timestamp": datetime.now().isoformat()
        }


store = ServerStore()


# Pydantic models
class ServerRegister(BaseModel):
    server_id: str
    hostname: str
    system: str


class MetricsData(BaseModel):
    timestamp: Optional[str] = None
    cpu: Optional[dict] = None
    memory: Optional[dict] = None
    disk: Optional[list] = None
    network: Optional[dict] = None
    gpu: Optional[dict] = None
    temperature: Optional[dict] = None
    processes: Optional[list] = None
    system: Optional[dict] = None


class CommandRequest(BaseModel):
    type: str
    id: Optional[str] = None
    pid: Optional[int] = None
    path: Optional[str] = None


class CommandResult(BaseModel):
    command_id: str
    result: dict


# API Router
api_router = APIRouter()


@api_router.get("/servers")
async def get_servers():
    """Get all registered servers."""
    return store.get_all_servers()


@api_router.get("/servers/{server_id}")
async def get_server(server_id: str):
    """Get server details."""
    server = store.get_server(server_id)
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    return server


@api_router.delete("/servers/offline")
async def cleanup_offline_servers():
    """Remove all offline servers."""
    count = store.cleanup_all_offline()
    return {"message": f"Removed {count} offline servers", "count": count}


@api_router.delete("/servers/{server_id}")
async def delete_server(server_id: str):
    """Remove a server."""
    server = store.get_server(server_id)
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    store.remove_server(server_id)
    return {"message": "Server removed"}


@api_router.post("/servers/register")
async def register_server(data: ServerRegister):
    """Register a new server."""
    store.add_server(data.server_id, data.hostname, data.system)
    return {"message": "Server registered", "server_id": data.server_id}


@api_router.get("/servers/{server_id}/metrics")
async def get_server_metrics(server_id: str, limit: int = 100):
    """Get server metrics history."""
    server = store.get_server(server_id)
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    return store.get_metrics_history(server_id, limit)


@api_router.post("/metrics/{server_id}")
async def receive_metrics(server_id: str, metrics: dict):
    """Receive metrics via HTTP polling."""
    store.add_server(
        metrics.get("system", {}).get("hostname", server_id),
        metrics.get("system", {}).get("hostname", "Unknown"),
        metrics.get("system", {}).get("os", {}).get("system", "Linux")
    )
    store.update_metrics(server_id, metrics)
    return {"message": "Metrics received"}


@api_router.post("/command_result/{server_id}")
async def receive_command_result(server_id: str, data: CommandResult):
    """Receive command execution result."""
    store.store_command_result(data.command_id, data.result)
    return {"message": "Result stored"}


@api_router.post("/servers/{server_id}/command")
async def send_command(server_id: str, command: CommandRequest):
    """Send command to a server."""
    server = store.get_server(server_id)
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    
    command_id = command.id or f"cmd_{datetime.now().timestamp()}"
    message = {
        "type": command.type,
        "id": command_id,
        "pid": command.pid,
        "path": command.path
    }
    
    # Try WebSocket first
    await store.broadcast_to_server(server_id, message)
    
    return {"message": "Command sent", "command_id": command_id}


@api_router.get("/servers/{server_id}/processes")
async def get_processes(server_id: str):
    """Get process list from server."""
    server = store.get_server(server_id)
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    
    metrics = server.get("current_metrics", {})
    processes = metrics.get("processes", [])
    return {"processes": processes}


@api_router.post("/servers/{server_id}/kill/{pid}")
async def kill_process(server_id: str, pid: int):
    """Kill a process on the server."""
    server = store.get_server(server_id)
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    
    command_id = f"kill_{datetime.now().timestamp()}"
    message = {
        "type": "kill",
        "id": command_id,
        "pid": pid
    }
    
    await store.broadcast_to_server(server_id, message)
    return {"message": "Kill command sent", "command_id": command_id, "pid": pid}








# Frontend static files
frontend_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "dist")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    # Startup
    print("Server Monitor Dashboard API starting...")
    yield
    # Shutdown
    print("Server Monitor Dashboard API shutting...")


app = FastAPI(
    title="Server Monitor Dashboard API",
    description="Backend API for server monitoring dashboard",
    version="1.0.0",
    lifespan=lifespan
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API router
app.include_router(api_router, prefix="/api")

# WebSocket endpoint - must be outside API router to avoid prefix
@app.websocket("/ws/{server_id}")
async def websocket_endpoint(websocket: WebSocket, server_id: str):
    """WebSocket connection for real-time communication."""
    await websocket.accept()
    store.add_connection(server_id, websocket)
    
    try:
        # Send current server info if exists
        server = store.get_server(server_id)
        if server:
            await websocket.send_json({
                "type": "server_info",
                "data": server
            })
        
        # Keep connection alive and handle messages
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
                message_type = message.get("type")
                
                if message_type == "metrics":
                    # Update metrics from WebSocket
                    metrics = message.get("data", {})
                    store.add_server(
                        metrics.get("system", {}).get("hostname", server_id),
                        metrics.get("system", {}).get("hostname", "Unknown"),
                        metrics.get("system", {}).get("os", {}).get("system", "Linux")
                    )
                    store.update_metrics(server_id, metrics)
                    
                elif message_type == "result":
                    # Command result
                    store.store_command_result(
                        message.get("command_id", ""),
                        message.get("result", {})
                    )
                    
            except json.JSONDecodeError:
                pass
                
    except WebSocketDisconnect:
        pass
    finally:
        store.remove_connection(server_id, websocket)


@app.get("/")
async def serve_frontend():
    """Serve the React frontend."""
    index_path = os.path.join(frontend_path, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return JSONResponse({
        "message": "Server Monitor Dashboard API",
        "docs": "/docs",
        "frontend_not_found": "Please build the frontend first"
    })


@app.get("/settings")
async def get_settings():
    """Get dashboard settings."""
    return {
        "metricsHistoryLimit": 100  # Default, frontend can override
    }


@app.get("/assets/{path:path}")
async def serve_assets(path: str):
    """Serve frontend assets."""
    file_path = os.path.join(frontend_path, "assets", path)
    if os.path.exists(file_path) and os.path.isfile(file_path):
        return FileResponse(file_path)
    raise HTTPException(status_code=404, detail="Not found")


@app.get("/api/{path:path}")
async def api_fallback(path: str):
    """API fallback for unknown routes."""
    raise HTTPException(status_code=404, detail="API endpoint not found")


@app.get("/{path:path}")
async def serve_static(path: str):
    """Serve static files (SPA fallback)."""
    # Don't serve static for API or ws paths
    if path.startswith("api") or path.startswith("ws"):
        raise HTTPException(status_code=404, detail="Not found")
    
    # Check if it's a static file
    file_path = os.path.join(frontend_path, path)
    if os.path.exists(file_path) and os.path.isfile(file_path):
        return FileResponse(file_path)
    
    # Fallback to index.html for SPA
    index_path = os.path.join(frontend_path, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    
    raise HTTPException(status_code=404, detail="Not found")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)