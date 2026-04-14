import { useMemo, useState, type CSSProperties } from 'react';
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

function getDrawerThemeVars(): Record<string, string> {
  const themeMode =
    typeof document !== 'undefined'
      ? (
          document.body.dataset.theme ||
          document.documentElement.dataset.theme ||
          window.localStorage.getItem('detroit-axle-theme-mode') ||
          window.sessionStorage.getItem('detroit-axle-theme-mode') ||
          window.localStorage.getItem('detroit-axle-theme') ||
          window.sessionStorage.getItem('detroit-axle-theme') ||
          ''
        ).toLowerCase()
      : '';

  const isLight = themeMode === 'light' || themeMode === 'white';
  const isCompact = typeof window !== 'undefined' ? window.innerWidth < 900 : false;
  const topOffset = isCompact ? 0 : 224;

  return {
    '--md-overlay': isLight ? 'rgba(15,23,42,0.16)' : 'rgba(2,6,23,0.56)',
    '--md-bg': isLight
      ? 'linear-gradient(180deg, rgba(255,255,255,0.995) 0%, rgba(247,250,255,0.985) 100%)'
      : 'linear-gradient(180deg, rgba(7,17,31,0.98) 0%, rgba(11,19,36,0.96) 100%)',
    '--md-border': isLight ? 'rgba(203,213,225,0.92)' : 'rgba(148,163,184,0.16)',
    '--md-text': isLight ? '#334155' : '#e5eefb',
    '--md-title': isLight ? '#0f172a' : '#f8fafc',
    '--md-muted': isLight ? '#64748b' : '#94a3b8',
    '--md-field-bg': isLight
      ? 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(250,252,255,0.98) 100%)'
      : 'rgba(15,23,42,0.78)',
    '--md-field-border': isLight ? 'rgba(203,213,225,0.92)' : 'rgba(148,163,184,0.18)',
    '--md-pill-bg': isLight ? 'rgba(37,99,235,0.10)' : 'rgba(37,99,235,0.18)',
    '--md-pill-border': isLight ? 'rgba(59,130,246,0.24)' : 'rgba(96,165,250,0.20)',
    '--md-item-bg': isLight
      ? 'linear-gradient(180deg, rgba(255,255,255,0.99) 0%, rgba(245,248,253,0.98) 100%)'
      : 'linear-gradient(180deg, rgba(15,23,42,0.82) 0%, rgba(15,23,42,0.66) 100%)',
    '--md-empty-bg': isLight ? 'rgba(241,245,249,0.98)' : 'rgba(15,23,42,0.52)',
    '--md-shadow': isLight ? '-20px 0 48px rgba(15,23,42,0.14)' : '-20px 0 48px rgba(2,6,23,0.42)',
    '--md-top': `${topOffset}px`,
    '--md-height': isCompact ? '100vh' : `calc(100vh - ${topOffset}px)`,
    '--md-radius': isCompact ? '0px' : '28px 0 0 28px',
  };
}

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
  const themeVars = getDrawerThemeVars();

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
      <div style={{ ...overlayStyle, ...(themeVars as CSSProperties) }} onClick={onClose} />
      <aside style={{ ...drawerStyle, ...(themeVars as CSSProperties) }}>
        <div style={headerStyle}>
          <div>
            <div style={eyebrowStyle}>Monitoring</div>
            <h3 style={titleStyle}>
              {mode === 'agent' ? 'My Monitoring Items' : 'Team Monitoring'}
            </h3>
          </div>
          <button
            type="button"
            aria-label="Close monitoring"
            onClick={onClose}
            style={closeButtonStyle}
          >
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

        {errorMessage ? <div style={errorBannerStyle}>{errorMessage}</div> : null}

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
                        ? ` • ${new Date(item.acknowledged_at).toLocaleString()}`
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
  inset: 'var(--md-top, 146px) 0 0 0',
  background: 'var(--md-overlay, rgba(2,6,23,0.56))',
  zIndex: 70,
};

