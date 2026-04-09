import { useState, useEffect } from 'react';
import { Network, Plus, Trash2, RefreshCw, Wifi, WifiOff, Settings, X, Check } from 'lucide-react';
import { useApi } from '../hooks/useApi';

interface SNMPDevice {
  device_id: string;
  name: string;
  ip: string;
  community: string;
  snmp_version: string;
  port: number;
  status: string;
  last_checked: string | null;
  metrics: Record<string, any>;
}

export default function SNMPDevices() {
  const { get, post, put, del } = useApi();
  const [devices, setDevices] = useState<SNMPDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState<SNMPDevice | null>(null);
  const [polling, setPolling] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadDevices();
  }, []);

  async function loadDevices() {
    const data = await get<{ devices: SNMPDevice[] }>('/snmp/devices');
    setDevices(data?.devices || []);
    setLoading(false);
  }

  const handleAddDevice = async (device: Partial<SNMPDevice>) => {
    await post('/snmp/devices', device);
    setShowAddModal(false);
    loadDevices();
  };

  const handleUpdateDevice = async (device: Partial<SNMPDevice>) => {
    if (!showEditModal) return;
    await put(`/snmp/devices/${showEditModal.device_id}`, device);
    setShowEditModal(null);
    loadDevices();
  };

  const handleDeleteDevice = async (deviceId: string) => {
    if (!confirm('Delete this device?')) return;
    await del(`/snmp/devices/${deviceId}`);
    loadDevices();
  };

  const handlePollDevice = async (deviceId: string) => {
    setPolling(prev => new Set(prev).add(deviceId));
    await post(`/snmp/devices/${deviceId}/poll`, {});
    setTimeout(() => {
      setPolling(prev => {
        const next = new Set(prev);
        next.delete(deviceId);
        return next;
      });
      loadDevices();
    }, 1000);
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="snmp-page">
      <div className="page-header">
        <div className="page-header-left">
          <h2>
            <Network size={28} />
            SNMP/Network Devices
          </h2>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
            <Plus size={18} /> Add Device
          </button>
        </div>
      </div>

      {devices.length === 0 ? (
        <div className="empty-state">
          <Network size={48} />
          <h3>No SNMP Devices</h3>
          <p>Add network devices to monitor via SNMP protocol</p>
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
            <Plus size={18} /> Add First Device
          </button>
        </div>
      ) : (
        <div className="device-grid">
          {devices.map(device => (
            <div key={device.device_id} className={`device-card ${device.status}`}>
              <div className="device-header">
                <div className="device-icon">
                  {device.status === 'online' ? <Wifi size={24} /> : <WifiOff size={24} />}
                </div>
                <div className="device-info">
                  <h3>{device.name}</h3>
                  <span className="device-ip">{device.ip}</span>
                </div>
                <div className={`device-status ${device.status}`}>
                  {device.status}
                </div>
              </div>
              
              <div className="device-details">
                <div className="device-detail">
                  <span className="detail-label">Community:</span>
                  <span className="detail-value">{device.community}</span>
                </div>
                <div className="device-detail">
                  <span className="detail-label">SNMP Version:</span>
                  <span className="detail-value">{device.snmp_version}</span>
                </div>
                <div className="device-detail">
                  <span className="detail-label">Port:</span>
                  <span className="detail-value">{device.port}</span>
                </div>
                {device.last_checked && (
                  <div className="device-detail">
                    <span className="detail-label">Last Poll:</span>
                    <span className="detail-value">{new Date(device.last_checked).toLocaleString()}</span>
                  </div>
                )}
              </div>

              {device.metrics && Object.keys(device.metrics).length > 0 && (
                <div className="device-metrics">
                  <h4>Metrics</h4>
                  <div className="metrics-grid">
                    {device.metrics.cpu !== undefined && (
                      <div className="metric-item">
                        <span className="metric-label">CPU</span>
                        <span className="metric-value">{device.metrics.cpu}%</span>
                      </div>
                    )}
                    {device.metrics.memory !== undefined && (
                      <div className="metric-item">
                        <span className="metric-label">Memory</span>
                        <span className="metric-value">{device.metrics.memory}%</span>
                      </div>
                    )}
                    {device.metrics.ifInOctets !== undefined && (
                      <div className="metric-item">
                        <span className="metric-label">In (MB)</span>
                        <span className="metric-value">{(device.metrics.ifInOctets / 1024 / 1024).toFixed(1)}</span>
                      </div>
                    )}
                    {device.metrics.ifOutOctets !== undefined && (
                      <div className="metric-item">
                        <span className="metric-label">Out (MB)</span>
                        <span className="metric-value">{(device.metrics.ifOutOctets / 1024 / 1024).toFixed(1)}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="device-actions">
                <button 
                  className="btn btn-secondary" 
                  onClick={() => handlePollDevice(device.device_id)}
                  disabled={polling.has(device.device_id)}
                >
                  <RefreshCw size={16} className={polling.has(device.device_id) ? 'spin' : ''} />
                  {polling.has(device.device_id) ? 'Polling...' : 'Poll'}
                </button>
                <button 
                  className="btn btn-secondary"
                  onClick={() => setShowEditModal(device)}
                >
                  <Settings size={16} />
                </button>
                <button 
                  className="btn btn-danger"
                  onClick={() => handleDeleteDevice(device.device_id)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Device Modal */}
      {showAddModal && (
        <DeviceModal
          onSave={handleAddDevice}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {/* Edit Device Modal */}
      {showEditModal && (
        <DeviceModal
          device={showEditModal}
          onSave={handleUpdateDevice}
          onClose={() => setShowEditModal(null)}
        />
      )}
    </div>
  );
}

function DeviceModal({ 
  device, 
  onSave, 
  onClose 
}: { 
  device?: SNMPDevice; 
  onSave: (d: Partial<SNMPDevice>) => void; 
  onClose: () => void;
}) {
  const [formData, setFormData] = useState({
    name: device?.name || '',
    ip: device?.ip || '',
    community: device?.community || 'public',
    snmp_version: device?.snmp_version || '2c',
    port: device?.port || 161
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{device ? 'Edit Device' : 'Add SNMP Device'}</h3>
          <button className="btn-icon" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Device Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
              placeholder="Router-1"
              required
            />
          </div>
          <div className="form-group">
            <label>IP Address</label>
            <input
              type="text"
              value={formData.ip}
              onChange={e => setFormData({...formData, ip: e.target.value})}
              placeholder="192.168.1.1"
              required
            />
          </div>
          <div className="form-group">
            <label>SNMP Community</label>
            <input
              type="text"
              value={formData.community}
              onChange={e => setFormData({...formData, community: e.target.value})}
              placeholder="public"
            />
          </div>
          <div className="form-group">
            <label>SNMP Version</label>
            <select
              value={formData.snmp_version}
              onChange={e => setFormData({...formData, snmp_version: e.target.value})}
            >
              <option value="1">v1</option>
              <option value="2c">v2c</option>
              <option value="3">v3</option>
            </select>
          </div>
          <div className="form-group">
            <label>Port</label>
            <input
              type="number"
              value={formData.port}
              onChange={e => setFormData({...formData, port: parseInt(e.target.value)})}
              placeholder="161"
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              <Check size={18} /> {device ? 'Update' : 'Add'} Device
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}