import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Plus, Trash2, RefreshCw, Search, AlertTriangle } from 'lucide-react';
import { useApi } from '../hooks/useApi';

interface LogEntry {
  timestamp: string | null;
  message: string;
  matched: boolean;
}

interface LogData {
  entries: LogEntry[];
  new_entries: number;
  matches: number;
  error: string | null;
}

interface LogConfig {
  name: string;
  file_path: string;
  pattern: string;
  tail: boolean;
  enabled: boolean;
}

export default function Logs() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { get, post, del } = useApi();
  const [logs, setLogs] = useState<{ [name: string]: LogData }>({});
  const [selectedLog, setSelectedLog] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [filter, setFilter] = useState('');
  const [showOnlyMatches, setShowOnlyMatches] = useState(false);

  useEffect(() => {
    if (!id) return;
    loadLogs();
    const interval = setInterval(loadLogs, 3000);
    return () => clearInterval(interval);
  }, [id]);

  async function loadLogs() {
    if (!id) return;
    const data = await get<{ logs: { [name: string]: LogData } }>(`/servers/${id}/logs`);
    if (data?.logs) {
      setLogs(data.logs);
      if (!selectedLog && Object.keys(data.logs).length > 0) {
        setSelectedLog(Object.keys(data.logs)[0]);
      }
    }
    setLoading(false);
  }

  const handleAddLog = async (config: LogConfig) => {
    if (!id) return;
    await post(`/servers/${id}/logs`, config);
    setShowAddModal(false);
    setTimeout(loadLogs, 1000);
  };

  const handleRemoveLog = async (name: string) => {
    if (!id || !confirm(`Remove log monitor "${name}"?`)) return;
    await del(`/servers/${id}/logs/${name}`);
    if (selectedLog === name) {
      setSelectedLog(null);
    }
    setTimeout(loadLogs, 1000);
  };

  const filteredEntries = selectedLog && logs[selectedLog] 
    ? logs[selectedLog].entries.filter(entry => {
        if (showOnlyMatches && !entry.matched) return false;
        if (filter && !entry.message.toLowerCase().includes(filter.toLowerCase())) return false;
        return true;
      })
    : [];

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div>
      <button className="back-btn" onClick={() => navigate(`/server/${id}`)}>
        <ArrowLeft size={18} />
        Back to Server
      </button>

      <div className="page-header">
        <div>
          <h2>
            <FileText size={24} />
            Log Monitor
          </h2>
          <p>Monitor and analyze log files on this server</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
          <Plus size={16} />
          Add Log File
        </button>
      </div>

      {/* Log Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {Object.keys(logs).map(logName => {
          const logData = logs[logName];
          const hasError = logData.error;
          const hasMatches = logData.matches > 0;
          
          return (
            <button
              key={logName}
              className={`btn ${selectedLog === logName ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setSelectedLog(logName)}
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <FileText size={14} />
              {logName}
              {hasError && <AlertTriangle size={14} className="text-red-500" />}
              {hasMatches && !hasError && (
                <span className="badge warning" style={{ fontSize: '10px' }}>{logData.matches}</span>
              )}
              <button
                className="btn-icon"
                onClick={(e) => { e.stopPropagation(); handleRemoveLog(logName); }}
                style={{ marginLeft: '4px', padding: '2px' }}
              >
                <Trash2 size={12} />
              </button>
            </button>
          );
        })}
        
        {Object.keys(logs).length === 0 && (
          <div style={{ color: 'var(--text-muted)', padding: '12px' }}>
            No log files configured. Click "Add Log File" to start monitoring.
          </div>
        )}
      </div>

      {/* Log Viewer */}
      {selectedLog && logs[selectedLog] && (
        <div className="card">
          <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span>{selectedLog}</span>
              <span className="mono" style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '12px' }}>
                {logs[selectedLog].entries.length} entries
              </span>
              {logs[selectedLog].error && (
                <span className="badge danger" style={{ marginLeft: '8px' }}>Error</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Filter logs..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                style={{ width: '200px' }}
              />
              <label className="toggle" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                <input
                  type="checkbox"
                  checked={showOnlyMatches}
                  onChange={(e) => setShowOnlyMatches(e.target.checked)}
                />
                <Search size={14} />
                Matches only
              </label>
              <button className="btn btn-secondary btn-sm" onClick={loadLogs}>
                <RefreshCw size={14} />
              </button>
            </div>
          </div>

          {logs[selectedLog].error ? (
            <div style={{ padding: '20px', color: 'var(--accent-red)', textAlign: 'center' }}>
              <AlertTriangle size={24} />
              <div style={{ marginTop: '8px' }}>{logs[selectedLog].error}</div>
            </div>
          ) : (
            <div className="log-viewer">
              {filteredEntries.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  {filter || showOnlyMatches ? 'No matching entries found' : 'No log entries yet'}
                </div>
              ) : (
                <table className="log-table">
                  <thead>
                    <tr>
                      <th style={{ width: '180px' }}>Timestamp</th>
                      <th>Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEntries.slice(-100).map((entry, idx) => (
                      <tr key={idx} className={entry.matched ? 'log-matched' : ''}>
                        <td className="mono" style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                          {entry.timestamp || '-'}
                        </td>
                        <td className="mono" style={{ fontSize: '12px', wordBreak: 'break-all' }}>
                          {entry.matched && <span className="badge success" style={{ marginRight: '8px', fontSize: '10px' }}>MATCH</span>}
                          {entry.message}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}

      {/* Add Log Modal */}
      {showAddModal && (
        <AddLogModal
          onClose={() => setShowAddModal(false)}
          onAdd={handleAddLog}
        />
      )}
    </div>
  );
}

function AddLogModal({ onClose, onAdd }: { onClose: () => void; onAdd: (config: LogConfig) => void }) {
  const [name, setName] = useState('');
  const [filePath, setFilePath] = useState('/var/log/syslog');
  const [pattern, setPattern] = useState('.*');
  const [tail, setTail] = useState(true);
  const [maxEntries, setMaxEntries] = useState(100);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAdd({ name, file_path: filePath, pattern, tail, enabled: true });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Add Log File Monitor</h3>
          <button className="btn-icon" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Monitor Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g., System Logs"
              required
            />
          </div>
          <div className="form-group">
            <label>Log File Path</label>
            <input
              type="text"
              value={filePath}
              onChange={e => setFilePath(e.target.value)}
              placeholder="/var/log/syslog"
              required
            />
          </div>
          <div className="form-group">
            <label>Regex Pattern (to match)</label>
            <input
              type="text"
              value={pattern}
              onChange={e => setPattern(e.target.value)}
              placeholder=".*"
            />
            <small style={{ color: 'var(--text-muted)' }}>Use regex to filter specific lines</small>
          </div>
          <div className="form-group">
            <label>Start Reading From</label>
            <select value={tail ? 'tail' : 'start'} onChange={e => setTail(e.target.value === 'tail')}>
              <option value="tail">End of file (tail)</option>
              <option value="start">Beginning of file</option>
            </select>
          </div>
          <div className="form-group">
            <label>Max Entries</label>
            <input
              type="number"
              value={maxEntries}
              onChange={e => setMaxEntries(Number(e.target.value))}
              min={10}
              max={1000}
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">Add Monitor</button>
          </div>
        </form>
      </div>
    </div>
  );
}