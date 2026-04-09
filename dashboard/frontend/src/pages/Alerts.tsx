import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Bell, AlertTriangle, AlertCircle, Settings, Save } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { useSettings } from '../hooks/useSettings';
import { Alert, AlertThreshold } from '../types';

interface ServerAlerts {
  [serverId: string]: Alert[];
}

export default function Alerts() {
  const navigate = useNavigate();
  const { get, put } = useApi();
  const { sendNotification, requestNotificationPermission } = useSettings();
  const [allAlerts, setAllAlerts] = useState<ServerAlerts>({});
  const [thresholds, setThresholds] = useState<AlertThreshold>({
    cpuPercent: 90,
    memoryPercent: 90,
    diskPercent: 90,
    gpuTemp: 85,
    cpuTemp: 80,
    enabled: true
  });
  const [activeTab, setActiveTab] = useState<'alerts' | 'thresholds'>('alerts');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadData() {
      // Request notification permission
      requestNotificationPermission();
      
      // Load active alerts
      const alerts = await get<{ alerts: ServerAlerts }>('/alerts');
      if (alerts?.alerts) {
        setAllAlerts(alerts.alerts);
        
        // Send browser notification for any critical alerts
        Object.entries(alerts.alerts).forEach(([, serverAlerts]) => {
          serverAlerts.forEach(alert => {
            if (alert.severity === 'critical') {
              sendNotification(
                `Critical Alert: ${alert.type}`,
                alert.message
              );
            }
          });
        });
      }
      
      // Load thresholds
      const thresh = await get<AlertThreshold>('/alerts/thresholds');
      if (thresh) {
        setThresholds(thresh);
      }
      
      setLoading(false);
    }
    
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [get, sendNotification, requestNotificationPermission]);

  const saveThresholds = async () => {
    setSaving(true);
    await put('/alerts/thresholds', thresholds);
    setSaving(false);
  };

  const toggleAlerts = async (enabled: boolean) => {
    setThresholds(prev => ({ ...prev, enabled }));
    await put('/alerts/thresholds', { ...thresholds, enabled });
  };

  const getAlertIcon = (severity: string) => {
    return severity === 'critical' 
      ? <AlertCircle size={18} className="text-red-500" />
      : <AlertTriangle size={18} className="text-yellow-500" />;
  };

  const totalAlerts = Object.values(allAlerts).flat().length;
  const criticalAlerts = Object.values(allAlerts).flat().filter(a => a.severity === 'critical').length;

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
          <h2>
            <Bell size={24} />
            Alerts
          </h2>
          <p>Monitor and configure alert thresholds</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button 
          className={`tab ${activeTab === 'alerts' ? 'active' : ''}`}
          onClick={() => setActiveTab('alerts')}
        >
          <Bell size={16} style={{ marginRight: 8 }} />
          Active Alerts ({totalAlerts})
        </button>
        <button 
          className={`tab ${activeTab === 'thresholds' ? 'active' : ''}`}
          onClick={() => setActiveTab('thresholds')}
        >
          <Settings size={16} style={{ marginRight: 8 }} />
          Thresholds
        </button>
      </div>

      {/* Alerts Tab */}
      {activeTab === 'alerts' && (
        <div>
          {totalAlerts === 0 ? (
            <div className="empty-state">
              <Bell size={48} strokeWidth={1} />
              <h3>No Active Alerts</h3>
              <p>All metrics are within configured thresholds</p>
            </div>
          ) : (
            <div className="alerts-list">
              {Object.entries(allAlerts).map(([serverId, alerts]) => 
                alerts.length > 0 && (
                  <div key={serverId} className="card" style={{ marginBottom: '16px' }}>
                    <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: criticalAlerts > 0 ? 'var(--accent-red)' : 'var(--accent-cyan)' }}>
                        {serverId}
                      </span>
                      <span className="badge warning">{alerts.length} alert{alerts.length > 1 ? 's' : ''}</span>
                    </div>
                    {alerts.map((alert, idx) => (
                      <div 
                        key={idx} 
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '12px',
                          padding: '12px',
                          marginTop: '8px',
                          background: alert.severity === 'critical' ? 'rgba(248, 81, 73, 0.1)' : 'rgba(210, 153, 34, 0.1)',
                          borderRadius: '8px',
                          borderLeft: `3px solid ${alert.severity === 'critical' ? 'var(--accent-red)' : 'var(--accent-yellow)'}`
                        }}
                      >
                        {getAlertIcon(alert.severity)}
                        <div>
                          <div style={{ fontWeight: 500 }}>{alert.message}</div>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            Threshold: {alert.threshold}%
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          )}
        </div>
      )}

      {/* Thresholds Tab */}
      {activeTab === 'thresholds' && (
        <div className="card">
          <div className="card-title">
            Alert Thresholds
            <label className="toggle" style={{ marginLeft: 'auto' }}>
              <input
                type="checkbox"
                checked={thresholds.enabled}
                onChange={(e) => toggleAlerts(e.target.checked)}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>

          <div className="settings-grid">
            <div className="setting-item">
              <div className="setting-label">
                <AlertTriangle size={18} />
                <div>
                  <div className="setting-title">CPU Usage Alert</div>
                  <div className="setting-desc">Alert when CPU exceeds this percentage</div>
                </div>
              </div>
              <div className="setting-control">
                <input
                  type="number"
                  min="50"
                  max="100"
                  value={thresholds.cpuPercent}
                  onChange={(e) => setThresholds(prev => ({ ...prev, cpuPercent: Number(e.target.value) }))}
                  disabled={!thresholds.enabled}
                />
                <span>%</span>
              </div>
            </div>

            <div className="setting-item">
              <div className="setting-label">
                <AlertTriangle size={18} />
                <div>
                  <div className="setting-title">Memory Usage Alert</div>
                  <div className="setting-desc">Alert when memory exceeds this percentage</div>
                </div>
              </div>
              <div className="setting-control">
                <input
                  type="number"
                  min="50"
                  max="100"
                  value={thresholds.memoryPercent}
                  onChange={(e) => setThresholds(prev => ({ ...prev, memoryPercent: Number(e.target.value) }))}
                  disabled={!thresholds.enabled}
                />
                <span>%</span>
              </div>
            </div>

            <div className="setting-item">
              <div className="setting-label">
                <AlertTriangle size={18} />
                <div>
                  <div className="setting-title">Disk Usage Alert</div>
                  <div className="setting-desc">Alert when disk exceeds this percentage</div>
                </div>
              </div>
              <div className="setting-control">
                <input
                  type="number"
                  min="50"
                  max="100"
                  value={thresholds.diskPercent}
                  onChange={(e) => setThresholds(prev => ({ ...prev, diskPercent: Number(e.target.value) }))}
                  disabled={!thresholds.enabled}
                />
                <span>%</span>
              </div>
            </div>

            <div className="setting-item">
              <div className="setting-label">
                <AlertTriangle size={18} />
                <div>
                  <div className="setting-title">GPU Temperature Alert</div>
                  <div className="setting-desc">Alert when GPU temperature exceeds this</div>
                </div>
              </div>
              <div className="setting-control">
                <input
                  type="number"
                  min="50"
                  max="100"
                  value={thresholds.gpuTemp}
                  onChange={(e) => setThresholds(prev => ({ ...prev, gpuTemp: Number(e.target.value) }))}
                  disabled={!thresholds.enabled}
                />
                <span>°C</span>
              </div>
            </div>

            <div className="setting-item">
              <div className="setting-label">
                <AlertTriangle size={18} />
                <div>
                  <div className="setting-title">CPU Temperature Alert</div>
                  <div className="setting-desc">Alert when CPU temperature exceeds this</div>
                </div>
              </div>
              <div className="setting-control">
                <input
                  type="number"
                  min="50"
                  max="100"
                  value={thresholds.cpuTemp}
                  onChange={(e) => setThresholds(prev => ({ ...prev, cpuTemp: Number(e.target.value) }))}
                  disabled={!thresholds.enabled}
                />
                <span>°C</span>
              </div>
            </div>
          </div>

          <div style={{ marginTop: '24px' }}>
            <button 
              className={`btn ${saving ? 'btn-secondary' : 'btn-primary'}`}
              onClick={saveThresholds}
              disabled={saving || !thresholds.enabled}
            >
              <Save size={16} />
              {saving ? 'Saving...' : 'Save Thresholds'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}