import { useState, useEffect } from 'react';
import { Activity as ActivityIcon, Server, Clock, AlertCircle, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { useSettings } from '../hooks/useSettings';

interface ActivityEvent {
  id: string;
  server_id: string;
  hostname: string;
  type: 'connect' | 'disconnect' | 'metrics' | 'command' | 'error';
  message: string;
  timestamp: string;
}

export default function Activity() {
  const { get } = useApi();
  const { settings } = useSettings();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    async function loadActivity() {
      const servers = await get<any[]>('/servers');
      
      if (servers) {
        // Generate activity from server states
        const newEvents: ActivityEvent[] = [];
        
        servers.forEach(server => {
          const lastSeen = new Date(server.last_seen);
          const now = new Date();
          const secondsAgo = Math.floor((now.getTime() - lastSeen.getTime()) / 1000);
          
          // Connection event
          newEvents.push({
            id: `${server.server_id}-connect`,
            server_id: server.server_id,
            hostname: server.hostname,
            type: server.status === 'online' ? 'connect' : 'disconnect',
            message: server.status === 'online' 
              ? 'Server connected' 
              : `Server went offline (${secondsAgo}s ago)`,
            timestamp: server.last_seen
          });
          
          // If has metrics, add metrics event
          if (server.current_metrics) {
            newEvents.push({
              id: `${server.server_id}-metrics`,
              server_id: server.server_id,
              hostname: server.hostname,
              type: 'metrics',
              message: `Metrics updated - CPU: ${server.current_metrics.cpu?.total?.toFixed(1)}%, Memory: ${server.current_metrics.memory?.percent?.toFixed(1)}%`,
              timestamp: server.last_seen
            });
          }
        });
        
        // Sort by timestamp descending
        newEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setEvents(newEvents);
      }
      
      setLoading(false);
    }
    
    loadActivity();
    
    const interval = setInterval(loadActivity, settings.refreshInterval * 1000);
    return () => clearInterval(interval);
  }, [get, settings.refreshInterval]);

  const filteredEvents = filter === 'all' 
    ? events 
    : events.filter(e => e.type === filter);

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'connect':
        return <CheckCircle size={16} className="event-icon connect" />;
      case 'disconnect':
        return <XCircle size={16} className="event-icon disconnect" />;
      case 'metrics':
        return <RefreshCw size={16} className="event-icon metrics" />;
      case 'command':
        return <Server size={16} className="event-icon command" />;
      case 'error':
        return <AlertCircle size={16} className="event-icon error" />;
      default:
        return <ActivityIcon size={16} className="event-icon" />;
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    const today = new Date();
    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    }
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="activity-page">
      <div className="page-header">
        <h2>
          <ActivityIcon size={24} />
          Activity
        </h2>
        <p>Real-time server activity and events</p>
      </div>

      <div className="activity-filters">
        <button 
          className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All Events
        </button>
        <button 
          className={`filter-btn ${filter === 'connect' ? 'active' : ''}`}
          onClick={() => setFilter('connect')}
        >
          <CheckCircle size={14} /> Connections
        </button>
        <button 
          className={`filter-btn ${filter === 'disconnect' ? 'active' : ''}`}
          onClick={() => setFilter('disconnect')}
        >
          <XCircle size={14} /> Disconnections
        </button>
        <button 
          className={`filter-btn ${filter === 'metrics' ? 'active' : ''}`}
          onClick={() => setFilter('metrics')}
        >
          <RefreshCw size={14} /> Metrics
        </button>
      </div>

      {filteredEvents.length === 0 ? (
        <div className="empty-state">
          <ActivityIcon size={48} strokeWidth={1} />
          <h3>No Activity Yet</h3>
          <p>Server events will appear here when agents connect</p>
        </div>
      ) : (
        <div className="activity-list">
          {filteredEvents.map(event => (
            <div key={event.id} className={`activity-item ${event.type}`}>
              <div className="activity-icon">
                {getEventIcon(event.type)}
              </div>
              <div className="activity-content">
                <div className="activity-header">
                  <span className="activity-hostname">{event.hostname}</span>
                  <span className="activity-server-id">{event.server_id}</span>
                </div>
                <div className="activity-message">{event.message}</div>
                <div className="activity-time">
                  <Clock size={12} />
                  <span>{formatDate(event.timestamp)} at {formatTime(event.timestamp)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}