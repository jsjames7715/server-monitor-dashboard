# Server Monitor Dashboard - Specification

## Project Overview
- **Project Name:** Server Monitor Dashboard
- **Type:** Full-stack monitoring solution (Server Agent + Web Dashboard)
- **Core Functionality:** Real-time server monitoring with remote control capabilities
- **Target Users:** System administrators managing Linux servers

---

## Architecture

### Components
1. **Server Agent (Python)** - Runs on Debian Linux servers, collects metrics, communicates with dashboard
2. **Dashboard Backend (FastAPI)** - Web server, serves React app, handles API requests, communicates with agents
3. **Dashboard Frontend (React)** - Cross-platform web UI for monitoring and control

### Communication
- **WebSocket:** Real-time push from servers to dashboard
- **HTTP Polling:** Fallback method for servers POSTing metrics periodically
- **No authentication** between servers and dashboard

---

## Server Agent Specification

### Platform
- Debian Linux 64-bit
- Python 3.8+ (downloadable script)

### Monitored Metrics
1. **CPU Usage** - Per-core and total utilization %
2. **Memory Usage** - Used, free, available, swap
3. **Disk Usage** - Per mount point usage %
4. **Network Bandwidth** - Bytes sent/received per second
5. **GPU Usage** - NVIDIA GPU utilization, memory, temperature (if available)
6. **Temperature** - CPU, GPU, system temperatures (if available via sensors)
7. **System Sensors** - Any available hardware sensors
8. **Process List** - Running processes with PID, name, CPU%, memory%

### Commands Supported
- Remote restart (`reboot`)
- Remote shutdown (`shutdown now`)
- Kill process by PID
- SFTP file operations (list, download, upload, delete files)

### Communication Protocol
```
WebSocket:
  - Connect to: ws://dashboard:8000/ws/{server_id}
  - Send: JSON metrics every 5 seconds
  - Receive: Command messages

HTTP Polling:
  - POST to: http://dashboard:8000/api/metrics/{server_id}
  - Body: JSON metrics
  - Interval: 10 seconds fallback
```

### Output
- Single Python script: `server_agent.py`
- Self-contained with all dependencies

---

## Dashboard Backend Specification

### Framework
- FastAPI (Python)
- Uvicorn server

### API Endpoints
```
GET  /                    - Serve React app
GET  /api/servers         - List all registered servers
GET  /api/servers/{id}    - Get server details
DELETE /api/servers/{id}  - Remove server
GET  /api/servers/{id}/metrics - Get historical metrics
POST /api/metrics/{server_id} - Receive metrics (HTTP polling)
WS   /ws/{server_id}      - WebSocket connection for real-time data
POST /api/servers/{id}/command - Send command to server
GET  /api/servers/{id}/processes - Get process list
POST /api/servers/{id}/kill/{pid} - Kill process
GET  /api/servers/{id}/files     - List files via SFTP
GET  /api/servers/{id}/files/download - Download file
POST /api/servers/{id}/files/upload - Upload file
DELETE /api/servers/{id}/files/{path} - Delete file
```

### Data Storage
- In-memory for simplicity (no database)
- Historical metrics kept in memory (last 100 data points per server)

---

## Dashboard Frontend Specification

### Framework
- React 18+ with TypeScript
- Vite build system

### UI Features
1. **Server List View** - Grid of server cards showing status
2. **Server Detail View** - Full dashboard for selected server
3. **Metrics Dashboard** - Real-time charts for all metrics
4. **Process Manager** - Table of processes with kill button
5. **File Manager** - SFTP file browser with upload/download
6. **Command Panel** - Buttons for restart/shutdown

### Visual Design
- Dark theme (cyberpunk/hacker aesthetic)
- Real-time animated charts
- Color-coded status indicators
- Responsive design for all platforms

### Dependencies
- React, React Router, Recharts (charts), Lucide React (icons)

---

## File Structure
```
/home/user/servermonitordashboard/
  server_agent/
    server_agent.py      # Python agent script
    requirements.txt     # Python dependencies
  dashboard/
    backend/
      main.py           # FastAPI application
      requirements.txt  # Python dependencies
    frontend/
      src/
        App.tsx
        components/
        pages/
        styles/
      package.json
      vite.config.ts
  SPEC.md
  README.md
```

---

## Acceptance Criteria
1. Server agent runs on Debian Linux and reports all metrics
2. Dashboard displays real-time metrics via WebSocket
3. HTTP polling fallback works when WebSocket fails
4. Remote restart/shutdown commands execute on server
5. Process list displays and processes can be killed
6. SFTP file management works (list, download, upload, delete)
7. Dashboard accessible from any OS via web browser
8. UI is polished, user-friendly, and visually impressive