const drawerStyle = {
  position: 'fixed' as const,
  top: 'var(--md-top, 146px)',
  right: 0,
  width: '420px',
  maxWidth: '100vw',
  height: 'var(--md-height, calc(100vh - 146px))',
  zIndex: 71,
  background: 'var(--md-bg, linear-gradient(180deg, rgba(7,17,31,0.98) 0%, rgba(11,19,36,0.96) 100%))',
  borderLeft: '1px solid var(--md-border, rgba(148,163,184,0.16))',
  borderTop: '1px solid var(--md-border, rgba(148,163,184,0.16))',
  borderTopLeftRadius: 'var(--md-radius, 28px 0 0 28px)',
  boxShadow: 'var(--md-shadow, -16px 0 40px rgba(2,6,23,0.42))',
  padding: '22px',
  overflowY: 'auto' as const,
  color: 'var(--md-text, #e5eefb)',
};

const headerStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: '12px',
  marginBottom: '18px',
};

const titleStyle = {
  margin: 0,
  color: 'var(--md-title, #0f172a)',
  fontSize: '20px',
  fontWeight: 800,
};

const eyebrowStyle = {
  color: 'var(--md-muted, #64748b)',
  fontSize: '12px',
  fontWeight: 800,
  letterSpacing: '0.16em',
  textTransform: 'uppercase' as const,
  marginBottom: '10px',
};

const closeButtonStyle = {
  width: '48px',
  height: '48px',
  borderRadius: '999px',
  border: '1px solid var(--md-border, rgba(203,213,225,0.92))',
  background: 'rgba(255,255,255,0.98)',
  color: '#0f172a',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '22px',
  fontWeight: 900,
  lineHeight: 1,
  boxShadow: '0 12px 28px rgba(15,23,42,0.14)',
};

const filterWrapStyle = {
  display: 'grid',
  gap: '8px',
  marginBottom: '16px',
};

const labelStyle = {
  color: 'var(--md-muted, #64748b)',
  fontWeight: 700,
  fontSize: '13px',
};

const fieldStyle = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: '12px',
  border: '1px solid var(--md-field-border, rgba(203,213,225,0.92))',
  background: 'var(--md-field-bg, rgba(255,255,255,0.98))',
  color: 'var(--md-text, #334155)',
};

const errorBannerStyle = {
  marginBottom: '14px',
  padding: '12px 14px',
  borderRadius: '12px',
  border: '1px solid rgba(248, 113, 113, 0.22)',
  background: 'rgba(127, 29, 29, 0.12)',
  color: '#b91c1c',
};

const countPillStyle = {
  display: 'inline-flex',
  padding: '8px 12px',
  borderRadius: '999px',
  background: 'var(--md-pill-bg, rgba(37,99,235,0.18))',
  border: '1px solid var(--md-pill-border, rgba(96,165,250,0.2))',
  color: '#93c5fd',
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
  border: '1px dashed var(--md-border, rgba(203,213,225,0.92))',
  backgroundColor: 'var(--md-empty-bg, rgba(241,245,249,0.98))',
  color: 'var(--md-muted, #64748b)',
  textAlign: 'center' as const,
};

const itemCardStyle = {
  padding: '18px',
  borderRadius: '18px',
  border: '1px solid var(--md-border, rgba(203,213,225,0.92))',
  background: 'var(--md-item-bg, #ffffff)',
  boxShadow: '0 14px 30px rgba(15,23,42,0.08)',
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
  color: 'var(--md-title, #0f172a)',
  fontSize: '16px',
};

const statusPillStyle = {
  padding: '6px 10px',
  borderRadius: '999px',
  background: 'var(--md-pill-bg, rgba(37,99,235,0.18))',
  color: '#2563eb',
  fontSize: '11px',
  fontWeight: 800,
};

const commentStyle = {
  color: 'var(--md-text, #334155)',
  lineHeight: 1.55,
  marginBottom: '12px',
};

const metaTextStyle = {
  color: 'var(--md-muted, #64748b)',
  fontSize: '13px',
  marginBottom: '10px',
};

const metaGridStyle = {
  display: 'grid',
  gap: '8px',
  color: 'var(--md-muted, #64748b)',
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
  background: 'rgba(22,101,52,0.12)',
  border: '1px solid rgba(74,222,128,0.2)',
  color: '#166534',
  fontSize: '12px',
  fontWeight: 800,
};

export default MonitoringDrawer;
