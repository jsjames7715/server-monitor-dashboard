import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, X, RefreshCw, Download } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { useApi } from '../hooks/useApi';
import { Server } from '../types';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

interface ComparisonData {
  timestamp: string;
  [serverId: string]: number | string;
}

export default function Compare() {
  const navigate = useNavigate();
  const { get } = useApi();
  const [servers, setServers] = useState<Server[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [comparisonData, setComparisonData] = useState<ComparisonData[]>([]);
  const [metricType, setMetricType] = useState<'cpu' | 'memory' | 'disk' | 'network'>('cpu');

  useEffect(() => {
    async function loadServers() {
      const data = await get<Server[]>('/servers');
      setServers(data || []);
      setLoading(false);
    }
    loadServers();
  }, [get]);

  useEffect(() => {
    async function loadMetrics() {
      if (selectedIds.length === 0) return;
      
      const allHistory: { [serverId: string]: { timestamp: string; value: number }[] } = {};
      
      for (const serverId of selectedIds) {
        const history = await get<{ timestamp: string; metrics: any }[]>(
          `/servers/${serverId}/metrics?limit=30`
        );
        
        if (history) {
          allHistory[serverId] = history.map(h => {
            let value = 0;
            const metrics = h.metrics;
            
            if (metricType === 'cpu') {
              value = metrics?.cpu?.total || 0;
            } else if (metricType === 'memory') {
              value = metrics?.memory?.percent || 0;
            } else if (metricType === 'disk') {
              value = metrics?.disk?.[0]?.percent || 0;
            } else if (metricType === 'network') {
              value = ((metrics?.network?.bytes_recv || 0) + (metrics?.network?.bytes_sent || 0));
            }
            
            return { timestamp: new Date(h.timestamp).toLocaleTimeString(), value };
          });
        }
      }
      
      // Merge into comparison data
      const merged: ComparisonData[] = [];
      const maxLen = Math.max(...Object.values(allHistory).map(h => h.length), 0);
      
      for (let i = 0; i < maxLen; i++) {
        const point: ComparisonData = { timestamp: '' };
        for (const serverId of selectedIds) {
          if (allHistory[serverId] && allHistory[serverId][i]) {
            point.timestamp = allHistory[serverId][i].timestamp;
            point[serverId] = allHistory[serverId][i].value;
          }
        }
        merged.push(point);
      }
      
      setComparisonData(merged);
    }
    
    loadMetrics();
    const interval = setInterval(loadMetrics, 5000);
    return () => clearInterval(interval);
  }, [selectedIds, metricType, get]);

  const toggleServer = (serverId: string) => {
    setSelectedIds(prev => 
      prev.includes(serverId) 
        ? prev.filter(id => id !== serverId)
        : [...prev, serverId].slice(0, 4) // Max 4 servers
    );
  };

  const getMetricLabel = () => {
    switch (metricType) {
      case 'cpu': return 'CPU Usage (%)';
      case 'memory': return 'Memory Usage (%)';
      case 'disk': return 'Disk Usage (%)';
      case 'network': return 'Network (bytes/s)';
    }
  };

  const getColor = (index: number) => {
    const colors = ['#00d9ff', '#3fb950', '#a371f7', '#f0883e'];
    return colors[index % colors.length];
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
      <button className="back-btn" onClick={() => navigate('/')}>
        <ArrowLeft size={18} />
        Back to Dashboard
      </button>

      <div className="page-header">
        <div>
          <h2>Server Comparison</h2>
          <p>Compare metrics side-by-side across multiple servers</p>
        </div>
      </div>

      {/* Server Selection */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="card-title">Select Servers (max 4)</div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {servers.map(server => (
            <button
              key={server.server_id}
              className={`btn ${selectedIds.includes(server.server_id) ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => toggleServer(server.server_id)}
            >
              {selectedIds.includes(server.server_id) ? <Check size={16} /> : <X size={16} />}
              {server.hostname}
              <span className={`badge ${server.status}`} style={{ marginLeft: '8px' }}>
                {server.status}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Metric Type Selection */}
      {selectedIds.length > 0 && (
        <div className="card" style={{ marginBottom: '24px' }}>
          <div className="card-title">Metric Type</div>
          <div style={{ display: 'flex', gap: '12px' }}>
            {(['cpu', 'memory', 'disk', 'network'] as const).map(type => (
              <button
                key={type}
                className={`btn ${metricType === type ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setMetricType(type)}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Comparison Chart */}
      {selectedIds.length > 0 && (
        <div className="card">
          <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{getMetricLabel()}</span>
            <button
              className="btn btn-secondary"
              onClick={() => window.open(`/api/export/${selectedIds[0]}?format=csv&limit=100`, '_blank')}
            >
              <Download size={16} />
              Export CSV
            </button>
          </div>
          
          <div className="chart-container" style={{ height: '400px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={comparisonData}>
                <XAxis dataKey="timestamp" stroke="#8b949e" fontSize={12} />
                <YAxis stroke="#8b949e" fontSize={12} />
                <Tooltip
                  contentStyle={{ background: '#151b24', border: '1px solid #2a3544', borderRadius: '8px' }}
                  labelStyle={{ color: '#8b949e' }}
                  formatter={(value: number, name: string) => {
                    if (metricType === 'network') {
                      return [formatBytes(value), name];
                    }
                    return [`${value.toFixed(1)}%`, name];
                  }}
                />
                <Legend />
                {selectedIds.map((serverId, index) => {
                  const server = servers.find(s => s.server_id === serverId);
                  return (
                    <Line
                      key={serverId}
                      type="monotone"
                      dataKey={serverId}
                      name={server?.hostname || serverId}
                      stroke={getColor(index)}
                      strokeWidth={2}
                      dot={false}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Summary Stats */}
      {selectedIds.length > 0 && (
        <div style={{ marginTop: '24px', display: 'grid', gridTemplateColumns: `repeat(${selectedIds.length}, 1fr)`, gap: '16px' }}>
          {selectedIds.map((serverId, index) => {
            const server = servers.find(s => s.server_id === serverId);
            const metrics = server?.current_metrics;
            
            return (
              <div key={serverId} className="card">
                <div className="card-title" style={{ color: getColor(index) }}>
                  {server?.hostname}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <div className="stat-label">CPU</div>
                    <div className="stat-value">{metrics?.cpu?.total?.toFixed(1) || 0}%</div>
                  </div>
                  <div>
                    <div className="stat-label">Memory</div>
                    <div className="stat-value">{metrics?.memory?.percent?.toFixed(1) || 0}%</div>
                  </div>
                  <div>
                    <div className="stat-label">Disk</div>
                    <div className="stat-value">{metrics?.disk?.[0]?.percent?.toFixed(1) || 0}%</div>
                  </div>
                  <div>
                    <div className="stat-label">Status</div>
                    <span className={`badge ${server?.status}`}>{server?.status}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedIds.length === 0 && servers.length > 0 && (
        <div className="empty-state">
          <RefreshCw size={48} strokeWidth={1} />
          <h3>Select Servers to Compare</h3>
          <p>Click on the server buttons above to add them to the comparison</p>
        </div>
      )}
    </div>
  );
}