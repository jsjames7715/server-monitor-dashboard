#!/usr/bin/env python3
"""
Server Monitor Agent - Monitors system resources and communicates with dashboard.
Compatible with Debian Linux 64-bit.
"""

import json
import os
import socket
import subprocess
import sys
import threading
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

try:
    import psutil
except ImportError:
    print("Installing psutil...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "psutil"])
    import psutil

try:
    import requests
except ImportError:
    print("Installing requests...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "requests"])
    import requests

# Try to import optional dependencies
# SFTP removed - file management features disabled

try:
    import websocket
    HAS_WEBSOCKET = True
except ImportError:
    HAS_WEBSOCKET = False
    print("Installing websocket-client...")
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "websocket-client"])
        import websocket
        HAS_WEBSOCKET = True
    except:
        print("Could not install websocket-client - WebSocket will be disabled")


class LogMonitor:
    """Monitors log files for patterns and alerts."""
    
    def __init__(self):
        self.log_configs: dict[str, dict] = {}  # config_name -> config
        self.file_positions: dict[str, int] = {}  # file_path -> last position
        self.match_counts: dict[str, int] = {}  # config_name -> match count in interval
    
    def add_log_config(self, name: str, file_path: str, pattern: str = ".*", 
                       tail: bool = True, max_entries: int = 100):
        """Add a log file configuration."""
        import re
        try:
            compiled_regex = re.compile(pattern)
        except re.error:
            compiled_regex = re.compile(".*")  # Fallback to match all
        
        self.log_configs[name] = {
            "file_path": file_path,
            "pattern": pattern,
            "regex": compiled_regex,
            "tail": tail,
            "max_entries": max_entries,
            "enabled": True
        }
        
        # Initialize position based on tail setting
        if file_path in self.file_positions:
            pass  # Keep existing position
        elif tail and os.path.exists(file_path):
            # Start from end for tail mode
            self.file_positions[file_path] = os.path.getsize(file_path)
        else:
            self.file_positions[file_path] = 0
    
    def remove_log_config(self, name: str):
        """Remove a log configuration."""
        if name in self.log_configs:
            del self.log_configs[name]
        if name in self.match_counts:
            del self.match_counts[name]
    
    def check_logs(self) -> dict:
        """Check all configured log files for new entries."""
        results = {}
        
        for name, config in self.log_configs.items():
            if not config.get("enabled", True):
                continue
            
            file_path = config["file_path"]
            regex = config["regex"]
            max_entries = config["max_entries"]
            
            if not os.path.exists(file_path):
                results[name] = {
                    "error": "File not found",
                    "entries": []
                }
                continue
            
            try:
                current_size = os.path.getsize(file_path)
                last_pos = self.file_positions.get(file_path, 0)
                
                # Handle log rotation (file shrunk)
                if current_size < last_pos:
                    last_pos = 0
                
                # Read new content
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    f.seek(last_pos)
                    new_lines = f.readlines()
                    self.file_positions[file_path] = f.tell()
                
                # Parse matching entries
                entries = []
                match_count = 0
                
                for line in new_lines:
                    line = line.rstrip('\n\r')
                    match = regex.search(line)
                    
                    if match:
                        match_count += 1
                        # Extract timestamp if present (common formats)
                        timestamp = self._extract_timestamp(line)
                        entries.append({
                            "timestamp": timestamp,
                            "message": line,
                            "matched": True
                        })
                    else:
                        entries.append({
                            "timestamp": None,
                            "message": line,
                            "matched": False
                        })
                
                # Keep only last max_entries
                entries = entries[-max_entries:]
                
                # Update match count for alerting (reset each interval)
                prev_count = self.match_counts.get(name, 0)
                self.match_counts[name] = prev_count + match_count if prev_count > 0 else match_count
                
                results[name] = {
                    "entries": entries,
                    "new_entries": len(new_lines),
                    "matches": match_count,
                    "error": None
                }
                
            except Exception as e:
                results[name] = {
                    "error": str(e),
                    "entries": []
                }
        
        return results
    
    def _extract_timestamp(self, line: str) -> Optional[str]:
        """Extract timestamp from log line."""
        import re
        
        # Common timestamp patterns
        patterns = [
            r'(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})',  # ISO format
            r'(\w{3} \d{1,2} \d{2}:\d{2}:\d{2})',  # Syslog
            r'(\d{2}/\w{3}/\d{4}:\d{2}:\d{2}:\d{2})',  # Apache
            r'(\d{2}-\d{2}-\d{4} \d{2}:\d{2}:\d{2})',  # Windows
        ]
        
        for pattern in patterns:
            match = re.search(pattern, line)
            if match:
                return match.group(1)
        
        return None
    
    def get_match_count(self, name: str) -> int:
        """Get match count for a config in last interval."""
        return self.match_counts.get(name, 0)
    
    def get_configs(self) -> list:
        """Get list of configured log monitors."""
        return [
            {
                "name": name,
                "file_path": config["file_path"],
                "pattern": config["pattern"],
                "tail": config["tail"],
                "enabled": config.get("enabled", True)
            }
            for name, config in self.log_configs.items()
        ]
    
    def toggle_config(self, name: str, enabled: bool):
        """Enable or disable a log config."""
        if name in self.log_configs:
            self.log_configs[name]["enabled"] = enabled


