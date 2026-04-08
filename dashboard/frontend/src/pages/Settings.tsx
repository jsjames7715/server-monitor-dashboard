import { useState } from 'react';
import { 
  Settings as SettingsIcon, Clock, Bell, Palette, Globe, 
  Server, RefreshCw, Save, Info, Monitor, Cpu, HardDrive
} from 'lucide-react';
import { useSettings } from '../hooks/useSettings';

const sections = [
  { id: 'general', label: 'General', icon: SettingsIcon },
  { id: 'display', label: 'Display', icon: Palette },
  { id: 'monitoring', label: 'Monitoring', icon: Monitor },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'about', label: 'About', icon: Info },
];

export default function Settings() {
  const { settings, updateSetting, resetSettings } = useSettings();
  const [saved, setSaved] = useState(false);
  const [activeSection, setActiveSection] = useState('general');

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    resetSettings();
  };

  return (
    <div className="settings-page">
      <div className="page-header">
        <h2>
          <SettingsIcon size={24} />
          Settings
        </h2>
      </div>

      <div className="settings-container">
        <div className="settings-sidebar">
          {sections.map(section => (
            <button
              key={section.id}
              className={`settings-nav-item ${activeSection === section.id ? 'active' : ''}`}
              onClick={() => setActiveSection(section.id)}
            >
              <section.icon size={18} />
              <span>{section.label}</span>
            </button>
          ))}
        </div>

        <div className="settings-content">
          {activeSection === 'general' && (
            <div className="settings-section">
              <h3>General Settings</h3>
              
              <div className="setting-item">
                <div className="setting-label">
                  <Clock size={18} />
                  <div>
                    <div className="setting-title">Auto Refresh Interval</div>
                    <div className="setting-desc">How often to refresh server data</div>
                  </div>
                </div>
                <div className="setting-control">
                  <select
                    value={settings.refreshInterval}
                    onChange={e => updateSetting('refreshInterval', Number(e.target.value))}
                  >
                    <option value={1}>1 second</option>
                    <option value={2}>2 seconds</option>
                    <option value={3}>3 seconds</option>
                    <option value={5}>5 seconds</option>
                    <option value={10}>10 seconds</option>
                    <option value={30}>30 seconds</option>
                  </select>
                </div>
              </div>

              <div className="setting-item">
                <div className="setting-label">
                  <HardDrive size={18} />
                  <div>
                    <div className="setting-title">Metrics History Limit</div>
                    <div className="setting-desc">Maximum data points to keep in memory</div>
                  </div>
                </div>
                <div className="setting-control">
                  <select
                    value={settings.metricsHistoryLimit}
                    onChange={e => updateSetting('metricsHistoryLimit', Number(e.target.value))}
                  >
                    <option value={50}>50 points</option>
                    <option value={100}>100 points</option>
                    <option value={200}>200 points</option>
                    <option value={500}>500 points</option>
                  </select>
                </div>
              </div>

              <div className="setting-item">
                <div className="setting-label">
                  <Globe size={18} />
                  <div>
                    <div className="setting-title">Temperature Unit</div>
                    <div className="setting-desc">Display temperatures in</div>
                  </div>
                </div>
                <div className="setting-control">
                  <select
                    value={settings.temperatureUnit}
                    onChange={e => updateSetting('temperatureUnit', e.target.value as 'celsius' | 'fahrenheit')}
                  >
                    <option value="celsius">Celsius (°C)</option>
                    <option value="fahrenheit">Fahrenheit (°F)</option>
                  </select>
                </div>
              </div>

              <div className="setting-item">
                <div className="setting-label">
                  <RefreshCw size={18} />
                  <div>
                    <div className="setting-title">Auto Reconnect</div>
                    <div className="setting-desc">Automatically reconnect to servers on disconnect</div>
                  </div>
                </div>
                <div className="setting-control">
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={settings.autoReconnect}
                      onChange={e => updateSetting('autoReconnect', e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'display' && (
            <div className="settings-section">
              <h3>Display Settings</h3>

              <div className="setting-item">
                <div className="setting-label">
                  <Palette size={18} />
                  <div>
                    <div className="setting-title">Dark Mode</div>
                    <div className="setting-desc">Use dark theme for the dashboard</div>
                  </div>
                </div>
                <div className="setting-control">
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={settings.darkMode}
                      onChange={e => updateSetting('darkMode', e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              </div>

              <div className="setting-item">
                <div className="setting-label">
                  <Palette size={18} />
                  <div>
                    <div className="setting-title">Compact Mode</div>
                    <div className="setting-desc">Show more data in less space</div>
                  </div>
                </div>
                <div className="setting-control">
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={settings.compactMode}
                      onChange={e => updateSetting('compactMode', e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              </div>

              <div className="setting-item">
                <div className="setting-label">
                  <Palette size={18} />
                  <div>
                    <div className="setting-title">Smooth Charts</div>
                    <div className="setting-desc">Enable chart animations</div>
                  </div>
                </div>
                <div className="setting-control">
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={settings.chartSmooth}
                      onChange={e => updateSetting('chartSmooth', e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'monitoring' && (
            <div className="settings-section">
              <h3>Monitoring Settings</h3>

              <div className="setting-item">
                <div className="setting-label">
                  <Cpu size={18} />
                  <div>
                    <div className="setting-title">Show GPU Stats</div>
                    <div className="setting-desc">Display GPU utilization and metrics</div>
                  </div>
                </div>
                <div className="setting-control">
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={settings.showGpuStats}
                      onChange={e => updateSetting('showGpuStats', e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              </div>

              <div className="setting-item">
                <div className="setting-label">
                  <Server size={18} />
                  <div>
                    <div className="setting-title">Show Network Stats</div>
                    <div className="setting-desc">Display network bandwidth usage</div>
                  </div>
                </div>
                <div className="setting-control">
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={settings.showNetworkStats}
                      onChange={e => updateSetting('showNetworkStats', e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'notifications' && (
            <div className="settings-section">
              <h3>Notification Settings</h3>

              <div className="setting-item">
                <div className="setting-label">
                  <Bell size={18} />
                  <div>
                    <div className="setting-title">System Notifications</div>
                    <div className="setting-desc">Show browser notifications for events</div>
                  </div>
                </div>
                <div className="setting-control">
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={settings.showSystemNotifications}
                      onChange={e => updateSetting('showSystemNotifications', e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'about' && (
            <div className="settings-section">
              <h3>About</h3>
              
              <div className="about-card">
                <div className="about-logo">
                  <Monitor size={48} />
                </div>
                <h2>Server Monitor Dashboard</h2>
                <p className="version">Version 1.0.0</p>
                <p className="about-desc">
                  A cross-platform server monitoring solution with real-time metrics, 
                  remote commands, and process management.
                </p>
                
                <div className="about-features">
                  <div className="feature-item">
                    <Cpu size={16} />
                    <span>CPU, Memory, Disk Monitoring</span>
                  </div>
                  <div className="feature-item">
                    <Globe size={16} />
                    <span>Network Bandwidth Tracking</span>
                  </div>
                  <div className="feature-item">
                    <Server size={16} />
                    <span>GPU & Temperature Sensors</span>
                  </div>
                  <div className="feature-item">
                    <RefreshCw size={16} />
                    <span>Real-time & Polling Modes</span>
                  </div>
                </div>
                
                <div className="about-tech">
                  <span className="tech-badge">React</span>
                  <span className="tech-badge">FastAPI</span>
                  <span className="tech-badge">Python</span>
                  <span className="tech-badge">WebSocket</span>
                </div>
              </div>
            </div>
          )}

          <div className="settings-actions">
            <button className="btn btn-secondary" onClick={handleReset}>
              Reset to Defaults
            </button>
            <button className={`btn btn-primary ${saved ? 'btn-success' : ''}`} onClick={handleSave}>
              <Save size={16} />
              {saved ? 'Saved!' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}