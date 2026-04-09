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
class SettingsStore:
    """Settings storage."""
    
    def __init__(self):
        self.settings: dict[str, Any] = {
            "metricsHistoryLimit": 100,
            "offlineTimeoutSeconds": 60,
            "refreshInterval": 3,
        }
        # Alert thresholds
        self.alert_thresholds: dict[str, Any] = {
            "cpuPercent": 90,
            "memoryPercent": 90,
            "diskPercent": 90,
            "gpuTemp": 85,
            "cpuTemp": 80,
            "enabled": True
        }
    
    def get(self, key: str, default: Any = None) -> Any:
        return self.settings.get(key, default)
    
    def set(self, key: str, value: Any):
        self.settings[key] = value
    
    def get_all(self) -> dict:
        return self.settings.copy()
    
    def update(self, updates: dict):
        self.settings.update(updates)
    
    def get_alert_thresholds(self) -> dict:
        return self.alert_thresholds.copy()
    
    def update_alert_thresholds(self, updates: dict):
        self.alert_thresholds.update(updates)
    
    def check_alerts(self, metrics: dict) -> list[dict]:
        """Check metrics against thresholds and return triggered alerts."""
        if not self.alert_thresholds.get("enabled", True):
            return []
        
        alerts = []
        
        # CPU check
        cpu_total = metrics.get("cpu", {}).get("total", 0)
        if cpu_total > self.alert_thresholds.get("cpuPercent", 90):
            alerts.append({
                "type": "cpu",
                "severity": "warning" if cpu_total < 95 else "critical",
                "message": f"CPU usage at {cpu_total:.1f}%",
                "value": cpu_total,
                "threshold": self.alert_thresholds.get("cpuPercent", 90)
            })
        
        # Memory check
        mem_percent = metrics.get("memory", {}).get("percent", 0)
        if mem_percent > self.alert_thresholds.get("memoryPercent", 90):
            alerts.append({
                "type": "memory",
                "severity": "warning" if mem_percent < 95 else "critical",
                "message": f"Memory usage at {mem_percent:.1f}%",
                "value": mem_percent,
                "threshold": self.alert_thresholds.get("memoryPercent", 90)
            })
        
        # Disk check
        for disk in metrics.get("disk", []):
            if disk.get("percent", 0) > self.alert_thresholds.get("diskPercent", 90):
                alerts.append({
                    "type": "disk",
                    "severity": "warning",
                    "message": f"Disk {disk.get('mountpoint', '')} at {disk.get('percent', 0):.1f}%",
                    "value": disk.get("percent", 0),
                    "threshold": self.alert_thresholds.get("diskPercent", 90),
                    "mountpoint": disk.get("mountpoint")
                })
        
        # GPU temperature check
        gpu_temp = metrics.get("temperature", {}).get("gpu")
        if gpu_temp and gpu_temp > self.alert_thresholds.get("gpuTemp", 85):
            alerts.append({
                "type": "gpu_temp",
                "severity": "warning" if gpu_temp < 90 else "critical",
                "message": f"GPU temperature at {gpu_temp}°C",
                "value": gpu_temp,
                "threshold": self.alert_thresholds.get("gpuTemp", 85)
            })
        
        # CPU temperature check
        cpu_temps = metrics.get("temperature", {}).get("cpu", [])
        for cpu_temp in cpu_temps:
            if cpu_temp.get("current", 0) > self.alert_thresholds.get("cpuTemp", 80):
                alerts.append({
                    "type": "cpu_temp",
                    "severity": "warning",
                    "message": f"CPU {cpu_temp.get('label', '')} temperature at {cpu_temp.get('current', 0)}°C",
                    "value": cpu_temp.get("current", 0),
                    "threshold": self.alert_thresholds.get("cpuTemp", 80),
                    "label": cpu_temp.get("label")
                })
        
        return alerts


