import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import MonitoringWidget from './MonitoringWidget';
import MonitoringDrawer from './MonitoringDrawer';
import SupervisorRequestsSupabase from './SupervisorRequestsSupabase';

type TeamName = 'Calls' | 'Tickets' | 'Sales';

type UserProfile = {
  id: string;
  role: 'admin' | 'qa' | 'agent' | 'supervisor';
  agent_id: string | null;
  agent_name: string;
  display_name: string | null;
  team: TeamName | null;
  email: string;
};

type AgentProfile = {
  id: string;
  agent_id: string | null;
  agent_name: string;
  display_name: string | null;
  team: TeamName | null;
  email: string;
};

type AuditItem = {
  id: string;
  agent_id: string;
  agent_name: string;
  team: TeamName;
  case_type: string;
  audit_date: string;
  order_number?: string | null;
  phone_number?: string | null;
  ticket_id?: string | null;
  quality_score: number;
  comments: string | null;
  shared_with_agent?: boolean;
  created_by_name?: string | null;
  created_by_email?: string | null;
  shared_at?: string | null;
};

type TeamRecord = {
  id: string;
  agent_id: string;
  agent_name: string;
  calls_count?: number;
  tickets_count?: number;
  amount?: number;
  call_date?: string;
  ticket_date?: string;
  sale_date?: string;
  date_to?: string | null;
  notes: string | null;
};

