import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileStack, Trash2, Copy, X, Check, Layers } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { Server as ServerType } from '../types';

interface TemplateVariable {
  name: string;
  label: string;
  type: string;
}

interface Template {
  id: string;
  name: string;
  description: string;
  variables: TemplateVariable[];
  widgets: any[];
}

export default function DashboardTemplates() {
  const navigate = useNavigate();
  const { get, post, del } = useApi();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [servers, setServers] = useState<ServerType[]>([]);
  const [snmpDevices, setSnmpDevices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showApplyModal, setShowApplyModal] = useState<Template | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('server-basic');
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [templatesData, serversData, snmpData] = await Promise.all([
      get<{ templates: Record<string, Template> }>('/dashboard-templates'),
      get<ServerType[]>('/servers'),
      get<{devices: any[]}>('/snmp/devices')
    ]);
    
    if (templatesData?.templates) {
      const templateList: Template[] = [];
      Object.entries(templatesData.templates).forEach(([tid, data]) => {
        const template: Template = {
          id: tid,
          name: data.name || tid,
          description: data.description || '',
          variables: data.variables || [],
          widgets: data.widgets || []
        };
        templateList.push(template);
      });
      setTemplates(templateList);
    }
    setServers(serversData || []);
    setSnmpDevices(snmpData?.devices || []);
    setLoading(false);
  }

  const handleApplyTemplate = async () => {
    if (!selectedTemplate) return;
    
    const result = await post<{ widgets: any[] }>(`/dashboard-templates/${selectedTemplate}/apply`, variableValues);
    
    if (result?.widgets) {
      // Create a new dashboard from the template
      const template = templates.find(t => t.id === selectedTemplate);
      await post('/dashboards', {
        name: `${template?.name || 'Template'} - ${new Date().toLocaleDateString()}`,
        widgets: result.widgets
      });
      setShowApplyModal(null);
      navigate('/dashboard');
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    // Only allow deleting non-built-in templates
    if (['server-basic', 'server-full', 'network-device'].includes(templateId)) {
      alert('Cannot delete built-in templates');
      return;
    }
    if (!confirm('Delete this template?')) return;
    await del(`/dashboard-templates/${templateId}`);
    loadData();
  };

  const getVariableOptions = (type: string) => {
    if (type === 'server') {
      return servers.map(s => ({ value: s.server_id, label: `${s.hostname} (${s.server_id})` }));
    } else if (type === 'snmp') {
      return snmpDevices.map(d => ({ value: d.device_id, label: `${d.name} (${d.ip})` }));
    }
    return [];
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="templates-page">
      <div className="page-header">
        <div className="page-header-left">
          <h2>
            <FileStack size={28} />
            Dashboard Templates
          </h2>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-primary" onClick={() => setShowApplyModal(templates[0])}>
            <Copy size={18} /> Apply Template
          </button>
        </div>
      </div>

      <div className="templates-description">
        <p>Dashboard templates allow you to create reusable dashboard configurations with variables. 
           Apply a template to generate a dashboard for a specific server or device.</p>
      </div>

      <div className="templates-grid">
        {templates.map(template => (
          <div key={template.id} className="template-card">
            <div className="template-header">
              <div className="template-icon">
                <Layers size={24} />
              </div>
              <div className="template-info">
                <h3>{template.name}</h3>
                <p>{template.description}</p>
              </div>
            </div>
            
            <div className="template-variables">
              <h4>Variables</h4>
              <div className="variables-list">
                {template.variables.map((variable, idx) => (
                  <div key={idx} className="variable-item">
                    <span className="variable-name">{variable.label}</span>
                    <span className="variable-type">{variable.type}</span>
                  </div>
                ))}
                {template.variables.length === 0 && (
                  <span className="no-variables">No variables - static template</span>
                )}
              </div>
            </div>

            <div className="template-widgets">
              <h4>Widgets ({template.widgets.length})</h4>
              <div className="widget-types">
                { [...new Set(template.widgets.map(w => w.type))].map((wtype, idx) => (
                  <span key={idx} className="widget-type-badge">{wtype}</span>
                ))}
              </div>
            </div>

            <div className="template-actions">
              <button 
                className="btn btn-primary"
                onClick={() => {
                  setSelectedTemplate(template.id);
                  // Set default values
                  const defaults: Record<string, string> = {};
                  template.variables.forEach(v => {
                    const options = getVariableOptions(v.type);
                    if (options.length > 0) {
                      defaults[v.name] = options[0].value;
                    }
                  });
                  setVariableValues(defaults);
                  setShowApplyModal(template);
                }}
              >
                <Copy size={16} /> Apply
              </button>
              { !['server-basic', 'server-full', 'network-device'].includes(template.id) && (
                <button 
                  className="btn btn-danger"
                  onClick={() => handleDeleteTemplate(template.id)}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Apply Template Modal */}
      {showApplyModal && (
        <div className="modal-overlay" onClick={() => setShowApplyModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Apply Template: {showApplyModal.name}</h3>
              <button className="btn-icon" onClick={() => setShowApplyModal(null)}>
                <X size={20} />
              </button>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label>Select Template</label>
                <select 
                  value={selectedTemplate}
                  onChange={e => {
                    setSelectedTemplate(e.target.value);
                    const template = templates.find(t => t.id === e.target.value);
                    if (template) {
                      const defaults: Record<string, string> = {};
                      template.variables.forEach(v => {
                        const options = getVariableOptions(v.type);
                        if (options.length > 0) {
                          defaults[v.name] = options[0].value;
                        }
                      });
                      setVariableValues(defaults);
                    }
                  }}
                >
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              {showApplyModal.variables.length > 0 && (
                <div className="variable-inputs">
                  <h4>Configure Variables</h4>
                  {showApplyModal.variables.map((variable, idx) => {
                    const options = getVariableOptions(variable.type);
                    return (
                      <div key={idx} className="form-group">
                        <label>{variable.label}</label>
                        {options.length > 0 ? (
                          <select
                            value={variableValues[variable.name] || ''}
                            onChange={e => setVariableValues({...variableValues, [variable.name]: e.target.value})}
                          >
                            <option value="">Select...</option>
                            {options.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={variableValues[variable.name] || ''}
                            onChange={e => setVariableValues({...variableValues, [variable.name]: e.target.value})}
                            placeholder={`Enter ${variable.label.toLowerCase()}`}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowApplyModal(null)}>
                Cancel
              </button>
              <button 
                className="btn btn-primary" 
                onClick={handleApplyTemplate}
                disabled={showApplyModal.variables.length > 0 && Object.values(variableValues).some(v => !v)}
              >
                <Check size={18} /> Apply & Create Dashboard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}