class ServerTagsStore:
    """Server tags/groups storage."""
    
    def __init__(self):
        self.tags: dict[str, list[str]] = {}  # tag_name -> [server_ids]
    
    def get_all_tags(self) -> dict[str, list[str]]:
        return self.tags.copy()
    
    def get_servers_by_tag(self, tag: str) -> list[str]:
        return self.tags.get(tag, [])
    
    def add_server_to_tag(self, server_id: str, tag: str):
        if tag not in self.tags:
            self.tags[tag] = []
        if server_id not in self.tags[tag]:
            self.tags[tag].append(server_id)
    
    def remove_server_from_tag(self, server_id: str, tag: str):
        if tag in self.tags and server_id in self.tags[tag]:
            self.tags[tag].remove(server_id)
    
    def delete_tag(self, tag: str):
        if tag in self.tags:
            del self.tags[tag]
    
    def get_server_tags(self, server_id: str) -> list[str]:
        return [tag for tag, servers in self.tags.items() if server_id in servers]


settings_store = SettingsStore()
server_tags_store = ServerTagsStore()

# Active alerts tracking
active_alerts: dict[str, list[dict]] = {}  # server_id -> [alerts]


class DashboardStore:
    """Dashboard configuration storage."""
    
    def __init__(self):
        # Default dashboard layout
        self.dashboards: dict[str, dict] = {
            "default": {
                "name": "Default Dashboard",
                "widgets": [
                    {"id": "w1", "type": "server_status", "x": 0, "y": 0, "w": 12, "h": 2},
                    {"id": "w2", "type": "cpu_gauge", "x": 0, "y": 2, "w": 4, "h": 3},
                    {"id": "w3", "type": "memory_gauge", "x": 4, "y": 2, "w": 4, "h": 3},
                    {"id": "w4", "type": "disk_gauge", "x": 8, "y": 2, "w": 4, "h": 3},
                    {"id": "w5", "type": "network_chart", "x": 0, "y": 5, "w": 6, "h": 4},
                    {"id": "w6", "type": "cpu_chart", "x": 6, "y": 5, "w": 6, "h": 4},
                    {"id": "w7", "type": "process_list", "x": 0, "y": 9, "w": 6, "h": 4},
                    {"id": "w8", "type": "alerts_list", "x": 6, "y": 9, "w": 6, "h": 4},
                ]
            }
        }
        self.active_dashboard = "default"
    
    def get_all_dashboards(self) -> dict[str, dict]:
        return self.dashboards.copy()
    
    def get_dashboard(self, name: str) -> Optional[dict]:
        return self.dashboards.get(name)
    
    def create_dashboard(self, name: str, widgets: list[dict]) -> dict:
        dashboard_id = name.lower().replace(" ", "-")
        self.dashboards[dashboard_id] = {
            "name": name,
            "widgets": widgets
        }
        return self.dashboards[dashboard_id]
    
    def update_dashboard(self, dashboard_id: str, name: str, widgets: list[dict]) -> Optional[dict]:
        if dashboard_id in self.dashboards:
            self.dashboards[dashboard_id] = {
                "name": name,
                "widgets": widgets
            }
            return self.dashboards[dashboard_id]
        return None
    
    def delete_dashboard(self, dashboard_id: str) -> bool:
        if dashboard_id in self.dashboards and dashboard_id != "default":
            del self.dashboards[dashboard_id]
            if self.active_dashboard == dashboard_id:
                self.active_dashboard = "default"
            return True
        return False
    
    def get_active(self) -> str:
        return self.active_dashboard
    
    def set_active(self, dashboard_id: str):
        if dashboard_id in self.dashboards:
            self.active_dashboard = dashboard_id


dashboard_store = DashboardStore()


