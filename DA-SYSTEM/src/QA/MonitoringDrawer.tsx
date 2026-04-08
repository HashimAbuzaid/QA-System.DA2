import { useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

type MonitoringItem = {
  id: string;
  order_number: string;
  comment: string;
  agent_id: string;
  agent_name: string;
  display_name: string | null;
  team: 'Calls' | 'Tickets' | 'Sales';
  created_by_name: string;
  created_by_email: string;
  created_at: string;
  status: 'active' | 'resolved';
  acknowledged_by_agent: boolean;
  acknowledged_at: string | null;
  resolved_at: string | null;
  resolved_by_name: string | null;
  resolved_by_email: string | null;
};

type AgentOption = {
  id: string;
  agent_id: string | null;
  agent_name: string;
  display_name: string | null;
};

type MonitoringDrawerProps = {
  open: boolean;
  onClose: () => void;
  items: MonitoringItem[];
  mode: 'agent' | 'supervisor';
  selectedAgentId?: string;
  onSelectAgentId?: (value: string) => void;
  agentOptions?: AgentOption[];
  onItemUpdated?: () => Promise<void> | void;
};

function MonitoringDrawer({
  open,
  onClose,
  items,
  mode,
  selectedAgentId = '',
  onSelectAgentId,
  agentOptions = [],
  onItemUpdated,
}: MonitoringDrawerProps) {
  const [workingId, setWorkingId] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const filteredItems = useMemo(() => {
    if (mode !== 'supervisor' || !selectedAgentId) return items;
    return items.filter((item) => item.agent_id === selectedAgentId);
  }, [items, mode, selectedAgentId]);

  if (!open) return null;

  function getAgentLabel(item: MonitoringItem | AgentOption) {
    if (item.display_name) {
      return `${item.agent_name} - ${item.display_name}`;
    }
    return `${item.agent_name} - ${item.agent_id || '-'}`;
  }

  async function handleAcknowledge(item: MonitoringItem) {
    if (mode !== 'agent' || item.acknowledged_by_agent) return;

    setErrorMessage('');
    setWorkingId(item.id);
    const { error } = await supabase
      .from('monitoring_items')
      .update({
        acknowledged_by_agent: true,
        acknowledged_at: new Date().toISOString(),
      })
      .eq('id', item.id);

    setWorkingId('');

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    await onItemUpdated?.();
  }

  return (
    <>
      <div style={overlayStyle} onClick={onClose} />
      <aside style={drawerStyle}>
        <div style={headerStyle}>
          <div>
            <div style={eyebrowStyle}>Monitoring</div>
            <h3 style={{ margin: 0 }}>
              {mode === 'agent' ? 'My Monitoring Items' : 'Team Monitoring'}
            </h3>
          </div>
          <button type="button" onClick={onClose} style={closeButtonStyle}>
            ✕
          </button>
        </div>

        {mode === 'supervisor' ? (
          <div style={filterWrapStyle}>
            <label style={labelStyle}>Filter by Agent</label>
            <select
              value={selectedAgentId}
              onChange={(e) => onSelectAgentId?.(e.target.value)}
              style={fieldStyle}
            >
              <option value="">All Team Agents</option>
              {agentOptions.map((agent) => (
                <option key={agent.id} value={agent.agent_id || ''}>
                  {getAgentLabel(agent)}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {errorMessage ? (
          <div style={errorBannerStyle}>{errorMessage}</div>
        ) : null}

        <div style={countPillStyle}>
          {filteredItems.length} active monitoring item
          {filteredItems.length === 1 ? '' : 's'}
        </div>

        <div style={listStyle}>
          {filteredItems.length === 0 ? (
            <div style={emptyStateStyle}>No active monitoring items found.</div>
          ) : (
            filteredItems.map((item) => (
              <div key={item.id} style={itemCardStyle}>
                <div style={topRowStyle}>
                  <div style={orderNumberStyle}>Order #{item.order_number}</div>
                  <div style={statusPillStyle}>
                    {item.acknowledged_by_agent ? 'Acknowledged' : 'Active'}
                  </div>
                </div>

                {mode === 'supervisor' ? (
                  <div style={metaTextStyle}>Agent: {getAgentLabel(item)}</div>
                ) : null}

                <div style={commentStyle}>{item.comment}</div>

                <div style={metaGridStyle}>
                  <div>
                    <strong>Created:</strong>{' '}
                    {new Date(item.created_at).toLocaleString()}
                  </div>
                  {mode === 'supervisor' ? (
                    <div>
                      <strong>Acknowledged:</strong>{' '}
                      {item.acknowledged_by_agent
                        ? item.acknowledged_at
                          ? new Date(item.acknowledged_at).toLocaleString()
                          : 'Yes'
                        : 'No'}
                    </div>
                  ) : null}
                </div>

                {mode === 'agent' ? (
                  item.acknowledged_by_agent ? (
                    <div style={acknowledgedPillStyle}>
                      Acknowledged
                      {item.acknowledged_at
                        ? ` • ${new Date(
                            item.acknowledged_at
                          ).toLocaleString()}`
                        : ''}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleAcknowledge(item)}
                      disabled={workingId === item.id}
                      style={acknowledgeButtonStyle}
                    >
                      {workingId === item.id ? 'Saving...' : 'Acknowledge'}
                    </button>
                  )
                ) : null}
              </div>
            ))
          )}
        </div>
      </aside>
    </>
  );
}

const overlayStyle = {
  position: 'fixed' as const,
  inset: 0,
  background: 'rgba(2,6,23,0.56)',
  zIndex: 70,
};

const drawerStyle = {
  position: 'fixed' as const,
  top: 0,
  right: 0,
  width: '420px',
  maxWidth: '100vw',
  height: '100vh',
  zIndex: 71,
  background:
    'linear-gradient(180deg, rgba(7,17,31,0.98) 0%, rgba(11,19,36,0.96) 100%)',
  borderLeft: '1px solid rgba(148,163,184,0.16)',
  boxShadow: '-16px 0 40px rgba(2,6,23,0.42)',
  padding: '22px',
  overflowY: 'auto' as const,
  color: '#e5eefb',
};

const headerStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '12px',
  marginBottom: '18px',
};

const eyebrowStyle = {
  color: '#60a5fa',
  fontSize: '12px',
  fontWeight: 800,
  letterSpacing: '0.16em',
  textTransform: 'uppercase' as const,
  marginBottom: '10px',
};

const closeButtonStyle = {
  width: '40px',
  height: '40px',
  borderRadius: '999px',
  border: '1px solid rgba(148,163,184,0.18)',
  background: 'rgba(15,23,42,0.72)',
  color: '#fff',
  cursor: 'pointer',
};

const filterWrapStyle = {
  display: 'grid',
  gap: '8px',
  marginBottom: '16px',
};

const labelStyle = {
  color: '#cbd5e1',
  fontWeight: 700,
  fontSize: '13px',
};

const fieldStyle = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: '12px',
  border: '1px solid rgba(148,163,184,0.16)',
  background: 'rgba(15,23,42,0.7)',
  color: '#e5eefb',
};

const errorBannerStyle = {
  marginBottom: '14px',
  padding: '12px 14px',
  borderRadius: '12px',
  border: '1px solid rgba(248, 113, 113, 0.22)',
  background: 'rgba(127, 29, 29, 0.24)',
  color: '#fecaca',
};

const countPillStyle = {
  display: 'inline-flex',
  padding: '8px 12px',
  borderRadius: '999px',
  background: 'rgba(37,99,235,0.16)',
  border: '1px solid rgba(96,165,250,0.2)',
  color: '#bfdbfe',
  fontSize: '12px',
  fontWeight: 800,
  marginBottom: '16px',
};

const listStyle = {
  display: 'grid',
  gap: '14px',
};

const emptyStateStyle = {
  padding: '18px',
  borderRadius: '16px',
  border: '1px dashed rgba(148,163,184,0.24)',
  backgroundColor: 'rgba(15,23,42,0.52)',
  color: '#94a3b8',
  textAlign: 'center' as const,
};

const itemCardStyle = {
  padding: '18px',
  borderRadius: '18px',
  border: '1px solid rgba(148,163,184,0.14)',
  background:
    'linear-gradient(180deg, rgba(15,23,42,0.82) 0%, rgba(15,23,42,0.66) 100%)',
};

const topRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '10px',
  alignItems: 'center',
  marginBottom: '10px',
};

const orderNumberStyle = {
  fontWeight: 800,
  color: '#f8fafc',
  fontSize: '16px',
};

const statusPillStyle = {
  padding: '6px 10px',
  borderRadius: '999px',
  background: 'rgba(37,99,235,0.18)',
  color: '#bfdbfe',
  fontSize: '11px',
  fontWeight: 800,
};

const commentStyle = {
  color: '#e2e8f0',
  lineHeight: 1.55,
  marginBottom: '12px',
};

const metaTextStyle = {
  color: '#94a3b8',
  fontSize: '13px',
  marginBottom: '10px',
};

const metaGridStyle = {
  display: 'grid',
  gap: '8px',
  color: '#cbd5e1',
  fontSize: '13px',
  marginBottom: '12px',
};

const acknowledgeButtonStyle = {
  padding: '12px 14px',
  borderRadius: '12px',
  border: '1px solid rgba(96,165,250,0.24)',
  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
  color: '#fff',
  fontWeight: 800,
  cursor: 'pointer',
};

const acknowledgedPillStyle = {
  display: 'inline-flex',
  padding: '8px 12px',
  borderRadius: '999px',
  background: 'rgba(22,101,52,0.18)',
  border: '1px solid rgba(74,222,128,0.2)',
  color: '#bbf7d0',
  fontSize: '12px',
  fontWeight: 800,
};

export default MonitoringDrawer;
