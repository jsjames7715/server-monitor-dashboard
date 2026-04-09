import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Tag, Plus, Trash2, X, Check } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { Server } from '../types';

interface TagsData {
  [tagName: string]: string[];
}

export default function Tags() {
  const navigate = useNavigate();
  const { get, post, del } = useApi();
  const [servers, setServers] = useState<Server[]>([]);
  const [tags, setTags] = useState<TagsData>({});
  const [newTagName, setNewTagName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      const [serversData, tagsData] = await Promise.all([
        get<Server[]>('/servers'),
        get<TagsData>('/tags')
      ]);
      
      setServers(serversData || []);
      setTags(tagsData || {});
      
      setLoading(false);
    }
    
    loadData();
  }, [get]);

  const createTag = async () => {
    if (!newTagName.trim()) return;
    await post('/tags', { name: newTagName.trim() });
    setTags(prev => ({ ...prev, [newTagName.trim()]: [] }));
    setNewTagName('');
  };

  const deleteTag = async (tagName: string) => {
    if (!confirm(`Delete tag "${tagName}"?`)) return;
    await del(`/tags/${tagName}`);
    setTags(prev => {
      const newTags = { ...prev };
      delete newTags[tagName];
      return newTags;
    });
  };

  const toggleServerInTag = async (tagName: string, serverId: string) => {
    const isInTag = tags[tagName]?.includes(serverId);
    
    if (isInTag) {
      await del(`/tags/${tagName}/${serverId}`);
      setTags(prev => ({
        ...prev,
        [tagName]: prev[tagName].filter(id => id !== serverId)
      }));
    } else {
      await post(`/tags/${tagName}/${serverId}`);
      setTags(prev => ({
        ...prev,
        [tagName]: [...(prev[tagName] || []), serverId]
      }));
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
      <button className="back-btn" onClick={() => navigate('/')}>
        <ArrowLeft size={18} />
        Back to Dashboard
      </button>

      <div className="page-header">
        <div>
          <h2>
            <Tag size={24} />
            Server Groups
          </h2>
          <p>Organize servers into groups for easier management</p>
        </div>
      </div>

      {/* Create New Tag */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="card-title">Create New Group</div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <input
            type="text"
            placeholder="Enter group name..."
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createTag()}
            style={{ flex: 1 }}
          />
          <button className="btn btn-primary" onClick={createTag} disabled={!newTagName.trim()}>
            <Plus size={16} />
            Create Group
          </button>
        </div>
      </div>

      {/* Existing Tags */}
      <div style={{ display: 'grid', gap: '16px' }}>
        {Object.keys(tags).length === 0 ? (
          <div className="empty-state">
            <Tag size={48} strokeWidth={1} />
            <h3>No Groups Created</h3>
            <p>Create a group above to organize your servers</p>
          </div>
        ) : (
          Object.entries(tags).map(([tagName, serverIds]) => (
            <div key={tagName} className="card">
              <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Tag size={18} />
                  {tagName}
                  <span className="badge" style={{ marginLeft: '8px' }}>
                    {serverIds.length} server{serverIds.length !== 1 ? 's' : ''}
                  </span>
                </span>
                <button 
                  className="btn btn-sm btn-danger"
                  onClick={() => deleteTag(tagName)}
                >
                  <Trash2 size={14} />
                  Delete
                </button>
              </div>
              
              <div style={{ marginTop: '16px' }}>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                  Assign servers to this group:
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {servers.map(server => {
                    const isAssigned = serverIds.includes(server.server_id);
                    return (
                      <button
                        key={server.server_id}
                        className={`btn btn-sm ${isAssigned ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => toggleServerInTag(tagName, server.server_id)}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        {isAssigned ? <Check size={14} /> : <X size={14} />}
                        {server.hostname}
                        <span className={`badge ${server.status}`} style={{ fontSize: '10px' }}>
                          {server.status}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Server Quick View by Tag */}
      {Object.keys(tags).length > 0 && (
        <div className="card" style={{ marginTop: '24px' }}>
          <div className="card-title">Servers by Group</div>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '16px' }}>
            {Object.entries(tags).map(([tagName, serverIds]) => {
              if (serverIds.length === 0) return null;
              return (
                <div 
                  key={tagName}
                  style={{ 
                    padding: '12px', 
                    background: 'var(--bg-secondary)', 
                    borderRadius: '8px',
                    minWidth: '200px'
                  }}
                >
                  <div style={{ fontWeight: 500, marginBottom: '8px' }}>
                    <Tag size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                    {tagName}
                  </div>
                  {serverIds.map(sid => {
                    const server = servers.find(s => s.server_id === sid);
                    return server ? (
                      <div 
                        key={sid}
                        style={{ 
                          fontSize: '13px', 
                          color: 'var(--text-secondary)',
                          padding: '4px 0'
                        }}
                      >
                        {server.hostname}
                      </div>
                    ) : null;
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}