# SNMP/Network Device Store
class SNMPStore:
    """SNMP network device storage."""
    
    def __init__(self):
        self.devices: dict[str, dict] = {}
    
    def add_device(self, device_id: str, name: str, ip: str, community: str = "public", 
                   snmp_version: str = "2c", port: int = 161) -> dict:
        self.devices[device_id] = {
            "device_id": device_id,
            "name": name,
            "ip": ip,
            "community": community,
            "snmp_version": snmp_version,
            "port": port,
            "status": "unknown",
            "last_checked": None,
            "metrics": {}
        }
        return self.devices[device_id]
    
    def get_device(self, device_id: str) -> Optional[dict]:
        return self.devices.get(device_id)
    
    def get_all_devices(self) -> list[dict]:
        return list(self.devices.values())
    
    def update_device_metrics(self, device_id: str, metrics: dict):
        if device_id in self.devices:
            self.devices[device_id]["metrics"] = metrics
            self.devices[device_id]["status"] = "online"
            self.devices[device_id]["last_checked"] = datetime.now().isoformat()
    
    def set_device_status(self, device_id: str, status: str):
        if device_id in self.devices:
            self.devices[device_id]["status"] = status
    
    def remove_device(self, device_id: str) -> bool:
        if device_id in self.devices:
            del self.devices[device_id]
            return True
        return False
    
    def update_device(self, device_id: str, updates: dict) -> Optional[dict]:
        if device_id in self.devices:
            self.devices[device_id].update(updates)
            return self.devices[device_id]
        return None


snmp_store = SNMPStore()


# Dashboard Template Store
class DashboardTemplateStore:
    """Dashboard template storage with variables."""
    
    def __init__(self):
        self.templates: dict[str, dict] = {
            "server-basic": {
                "name": "Server Basic",
                "description": "Basic server monitoring template",
                "variables": [{"name": "server_id", "label": "Server ID", "type": "server"}],
                "widgets": [
                    {"id": "w1", "type": "server_status", "x": 0, "y": 0, "w": 12, "h": 2, "serverIdVar": "server_id"},
                    {"id": "w2", "type": "cpu_gauge", "x": 0, "y": 2, "w": 4, "h": 3, "serverIdVar": "server_id"},
                    {"id": "w3", "type": "memory_gauge", "x": 4, "y": 2, "w": 4, "h": 3, "serverIdVar": "server_id"},
                    {"id": "w4", "type": "disk_gauge", "x": 8, "y": 2, "w": 4, "h": 3, "serverIdVar": "server_id"},
                ]
            },
            "server-full": {
                "name": "Server Full",
                "description": "Full server monitoring with network and processes",
                "variables": [{"name": "server_id", "label": "Server ID", "type": "server"}],
                "widgets": [
                    {"id": "w1", "type": "server_status", "x": 0, "y": 0, "w": 12, "h": 2, "serverIdVar": "server_id"},
                    {"id": "w2", "type": "cpu_gauge", "x": 0, "y": 2, "w": 4, "h": 3, "serverIdVar": "server_id"},
                    {"id": "w3", "type": "memory_gauge", "x": 4, "y": 2, "w": 4, "h": 3, "serverIdVar": "server_id"},
                    {"id": "w4", "type": "disk_gauge", "x": 8, "y": 2, "w": 4, "h": 3, "serverIdVar": "server_id"},
                    {"id": "w5", "type": "network_chart", "x": 0, "y": 5, "w": 6, "h": 4, "serverIdVar": "server_id"},
                    {"id": "w6", "type": "cpu_chart", "x": 6, "y": 5, "w": 6, "h": 4, "serverIdVar": "server_id"},
                    {"id": "w7", "type": "process_list", "x": 0, "y": 9, "w": 6, "h": 4, "serverIdVar": "server_id"},
                    {"id": "w8", "type": "alerts_list", "x": 6, "y": 9, "w": 6, "h": 4},
                ]
            },
            "network-device": {
                "name": "Network Device",
                "description": "SNMP network device monitoring template",
                "variables": [{"name": "device_id", "label": "Device ID", "type": "snmp"}],
                "widgets": [
                    {"id": "w1", "type": "network_device_status", "x": 0, "y": 0, "w": 12, "h": 2, "deviceIdVar": "device_id"},
                    {"id": "w2", "type": "snmp_traffic_chart", "x": 0, "y": 2, "w": 6, "h": 4, "deviceIdVar": "device_id"},
                    {"id": "w3", "type": "snmp_cpu_chart", "x": 6, "y": 2, "w": 6, "h": 4, "deviceIdVar": "device_id"},
                    {"id": "w4", "type": "snmp_interfaces", "x": 0, "y": 6, "w": 12, "h": 5, "deviceIdVar": "device_id"},
                ]
            }
        }
    
    def get_all_templates(self) -> dict[str, dict]:
        return self.templates.copy()
    
    def get_template(self, template_id: str) -> Optional[dict]:
        return self.templates.get(template_id)
    
    def create_template(self, template_id: str, name: str, description: str, 
                        variables: list[dict], widgets: list[dict]) -> dict:
        self.templates[template_id] = {
            "name": name,
            "description": description,
            "variables": variables,
            "widgets": widgets
        }
        return self.templates[template_id]
    
    def update_template(self, template_id: str, updates: dict) -> Optional[dict]:
        if template_id in self.templates:
            self.templates[template_id].update(updates)
            return self.templates[template_id]
        return None
    
    def delete_template(self, template_id: str) -> bool:
        if template_id in self.templates and template_id not in ["server-basic", "server-full", "network-device"]:
            del self.templates[template_id]
            return True
        return False
    
    def apply_template(self, template_id: str, variable_values: dict[str, str]) -> list[dict]:
        """Apply template with variable values to generate widget list."""
        template = self.templates.get(template_id)
        if not template:
            return []
        
        widgets = []
        for widget in template.get("widgets", []):
            new_widget = widget.copy()
            # Replace variable placeholders
            for var in template.get("variables", []):
                var_name = var.get("name")
                if var_name in variable_values:
                    if "serverIdVar" in new_widget and new_widget["serverIdVar"] == var_name:
                        new_widget["serverId"] = variable_values[var_name]
                    if "deviceIdVar" in new_widget and new_widget["deviceIdVar"] == var_name:
                        new_widget["deviceId"] = variable_values[var_name]
            widgets.append(new_widget)
        
        return widgets


