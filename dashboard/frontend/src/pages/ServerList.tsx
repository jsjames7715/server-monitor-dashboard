import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Cpu, HardDrive, MemoryStick, Network, Server as ServerIcon, Trash2 } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { useSettings } from '../hooks/useSettings';
import { Server } from '../types';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function ServerCard({ server, onRemove }: { server: Server; onRemove: (id: string, e: React.MouseEvent) => void }) {
  const navigate = useNavigate();
  const metrics = server.current_metrics;

  return (
    <div className="server-card" onClick={() => navigate(`/server/${server.server_id}`)}>
      <div className="server-card-header">
        <div>
          <div className="server-name">{server.hostname}</div>
          <div className="server-id">{server.server_id}</div>
        </div>
        <div className="server-card-actions">
          <button 
            className="btn-icon" 
            onClick={(e) => onRemove(server.server_id, e)}
            title="Remove server"
          >
            <Trash2 size={14} />
          </button>
          <div className="server-status">
            <span className={`status-dot ${server.status}`}></span>
            <span>{server.status}</span>
          </div>
        </div>
      </div>
      
      {metrics ? (
        <div className="server-metrics">
          <div className="metric-item">
            <div className="metric-label">
              <Cpu size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
              CPU
            </div>
            <div className="metric-value cyan">{metrics.cpu?.total?.toFixed(1)}%</div>
          </div>
          <div className="metric-item">
            <div className="metric-label">
              <MemoryStick size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
              Memory
            </div>
            <div className="metric-value green">{metrics.memory?.percent?.toFixed(1)}%</div>
          </div>
          <div className="metric-item">
            <div className="metric-label">
              <HardDrive size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
              Disk
            </div>
            <div className="metric-value yellow">
              {metrics.disk?.[0]?.percent?.toFixed(1) || 0}%
            </div>
          </div>
          <div className="metric-item">
            <div className="metric-label">
              <Network size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
              Network
            </div>
            <div className="metric-value purple">
              {formatBytes((metrics.network?.bytes_recv || 0) + (metrics.network?.bytes_sent || 0))}/s
            </div>
          </div>
        </div>
      ) : (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>
          No metrics received yet
        </div>
      )}
    </div>
  );
}

export default function ServerList() {
  const { get, del } = useApi();
  const { settings, requestNotificationPermission, sendNotification } = useSettings();
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [offlineCount, setOfflineCount] = useState(0);
  const [prevServerStatuses, setPrevServerStatuses] = useState<Record<string, string>>({});

  useEffect(() => {
    // Request notification permission on first load if enabled
    if (settings.showSystemNotifications) {
      requestNotificationPermission();
    }
  }, [settings.showSystemNotifications, requestNotificationPermission]);

  useEffect(() => {
    async function loadServers() {
      const data = await get<Server[]>('/servers');
      const serverList = data || [];
      
      // Check for status changes and send notifications
      if (settings.showSystemNotifications && !loading) {
        serverList.forEach(server => {
          const prevStatus = prevServerStatuses[server.server_id];
          if (prevStatus && prevStatus !== server.status) {
            if (server.status === 'offline') {
              sendNotification(
                'Server Offline',
                `${server.hostname} (${server.server_id}) went offline`
              );
            } else if (server.status === 'online' && prevStatus === 'offline') {
              sendNotification(
                'Server Online',
                `${server.hostname} (${server.server_id}) is back online`
              );
            }
          }
        });
      }
      
      // Track current statuses
      const newStatuses: Record<string, string> = {};
      serverList.forEach(s => newStatuses[s.server_id] = s.status);
      setPrevServerStatuses(newStatuses);
      
      setServers(serverList);
      // Count offline servers
      const offline = serverList.filter(s => s.status === 'offline').length;
      setOfflineCount(offline);
      setLoading(false);
    }
    loadServers();
    
    // Poll for updates using settings refresh interval
    // Also use metricsHistoryLimit setting - could be used for chart data points
      // For now we just track it
      
      const interval = setInterval(loadServers, settings.refreshInterval * 1000);
    return () => clearInterval(interval);
  }, [get, settings.refreshInterval]);

  const handleCleanupOffline = async () => {
    if (offlineCount === 0) return;
    if (confirm(`Remove ${offlineCount} offline server(s)?`)) {
      await del('/servers/offline');
      setServers(prev => prev.filter(s => s.status !== 'offline'));
      setOfflineCount(0);
    }
  };

  const handleRemoveServer = async (serverId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Remove this server from the dashboard?')) {
      await del(`/servers/${serverId}`);
      setServers(prev => prev.filter(s => s.server_id !== serverId));
    }
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Server Dashboard</h2>
          <p>Monitor and manage your connected servers</p>
        </div>
        {offlineCount > 0 && (
          <button className="btn btn-secondary" onClick={handleCleanupOffline}>
            Clean up {offlineCount} offline server{offlineCount > 1 ? 's' : ''}
          </button>
        )}
      </div>

      {servers.length === 0 ? (
        <div className="empty-state">
          <ServerIcon size={64} strokeWidth={1} />
          <h3>No Servers Connected</h3>
          <p>
            Run the server agent on your Debian Linux machines to start monitoring.
            <br />
            <code style={{ color: 'var(--accent-cyan)' }}>
              python server_agent.py --url http://your-dashboard:8000
            </code>
          </p>
        </div>
      ) : (
        <div className={`server-grid ${settings.compactMode ? 'compact' : ''}`}>
          {servers.map(server => (
            <ServerCard key={server.server_id} server={server} onRemove={handleRemoveServer} />
          ))}
        </div>
      )}
    </div>
  );
}