class SystemMonitor:
    """Collects system metrics."""
    
    def __init__(self):
        self._prev_net_io = None
        self._prev_disk_io = None
        self._prev_time = None
        self.log_monitor = LogMonitor()
    
    def get_cpu_usage(self) -> dict:
        """Get CPU usage metrics."""
        cpu_percent = psutil.cpu_percent(interval=1, percpu=True)
        cpu_freq = psutil.cpu_freq()
        
        return {
            "total": psutil.cpu_percent(interval=0),
            "per_core": cpu_percent,
            "count": psutil.cpu_count(),
            "frequency_current": cpu_freq.current if cpu_freq else 0,
            "frequency_min": cpu_freq.min if cpu_freq else 0,
            "frequency_max": cpu_freq.max if cpu_freq else 0
        }
    
    def get_memory_usage(self) -> dict:
        """Get memory usage metrics."""
        mem = psutil.virtual_memory()
        swap = psutil.swap_memory()
        
        return {
            "total": mem.total,
            "available": mem.available,
            "used": mem.used,
            "free": mem.free,
            "percent": mem.percent,
            "active": getattr(mem, 'active', 0),
            "inactive": getattr(mem, 'inactive', 0),
            "buffers": getattr(mem, 'buffers', 0),
            "cached": getattr(mem, 'cached', 0),
            "swap_total": swap.total,
            "swap_used": swap.used,
            "swap_free": swap.free,
            "swap_percent": swap.percent
        }
    
    def get_disk_usage(self) -> list:
        """Get disk usage for all mounted partitions."""
        partitions = psutil.disk_partitions()
        disks = []
        
        for partition in partitions:
            try:
                usage = psutil.disk_usage(partition.mountpoint)
                disks.append({
                    "device": partition.device,
                    "mountpoint": partition.mountpoint,
                    "filesystem": partition.fstype,
                    "total": usage.total,
                    "used": usage.used,
                    "free": usage.free,
                    "percent": usage.percent
                })
            except PermissionError:
                continue
        
        return disks
    
    def get_network_usage(self) -> dict:
        """Get network bandwidth usage."""
        net_io = psutil.net_io_counters()
        current_time = time.time()
        
        if self._prev_net_io is None or self._prev_time is None:
            self._prev_net_io = net_io
            self._prev_time = current_time
            return {
                "bytes_sent": 0,
                "bytes_recv": 0,
                "packets_sent": 0,
                "packets_recv": 0,
                "errors_in": 0,
                "errors_out": 0,
                "drop_in": 0,
                "drop_out": 0
            }
        
        time_diff = current_time - self._prev_time
        bytes_sent_diff = net_io.bytes_sent - self._prev_net_io.bytes_sent
        bytes_recv_diff = net_io.bytes_recv - self._prev_net_io.bytes_recv
        
        result = {
            "bytes_sent": bytes_sent_diff / time_diff if time_diff > 0 else 0,
            "bytes_recv": bytes_recv_diff / time_diff if time_diff > 0 else 0,
            "total_sent": net_io.bytes_sent,
            "total_recv": net_io.bytes_recv,
            "packets_sent": net_io.packets_sent,
            "packets_recv": net_io.packets_recv,
            "errors_in": net_io.errin,
            "errors_out": net_io.errout,
            "drop_in": net_io.dropin,
            "drop_out": net_io.dropout
        }
        
        self._prev_net_io = net_io
        self._prev_time = current_time
        
        return result
    
    def get_gpu_usage(self) -> Optional[dict]:
        """Get GPU metrics if NVIDIA GPU is available."""
        try:
            result = subprocess.run(
                ["nvidia-smi", "--query-gpu=utilization.gpu,utilization.memory,memory.used,memory.total,temperature.gpu,power.draw",
                 "--format=csv,noheader,nounits"],
                capture_output=True,
                text=True,
                timeout=5
            )
            
            if result.returncode == 0 and result.stdout.strip():
                values = result.stdout.strip().split(", ")
                return {
                    "available": True,
                    "utilization_gpu": float(values[0]),
                    "utilization_memory": float(values[1]),
                    "memory_used": float(values[2]),
                    "memory_total": float(values[3]),
                    "temperature": float(values[4]),
                    "power_draw": float(values[5])
                }
        except (subprocess.TimeoutExpired, FileNotFoundError, ValueError):
            pass
        
        return {"available": False}
    
    def get_temperature(self) -> dict:
        """Get system temperatures."""
        temps = {"cpu": [], "gpu": None, "system": []}
        
        # Try psutil for CPU temperature
        try:
            cpu_temp = psutil.sensors_temperatures()
            if cpu_temp:
                for name, entries in cpu_temp.items():
                    for entry in entries:
                        temps["cpu"].append({
                            "label": entry.label or name,
                            "current": entry.current,
                            "high": entry.high,
                            "critical": entry.critical
                        })
        except Exception:
            pass
        
        # Try to get GPU temperature via nvidia-smi
        try:
            result = subprocess.run(
                ["nvidia-smi", "--query-gpu=temperature.gpu", "--format=csv,noheader,nounits"],
                capture_output=True,
                text=True,
                timeout=5
            )
            if result.returncode == 0 and result.stdout.strip():
                temps["gpu"] = float(result.stdout.strip())
        except:
            pass
        
        # Try lm-sensors for system temperature
        try:
            result = subprocess.run(
                ["sensors"],
                capture_output=True,
                text=True,
                timeout=5
            )
            if result.returncode == 0:
                temps["raw_sensors"] = result.stdout[:500]  # Truncate for size
        except:
            pass
        
        return temps
    
    def get_processes(self, limit: int = 100) -> list:
        """Get running processes."""
        processes = []
        for proc in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_percent', 'status', 'username']):
            try:
                pinfo = proc.info
                processes.append({
                    "pid": pinfo['pid'],
                    "name": pinfo['name'],
                    "cpu_percent": pinfo['cpu_percent'] or 0,
                    "memory_percent": pinfo['memory_percent'] or 0,
                    "status": pinfo['status'],
                    "username": pinfo['username']
                })
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        
        # Sort by CPU usage and limit
        processes.sort(key=lambda x: x['cpu_percent'], reverse=True)
        return processes[:limit]
    
    def get_system_info(self) -> dict:
        """Get general system information."""
        boot_time = psutil.boot_time()
        uptime = time.time() - boot_time
        
        return {
            "hostname": socket.gethostname(),
            "os": {
                "system": os.uname().sysname,
                "release": os.uname().release,
                "version": os.uname().version,
                "machine": os.uname().machine
            },
            "boot_time": datetime.fromtimestamp(boot_time).isoformat(),
            "uptime_seconds": uptime,
            "uptime_hours": uptime / 3600
        }
    
    def get_all_metrics(self) -> dict:
        """Collect all system metrics."""
        return {
            "timestamp": datetime.now().isoformat(),
            "cpu": self.get_cpu_usage(),
            "memory": self.get_memory_usage(),
            "disk": self.get_disk_usage(),
            "network": self.get_network_usage(),
            "gpu": self.get_gpu_usage(),
            "temperature": self.get_temperature(),
            "processes": self.get_processes(),
            "system": self.get_system_info(),
            "logs": self.log_monitor.check_logs()
        }