dashboard_template_store = DashboardTemplateStore()


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
            
            # Keep history - use configurable limit
            self.metrics_history[server_id].append({
                "timestamp": datetime.now().isoformat(),
                "metrics": metrics
            })
            limit = settings_store.get("metricsHistoryLimit", 100)
            if len(self.metrics_history[server_id]) > limit:
                self.metrics_history[server_id] = self.metrics_history[server_id][-limit:]
            
            # Check for alerts
            global active_alerts
            alerts = settings_store.check_alerts(metrics)
            if alerts:
                active_alerts[server_id] = alerts
            elif server_id in active_alerts:
                del active_alerts[server_id]
    
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


@api_router.get("/settings")
async def get_settings():
    """Get dashboard settings."""
    return settings_store.get_all()


@api_router.put("/settings")
async def update_settings(updates: dict):
    """Update dashboard settings."""
    settings_store.update(updates)
    return {"message": "Settings updated", "settings": settings_store.get_all()}


# Alert thresholds endpoints
@api_router.get("/alerts/thresholds")
async def get_alert_thresholds():
    """Get alert thresholds."""
    return settings_store.get_alert_thresholds()


@api_router.put("/alerts/thresholds")
async def update_alert_thresholds(updates: dict):
    """Update alert thresholds."""
    settings_store.update_alert_thresholds(updates)
    return {"message": "Thresholds updated", "thresholds": settings_store.get_alert_thresholds()}


@api_router.get("/alerts/{server_id}")
async def get_server_alerts(server_id: str):
    """Get active alerts for a server."""
    return {"alerts": active_alerts.get(server_id, [])}


@api_router.get("/alerts")
async def get_all_alerts():
    """Get all active alerts across all servers."""
    return {"alerts": active_alerts}


# Server tags/groups endpoints
@api_router.get("/tags")
async def get_all_tags():
    """Get all server tags and their server IDs."""
    return server_tags_store.get_all_tags()


@api_router.get("/tags/{tag}")
async def get_servers_by_tag(tag: str):
    """Get all servers in a specific tag."""
    return {"server_ids": server_tags_store.get_servers_by_tag(tag)}


@api_router.post("/tags/{tag}/{server_id}")
async def add_server_to_tag(tag: str, server_id: str):
    """Add a server to a tag."""
    server = store.get_server(server_id)
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    server_tags_store.add_server_to_tag(server_id, tag)
    return {"message": f"Server {server_id} added to tag {tag}"}


