# Project knowledge

This file gives Codebuff context about your project: goals, commands, conventions, and gotchas.

## Overview
- **Project:** Server Monitor Dashboard — full-stack monitoring solution
- **Stack:** React + FastAPI (Python) + Server Agent (Python)

## Quickstart
- Start dashboard:
  ```bash
  cd dashboard/backend
  python -m venv venv && source venv/bin/activate
  pip install -r requirements.txt
  python main.py
  ```
- Run server agent (Debian Linux):
  ```bash
  cd server_agent
  pip install -r requirements.txt
  python server_agent.py --url http://localhost:8000
  ```
- Access dashboard: http://localhost:8000

## Architecture
- Key directories:
  - `server_agent/` — Python monitoring agent for Debian Linux
  - `dashboard/backend/` — FastAPI backend (port 8000)
  - `dashboard/frontend/` — React + TypeScript frontend (Vite)
- Data flow: WebSocket (real-time) + HTTP polling fallback

## Features
- Real-time metrics: CPU, Memory, Disk, Network, GPU, Temperature
- Remote commands: Restart, Shutdown, Kill processes
- Process management with kill functionality
- SFTP file operations (requires configuration)

## Conventions
- Formatting: Prettier/ESLint for frontend
- Python: follows FastAPI best practices
- No authentication (intentional design)
