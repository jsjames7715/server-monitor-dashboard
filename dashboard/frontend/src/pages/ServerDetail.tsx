import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Cpu, MemoryStick, HardDrive, Network, Thermometer, Activity,
  Package, Folder, Power, RefreshCw, Trash2, ArrowLeft,
  Terminal, FileText
} from 'lucide-react';
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer
} from 'recharts';
import { useApi } from '../hooks/useApi';
import { useSettings } from '../hooks/useSettings';
import { Server, ProcessInfo } from '../types';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}

function getProgressColor(percent: number): string {
  if (percent > 90) return 'red';
  if (percent > 70) return 'yellow';
  return 'cyan';
}

interface MetricHistory {
  timestamp: string;
  cpu: number;
  memory: number;
  network: number;
}

export default function ServerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { get, post } = useApi();
  const { settings, convertTemperature } = useSettings();
  const [server, setServer] = useState<Server | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('metrics');
  const [metricsHistory, setMetricsHistory] = useState<MetricHistory[]>([]);
  const [commandLoading, setCommandLoading] = useState<string | null>(null);

  useEffect(() => {
    async function loadServer() {
      if (!id) return;
      const data = await get<Server>(`/servers/${id}`);
      setServer(data);
      setLoading(false);
    }
    loadServer();
    
    const interval = setInterval(loadServer, settings.refreshInterval * 1000);
    return () => clearInterval(interval);
  }, [id, get, settings.refreshInterval]);

  useEffect(() => {
    if (server?.current_metrics) {
      const metrics = server.current_metrics;
      setMetricsHistory(prev => {
        const newPoint = {
          timestamp: new Date().toLocaleTimeString(),
          cpu: metrics.cpu?.total || 0,
          memory: metrics.memory?.percent || 0,
          network: (metrics.network?.bytes_recv || 0) + (metrics.network?.bytes_sent || 0)
        };
        const updated = [...prev, newPoint].slice(-30);
        return updated;
      });
    }
  }, [server?.current_metrics]);

  const sendCommand = async (type: string) => {
    if (!id) return;
    setCommandLoading(type);
    try {
      await post(`/servers/${id}/command`, { type });
    } finally {
      setTimeout(() => setCommandLoading(null), 2000);
    }
  };

  const killProcess = async (pid: number) => {
    if (!id) return;
    if (!confirm(`Are you sure you want to kill process ${pid}?`)) return;
    await post(`/servers/${id}/kill/${pid}`);
  };

  if (loading || !server) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  const metrics = server.current_metrics;

  return (
    <div>
      <button className="back-btn" onClick={() => navigate('/')}>
        <ArrowLeft size={18} />
        Back to Dashboard
      </button>

      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2>{server.hostname}</h2>
            <p style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span className="mono" style={{ color: 'var(--text-muted)' }}>{server.server_id}</span>
              <span className={`badge ${server.status}`}>{server.status}</span>
              {metrics?.system && (
                <span style={{ color: 'var(--text-secondary)' }}>
                  {metrics.system.os?.system} {metrics.system.os?.release}
                </span>
              )}
            </p>
          </div>
          {metrics?.system && (
            <div style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>
              <div>Uptime: {formatUptime(metrics.system.uptime_seconds)}</div>
            </div>
          )}
        </div>
      </div>

      {/* Command Panel */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="card-title">
          <Terminal size={18} />
          Remote Commands
        </div>
        <div className="command-panel">
          <button
            className="btn btn-warning"
            onClick={() => sendCommand('restart')}
            disabled={commandLoading !== null}
          >
            {commandLoading === 'restart' ? <RefreshCw className="spin" size={16} /> : <RefreshCw size={16} />}
            Restart Server
          </button>
          <button
            className="btn btn-danger"
            onClick={() => sendCommand('shutdown')}
            disabled={commandLoading !== null}
          >
            <Power size={16} />
            Shutdown Server
          </button>
          <button
            className="btn btn-primary"
            onClick={() => sendCommand('ping')}
            disabled={commandLoading !== null}
          >
            <Activity size={16} />
            Ping
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button className={`tab ${activeTab === 'metrics' ? 'active' : ''}`} onClick={() => setActiveTab('metrics')}>
          <Activity size={16} style={{ marginRight: 8 }} />
          Metrics
        </button>
        <button className={`tab ${activeTab === 'processes' ? 'active' : ''}`} onClick={() => setActiveTab('processes')}>
          <Package size={16} style={{ marginRight: 8 }} />
          Processes
        </button>
        <button className={`tab ${activeTab === 'logs' ? 'active' : ''}`} onClick={() => navigate(`/server/${id}/logs`)}>
          <FileText size={16} style={{ marginRight: 8 }} />
          Logs
        </button>
      </div>

      {/* Metrics Tab */}
      {activeTab === 'metrics' && metrics && (
        <div className="metrics-grid">
          {/* CPU */}
          <div className="metric-chart-card">
            <div className="card-title">
              <Cpu size={18} />
              CPU Usage
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div>
                <div className="stat-value cyan">{metrics.cpu?.total?.toFixed(1)}%</div>
                <div className="stat-label">Total Usage</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="stat-value" style={{ fontSize: '16px' }}>
                  {metrics.cpu?.count} cores
                </div>
                <div className="stat-label">
                  {((metrics.cpu?.frequency_current || 0) / 1000).toFixed(1)} GHz
                </div>
              </div>
            </div>
            <div className="progress-bar">
              <div
                className={`progress-fill ${getProgressColor(metrics.cpu?.total || 0)}`}
                style={{ width: `${metrics.cpu?.total || 0}%` }}
              />
            </div>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={metricsHistory}>
                  <defs>
                    <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00d9ff" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#00d9ff" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="timestamp" hide />
                  <YAxis domain={[0, 100]} hide />
                  <Tooltip
                    contentStyle={{ background: '#151b24', border: '1px solid #2a3544', borderRadius: '8px' }}
                    labelStyle={{ color: '#8b949e' }}
                  />
                  <Area type="monotone" dataKey="cpu" stroke="#00d9ff" fill="url(#cpuGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Memory */}
          <div className="metric-chart-card">
            <div className="card-title">
              <MemoryStick size={18} />
              Memory Usage
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div>
                <div className="stat-value green">{metrics.memory?.percent?.toFixed(1)}%</div>
                <div className="stat-label">Used</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="stat-value" style={{ fontSize: '16px' }}>
                  {formatBytes(metrics.memory?.used || 0)}
                </div>
                <div className="stat-label">of {formatBytes(metrics.memory?.total || 0)}</div>
              </div>
            </div>
            <div className="progress-bar">
              <div
                className={`progress-fill ${getProgressColor(metrics.memory?.percent || 0)}`}
                style={{ width: `${metrics.memory?.percent || 0}%` }}
              />
            </div>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={metricsHistory}>
                  <defs>
                    <linearGradient id="memGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3fb950" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#3fb950" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="timestamp" hide />
                  <YAxis domain={[0, 100]} hide />
                  <Tooltip
                    contentStyle={{ background: '#151b24', border: '1px solid #2a3544', borderRadius: '8px' }}
                    labelStyle={{ color: '#8b949e' }}
                  />
                  <Area type="monotone" dataKey="memory" stroke="#3fb950" fill="url(#memGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Disk */}
          <div className="metric-chart-card">
            <div className="card-title">
              <HardDrive size={18} />
              Disk Usage
            </div>
            {metrics.disk?.map((d, i) => (
              <div key={i} style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '14px' }}>{d.mountpoint}</span>
                  <span className="mono" style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    {formatBytes(d.used)} / {formatBytes(d.total)}
                  </span>
                </div>
                <div className="progress-bar">
                  <div
                    className={`progress-fill ${getProgressColor(d.percent)}`}
                    style={{ width: `${d.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {settings.showNetworkStats && metrics.network && (
          <div className="metric-chart-card">
            <div className="card-title">
              <Network size={18} />
              Network Traffic
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="stat-card">
                <div className="stat-label">Download</div>
                <div className="stat-value cyan" style={{ fontSize: '18px' }}>
                  {formatBytes(metrics.network?.bytes_recv || 0)}/s
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Upload</div>
                <div className="stat-value purple" style={{ fontSize: '18px' }}>
                  {formatBytes(metrics.network?.bytes_sent || 0)}/s
                </div>
              </div>
            </div>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={metricsHistory}>
                  <XAxis dataKey="timestamp" hide />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{ background: '#151b24', border: '1px solid #2a3544', borderRadius: '8px' }}
                    labelStyle={{ color: '#8b949e' }}
                    formatter={(value: number) => formatBytes(value)}
                  />
                  <Line type="monotone" dataKey="network" stroke="#a371f7" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          )}

          {settings.showGpuStats && metrics.gpu?.available && (
            <div className="metric-chart-card">
              <div className="card-title">
                <Activity size={18} />
                GPU Usage (NVIDIA)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                <div className="stat-card">
                  <div className="stat-label">GPU</div>
                  <div className="stat-value cyan">{metrics.gpu.utilization_gpu}%</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Memory</div>
                  <div className="stat-value purple">{metrics.gpu.utilization_memory}%</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Temperature</div><div className="stat-value" style={{ color: metrics.gpu.temperature > 80 ? 'var(--accent-red)' : 'var(--accent-yellow)' }}>
                      {settings.temperatureUnit === 'fahrenheit' ? convertTemperature(metrics.gpu.temperature) + '°F' : metrics.gpu.temperature + '°C'}
                    </div>
                </div>
              </div>
            </div>
          )}

          {/* Temperature */}
          {(metrics.temperature?.cpu?.length > 0 || metrics.temperature?.gpu) && (
            <div className="metric-chart-card">
              <div className="card-title">
                <Thermometer size={18} />
                Temperature
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
                {metrics.temperature.cpu?.map((t, i) => (
                  <div key={i} className="stat-card">
                    <div className="stat-label">{t.label || 'CPU'}</div>
                    <div className="stat-value" style={{ color: t.current > 80 ? 'var(--accent-red)' : 'var(--accent-yellow)' }}>
                      {settings.temperatureUnit === 'fahrenheit' ? convertTemperature(t.current).toFixed(1) + '°F' : t.current.toFixed(1) + '°C'}
                    </div>
                  </div>
                ))}
                {metrics.temperature.gpu && (
                  <div className="stat-card">
                    <div className="stat-label">GPU</div>
                    <div className="stat-value" style={{ color: metrics.temperature.gpu > 80 ? 'var(--accent-red)' : 'var(--accent-yellow)' }}>
                      {settings.temperatureUnit === 'fahrenheit' ? convertTemperature(metrics.temperature.gpu) + '°F' : metrics.temperature.gpu + '°C'}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Processes Tab */}
      {activeTab === 'processes' && metrics && (
        <div className="process-table-container">
          <table className="process-table">
            <thead>
              <tr>
                <th>PID</th>
                <th>Name</th>
                <th>CPU %</th>
                <th>Memory %</th>
                <th>Status</th>
                <th>User</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {(metrics.processes || []).slice(0, 50).map((proc: ProcessInfo) => (
                <tr key={proc.pid}>
                  <td className="process-pid">{proc.pid}</td>
                  <td className="process-name">{proc.name}</td>
                  <td>
                    <span style={{ color: proc.cpu_percent > 50 ? 'var(--accent-red)' : 'var(--accent-cyan)' }}>
                      {proc.cpu_percent?.toFixed(1)}%
                    </span>
                  </td>
                  <td>
                    <span style={{ color: proc.memory_percent > 50 ? 'var(--accent-red)' : 'var(--accent-green)' }}>
                      {proc.memory_percent?.toFixed(1)}%
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${proc.status === 'running' ? 'online' : 'offline'}`}>
                      {proc.status}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-muted)' }}>{proc.username}</td>
                  <td>
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => killProcess(proc.pid)}
                    >
                      <Trash2 size={14} />
                      Kill
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Files Tab */}
      {activeTab === 'files' && (
        <div className="file-manager">
          <div className="file-toolbar">
            <span className="file-path">/ (SFTP - Configure SFTP in agent)</span>
          </div>
          <div className="empty-state" style={{ padding: '40px' }}>
            <Folder size={48} strokeWidth={1} />
            <h3>File Manager</h3>
            <p>
              Configure SFTP credentials when starting the server agent to enable file management.
              <br />
              <code style={{ color: 'var(--accent-cyan)' }}>
                python server_agent.py --sftp-host 192.168.1.100 --sftp-user admin --sftp-pass password
              </code>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}