@api_router.delete("/tags/{tag}/{server_id}")
async def remove_server_from_tag(tag: str, server_id: str):
    """Remove a server from a tag."""
    server_tags_store.remove_server_from_tag(server_id, tag)
    return {"message": f"Server {server_id} removed from tag {tag}"}


@api_router.delete("/tags/{tag}")
async def delete_tag(tag: str):
    """Delete a tag and remove it from all servers."""
    server_tags_store.delete_tag(tag)
    return {"message": f"Tag {tag} deleted"}


@api_router.get("/servers/{server_id}/tags")
async def get_server_tags(server_id: str):
    """Get all tags for a specific server."""
    return {"tags": server_tags_store.get_server_tags(server_id)}


# Dashboard endpoints
@api_router.get("/dashboards")
async def get_dashboards():
    """Get all dashboards."""
    return {
        "dashboards": dashboard_store.get_all_dashboards(),
        "active": dashboard_store.get_active()
    }


@api_router.get("/dashboards/{dashboard_id}")
async def get_dashboard(dashboard_id: str):
    """Get a specific dashboard."""
    dashboard = dashboard_store.get_dashboard(dashboard_id)
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    return dashboard


@api_router.post("/dashboards")
async def create_dashboard(data: dict):
    """Create a new dashboard."""
    name = data.get("name", "New Dashboard")
    widgets = data.get("widgets", [])
    dashboard = dashboard_store.create_dashboard(name, widgets)
    return {"message": "Dashboard created", "dashboard": dashboard}


@api_router.put("/dashboards/{dashboard_id}")
async def update_dashboard(dashboard_id: str, data: dict):
    """Update a dashboard."""
    name = data.get("name", "Untitled")
    widgets = data.get("widgets", [])
    dashboard = dashboard_store.update_dashboard(dashboard_id, name, widgets)
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    return {"message": "Dashboard updated", "dashboard": dashboard}


@api_router.delete("/dashboards/{dashboard_id}")
async def delete_dashboard(dashboard_id: str):
    """Delete a dashboard."""
    if dashboard_store.delete_dashboard(dashboard_id):
        return {"message": "Dashboard deleted"}
    raise HTTPException(status_code=400, detail="Cannot delete default dashboard")


@api_router.post("/dashboards/{dashboard_id}/activate")
async def activate_dashboard(dashboard_id: str):
    """Set active dashboard."""
    dashboard_store.set_active(dashboard_id)
    return {"message": "Dashboard activated", "active": dashboard_id}


# Dashboard Template endpoints
@api_router.get("/dashboard-templates")
async def get_templates():
    """Get all dashboard templates."""
    return {"templates": dashboard_template_store.get_all_templates()}


