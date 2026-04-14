import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import MonitoringWidget from './MonitoringWidget';
import MonitoringDrawer from './MonitoringDrawer';
import SupervisorRequestsSupabase from './SupervisorRequestsSupabase';
import RecognitionWall from './RecognitionWall';
import DigitalTrophyCabinet from './DigitalTrophyCabinet';
import VoiceOfEmployeeSupabase from './VoiceOfEmployeeSupabase';

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

type ScoreDetail = {
  metric: string;
  result: string;
  pass: number;
  borderline: number;
  adjustedWeight: number;
  earned: number;
  counts_toward_score?: boolean;
  metric_comment?: string | null;
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
  score_details: ScoreDetail[];
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

function openNativeDatePicker(target: HTMLInputElement) {
  const input = target as HTMLInputElement & { showPicker?: () => void };
  input.showPicker?.();
}


function getSupervisorThemeVars(): Record<string, string> {
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

  return {
    '--da-page-text': isLight ? '#334155' : '#e5eefb',
    '--da-title': isLight ? '#0f172a' : '#f8fafc',
    '--da-muted-text': isLight ? '#475569' : '#cbd5e1',
    '--da-subtle-text': isLight ? '#64748b' : '#94a3b8',
    '--da-accent-text': isLight ? '#2563eb' : '#60a5fa',
    '--da-panel-bg': isLight
      ? 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(247,250,255,0.96) 100%)'
      : 'linear-gradient(180deg, rgba(15,23,42,0.82) 0%, rgba(15,23,42,0.68) 100%)',
    '--da-panel-border': isLight
      ? '1px solid rgba(203,213,225,0.92)'
      : '1px solid rgba(148,163,184,0.14)',
    '--da-panel-shadow': isLight
      ? '0 18px 40px rgba(15,23,42,0.10)'
      : '0 18px 40px rgba(2,6,23,0.35)',
    '--da-surface-bg': isLight ? 'rgba(255,255,255,0.98)' : 'rgba(15,23,42,0.62)',
    '--da-field-bg': isLight
      ? 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(250,252,255,0.98) 100%)'
      : 'rgba(15,23,42,0.74)',
  };
}

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
  const [expandedAuditId, setExpandedAuditId] = useState<string | null>(null);
  const [auditDateFrom, setAuditDateFrom] = useState('');
  const [auditDateTo, setAuditDateTo] = useState('');
  const [recordDateFrom, setRecordDateFrom] = useState('');
  const [recordDateTo, setRecordDateTo] = useState('');

  const agentPickerRef = useRef<HTMLDivElement | null>(null);
  const pageRootRef = useRef<HTMLDivElement | null>(null);
  const themeVars = getSupervisorThemeVars();
  const [auditsVisible, setAuditsVisible] = useState(true);

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


  function normalizeAgentId(value?: string | null) {
    return String(value || '').trim().replace(/\.0+$/, '');
  }

  function normalizeAgentName(value?: string | null) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function matchesDateRange(
    startDate?: string | null,
    endDate?: string | null,
    filterFrom?: string,
    filterTo?: string
  ) {
    const recordStart = String(startDate || '').slice(0, 10);
    const recordEnd = String(endDate || startDate || '').slice(0, 10);

    if (!recordStart) return false;

    const effectiveFrom = filterFrom || '0001-01-01';
    const effectiveTo = filterTo || '9999-12-31';

    return recordEnd >= effectiveFrom && recordStart <= effectiveTo;
  }

  function clearAuditDateFilters() {
    setAuditDateFrom('');
    setAuditDateTo('');
  }

  function clearRecordDateFilters() {
    setRecordDateFrom('');
    setRecordDateTo('');
  }

  function getResultBadgeColor(result: string) {
    if (result === 'Pass') return '#166534';
    if (result === 'Borderline') return '#92400e';
    if (result === 'Fail' || result === 'Auto-Fail') return '#991b1b';
    if (result === 'N/A') return '#374151';
    if (result === 'Yes') return '#166534';
    if (result === 'No') return '#991b1b';
    return '#1f2937';
  }

  function isNoScoreDetail(detail: ScoreDetail) {
    return (
      detail.counts_toward_score === false ||
      (Number(detail.pass || 0) === 0 &&
        Number(detail.borderline || 0) === 0 &&
        Number(detail.adjustedWeight || 0) === 0)
    );
  }

  function getRecordStartDate(record: TeamRecord) {
    return record.call_date || record.ticket_date || record.sale_date || '-';
  }

  function getRecordMetricLabel() {
    if (currentUser.team === 'Calls') return 'Calls Count';
    if (currentUser.team === 'Tickets') return 'Tickets Count';
    return 'Amount';
  }

  function getRecordMetricValue(record: TeamRecord) {
    if (currentUser.team === 'Calls') return String(record.calls_count ?? 0);
    if (currentUser.team === 'Tickets') return String(record.tickets_count ?? 0);
    return `$${Number(record.amount || 0).toFixed(2)}`;
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
    return audits.filter((audit) => {
      const matchesAgent = selectedAgent
        ? (
            (normalizeAgentId(audit.agent_id) &&
              normalizeAgentId(audit.agent_id) === normalizeAgentId(selectedAgent.agent_id)) ||
            normalizeAgentName(audit.agent_name) ===
              normalizeAgentName(selectedAgent.agent_name)
          )
        : true;

      const matchesDates = matchesDateRange(
        audit.audit_date,
        audit.audit_date,
        auditDateFrom,
        auditDateTo
      );

      return matchesAgent && matchesDates;
    });
  }, [audits, selectedAgent, auditDateFrom, auditDateTo]);

  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      const matchesAgent = selectedAgent
        ? (
            (normalizeAgentId(record.agent_id) &&
              normalizeAgentId(record.agent_id) === normalizeAgentId(selectedAgent.agent_id)) ||
            normalizeAgentName(record.agent_name) ===
              normalizeAgentName(selectedAgent.agent_name)
          )
        : true;

      const recordStart =
        record.call_date || record.ticket_date || record.sale_date || null;
      const matchesDates = matchesDateRange(
        recordStart,
        record.date_to || null,
        recordDateFrom,
        recordDateTo
      );

      return matchesAgent && matchesDates;
    });
  }, [records, selectedAgent, recordDateFrom, recordDateTo]);

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

  function handleMonitoringWidgetClick() {
    setMonitoringOpen(true);

    if (pageRootRef.current) {
      pageRootRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  if (loading) {
    return <div style={{ color: 'var(--da-muted-text, #cbd5e1)' }}>Loading supervisor portal...</div>;
  }

  return (
    <div ref={pageRootRef} data-no-theme-invert="true" style={{ color: 'var(--da-page-text, #e5eefb)', ...(themeVars as any) }}>
      <div style={pageHeaderStyle}>
        <div>
          <div style={sectionEyebrow}>Supervisor Portal</div>
          <h2 style={{ marginBottom: '8px' }}>
            {currentUser.team || 'Team'} Supervisor Portal
          </h2>
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

            <div style={{ ...filterGridStyle, marginTop: '16px' }}>
              <div>
                <label style={labelStyle}>Audit Date From</label>
                <input
                  type="date"
                  value={auditDateFrom}
                  onChange={(e) => setAuditDateFrom(e.target.value)}
                  onClick={(e) => openNativeDatePicker(e.currentTarget)}
                  onFocus={(e) => openNativeDatePicker(e.currentTarget)}
                  style={fieldStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Audit Date To</label>
                <input
                  type="date"
                  value={auditDateTo}
                  onChange={(e) => setAuditDateTo(e.target.value)}
                  onClick={(e) => openNativeDatePicker(e.currentTarget)}
                  onFocus={(e) => openNativeDatePicker(e.currentTarget)}
                  style={fieldStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Records Date From</label>
                <input
                  type="date"
                  value={recordDateFrom}
                  onChange={(e) => setRecordDateFrom(e.target.value)}
                  onClick={(e) => openNativeDatePicker(e.currentTarget)}
                  onFocus={(e) => openNativeDatePicker(e.currentTarget)}
                  style={fieldStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Records Date To</label>
                <input
                  type="date"
                  value={recordDateTo}
                  onChange={(e) => setRecordDateTo(e.target.value)}
                  onClick={(e) => openNativeDatePicker(e.currentTarget)}
                  onFocus={(e) => openNativeDatePicker(e.currentTarget)}
                  style={fieldStyle}
                />
              </div>
            </div>

            <div style={{ marginTop: '12px', display: 'flex', gap: '10px', flexWrap: 'wrap' as const }}>
              <button
                type="button"
                onClick={clearAuditDateFilters}
                style={secondaryButton}
              >
                Clear Audit Dates
              </button>
              <button
                type="button"
                onClick={clearRecordDateFilters}
                style={secondaryButton}
              >
                Clear Record Dates
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
            <div style={sectionHeaderActionsStyle}>
              <button
                type="button"
                onClick={() => setAuditsVisible((prev) => !prev)}
                style={miniSecondaryButton}
              >
                {auditsVisible ? 'Hide Audits' : 'Show Audits'}
              </button>
            </div>
            {!auditsVisible ? (
              <div style={collapsedMessageStyle}>Audits are hidden for now.</div>
            ) : filteredAudits.length === 0 ? (
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
                    <div style={auditCellActionsStyle}>Actions</div>
                  </div>

                  {filteredAudits.map((audit) => {
                    const isExpanded = expandedAuditId === audit.id;

                    return (
                      <div key={audit.id} style={auditEntryStyle}>
                        <div style={auditRowStyle}>
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

                          <div style={auditCellActionsStyle}>
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedAuditId(
                                  expandedAuditId === audit.id ? null : audit.id
                                )
                              }
                              style={miniSecondaryButton}
                            >
                              {isExpanded ? 'Hide' : 'Details'}
                            </button>
                          </div>
                        </div>

                        {isExpanded ? (
                          <div style={auditExpandedRowStyle}>
                            <div style={expandedPanelStyle}>
                              <div style={detailInfoGridStyle}>
                                <div style={detailInfoCardStyle}>
                                  <div style={detailLabelStyle}>Agent</div>
                                  <div style={detailValueStyle}>
                                    {getAgentLabel(audit.agent_id, audit.agent_name)}
                                  </div>
                                </div>

                                <div style={detailInfoCardStyle}>
                                  <div style={detailLabelStyle}>Reference</div>
                                  <div style={detailValueStyle}>
                                    {getAuditReference(audit)}
                                  </div>
                                </div>

                                <div style={detailInfoCardStyle}>
                                  <div style={detailLabelStyle}>Release Date</div>
                                  <div style={detailValueStyle}>
                                    {formatDate(audit.shared_at)}
                                  </div>
                                </div>

                                <div style={detailInfoCardStyle}>
                                  <div style={detailLabelStyle}>Created By</div>
                                  <div style={detailValueStyle}>
                                    {audit.created_by_name ||
                                      audit.created_by_email ||
                                      '-'}
                                  </div>
                                </div>
                              </div>

                              <div style={fullCommentCardStyle}>
                                <div style={detailLabelStyle}>Full Comment</div>
                                <div style={fullCommentTextStyle}>
                                  {audit.comments?.trim() || '-'}
                                </div>
                              </div>

                              <div style={{ ...sectionEyebrow, marginTop: '18px' }}>
                                Score Details
                              </div>
                              <div style={{ display: 'grid', gap: '10px' }}>
                                {(audit.score_details || []).map((detail) => (
                                  <div
                                    key={`${audit.id}-${detail.metric}`}
                                    style={detailRowStyle}
                                  >
                                    <div>
                                      <div
                                        style={{
                                          color: 'var(--da-title, #f8fafc)',
                                          fontWeight: 700,
                                        }}
                                      >
                                        {detail.metric}
                                      </div>
                                      <div
                                        style={{
                                          color: 'var(--da-subtle-text, #94a3b8)',
                                          fontSize: '12px',
                                          marginTop: '4px',
                                        }}
                                      >
                                        {isNoScoreDetail(detail)
                                          ? 'Yes / No question • No score'
                                          : `Pass ${detail.pass} • Borderline ${detail.borderline} • Adjusted ${Number(detail.adjustedWeight || 0).toFixed(2)}`}
                                      </div>
                                      {detail.metric_comment ? (
                                        <div style={metricNoteCardStyle}>
                                          <div style={metricNoteLabelStyle}>
                                            QA Note
                                          </div>
                                          <div style={metricNoteTextStyle}>
                                            {detail.metric_comment}
                                          </div>
                                        </div>
                                      ) : null}
                                    </div>

                                    <span
                                      style={{
                                        ...pillStyle,
                                        backgroundColor: getResultBadgeColor(
                                          detail.result
                                        ),
                                      }}
                                    >
                                      {detail.result}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Section>

          <Section title={`${currentUser.team} Team Records`}>
            {filteredRecords.length === 0 ? (
              <p>No team records found.</p>
            ) : (
              <div style={recordsTableWrapStyle}>
                <div style={recordsTableStyle}>
                  <div style={{ ...recordsRowStyle, ...recordsHeaderRowStyle }}>
                    <div style={recordsCellAgentStyle}>Agent</div>
                    <div style={recordsCellDateFromStyle}>Date From</div>
                    <div style={recordsCellDateToStyle}>Date To</div>
                    <div style={recordsCellMetricStyle}>{getRecordMetricLabel()}</div>
                    <div style={recordsCellNotesStyle}>Notes</div>
                  </div>

                  {filteredRecords.map((record) => (
                    <div key={record.id} style={recordsRowStyle}>
                      <div style={recordsCellAgentStyle}>
                        <div style={primaryCellTextStyle}>
                          {getAgentLabel(record.agent_id, record.agent_name)}
                        </div>
                      </div>

                      <div style={recordsCellDateFromStyle}>
                        <div style={primaryCellTextStyle}>
                          {getRecordStartDate(record)}
                        </div>
                      </div>

                      <div style={recordsCellDateToStyle}>
                        <div style={primaryCellTextStyle}>
                          {record.date_to || '-'}
                        </div>
                      </div>

                      <div style={recordsCellMetricStyle}>
                        <div style={primaryCellTextStyle}>
                          {getRecordMetricValue(record)}
                        </div>
                      </div>

                      <div style={recordsCellNotesStyle}>
                        <div style={primaryCellTextStyle}>
                          {record.notes || '-'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Section>

          <DigitalTrophyCabinet scope="team" currentUser={currentUser} />
          <RecognitionWall compact currentUser={currentUser as any} />
          <VoiceOfEmployeeSupabase currentUser={currentUser} />

          <MonitoringWidget
            count={monitoringItems.length}
            onClick={handleMonitoringWidgetClick}
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

const sectionHeaderActionsStyle = {
  display: 'flex',
  justifyContent: 'flex-end',
  marginBottom: '12px',
};

const collapsedMessageStyle = {
  color: 'var(--da-subtle-text, #94a3b8)',
  fontWeight: 600,
  padding: '8px 2px',
};

const pageHeaderStyle = {
  display: 'flex',
  gap: '16px',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexWrap: 'wrap' as const,
  marginBottom: '22px',
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
  border: 'var(--da-panel-border, 1px solid rgba(148,163,184,0.14))',
  borderRadius: '24px',
  padding: '22px',
  boxShadow: 'var(--da-panel-shadow, 0 18px 40px rgba(2,6,23,0.26))',
  backdropFilter: 'blur(16px)',
};

const filterGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '16px',
};

const labelStyle = {
  display: 'block',
  marginBottom: '8px',
  color: 'var(--da-muted-text, #475569)',
  fontWeight: 700,
  fontSize: '13px',
};

const fieldStyle = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: '12px',
  border: 'var(--da-field-border, 1px solid rgba(148,163,184,0.16))',
  background: 'var(--da-field-bg, rgba(15,23,42,0.7))',
  color: 'var(--da-field-text, #e5eefb)',
};

const pickerButtonStyle = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: '12px',
  border: 'var(--da-field-border, 1px solid rgba(148,163,184,0.16))',
  background: 'var(--da-field-bg, rgba(15,23,42,0.7))',
  textAlign: 'left' as const,
  cursor: 'pointer',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  color: 'var(--da-field-text, #e5eefb)',
};

const pickerMenuStyle = {
  position: 'absolute' as const,
  top: 'calc(100% + 8px)',
  left: 0,
  right: 0,
  background: 'var(--da-menu-bg, rgba(15,23,42,0.96))',
  border: 'var(--da-field-border, 1px solid rgba(148,163,184,0.16))',
  borderRadius: '16px',
  boxShadow: 'var(--da-panel-shadow, 0 10px 30px rgba(0,0,0,0.22))',
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
  backgroundColor: 'var(--da-card-bg, rgba(15,23,42,0.68))',
  color: 'var(--da-subtle-text, #94a3b8)',
};

const pickerOptionStyle = {
  padding: '12px',
  borderRadius: '8px',
  border: '1px solid rgba(148,163,184,0.12)',
  backgroundColor: 'var(--da-option-bg, rgba(15,23,42,0.6))',
  textAlign: 'left' as const,
  cursor: 'pointer',
  fontWeight: 500,
  color: 'var(--da-field-text, #e5eefb)',
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
  border: 'var(--da-panel-border, 1px solid rgba(148,163,184,0.14))',
  borderRadius: '22px',
  padding: '22px',
  boxShadow: 'var(--da-panel-shadow, 0 18px 40px rgba(2,6,23,0.24))',
};

const secondaryButton = {
  backgroundColor: 'var(--da-secondary-bg, rgba(15,23,42,0.78))',
  color: 'var(--da-secondary-text, #e5eefb)',
  border: 'var(--da-secondary-border, 1px solid rgba(148,163,184,0.18))',
  padding: '10px 14px',
  borderRadius: '10px',
  cursor: 'pointer',
  fontWeight: 700,
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
  minWidth: '1320px',
};

const auditEntryStyle = {
  borderBottom: '1px solid rgba(148,163,184,0.08)',
};

const auditRowStyle = {
  display: 'grid',
  gridTemplateColumns:
    '140px 220px minmax(240px, 1.4fr) 120px 180px 220px minmax(260px, 1.6fr) 100px',
  gap: '14px',
  alignItems: 'center',
  padding: '14px 16px',
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
const auditCellActionsStyle = {
  display: 'flex',
  gap: '8px',
  flexWrap: 'wrap' as const,
};

const primaryCellTextStyle = {
  color: 'var(--da-title, #f8fafc)',
  fontSize: '14px',
  fontWeight: 600,
  lineHeight: 1.4,
};

const secondaryCellTextStyle = {
  marginTop: '4px',
  color: 'var(--da-subtle-text, #64748b)',
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
  background: 'rgba(37, 99, 235, 0.14)',
  border: '1px solid rgba(96,165,250,0.32)',
  color: 'var(--da-accent-text, #2563eb)',
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

const miniSecondaryButton = {
  padding: '8px 10px',
  background: 'var(--da-secondary-bg, rgba(15,23,42,0.78))',
  color: 'var(--da-secondary-text, #e5eefb)',
  border: 'var(--da-secondary-border, 1px solid rgba(148,163,184,0.18))',
  borderRadius: '10px',
  cursor: 'pointer',
  fontWeight: 700,
  fontSize: '12px',
};

const auditExpandedRowStyle = {
  padding: '0 16px 16px 16px',
};

const expandedPanelStyle = {
  borderRadius: '18px',
  border: '1px solid rgba(148,163,184,0.14)',
  background:
    'var(--da-panel-bg, linear-gradient(180deg, var(--da-field-bg, rgba(15, 23, 42, 0.82)) 0%, var(--da-surface-bg, rgba(15, 23, 42, 0.68)) 100%))',
  padding: '18px',
};

const detailInfoGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '12px',
  marginBottom: '18px',
};

const detailInfoCardStyle = {
  borderRadius: '14px',
  border: '1px solid rgba(148,163,184,0.14)',
  background: 'var(--da-surface-bg, rgba(15,23,42,0.6))',
  padding: '14px 16px',
};

const detailLabelStyle = {
  color: 'var(--da-subtle-text, #94a3b8)',
  fontSize: '12px',
  fontWeight: 700,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.08em',
  marginBottom: '8px',
};

const detailValueStyle = {
  color: 'var(--da-title, #f8fafc)',
  fontSize: '14px',
  fontWeight: 700,
  lineHeight: 1.5,
};

const fullCommentCardStyle = {
  borderRadius: '14px',
  border: '1px solid rgba(148,163,184,0.14)',
  background: 'var(--da-surface-bg, rgba(15,23,42,0.6))',
  padding: '14px 16px',
  marginBottom: '18px',
};

const fullCommentTextStyle = {
  color: 'var(--da-page-text, #e5eefb)',
  fontSize: '14px',
  lineHeight: 1.7,
  whiteSpace: 'pre-wrap' as const,
  wordBreak: 'break-word' as const,
};

const detailRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '12px',
  alignItems: 'center',
  padding: '12px 14px',
  borderRadius: '14px',
  border: '1px solid rgba(148,163,184,0.12)',
  background: 'var(--da-surface-bg, rgba(15,23,42,0.52))',
};

const metricNoteCardStyle = {
  marginTop: '10px',
  borderRadius: '12px',
  border: '1px solid rgba(148,163,184,0.12)',
  background: 'var(--da-surface-bg, rgba(15,23,42,0.52))',
  padding: '10px 12px',
};

const metricNoteLabelStyle = {
  color: 'var(--da-accent-text, #93c5fd)',
  fontSize: '11px',
  fontWeight: 800,
  letterSpacing: '0.1em',
  textTransform: 'uppercase' as const,
  marginBottom: '6px',
};

const metricNoteTextStyle = {
  color: 'var(--da-page-text, #e5eefb)',
  fontSize: '13px',
  lineHeight: 1.55,
  whiteSpace: 'pre-wrap' as const,
};

const recordsTableWrapStyle = {
  marginTop: '16px',
  overflowX: 'auto' as const,
  borderRadius: '18px',
  border: 'var(--da-panel-border, 1px solid rgba(148,163,184,0.14))',
  background:
    'var(--da-panel-bg, linear-gradient(180deg, var(--da-field-bg, rgba(15, 23, 42, 0.82)) 0%, var(--da-surface-bg, rgba(15, 23, 42, 0.68)) 100%))',
  boxShadow: 'var(--da-panel-shadow, 0 8px 24px rgba(2,6,23,0.2))',
};

const recordsTableStyle = {
  minWidth: '1080px',
};

const recordsRowStyle = {
  display: 'grid',
  gridTemplateColumns: '240px 150px 150px 170px minmax(280px, 1.4fr)',
  gap: '14px',
  alignItems: 'center',
  padding: '14px 16px',
  borderBottom: '1px solid rgba(148,163,184,0.1)',
};

const recordsHeaderRowStyle = {
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

const recordsCellAgentStyle = {};
const recordsCellDateFromStyle = {};
const recordsCellDateToStyle = {};
const recordsCellMetricStyle = {};
const recordsCellNotesStyle = {};

export default SupervisorPortal;
