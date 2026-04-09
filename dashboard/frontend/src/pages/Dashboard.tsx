import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Save, Trash2, GripVertical, Edit3, LayoutDashboard,
  Cpu, MemoryStick, HardDrive, Network, Activity, Bell, AlertTriangle,
  Server, Layers, X
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import { useApi } from '../hooks/useApi';
import { Server as ServerType } from '../types';

interface Widget {
  id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  serverId?: string;
}

interface Dashboard {
  name: string;
  widgets: Widget[];
}

const WIDGET_TYPES = [
  { type: 'server_status', name: 'Server Status', icon: Server, defaultW: 12, defaultH: 2 },
  { type: 'cpu_gauge', name: 'CPU Gauge', icon: Cpu, defaultW: 4, defaultH: 3 },
  { type: 'memory_gauge', name: 'Memory Gauge', icon: MemoryStick, defaultW: 4, defaultH: 3 },
  { type: 'disk_gauge', name: 'Disk Gauge', icon: HardDrive, defaultW: 4, defaultH: 3 },
  { type: 'network_chart', name: 'Network Chart', icon: Network, defaultW: 6, defaultH: 4 },
  { type: 'cpu_chart', name: 'CPU History', icon: Activity, defaultW: 6, defaultH: 4 },
  { type: 'memory_chart', name: 'Memory History', icon: MemoryStick, defaultW: 6, defaultH: 4 },
  { type: 'process_list', name: 'Top Processes', icon: Cpu, defaultW: 6, defaultH: 4 },
  { type: 'alerts_list', name: 'Alerts', icon: Bell, defaultW: 6, defaultH: 4 },
  { type: 'temperature_gauge', name: 'Temperature', icon: Activity, defaultW: 4, defaultH: 3 },
];

function getWidgetTitle(type: string): string {
  const widget = WIDGET_TYPES.find(w => w.type === type);
  return widget?.name || type;
}

function ServerStatusWidget({ servers }: { servers: ServerType[] }) {
  return (
    <div className="dashboard-widget-content">
      <div className="server-status-grid">
        {servers.map(server => (
          <div key={server.server_id} className="server-status-item">
            <div className={`status-dot ${server.status}`} />
            <span className="server-status-name">{server.hostname}</span>
            <span className="server-status-id">{server.server_id}</span>
          </div>
        ))}
        {servers.length === 0 && (
          <div className="empty-state">
            <p>No servers connected</p>
          </div>
        )}
      </div>
    </div>
  );
}