@api_router.get("/dashboard-templates/{template_id}")
async def get_template(template_id: str):
    """Get a specific template."""
    template = dashboard_template_store.get_template(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template


@api_router.post("/dashboard-templates/{template_id}/apply")
async def apply_template(template_id: str, variables: dict):
    """Apply a template with variable values."""
    widgets = dashboard_template_store.apply_template(template_id, variables)
    return {"widgets": widgets}


@api_router.post("/dashboard-templates")
async def create_template(data: dict):
    """Create a new dashboard template."""
    template_id = data.get("id") or data.get("name", "").lower().replace(" ", "-")
    name = data.get("name", "New Template")
    description = data.get("description", "")
    variables = data.get("variables", [])
    widgets = data.get("widgets", [])
    
    template = dashboard_template_store.create_template(template_id, name, description, variables, widgets)
    return {"message": "Template created", "template": template}


@api_router.delete("/dashboard-templates/{template_id}")
async def delete_template(template_id: str):
    """Delete a dashboard template."""
    if dashboard_template_store.delete_template(template_id):
        return {"message": "Template deleted"}
    raise HTTPException(status_code=400, detail="Cannot delete built-in templates")


# SNMP/Network Device endpoints
@api_router.get("/snmp/devices")
async def get_snmp_devices():
    """Get all SNMP devices."""
    return {"devices": snmp_store.get_all_devices()}


@api_router.get("/snmp/devices/{device_id}")
async def get_snmp_device(device_id: str):
    """Get a specific SNMP device."""
    device = snmp_store.get_device(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return device


@api_router.post("/snmp/devices")
async def add_snmp_device(data: dict):
    """Add a new SNMP device."""
    device_id = data.get("device_id") or data.get("name", "").lower().replace(" ", "-")
    name = data.get("name", "New Device")
    ip = data.get("ip")
    
    if not ip:
        raise HTTPException(status_code=400, detail="IP address required")
    
    community = data.get("community", "public")
    snmp_version = data.get("snmp_version", "2c")
    port = data.get("port", 161)
    
    device = snmp_store.add_device(device_id, name, ip, community, snmp_version, port)
    return {"message": "Device added", "device": device}


@api_router.put("/snmp/devices/{device_id}")
async def update_snmp_device(device_id: str, data: dict):
    """Update an SNMP device."""
    device = snmp_store.update_device(device_id, data)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return {"message": "Device updated", "device": device}


@api_router.delete("/snmp/devices/{device_id}")
async def delete_snmp_device(device_id: str):
    """Delete an SNMP device."""
    if snmp_store.remove_device(device_id):
        return {"message": "Device deleted"}
    raise HTTPException(status_code=404, detail="Device not found")


@api_router.post("/snmp/devices/{device_id}/poll")
async def poll_snmp_device(device_id: str):
    """Poll SNMP device for metrics (simulated - requires pysnmp)."""
    device = snmp_store.get_device(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    # Try to import pysnmp for real SNMP polling
    try:
        from pysnmp.hlapi import *
        
        # Basic SNMP polling - get system info
        iterator = getCmd(
            SnmpEngine(),
            CommunityData(device.get("community", "public"), mpModel=1),  # v2c
            UdpTransportTarget((device["ip"], device.get("port", 161)), timeout=2, retries=1),
            ContextData(),
            ObjectType(ObjectIdentity('1.3.6.1.2.1.1.1.0')),  # sysDescr
            ObjectType(ObjectIdentity('1.3.6.1.2.1.1.3.0')),  # sysUpTime
            ObjectType(ObjectIdentity('1.3.6.1.2.1.1.5.0')),  # sysName
        )
        
        errorIndication, errorStatus, errorIndex, varBinds = next(iterator)
        
        if errorIndication:
            snmp_store.set_device_status(device_id, "error")
            return {"error": str(errorIndication)}
        
        # Parse response
        metrics = {}
        for varBind in varBinds:
            metrics[str(varBind[0])] = str(varBind[1])
        
        snmp_store.update_device_metrics(device_id, metrics)
        return {"message": "Device polled", "metrics": metrics}
        
    except ImportError:
        # Simulate metrics if pysnmp not available
        snmp_store.update_device_metrics(device_id, {
            "simulated": True,
            "sysDescr": "Network Device (simulated)",
            "sysUpTime": "123456789",
            "ifNumber": 4,
            "ifInOctets": 1234567890,
            "ifOutOctets": 987654321,
            "cpu": 25 + (device_id.__hash__() % 30),
            "memory": 40 + (device_id.__hash__() % 20)
        })
        return {"message": "Device polled (simulated)", "simulated": True}
    except Exception as e:
        snmp_store.set_device_status(device_id, "error")
        return {"error": str(e)}


@api_router.get("/snmp/devices/{device_id}/metrics")
async def get_snmp_device_metrics(device_id: str):
    """Get metrics for an SNMP device."""
    device = snmp_store.get_device(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return {"metrics": device.get("metrics", {}), "status": device.get("status")}


# Log monitoring endpoints
@api_router.get("/servers/{server_id}/logs")
async def get_server_logs(server_id: str):
    """Get log monitoring data for a server."""
    server = store.get_server(server_id)
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    
    metrics = server.get("current_metrics", {})
    logs = metrics.get("logs", {})
    return {"logs": logs}


@api_router.post("/servers/{server_id}/logs")
async def add_log_monitor(server_id: str, config: dict):
    """Add a log file to monitor."""
    server = store.get_server(server_id)
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    
    command_id = f"log_add_{datetime.now().timestamp()}"
    message = {
        "type": "add_log",
        "id": command_id,
        "name": config.get("name"),
        "file_path": config.get("file_path"),
        "pattern": config.get("pattern", ".*"),
        "tail": config.get("tail", True),
        "max_entries": config.get("max_entries", 100)
    }
    
    await store.broadcast_to_server(server_id, message)
    return {"message": "Log monitor added", "command_id": command_id}


@api_router.delete("/servers/{server_id}/logs/{log_name}")
async def remove_log_monitor(server_id: str, log_name: str):
    """Remove a log file monitor."""
    server = store.get_server(server_id)
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    
    command_id = f"log_remove_{datetime.now().timestamp()}"
    message = {
        "type": "remove_log",
        "id": command_id,
        "name": log_name
    }
    
    await store.broadcast_to_server(server_id, message)
    return {"message": "Log monitor removed", "command_id": command_id}


# Metrics export endpoint
@api_router.get("/export/{server_id}")
async def export_metrics_csv(server_id: str, format: str = "csv", limit: int = 100):
    """Export metrics data for a server in CSV or JSON format."""
    server = store.get_server(server_id)
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    
    history = store.get_metrics_history(server_id, limit)
    
    if format == "json":
        return {
            "server_id": server_id,
            "hostname": server.get("hostname"),
            "metrics": history
        }
    
    # CSV format
    import csv
    import io
    
    output = io.StringIO()
    if history:
        # Get all metric keys from the first entry
        first_metrics = history[0].get("metrics", {})
        
        # Build CSV header
        headers = ["timestamp"]
        
        # CPU metrics
        if "cpu" in first_metrics:
            headers.extend(["cpu_total", "cpu_count", "cpu_freq_mhz"])
        
        # Memory metrics
        if "memory" in first_metrics:
            headers.extend(["memory_total", "memory_used", "memory_available", "memory_percent"])
        
        # Disk metrics (just first disk for simplicity)
        if "disk" in first_metrics and first_metrics["disk"]:
            headers.extend(["disk0_total", "disk0_used", "disk0_percent"])
        
        # Network metrics
        if "network" in first_metrics:
            headers.extend(["network_bytes_sent", "network_bytes_recv"])
        
        # GPU metrics
        if "gpu" in first_metrics and first_metrics["gpu"]:
            headers.extend(["gpu_util", "gpu_mem_used", "gpu_temp", "gpu_power"])
        
        writer = csv.DictWriter(output, fieldnames=headers)
        writer.writeheader()
        
        for entry in history:
            row = {"timestamp": entry.get("timestamp", "")}
            metrics = entry.get("metrics", {})
            
            # CPU
            if "cpu" in metrics:
                row["cpu_total"] = metrics["cpu"].get("total", "")
                row["cpu_count"] = metrics["cpu"].get("count", "")
                row["cpu_freq_mhz"] = metrics["cpu"].get("frequency_current", "")
            
            # Memory
            if "memory" in metrics:
                row["memory_total"] = metrics["memory"].get("total", "")
                row["memory_used"] = metrics["memory"].get("used", "")
                row["memory_available"] = metrics["memory"].get("available", "")
                row["memory_percent"] = metrics["memory"].get("percent", "")
            
            # Disk
            if "disk" in metrics and metrics["disk"]:
                disk0 = metrics["disk"][0]
                row["disk0_total"] = disk0.get("total", "")
                row["disk0_used"] = disk0.get("used", "")
                row["disk0_percent"] = disk0.get("percent", "")
            
            # Network
            if "network" in metrics:
                row["network_bytes_sent"] = metrics["network"].get("bytes_sent", "")
                row["network_bytes_recv"] = metrics["network"].get("bytes_recv", "")
            
            # GPU
            if "gpu" in metrics and metrics["gpu"]:
                row["gpu_util"] = metrics["gpu"].get("utilization_gpu", "")
                row["gpu_mem_used"] = metrics["gpu"].get("memory_used", "")
                row["gpu_temp"] = metrics["gpu"].get("temperature", "")
                row["gpu_power"] = metrics["gpu"].get("power_draw", "")
            
            writer.writerow(row)
    
    csv_content = output.getvalue()
    return PlainTextResponse(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={server_id}_metrics.csv"}
    )


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