class ServerAgent:
    """Main agent class that handles communication and commands."""
    
    def __init__(self, dashboard_url: str, server_id: str = None,
                 interval: int = 5):
        self.dashboard_url = dashboard_url.rstrip('/')
        self.server_id = server_id or str(uuid.uuid4())[:8]
        self.interval = interval
        
        self.monitor = SystemMonitor()
        self.running = True
        self.ws_connection = None
        self.command_handlers = {
            "restart": self._handle_restart,
            "shutdown": self._handle_shutdown,
            "kill": self._handle_kill,
            "ping": self._handle_ping,
            "get_processes": self._handle_get_processes,
            "add_log": self._handle_add_log,
            "remove_log": self._handle_remove_log,
            "get_logs": self._handle_get_logs,
            "toggle_log": self._handle_toggle_log,
        }
    
    def _send_http_metrics(self, metrics: dict) -> bool:
        """Send metrics via HTTP POST."""
        try:
            url = f"{self.dashboard_url}/api/metrics/{self.server_id}"
            response = requests.post(url, json=metrics, timeout=10)
            return response.status_code == 200
        except Exception as e:
            print(f"HTTP metrics failed: {e}")
            return False
    
    def _connect_websocket(self) -> bool:
        """Connect to dashboard via WebSocket."""
        if not HAS_WEBSOCKET:
            return False
        
        try:
            ws_url = f"{self.dashboard_url.replace('http', 'ws')}/ws/{self.server_id}"
            self.ws_connection = websocket.WebSocketApp(
                ws_url,
                on_message=self._on_ws_message,
                on_error=self._on_ws_error,
                on_close=self._on_ws_close,
                on_open=self._on_ws_open
            )
            
            ws_thread = threading.Thread(target=self.ws_connection.run_forever, daemon=True)
            ws_thread.start()
            time.sleep(2)  # Wait for connection
            
            return self.ws_connection.sock and self.ws_connection.sock.connected
        except Exception as e:
            print(f"WebSocket connection failed: {e}")
            return False
    
    def _on_ws_open(self, ws):
        print(f"WebSocket connected for server {self.server_id}")
    
    def _on_ws_message(self, ws, message):
        try:
            command = json.loads(message)
            self._execute_command(command)
        except json.JSONDecodeError:
            print("Invalid command received")
    
    def _on_ws_error(self, ws, error):
        print(f"WebSocket error: {error}")
    
    def _on_ws_close(self, ws, close_status_code, close_msg):
        print(f"WebSocket closed: {close_status_code} - {close_msg}")
        self.ws_connection = None
    
    def _send_ws_message(self, data: dict):
        if self.ws_connection and self.ws_connection.sock and self.ws_connection.sock.connected:
            try:
                self.ws_connection.send(json.dumps(data))
                return True
            except Exception as e:
                print(f"WS send failed: {e}")
        return False
    
    def _execute_command(self, command: dict):
        """Execute a command from the dashboard."""
        cmd_type = command.get("type")
        handler = self.command_handlers.get(cmd_type)
        
        if handler:
            result = handler(command)
            # Send result back
            if self._send_ws_message({"type": "result", "command_id": command.get("id"), "result": result}):
                pass
            else:
                # Fallback to HTTP
                try:
                    requests.post(
                        f"{self.dashboard_url}/api/command_result/{self.server_id}",
                        json={"command_id": command.get("id"), "result": result},
                        timeout=5
                    )
                except:
                    pass
    
    def _handle_restart(self, command: dict) -> dict:
        """Handle restart command."""
        print("Executing restart command...")
        subprocess.run(["shutdown", "-r", "now"], check=False)
        return {"success": True, "message": "System restarting..."}
    
    def _handle_shutdown(self, command: dict) -> dict:
        """Handle shutdown command."""
        print("Executing shutdown command...")
        subprocess.run(["shutdown", "-h", "now"], check=False)
        return {"success": True, "message": "System shutting down..."}
    
    def _handle_kill(self, command: dict) -> dict:
        """Handle kill process command."""
        pid = command.get("pid")
        if not pid:
            return {"success": False, "error": "No PID provided"}
        
        try:
            proc = psutil.Process(pid)
            proc.terminate()
            return {"success": True, "message": f"Process {pid} terminated"}
        except psutil.NoSuchProcess:
            return {"success": False, "error": f"Process {pid} not found"}
        except psutil.AccessDenied:
            return {"success": False, "error": f"Access denied to kill {pid}"}
    
    def _handle_ping(self, command: dict) -> dict:
        """Handle ping command."""
        return {"success": True, "message": "pong", "timestamp": datetime.now().isoformat()}
    
    def _handle_get_processes(self, command: dict) -> dict:
        """Handle get processes command."""
        limit = command.get("limit", 100)
        return {"success": True, "processes": self.monitor.get_processes(limit)}
    
    def _handle_add_log(self, command: dict) -> dict:
        """Handle add log monitoring command."""
        name = command.get("name")
        file_path = command.get("file_path")
        pattern = command.get("pattern", ".*")
        tail = command.get("tail", True)
        max_entries = command.get("max_entries", 100)
        
        if not name or not file_path:
            return {"success": False, "error": "name and file_path required"}
        
        self.monitor.log_monitor.add_log_config(name, file_path, pattern, tail, max_entries)
        return {"success": True, "message": f"Log monitoring added: {name}"}
    
    def _handle_remove_log(self, command: dict) -> dict:
        """Handle remove log monitoring command."""
        name = command.get("name")
        if not name:
            return {"success": False, "error": "name required"}
        
        self.monitor.log_monitor.remove_log_config(name)
        return {"success": True, "message": f"Log monitoring removed: {name}"}
    
    def _handle_get_logs(self, command: dict) -> dict:
        """Handle get log configs command."""
        return {
            "success": True,
            "configs": self.monitor.log_monitor.get_configs(),
            "logs": self.monitor.log_monitor.check_logs()
        }
    
    def _handle_toggle_log(self, command: dict) -> dict:
        """Handle toggle log monitoring command."""
        name = command.get("name")
        enabled = command.get("enabled", True)
        
        if not name:
            return {"success": False, "error": "name required"}
        
        self.monitor.log_monitor.toggle_config(name, enabled)
        return {"success": True, "message": f"Log monitoring {name} {'enabled' if enabled else 'disabled'}"}
    
    def start(self):
        """Start the agent."""
        print(f"Server Agent starting with ID: {self.server_id}")
        print(f"Dashboard URL: {self.dashboard_url}")
        
        # Register with dashboard
        try:
            requests.post(
                f"{self.dashboard_url}/api/servers/register",
                json={
                    "server_id": self.server_id,
                    "hostname": socket.gethostname(),
                    "system": os.uname().sysname
                },
                timeout=10
            )
        except Exception as e:
            print(f"Registration failed: {e}")
        
        # Main loop
        ws_connected = False
        
        while self.running:
            metrics = self.monitor.get_all_metrics()
            metrics["server_id"] = self.server_id
            
            # Try WebSocket first, fallback to HTTP
            if not ws_connected:
                ws_connected = self._connect_websocket()
            
            if ws_connected and self._send_ws_message({"type": "metrics", "data": metrics}):
                pass
            else:
                # Fallback to HTTP
                self._send_http_metrics(metrics)
                ws_connected = False
            
            time.sleep(self.interval)
    
    def stop(self):
        """Stop the agent."""
        self.running = False
        if self.ws_connection:
            self.ws_connection.close()


def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="Server Monitor Agent")
    parser.add_argument("--url", "-u", default="http://localhost:8000", 
                        help="Dashboard URL")
    parser.add_argument("--id", "-i", default=None,
                        help="Server ID (auto-generated if not provided)")
    parser.add_argument("--interval", type=int, default=5,
                        help="Metrics reporting interval in seconds (default: 5)")
    
    args = parser.parse_args()
    
    agent = ServerAgent(
        dashboard_url=args.url,
        server_id=args.id,
        interval=args.interval
    )
    
    try:
        agent.start()
    except KeyboardInterrupt:
        print("\nStopping agent...")
        agent.stop()


if __name__ == "__main__":
    main()