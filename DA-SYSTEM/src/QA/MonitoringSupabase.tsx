import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

type MonitoringStatus = 'active' | 'resolved';

type AgentProfile = {
  id: string;
  role: 'agent';
  agent_id: string | null;
  agent_name: string;
  display_name: string | null;
  team: 'Calls' | 'Tickets' | 'Sales' | null;
};

type CurrentProfile = {
  id: string;
  role: 'admin' | 'qa' | 'agent' | 'supervisor';
  agent_name: string;
  display_name: string | null;
  team: 'Calls' | 'Tickets' | 'Sales' | null;
  email: string;
};

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
  status: MonitoringStatus;
  acknowledged_by_agent: boolean;
  acknowledged_at: string | null;
  resolved_at: string | null;
  resolved_by_name: string | null;
  resolved_by_email: string | null;
};

function MonitoringSupabase() {
  const [currentProfile, setCurrentProfile] = useState<CurrentProfile | null>(
    null
  );
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [items, setItems] = useState<MonitoringItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [workingId, setWorkingId] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const [selectedAgentProfileId, setSelectedAgentProfileId] = useState('');
  const [agentSearch, setAgentSearch] = useState('');
  const [isAgentPickerOpen, setIsAgentPickerOpen] = useState(false);
  const [orderNumber, setOrderNumber] = useState('');
  const [comment, setComment] = useState('');
  const [statusFilter, setStatusFilter] = useState<MonitoringStatus | ''>(
    'active'
  );
  const [teamFilter, setTeamFilter] = useState<
    'Calls' | 'Tickets' | 'Sales' | ''
  >('');
  const [searchText, setSearchText] = useState('');

  const agentPickerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void loadMonitoringPage();
  }, []);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (
        agentPickerRef.current &&
        !agentPickerRef.current.contains(event.target as Node)
      ) {
        setIsAgentPickerOpen(false);
      }
    }

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  async function loadMonitoringPage() {
    setLoading(true);
    setErrorMessage('');

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) {
      setLoading(false);
      setErrorMessage(authError.message);
      return;
    }

    const userId = authData.user?.id;
    if (!userId) {
      setLoading(false);
      setErrorMessage('Could not identify the logged-in user.');
      return;
    }

    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('id, role, agent_name, display_name, team, email')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) {
      setLoading(false);
      setErrorMessage(profileError.message);
      return;
    }

    const loadedProfile = (profileData as CurrentProfile) || null;
    setCurrentProfile(loadedProfile);

    const [profilesResult, itemsResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, role, agent_id, agent_name, display_name, team')
        .eq('role', 'agent')
        .order('agent_name', { ascending: true }),
      supabase
        .from('monitoring_items')
        .select('*')
        .order('created_at', { ascending: false }),
    ]);

    setLoading(false);

    if (profilesResult.error) {
      setErrorMessage(profilesResult.error.message);
      return;
    }

    if (itemsResult.error) {
      setErrorMessage(itemsResult.error.message);
      return;
    }

    setProfiles((profilesResult.data as AgentProfile[]) || []);
    setItems((itemsResult.data as MonitoringItem[]) || []);
  }

  const selectedAgent =
    profiles.find((profile) => profile.id === selectedAgentProfileId) || null;

  function getAgentLabel(profile: AgentProfile) {
    return profile.display_name
      ? `${profile.agent_name} - ${profile.display_name}`
      : `${profile.agent_name} - ${profile.agent_id}`;
  }

  const visibleAgents = useMemo(() => {
    const search = agentSearch.trim().toLowerCase();

    if (!search) return profiles;

    return profiles.filter((profile) => {
      const label = getAgentLabel(profile).toLowerCase();
      return (
        profile.agent_name.toLowerCase().includes(search) ||
        (profile.agent_id || '').toLowerCase().includes(search) ||
        (profile.display_name || '').toLowerCase().includes(search) ||
        label.includes(search)
      );
    });
  }, [profiles, agentSearch]);

  function handleSelectAgent(profile: AgentProfile) {
    setSelectedAgentProfileId(profile.id);
    setAgentSearch(getAgentLabel(profile));
    setIsAgentPickerOpen(false);
  }

  function resetForm() {
    setSelectedAgentProfileId('');
    setAgentSearch('');
    setIsAgentPickerOpen(false);
    setOrderNumber('');
    setComment('');
  }



  async function handleCreate() {
    setErrorMessage('');

    if (!currentProfile) {
      setErrorMessage('Current profile is missing.');
      return;
    }

    if (!selectedAgent) {
      setErrorMessage('Please choose an agent.');
      return;
    }

    if (!orderNumber.trim() || !comment.trim()) {
      setErrorMessage('Please fill Order Number and Comment.');
      return;
    }

    if (!selectedAgent.agent_id || !selectedAgent.team) {
      setErrorMessage('Selected agent is missing Agent ID or Team.');
      return;
    }

    setSaving(true);

    const { error } = await supabase.from('monitoring_items').insert({
      order_number: orderNumber.trim(),
      comment: comment.trim(),
      agent_id: selectedAgent.agent_id,
      agent_name: selectedAgent.agent_name,
      display_name: selectedAgent.display_name || null,
      team: selectedAgent.team,
      created_by_name: currentProfile.display_name || currentProfile.agent_name,
      created_by_email: currentProfile.email,
      created_by_user_id: currentProfile.id,
      status: 'active',
    });

    setSaving(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    resetForm();
    await loadMonitoringPage();
  }

  async function handleResolve(item: MonitoringItem) {
    if (!currentProfile) return;

    setWorkingId(item.id);
    const { error } = await supabase
      .from('monitoring_items')
      .update({
        status: 'resolved',
        resolved_at: new Date().toISOString(),
        resolved_by_name:
          currentProfile.display_name || currentProfile.agent_name,
        resolved_by_email: currentProfile.email,
      })
      .eq('id', item.id);
    setWorkingId('');

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    await loadMonitoringPage();
  }

  const filteredItems = useMemo(() => {
    const search = searchText.trim().toLowerCase();

    return items.filter((item) => {
      const matchesStatus = statusFilter ? item.status === statusFilter : true;
      const matchesTeam = teamFilter ? item.team === teamFilter : true;
      const matchesSearch = search
        ? item.order_number.toLowerCase().includes(search) ||
          item.agent_name.toLowerCase().includes(search) ||
          (item.display_name || '').toLowerCase().includes(search) ||
          item.comment.toLowerCase().includes(search)
        : true;
      return matchesStatus && matchesTeam && matchesSearch;
    });
  }, [items, statusFilter, teamFilter, searchText]);

  if (loading) {
    return <div style={{ color: '#cbd5e1' }}>Loading monitoring...</div>;
  }

  return (
    <div style={{ color: '#e5eefb' }}>
      <div style={pageHeaderStyle}>
        <div>
          <div style={sectionEyebrow}>Operational Alerts</div>
          <h2 style={{ marginBottom: '8px' }}>Monitoring</h2>
          <p style={{ margin: 0, color: '#94a3b8' }}>
            Create manual order watch items linked to an agent through profiles.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadMonitoringPage()}
          style={secondaryButton}
        >
          Refresh
        </button>
      </div>

      {errorMessage ? <div style={errorBanner}>{errorMessage}</div> : null}

      <div style={panelStyle}>
        <div style={formGridStyle}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Agent</label>
            <div ref={agentPickerRef} style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setIsAgentPickerOpen((prev) => !prev)}
                style={pickerButtonStyle}
              >
                <span style={{ color: selectedAgent ? '#f8fafc' : '#94a3b8' }}>
                  {selectedAgent
                    ? getAgentLabel(selectedAgent)
                    : 'Select agent'}
                </span>
                <span>▼</span>
              </button>

              {isAgentPickerOpen && (
                <div style={pickerMenuStyle}>
                  <div style={pickerSearchWrapStyle}>
                    <input
                      type="text"
                      value={agentSearch}
                      onChange={(e) => setAgentSearch(e.target.value)}
                      placeholder="Search by name, ID, or display name"
                      style={fieldStyle}
                    />
                  </div>
                  <div style={pickerListStyle}>
                    {visibleAgents.length === 0 ? (
                      <div style={pickerInfoStyle}>No agents found</div>
                    ) : (
                      visibleAgents.map((profile) => (
                        <button
                          key={profile.id}
                          type="button"
                          onClick={() => handleSelectAgent(profile)}
                          style={{
                            ...pickerOptionStyle,
                            ...(selectedAgentProfileId === profile.id
                              ? pickerOptionActiveStyle
                              : {}),
                          }}
                        >
                          {getAgentLabel(profile)}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div>
            <label style={labelStyle}>Order Number</label>
            <input
              type="text"
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              style={fieldStyle}
            />
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Comment</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              style={fieldStyle}
            />
          </div>
        </div>
      </div>

      <div style={actionRowStyle}>
        <button
          type="button"
          onClick={() => void handleCreate()}
          disabled={saving}
          style={primaryButton}
        >
          {saving ? 'Saving...' : 'Create Monitoring Item'}
        </button>
        <button
          type="button"
          onClick={resetForm}
          disabled={saving}
          style={secondaryButton}
        >
          Clear Form
        </button>
      </div>

      <div style={{ ...panelStyle, marginTop: '24px' }}>
        <div style={filterGridStyle}>
          <div>
            <label style={labelStyle}>Status</label>
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as MonitoringStatus | '')
              }
              style={fieldStyle}
            >
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Team</label>
            <select
              value={teamFilter}
              onChange={(e) =>
                setTeamFilter(
                  e.target.value as 'Calls' | 'Tickets' | 'Sales' | ''
                )
              }
              style={fieldStyle}
            >
              <option value="">All Teams</option>
              <option value="Calls">Calls</option>
              <option value="Tickets">Tickets</option>
              <option value="Sales">Sales</option>
            </select>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Search</label>
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={fieldStyle}
              placeholder="Search by order number, agent, display name, or comment"
            />
          </div>
        </div>
      </div>

      <div style={{ marginTop: '24px', display: 'grid', gap: '14px' }}>
        {filteredItems.length === 0 ? (
          <div style={emptyStateStyle}>No monitoring items found.</div>
        ) : (
          filteredItems.map((item) => (
            <div key={item.id} style={itemCardStyle}>
              <div style={itemTopRowStyle}>
                <div>
                  <div style={orderStyle}>Order #{item.order_number}</div>
                  <div style={itemMetaStyle}>
                    {item.agent_name}
                    {item.display_name
                      ? ` - ${item.display_name}`
                      : ` - ${item.agent_id}`}{' '}
                    • {item.team}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <div
                    style={statusPillStyle(
                      item.status === 'active' ? '#2563eb' : '#166534'
                    )}
                  >
                    {item.status}
                  </div>
                  <div
                    style={statusPillStyle(
                      item.acknowledged_by_agent ? '#166534' : '#92400e'
                    )}
                  >
                    {item.acknowledged_by_agent
                      ? 'Acknowledged'
                      : 'Not Acknowledged'}
                  </div>
                </div>
              </div>
              <div style={commentStyle}>{item.comment}</div>
              <div style={detailGridStyle}>
                <div>
                  <strong>Created By:</strong> {item.created_by_name} •{' '}
                  {item.created_by_email}
                </div>
                <div>
                  <strong>Created At:</strong>{' '}
                  {new Date(item.created_at).toLocaleString()}
                </div>
                <div>
                  <strong>Acknowledged At:</strong>{' '}
                  {item.acknowledged_at
                    ? new Date(item.acknowledged_at).toLocaleString()
                    : '-'}
                </div>
                <div>
                  <strong>Resolved At:</strong>{' '}
                  {item.resolved_at
                    ? new Date(item.resolved_at).toLocaleString()
                    : '-'}
                </div>
              </div>
              {item.status === 'active' ? (
                <div style={{ marginTop: '14px' }}>
                  <button
                    type="button"
                    onClick={() => void handleResolve(item)}
                    disabled={workingId === item.id}
                    style={secondaryButton}
                  >
                    {workingId === item.id ? 'Saving...' : 'Resolve'}
                  </button>
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const pageHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '16px',
  alignItems: 'center',
  flexWrap: 'wrap' as const,
  marginBottom: '18px',
};
const sectionEyebrow = {
  color: '#60a5fa',
  fontSize: '12px',
  fontWeight: 800,
  letterSpacing: '0.16em',
  textTransform: 'uppercase' as const,
  marginBottom: '12px',
};
const panelStyle = {
  background:
    'linear-gradient(180deg, rgba(15,23,42,0.82) 0%, rgba(15,23,42,0.68) 100%)',
  border: '1px solid rgba(148,163,184,0.14)',
  borderRadius: '22px',
  padding: '22px',
};
const formGridStyle = { display: 'grid', gap: '16px' };
const filterGridStyle = {
  display: 'grid',
  gap: '16px',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
};
const labelStyle = {
  display: 'block',
  marginBottom: '8px',
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
const pickerButtonStyle = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: '12px',
  border: '1px solid rgba(148,163,184,0.16)',
  background: 'rgba(15,23,42,0.7)',
  textAlign: 'left' as const,
  cursor: 'pointer',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  color: '#e5eefb',
};
const pickerMenuStyle = {
  position: 'absolute' as const,
  top: 'calc(100% + 8px)',
  left: 0,
  right: 0,
  background: 'rgba(15,23,42,0.96)',
  border: '1px solid rgba(148,163,184,0.16)',
  borderRadius: '16px',
  boxShadow: '0 10px 30px rgba(0,0,0,0.22)',
  zIndex: 20,
  overflow: 'hidden',
};
const pickerSearchWrapStyle = {
  padding: '12px',
  borderBottom: '1px solid rgba(148,163,184,0.12)',
};
const pickerListStyle = {
  maxHeight: '280px',
  overflowY: 'auto' as const,
  padding: '8px',
  display: 'grid',
  gap: '8px',
};
const pickerInfoStyle = {
  padding: '12px',
  borderRadius: '8px',
  backgroundColor: 'rgba(15,23,42,0.68)',
  color: '#94a3b8',
};
const pickerOptionStyle = {
  padding: '12px',
  borderRadius: '8px',
  border: '1px solid rgba(148,163,184,0.12)',
  backgroundColor: 'rgba(15,23,42,0.6)',
  textAlign: 'left' as const,
  cursor: 'pointer',
  fontWeight: 500,
  color: '#e5eefb',
};
const pickerOptionActiveStyle = {
  border: '1px solid #2563eb',
  backgroundColor: 'rgba(37,99,235,0.18)',
};

const actionRowStyle = {
  display: 'flex',
  gap: '10px',
  flexWrap: 'wrap' as const,
  marginTop: '18px',
};
const primaryButton = {
  padding: '12px 16px',
  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
  color: 'white',
  border: '1px solid rgba(96,165,250,0.24)',
  borderRadius: '14px',
  cursor: 'pointer',
  fontWeight: 700,
};
const secondaryButton = {
  padding: '12px 16px',
  background: 'rgba(15,23,42,0.74)',
  color: '#e5eefb',
  border: '1px solid rgba(148,163,184,0.18)',
  borderRadius: '14px',
  cursor: 'pointer',
  fontWeight: 700,
};
const errorBanner = {
  marginTop: '16px',
  padding: '12px 14px',
  borderRadius: '10px',
  backgroundColor: 'rgba(127,29,29,0.24)',
  border: '1px solid rgba(248,113,113,0.22)',
  color: '#fecaca',
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
const itemTopRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '14px',
  alignItems: 'flex-start',
  flexWrap: 'wrap' as const,
  marginBottom: '12px',
};
const orderStyle = { fontSize: '18px', fontWeight: 800, color: '#f8fafc' };
const itemMetaStyle = { color: '#94a3b8', fontSize: '13px', marginTop: '6px' };
const commentStyle = {
  color: '#e2e8f0',
  lineHeight: 1.55,
  marginBottom: '12px',
};
const detailGridStyle = {
  display: 'grid',
  gap: '8px',
  color: '#cbd5e1',
  fontSize: '13px',
};
const statusPillStyle = (backgroundColor: string) => ({
  padding: '6px 10px',
  borderRadius: '999px',
  backgroundColor,
  color: '#fff',
  fontSize: '11px',
  fontWeight: 800,
});

export default MonitoringSupabase;
