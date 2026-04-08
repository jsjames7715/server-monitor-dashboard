import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LayoutDashboard, Server, Activity as ActivityIcon, Settings as SettingsIcon } from 'lucide-react';
import ServerList from './pages/ServerList';
import ServerDetail from './pages/ServerDetail';
import Settings from './pages/Settings';
import Activity from './pages/Activity';

function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <ActivityIcon size={24} />
        <h1>ServerMonitor</h1>
      </div>
      <nav className="nav-menu">
        <a className="nav-item active" href="/">
          <LayoutDashboard size={20} />
          <span>Dashboard</span>
        </a>
        <a className="nav-item" href="/servers">
          <Server size={20} />
          <span>Servers</span>
        </a>
        <a className="nav-item" href="/activity">
          <ActivityIcon size={20} />
          <span>Activity</span>
        </a>
        <a className="nav-item" href="/settings">
          <SettingsIcon size={20} />
          <span>Settings</span>
        </a>
      </nav>
      <div style={{ marginTop: 'auto', padding: '16px', borderTop: '1px solid var(--border-color)' }}>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          Server Monitor Dashboard
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
          v1.0.0
        </div>
      </div>
    </aside>
  );
}

function App() {
  return (
    <BrowserRouter>
      <div className="app-container">
        <Sidebar />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<ServerList />} />
            <Route path="/servers" element={<ServerList />} />
            <Route path="/server/:id" element={<ServerDetail />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/activity" element={<Activity />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;