type MonitoringItem = {
  id: string;
  order_number: string;
  comment: string;
  agent_id: string;
  agent_name: string;
  display_name: string | null;
  team: TeamName;
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

type SupervisorPortalTab = 'overview' | 'requests';

type SupervisorPortalProps = {
  currentUser: UserProfile;
};

function SupervisorPortal({ currentUser }: SupervisorPortalProps) {
  const [teamAgents, setTeamAgents] = useState<AgentProfile[]>([]);
  const [audits, setAudits] = useState<AuditItem[]>([]);
  const [records, setRecords] = useState<TeamRecord[]>([]);
  const [monitoringItems, setMonitoringItems] = useState<MonitoringItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedAgentProfileId, setSelectedAgentProfileId] = useState('');
  const [agentSearch, setAgentSearch] = useState('');
  const [isAgentPickerOpen, setIsAgentPickerOpen] = useState(false);
  const [monitoringOpen, setMonitoringOpen] = useState(false);
  const [monitoringAgentFilter, setMonitoringAgentFilter] = useState('');
  const [activeTab, setActiveTab] = useState<SupervisorPortalTab>('overview');

  const agentPickerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void loadTeamData(false);
  }, [currentUser.id, currentUser.team]);

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

  async function loadTeamData(isRefresh: boolean) {
    if (!currentUser.team) {
      setErrorMessage('Your supervisor profile is missing a team.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    setErrorMessage('');

    const agentsPromise = supabase
      .from('profiles')
      .select('id, agent_id, agent_name, display_name, team, email')
      .eq('role', 'agent')
      .eq('team', currentUser.team)
      .order('agent_name', { ascending: true });

    const auditsPromise = supabase
      .from('audits')
      .select('*')
      .eq('team', currentUser.team)
      .order('audit_date', { ascending: false });

    const monitoringPromise = supabase
      .from('monitoring_items')
      .select('*')
      .eq('team', currentUser.team)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    const recordsPromise =
      currentUser.team === 'Calls'
        ? supabase
            .from('calls_records')
            .select('*')
            .order('call_date', { ascending: false })
        : currentUser.team === 'Tickets'
        ? supabase
            .from('tickets_records')
            .select('*')
            .order('ticket_date', { ascending: false })
        : supabase
            .from('sales_records')
            .select('*')
            .order('sale_date', { ascending: false });

    const [agentsResult, auditsResult, recordsResult, monitoringResult] =
      await Promise.all([
        agentsPromise,
        auditsPromise,
        recordsPromise,
        monitoringPromise,
      ]);

    const errors = [
      agentsResult.error?.message,
      auditsResult.error?.message,
      recordsResult.error?.message,
      monitoringResult.error?.message,
    ].filter(Boolean);

    if (errors.length > 0) {
      setErrorMessage(errors.join(' | '));
    }

    setTeamAgents((agentsResult.data as AgentProfile[]) || []);
    setAudits((auditsResult.data as AuditItem[]) || []);
    setRecords((recordsResult.data as TeamRecord[]) || []);
    setMonitoringItems((monitoringResult.data as MonitoringItem[]) || []);
    setLoading(false);
    setRefreshing(false);
  }

  function getAgentLabel(agentId?: string | null, agentName?: string | null) {
    const matchedProfile = teamAgents.find(
      (profile) =>
        profile.agent_id === (agentId || null) &&
        profile.agent_name === (agentName || '')
    );

    if (matchedProfile?.display_name) {
      return `${agentName || '-'} - ${matchedProfile.display_name}`;
    }

    return `${agentName || '-'} - ${agentId || '-'}`;
  }

  function formatDate(dateValue?: string | null) {
    if (!dateValue) return '-';
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString();
  }

  function formatDateOnly(dateValue?: string | null) {
    if (!dateValue) return '-';
    const date = new Date(`${dateValue}T00:00:00`);
    if (Number.isNaN(date.getTime())) return dateValue;
    return date.toLocaleDateString();
  }

  function getAuditReference(audit: AuditItem) {
    if (audit.team === 'Tickets') {
      return `Ticket ID: ${audit.ticket_id || '-'}`;
    }

    return `Order #: ${audit.order_number || '-'} | Phone: ${
      audit.phone_number || '-'
    }`;
  }

  function getCommentsPreview(value?: string | null) {
    const text = (value || '').trim();
    if (!text) return '-';
    if (text.length <= 120) return text;
    return `${text.slice(0, 117)}...`;
  }

  const visibleAgents = useMemo(() => {
    const search = agentSearch.trim().toLowerCase();

    if (!search) return teamAgents;

    return teamAgents.filter((profile) => {
      const label = getAgentLabel(
        profile.agent_id,
        profile.agent_name
      ).toLowerCase();

      return (
        profile.agent_name.toLowerCase().includes(search) ||
        (profile.agent_id || '').toLowerCase().includes(search) ||
        (profile.display_name || '').toLowerCase().includes(search) ||
        label.includes(search)
      );
    });
  }, [teamAgents, agentSearch]);

  const selectedAgent =
    teamAgents.find((profile) => profile.id === selectedAgentProfileId) || null;

  function handleSelectAgent(profile: AgentProfile) {
    setSelectedAgentProfileId(profile.id);
    setAgentSearch(getAgentLabel(profile.agent_id, profile.agent_name));
    setIsAgentPickerOpen(false);
  }

  function clearAgentFilter() {
    setSelectedAgentProfileId('');
    setAgentSearch('');
    setIsAgentPickerOpen(false);
  }

  const filteredAudits = useMemo(() => {
    if (!selectedAgent) return audits;

    return audits.filter(
      (audit) =>
        audit.agent_id === selectedAgent.agent_id &&
        audit.agent_name === selectedAgent.agent_name
    );
  }, [audits, selectedAgent]);

  const filteredRecords = useMemo(() => {
    if (!selectedAgent) return records;

    return records.filter(
      (record) =>
        record.agent_id === selectedAgent.agent_id &&
        record.agent_name === selectedAgent.agent_name
    );
  }, [records, selectedAgent]);

  const averageQuality =
    filteredAudits.length > 0
      ? (
          filteredAudits.reduce(
            (sum, item) => sum + Number(item.quality_score),
            0
          ) / filteredAudits.length
        ).toFixed(2)
      : '0.00';

  const releasedAuditCount = filteredAudits.filter(
    (item) => item.shared_with_agent
  ).length;

  const hiddenAuditCount = filteredAudits.length - releasedAuditCount;

  const totalMetric = filteredRecords.reduce(
    (sum, item) =>
      sum + Number(item.calls_count || item.tickets_count || item.amount || 0),
    0
  );

  if (loading) {
    return <div style={{ color: 'var(--da-muted-text, #cbd5e1)' }}>Loading supervisor portal...</div>;
  }

  return (
    <div style={{ color: 'var(--da-page-text, #e5eefb)' }}>
      <div style={pageHeaderStyle}>
        <div>
          <div style={sectionEyebrow}>Supervisor Portal</div>
          <h2 style={{ marginBottom: '8px' }}>
            {currentUser.team || 'Team'} Supervisor Portal
          </h2>
          <p style={{ margin: 0, color: 'var(--da-subtle-text, #94a3b8)' }}>
            You can only see your own team data and can filter down to a single
            agent.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadTeamData(true)}
          disabled={refreshing}
          style={secondaryButton}
        >
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div style={tabBarStyle}>
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          style={{
            ...tabButtonStyle,
            ...(activeTab === 'overview' ? activeTabButtonStyle : {}),
          }}
        >
          Overview
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('requests')}
          style={{
            ...tabButtonStyle,
            ...(activeTab === 'requests' ? activeTabButtonStyle : {}),
          }}
        >
          Supervisor Requests
        </button>
      </div>

      {activeTab === 'requests' ? (
        <div style={{ marginTop: '24px' }}>
          <SupervisorRequestsSupabase currentUser={currentUser} />
        </div>
      ) : (
        <>
          {errorMessage ? <div style={errorBanner}>{errorMessage}</div> : null}

          <div style={panelStyle}>
            <label style={labelStyle}>Agent Filter</label>

            <div ref={agentPickerRef} style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setIsAgentPickerOpen((prev) => !prev)}
                style={pickerButtonStyle}
              >
                <span style={{ color: selectedAgent ? 'var(--da-title, #f8fafc)' : 'var(--da-subtle-text, #94a3b8)' }}>
                  {selectedAgent
                    ? getAgentLabel(
                        selectedAgent.agent_id,
                        selectedAgent.agent_name
                      )
                    : 'All team agents'}
                </span>
                <span>▼</span>
              </button>

              {isAgentPickerOpen ? (
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
                          {getAgentLabel(profile.agent_id, profile.agent_name)}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            <div style={{ marginTop: '12px' }}>
              <button
                type="button"
                onClick={clearAgentFilter}
                style={secondaryButton}
              >
                Clear Filter
              </button>
            </div>
          </div>

          <div style={summaryGridStyle}>
            <SummaryCard
              title="Team Agents"
              value={String(teamAgents.length)}
            />
            <SummaryCard
              title={selectedAgent ? 'Filtered Audits' : 'Team Audits'}
              value={String(filteredAudits.length)}
            />
            <SummaryCard title="Average Quality" value={`${averageQuality}%`} />
            <SummaryCard
              title="Released Audits"
              value={String(releasedAuditCount)}
            />
            <SummaryCard
              title="Hidden Audits"
              value={String(hiddenAuditCount)}
            />
            <SummaryCard
              title={
                currentUser.team === 'Sales'
                  ? 'Total Sales'
                  : `Total ${currentUser.team}`
              }
              value={
                currentUser.team === 'Sales'
                  ? `$${totalMetric.toFixed(2)}`
                  : String(totalMetric)
              }
            />
            <SummaryCard
              title="Monitoring Alerts"
              value={String(monitoringItems.length)}
            />
          </div>

          <Section
            title={`${
              selectedAgent ? 'Filtered' : currentUser.team || 'Team'
            } Audits`}
          >
            {filteredAudits.length === 0 ? (
              <p>No audits found for this selection.</p>
            ) : (
              <div style={auditTableWrapStyle}>
                <div style={auditTableStyle}>
                  <div style={{ ...auditRowStyle, ...auditHeaderRowStyle }}>
                    <div style={auditCellDateStyle}>Audit Date</div>
                    <div style={auditCellCaseStyle}>Case Type</div>
                    <div style={auditCellReferenceStyle}>Reference</div>
                    <div style={auditCellScoreStyle}>Quality</div>
                    <div style={auditCellReleaseStyle}>Release</div>
                    <div style={auditCellCreatorStyle}>Created By</div>
                    <div style={auditCellCommentsStyle}>Comments</div>
                  </div>

                  {filteredAudits.map((audit) => (
                    <div key={audit.id} style={auditRowStyle}>
                      <div style={auditCellDateStyle}>
                        <div style={primaryCellTextStyle}>
                          {formatDateOnly(audit.audit_date)}
                        </div>
                        <div style={secondaryCellTextStyle}>{audit.team}</div>
                      </div>

                      <div style={auditCellCaseStyle}>
                        <div style={primaryCellTextStyle}>
                          {audit.case_type}
                        </div>
                        <div style={secondaryCellTextStyle}>
                          {getAgentLabel(audit.agent_id, audit.agent_name)}
                        </div>
                      </div>

                      <div style={auditCellReferenceStyle}>
                        <div style={primaryCellTextStyle}>
                          {getAuditReference(audit)}
                        </div>
                      </div>

                      <div style={auditCellScoreStyle}>
                        <span style={scorePillStyle}>
                          {Number(audit.quality_score).toFixed(2)}%
                        </span>
                      </div>

                      <div style={auditCellReleaseStyle}>
                        <span
                          style={{
                            ...pillStyle,
                            backgroundColor: audit.shared_with_agent
                              ? '#166534'
                              : '#475569',
                          }}
                        >
                          {audit.shared_with_agent ? 'Released' : 'Hidden'}
                        </span>
                        <div style={secondaryCellTextStyle}>
                          {formatDate(audit.shared_at)}
                        </div>
                      </div>

                      <div style={auditCellCreatorStyle}>
                        <div style={primaryCellTextStyle}>
                          {audit.created_by_name ||
                            audit.created_by_email ||
                            '-'}
                        </div>
                      </div>

                      <div style={auditCellCommentsStyle}>
                        <div style={primaryCellTextStyle}>
                          {getCommentsPreview(audit.comments)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Section>

          <Section title={`${currentUser.team} Team Records`}>
            {filteredRecords.length === 0 ? (
              <p>No team records found.</p>
            ) : (
              <div style={{ display: 'grid', gap: '12px' }}>
                {filteredRecords.map((record) => (
                  <div key={record.id} style={cardStyle}>
                    <p>
                      <strong>Agent:</strong>{' '}
                      {getAgentLabel(record.agent_id, record.agent_name)}
                    </p>
                    <p>
                      <strong>Date From:</strong>{' '}
                      {record.call_date ||
                        record.ticket_date ||
                        record.sale_date ||
                        '-'}
                    </p>
                    <p>
                      <strong>Date To:</strong> {record.date_to || '-'}
                    </p>
                    {currentUser.team === 'Calls' ? (
                      <p>
                        <strong>Calls Count:</strong> {record.calls_count}
                      </p>
                    ) : null}
                    {currentUser.team === 'Tickets' ? (
                      <p>
                        <strong>Tickets Count:</strong> {record.tickets_count}
                      </p>
                    ) : null}
                    {currentUser.team === 'Sales' ? (
                      <p>
                        <strong>Amount:</strong> $
                        {Number(record.amount || 0).toFixed(2)}
                      </p>
                    ) : null}
                    <p>
                      <strong>Notes:</strong> {record.notes || '-'}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <MonitoringWidget
            count={monitoringItems.length}
            onClick={() => setMonitoringOpen(true)}
          />
          <MonitoringDrawer
            open={monitoringOpen}
            onClose={() => setMonitoringOpen(false)}
            items={monitoringItems}
            mode="supervisor"
            selectedAgentId={monitoringAgentFilter}
            onSelectAgentId={setMonitoringAgentFilter}
            agentOptions={teamAgents.map((item) => ({
              id: item.id,
              agent_id: item.agent_id,
              agent_name: item.agent_name,
              display_name: item.display_name,
            }))}
            onItemUpdated={() => loadTeamData(true)}
          />
        </>
      )}
    </div>
  );
}

function SummaryCard({ title, value }: { title: string; value: string }) {
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: '13px', color: 'var(--da-subtle-text, #94a3b8)', marginBottom: '8px' }}>
        {title}
      </div>
      <div style={{ fontSize: '28px', fontWeight: 'bold', color: 'var(--da-title, #f8fafc)' }}>
        {value}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginTop: '32px' }}>
      <h3 style={{ marginBottom: '14px' }}>{title}</h3>
      {children}
    </div>
  );
}

const pageHeaderStyle = {
  display: 'flex',
  gap: '12px',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexWrap: 'wrap' as const,
  marginBottom: '18px',
};

const sectionEyebrow = {
  color: 'var(--da-accent-text, #60a5fa)',
  fontSize: '12px',
  fontWeight: 800,
  letterSpacing: '0.18em',
  textTransform: 'uppercase' as const,
  marginBottom: '12px',
};

const tabBarStyle = {
  display: 'flex',
  gap: '10px',
  flexWrap: 'wrap' as const,
  marginBottom: '12px',
};

const tabButtonStyle = {
  padding: '12px 16px',
  borderRadius: '14px',
  border: '1px solid rgba(148,163,184,0.16)',
  background: 'var(--da-surface-bg, rgba(15,23,42,0.62))',
  color: 'var(--da-muted-text, #cbd5e1)',
  cursor: 'pointer',
  fontWeight: 700,
  whiteSpace: 'nowrap' as const,
  transition: 'all 0.2s ease',
};

const activeTabButtonStyle = {
  background:
    'linear-gradient(135deg, rgba(37,99,235,0.95) 0%, rgba(59,130,246,0.92) 100%)',
  color: '#ffffff',
  border: '1px solid rgba(147,197,253,0.38)',
  boxShadow: '0 10px 24px rgba(37,99,235,0.25)',
};

const panelStyle = {
  background:
    'var(--da-panel-bg, linear-gradient(180deg, var(--da-field-bg, rgba(15, 23, 42, 0.82)) 0%, var(--da-surface-bg, rgba(15, 23, 42, 0.68)) 100%))',
  border: '1px solid rgba(148,163,184,0.14)',
  borderRadius: '20px',
  padding: '20px',
};

const labelStyle = {
  display: 'block',
  marginBottom: '8px',
  color: 'var(--da-muted-text, #cbd5e1)',
  fontWeight: 700,
  fontSize: '13px',
};

const fieldStyle = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: '12px',
  border: '1px solid rgba(148,163,184,0.16)',
  background: 'var(--da-surface-bg, rgba(15,23,42,0.7))',
  color: 'var(--da-page-text, #e5eefb)',
};

const pickerButtonStyle = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: '12px',
  border: '1px solid rgba(148,163,184,0.16)',
  background: 'var(--da-surface-bg, rgba(15,23,42,0.7))',
  textAlign: 'left' as const,
  cursor: 'pointer',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  color: 'var(--da-page-text, #e5eefb)',
};

const pickerMenuStyle = {
  position: 'absolute' as const,
  top: 'calc(100% + 8px)',
  left: 0,
  right: 0,
  background: 'var(--da-menu-bg, rgba(15,23,42,0.96))',
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
  backgroundColor: 'var(--da-surface-bg, rgba(15,23,42,0.68))',
  color: 'var(--da-subtle-text, #94a3b8)',
};

const pickerOptionStyle = {
  padding: '12px',
  borderRadius: '8px',
  border: '1px solid rgba(148,163,184,0.12)',
  backgroundColor: 'var(--da-surface-bg, rgba(15,23,42,0.6))',
  textAlign: 'left' as const,
  cursor: 'pointer',
  fontWeight: 500,
  color: 'var(--da-page-text, #e5eefb)',
};

const pickerOptionActiveStyle = {
  border: '1px solid #2563eb',
  backgroundColor: 'var(--da-active-option-bg, rgba(37, 99, 235, 0.18))',
};

const summaryGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '16px',
  marginTop: '24px',
  marginBottom: '8px',
};

const cardStyle = {
  background:
    'var(--da-panel-bg, linear-gradient(180deg, var(--da-field-bg, rgba(15, 23, 42, 0.82)) 0%, var(--da-surface-bg, rgba(15, 23, 42, 0.68)) 100%))',
  border: '1px solid rgba(148,163,184,0.14)',
  borderRadius: '18px',
  padding: '20px',
  boxShadow: '0 8px 24px rgba(2,6,23,0.2)',
};

const secondaryButton = {
  backgroundColor: 'var(--da-field-bg, rgba(15,23,42,0.78))',
  color: 'white',
  border: '1px solid rgba(148,163,184,0.18)',
  padding: '10px 14px',
  borderRadius: '10px',
  cursor: 'pointer',
};

const errorBanner = {
  marginTop: '16px',
  padding: '12px 14px',
  borderRadius: '10px',
  backgroundColor: 'rgba(127,29,29,0.24)',
  border: '1px solid rgba(248,113,113,0.22)',
  color: 'var(--da-error-text, #fecaca)',
};

const auditTableWrapStyle = {
  marginTop: '16px',
  overflowX: 'auto' as const,
  borderRadius: '18px',
  border: '1px solid rgba(148,163,184,0.14)',
  background:
    'var(--da-panel-bg, linear-gradient(180deg, var(--da-field-bg, rgba(15, 23, 42, 0.82)) 0%, var(--da-surface-bg, rgba(15, 23, 42, 0.68)) 100%))',
  boxShadow: '0 8px 24px rgba(2,6,23,0.2)',
};

const auditTableStyle = {
  minWidth: '1180px',
};

const auditRowStyle = {
  display: 'grid',
  gridTemplateColumns:
    '140px 220px minmax(240px, 1.4fr) 120px 180px 220px minmax(260px, 1.8fr)',
  gap: '14px',
  alignItems: 'center',
  padding: '14px 16px',
  borderBottom: '1px solid rgba(148,163,184,0.1)',
};

const auditHeaderRowStyle = {
  position: 'sticky' as const,
  top: 0,
  zIndex: 1,
  background: 'rgba(2,6,23,0.92)',
  color: 'var(--da-accent-text, #93c5fd)',
  fontSize: '12px',
  fontWeight: 800,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.12em',
};

const auditCellDateStyle = {};
const auditCellCaseStyle = {};
const auditCellReferenceStyle = {};
const auditCellScoreStyle = {};
const auditCellReleaseStyle = {};
const auditCellCreatorStyle = {};
const auditCellCommentsStyle = {};

const primaryCellTextStyle = {
  color: 'var(--da-title, #f8fafc)',
  fontSize: '14px',
  fontWeight: 600,
  lineHeight: 1.4,
};

const secondaryCellTextStyle = {
  marginTop: '4px',
  color: '#64748b',
  fontSize: '12px',
  fontWeight: 600,
  lineHeight: 1.4,
};

const scorePillStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '84px',
  padding: '8px 10px',
  borderRadius: '999px',
  background: 'var(--da-active-option-bg, rgba(37, 99, 235, 0.18))',
  border: '1px solid rgba(96,165,250,0.26)',
  color: '#dbeafe',
  fontSize: '13px',
  fontWeight: 800,
};

const pillStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '6px 10px',
  borderRadius: '999px',
  fontSize: '12px',
  fontWeight: 800,
  color: '#ffffff',
};

export default SupervisorPortal;