function GaugeWidget({ value, label, max = 100, color = '#00d9ff' }: { value: number; label: string; max?: number; color?: string }) {
  const percentage = Math.min((value / max) * 100, 100);
  const data = [
    { name: 'Used', value: percentage },
    { name: 'Free', value: 100 - percentage }
  ];

  return (
    <div className="dashboard-widget-content gauge-widget">
      <div className="gauge-label">{label}</div>
      <div className="gauge-value" style={{ color }}>{value.toFixed(1)}%</div>
      <div className="gauge-chart">
        <ResponsiveContainer width="100%" height={80}>
          <PieChart>
            <Pie
              data={data}
              innerRadius={25}
              outerRadius={35}
              dataKey="value"
              startAngle={180}
              endAngle={0}
            >
              <Cell fill={color} />
              <Cell fill="var(--bg-tertiary)" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ChartWidget({ data, dataKey, color = '#00d9ff' }: { data: any[]; dataKey: string; color?: string }) {
  return (
    <div className="dashboard-widget-content chart-widget">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id={`gradient-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3}/>
              <stop offset="95%" stopColor={color} stopOpacity={0}/>
            </linearGradient>
          </defs>
          <XAxis dataKey="time" hide />
          <YAxis hide domain={[0, 100]} />
          <Tooltip
            contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px' }}
            labelStyle={{ color: 'var(--text-muted)' }}
          />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            fill={`url(#gradient-${dataKey})`}
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function ProcessListWidget({ servers }: { servers: ServerType[] }) {
  const onlineServer = servers.find(s => s.status === 'online');
  const processes = onlineServer?.current_metrics?.processes?.slice(0, 5) || [];

  return (
    <div className="dashboard-widget-content process-widget">
      {processes.length > 0 ? (
        <div className="process-mini-list">
          {processes.map((proc: any, idx: number) => (
            <div key={idx} className="process-mini-item">
              <span className="process-name">{proc.name}</span>
              <span className="process-cpu">{proc.cpu_percent?.toFixed(1)}% CPU</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state"><p>No process data</p></div>
      )}
    </div>
  );
}

function AlertsWidget() {
  const [alerts, setAlerts] = useState<{serverId: string; message: string; severity: string}[]>([]);

  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const response = await fetch('/api/alerts');
        const data = await response.json();
        const newAlerts: {serverId: string; message: string; severity: string}[] = [];
        Object.entries(data.alerts || {}).forEach(([serverId, serverAlerts]: [string, any]) => {
          serverAlerts.forEach((alert: any) => {
            newAlerts.push({
              serverId,
              message: alert.message,
              severity: alert.severity
            });
          });
        });
        setAlerts(newAlerts.slice(0, 5));
      } catch (e) { console.error('Failed to fetch alerts', e); }
    };
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="dashboard-widget-content alerts-widget">
      {alerts.length > 0 ? (
        <div className="alerts-mini-list">
          {alerts.map((alert, idx) => (
            <div key={idx} className={`alert-mini-item ${alert.severity}`}>
              <AlertTriangle size={14} />
              <span>{alert.message}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state"><p>No active alerts</p></div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { get, post, put, del } = useApi();
  const [servers, setServers] = useState<ServerType[]>([]);
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [activeDashboard, setActiveDashboard] = useState<string>('default');
  const [currentWidgets, setCurrentWidgets] = useState<Widget[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showWidgetPicker, setShowWidgetPicker] = useState(false);
  const [dashboardName, setDashboardName] = useState('Default Dashboard');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [serversData, dashboardsData] = await Promise.all([
      get<ServerType[]>('/servers'),
      get<any>('/dashboards')
    ]);
    
    setServers(serversData || []);
    
    if (dashboardsData?.dashboards) {
      const dashList = Object.entries(dashboardsData.dashboards).map(([id, data]: [string, any]) => ({
        id,
        ...data
      }));
      setDashboards(dashList);
      setActiveDashboard(dashboardsData.active || 'default');
      
      const active = dashList.find((d: any) => d.id === (dashboardsData.active || 'default'));
      if (active) {
        setCurrentWidgets(active.widgets || []);
        setDashboardName(active.name);
      }
    }
    
    setLoading(false);
  }

  const handleDrop = useCallback((e: React.DragEvent, widgetId?: string) => {
    e.preventDefault();
    const widgetType = e.dataTransfer.getData('widgetType');
    if (!widgetType) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / (rect.width / 12));
    const y = Math.floor((e.clientY - rect.top) / 100);

    const widgetDef = WIDGET_TYPES.find(w => w.type === widgetType);
    if (!widgetDef) return;

    if (widgetId) {
      // Moving existing widget
      setCurrentWidgets(prev => prev.map(w => 
        w.id === widgetId ? { ...w, x: Math.max(0, x), y: Math.max(0, y) } : w
      ));
    } else {
      // Adding new widget
      const newWidget: Widget = {
        id: `w${Date.now()}`,
        type: widgetType,
        x: Math.max(0, Math.min(x, 12 - widgetDef.defaultW)),
        y: Math.max(0, y),
        w: widgetDef.defaultW,
        h: widgetDef.defaultH
      };
      setCurrentWidgets(prev => [...prev, newWidget]);
    }
  }, []);

  const handleRemoveWidget = (widgetId: string) => {
    setCurrentWidgets(prev => prev.filter(w => w.id !== widgetId));
  };

  const handleSaveDashboard = async () => {
    await put(`/dashboards/${activeDashboard}`, {
      name: dashboardName,
      widgets: currentWidgets
    });
    setEditMode(false);
  };

  const handleCreateDashboard = async () => {
    const name = prompt('Enter dashboard name:');
    if (!name) return;
    
    const result = await post<any>('/dashboards', {
      name,
      widgets: []
    });
    
    if (result?.dashboard) {
      await loadData();
      setActiveDashboard(result.dashboard.id || name.toLowerCase().replace(/\s/g, '-'));
      setCurrentWidgets([]);
      setDashboardName(name);
      setEditMode(true);
    }
  };

  const handleDeleteDashboard = async () => {
    if (!confirm('Delete this dashboard?')) return;
    await del(`/dashboards/${activeDashboard}`);
    loadData();
  };

  // Generate chart data from server metrics
  const getChartData = (type: 'cpu' | 'memory' | 'network') => {
    const onlineServer = servers.find(s => s.status === 'online');
    if (!onlineServer?.current_metrics) return [];

    const history: any[] = [];
    for (let i = 0; i < 20; i++) {
      if (type === 'cpu') {
        const base = onlineServer.current_metrics.cpu?.total || 0;
        history.push({ time: i, cpu: base + (Math.random() - 0.5) * 10 });
      } else if (type === 'memory') {
        const base = onlineServer.current_metrics.memory?.percent || 0;
        history.push({ time: i, memory: base + (Math.random() - 0.5) * 5 });
      } else if (type === 'network') {
        const sent = onlineServer.current_metrics.network?.bytes_sent || 0;
        const recv = onlineServer.current_metrics.network?.bytes_recv || 0;
        history.push({ time: i, network: ((sent + recv) / 1024 / 1024) });
      }
    }
    return history;
  };

  const renderWidget = (widget: Widget) => {
    const props = { servers };
    
    switch (widget.type) {
      case 'server_status':
        return <ServerStatusWidget {...props} />;
      case 'cpu_gauge':
        const cpuValue = servers.find(s => s.status === 'online')?.current_metrics?.cpu?.total || 0;
        return <GaugeWidget value={cpuValue} label="CPU" color="#00d9ff" />;
      case 'memory_gauge':
        const memValue = servers.find(s => s.status === 'online')?.current_metrics?.memory?.percent || 0;
        return <GaugeWidget value={memValue} label="Memory" color="#a371f7" />;
      case 'disk_gauge':
        const diskValue = servers.find(s => s.status === 'online')?.current_metrics?.disk?.[0]?.percent || 0;
        return <GaugeWidget value={diskValue} label="Disk" color="#3fb950" />;
      case 'cpu_chart':
        return <ChartWidget data={getChartData('cpu')} dataKey="cpu" color="#00d9ff" />;
      case 'memory_chart':
        return <ChartWidget data={getChartData('memory')} dataKey="memory" color="#a371f7" />;
      case 'network_chart':
        return <ChartWidget data={getChartData('network')} dataKey="network" color="#d29922" />;
      case 'process_list':
        return <ProcessListWidget {...props} />;
      case 'alerts_list':
        return <AlertsWidget />;
      case 'temperature_gauge':
        const tempValue = servers.find(s => s.status === 'online')?.current_metrics?.temperature?.cpu?.[0]?.current || 0;
        return <GaugeWidget value={tempValue} label="Temperature" max={100} color="#f85149" />;
      default:
        return <div className="dashboard-widget-content">Unknown widget: {widget.type}</div>;
    }
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <div className="page-header">
        <div className="page-header-left">
          <h2>
            <LayoutDashboard size={28} />
            {editMode ? 'Edit Dashboard' : 'Dashboard'}
          </h2>
          <select
            className="dashboard-select"
            value={activeDashboard}
            onChange={(e) => {
              setActiveDashboard(e.target.value);
              const dash = dashboards.find(d => (d as any).id === e.target.value);
              if (dash) {
                setCurrentWidgets((dash as any).widgets || []);
                setDashboardName((dash as any).name);
              }
            }}
          >
            {dashboards.map((dash: any) => (
              <option key={dash.id} value={dash.id}>{dash.name}</option>
            ))}
          </select>
        </div>
        <div className="page-header-actions">
          {editMode ? (
            <>
              <button className="btn btn-secondary" onClick={() => setShowWidgetPicker(true)}>
                <Plus size={18} /> Add Widget
              </button>
              <button className="btn btn-primary" onClick={handleSaveDashboard}>
                <Save size={18} /> Save
              </button>
              <button className="btn btn-danger" onClick={handleDeleteDashboard} disabled={activeDashboard === 'default'}>
                <Trash2 size={18} />
              </button>
            </>
          ) : (
            <button className="btn btn-secondary" onClick={() => setEditMode(true)}>
              <Edit3 size={18} /> Customize
            </button>
          )}
          <button className="btn btn-secondary" onClick={handleCreateDashboard}>
            <Plus size={18} /> New Dashboard
          </button>
        </div>
      </div>

      {editMode && (
        <div className="dashboard-name-edit">
          <input
            type="text"
            value={dashboardName}
            onChange={(e) => setDashboardName(e.target.value)}
            placeholder="Dashboard name"
          />
        </div>
      )}

      <div
        className={`dashboard-grid ${editMode ? 'edit-mode' : ''}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => handleDrop(e)}
      >
        {currentWidgets.map((widget) => (
          <div
            key={widget.id}
            className="dashboard-widget"
            style={{
              gridColumn: `${widget.x + 1} / span ${widget.w}`,
              gridRow: `${widget.y + 1} / span ${widget.h}`
            }}
            draggable={editMode}
            onDragStart={(e) => e.dataTransfer.setData('widgetId', widget.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleDrop(e as any, widget.id)}
          >
            <div className="dashboard-widget-header">
              <span className="dashboard-widget-title">
                {editMode && <GripVertical size={14} className="drag-handle" />}
                {getWidgetTitle(widget.type)}
              </span>
              {editMode && (
                <button
                  className="btn-icon widget-remove"
                  onClick={() => handleRemoveWidget(widget.id)}
                >
                  <X size={14} />
                </button>
              )}
            </div>
            {renderWidget(widget)}
          </div>
        ))}
        
        {currentWidgets.length === 0 && !editMode && (
          <div className="empty-state" style={{ gridColumn: '1 / -1' }}>
            <Layers size={48} />
            <h3>No widgets</h3>
            <p>Click "Customize" to add widgets to your dashboard</p>
          </div>
        )}
      </div>

      {/* Widget Picker Modal */}
      {showWidgetPicker && (
        <div className="modal-overlay" onClick={() => setShowWidgetPicker(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add Widget</h3>
              <button className="btn-icon" onClick={() => setShowWidgetPicker(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="widget-picker-grid">
              {WIDGET_TYPES.map((widget) => (
                <div
                  key={widget.type}
                  className="widget-picker-item"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('widgetType', widget.type);
                  }}
                  onClick={() => {
                    const newWidget: Widget = {
                      id: `w${Date.now()}`,
                      type: widget.type,
                      x: 0,
                      y: currentWidgets.length * 2,
                      w: widget.defaultW,
                      h: widget.defaultH
                    };
                    setCurrentWidgets(prev => [...prev, newWidget]);
                    setShowWidgetPicker(false);
                  }}
                >
                  <widget.icon size={24} />
                  <span>{widget.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}