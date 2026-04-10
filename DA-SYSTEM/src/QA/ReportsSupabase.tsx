import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';

type AuditItem = {
  id: string;
  agent_id: string;
  agent_name: string;
  team: string;
  case_type: string;
  audit_date: string;
  order_number: string | null;
  phone_number: string | null;
  ticket_id: string | null;
  quality_score: number;
  comments: string | null;
};

type AgentProfile = {
  id: string;
  agent_id: string | null;
  agent_name: string;
  display_name: string | null;
  team: 'Calls' | 'Tickets' | 'Sales' | null;
};

type CallsRecord = {
  id: string;
  agent_id: string;
  agent_name: string;
  calls_count: number;
  call_date: string;
  notes: string | null;
};

type TicketsRecord = {
  id: string;
  agent_id: string;
  agent_name: string;
  tickets_count: number;
  ticket_date: string;
  notes: string | null;
};

type SalesRecord = {
  id: string;
  agent_id: string;
  agent_name: string;
  amount: number;
  sale_date: string;
  notes: string | null;
};

type SupervisorRequest = {
  id: string;
  status: 'Open' | 'Under Review' | 'Closed';
  created_at: string;
  team: string | null;
  priority: 'Low' | 'Medium' | 'High' | 'Urgent';
  case_reference: string;
  agent_id?: string | null;
  agent_name?: string | null;
  case_type?: string;
  supervisor_name?: string;
  request_note?: string;
};

type AgentFeedback = {
  id: string;
  status: 'Open' | 'In Progress' | 'Closed';
  created_at: string;
  team: string;
  feedback_type: 'Coaching' | 'Audit Feedback' | 'Warning' | 'Follow-up';
  agent_name: string;
  agent_id?: string;
  qa_name?: string;
  subject: string;
  feedback_note?: string;
  action_plan?: string | null;
  due_date?: string | null;
};


function openNativeDatePicker(target: HTMLInputElement) {
  const input = target as HTMLInputElement & { showPicker?: () => void };
  input.showPicker?.();
}

function getThemeVars(): Record<string, string> {
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
    '--screen-text': isLight ? '#334155' : '#e5eefb',
    '--screen-heading': isLight ? '#0f172a' : '#f8fafc',
    '--screen-muted': isLight ? '#7c8ca8' : '#94a3b8',
    '--screen-subtle': isLight ? '#64748b' : '#64748b',
    '--screen-accent': isLight ? '#2563eb' : '#60a5fa',
    '--screen-panel-bg': isLight
      ? 'linear-gradient(180deg, rgba(255,255,255,0.99) 0%, rgba(247,250,255,0.97) 100%)'
      : 'linear-gradient(180deg, rgba(15,23,42,0.82) 0%, rgba(15,23,42,0.68) 100%)',
    '--screen-card-bg': isLight
      ? 'linear-gradient(180deg, rgba(255,255,255,0.99) 0%, rgba(248,250,255,0.98) 100%)'
      : 'linear-gradient(180deg, rgba(15,23,42,0.82) 0%, rgba(15,23,42,0.68) 100%)',
    '--screen-card-soft-bg': isLight
      ? 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,255,0.97) 100%)'
      : 'rgba(15,23,42,0.52)',
    '--screen-field-bg': isLight
      ? 'linear-gradient(180deg, rgba(255,255,255,0.99) 0%, rgba(250,252,255,0.99) 100%)'
      : 'rgba(15,23,42,0.7)',
    '--screen-field-text': isLight ? '#334155' : '#e5eefb',
    '--screen-border': isLight ? 'rgba(203,213,225,0.92)' : 'rgba(148,163,184,0.14)',
    '--screen-border-strong': isLight ? 'rgba(191, 211, 237, 0.95)' : 'rgba(148,163,184,0.18)',
    '--screen-table-head-bg': isLight ? 'rgba(13, 27, 57, 0.98)' : 'rgba(2,6,23,0.92)',
    '--screen-pill-bg': isLight ? 'rgba(248,250,252,0.98)' : 'rgba(15,23,42,0.56)',
    '--screen-secondary-btn-bg': isLight ? 'rgba(255,255,255,0.98)' : 'rgba(15,23,42,0.78)',
    '--screen-secondary-btn-text': isLight ? '#475569' : '#e5eefb',
    '--screen-menu-bg': isLight ? 'rgba(255,255,255,0.99)' : 'rgba(15,23,42,0.96)',
    '--screen-shadow': isLight ? '0 18px 40px rgba(15,23,42,0.10)' : '0 18px 40px rgba(2,6,23,0.35)',
    '--screen-score-pill-bg': isLight ? 'rgba(37,99,235,0.10)' : 'rgba(37,99,235,0.18)',
    '--screen-score-pill-border': isLight ? 'rgba(59,130,246,0.34)' : 'rgba(96,165,250,0.26)',
    '--screen-score-pill-text': isLight ? '#1d4ed8' : '#dbeafe',
  };
}

function ReportsSupabase() {
  const [audits, setAudits] = useState<AuditItem[]>([]);
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [callsRecords, setCallsRecords] = useState<CallsRecord[]>([]);
  const [ticketsRecords, setTicketsRecords] = useState<TicketsRecord[]>([]);
  const [salesRecords, setSalesRecords] = useState<SalesRecord[]>([]);
  const [supervisorRequests, setSupervisorRequests] = useState<
    SupervisorRequest[]
  >([]);
  const [agentFeedback, setAgentFeedback] = useState<AgentFeedback[]>([]);
  const [loading, setLoading] = useState(true);

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [selectedAgentProfileId, setSelectedAgentProfileId] = useState('');
  const [agentSearch, setAgentSearch] = useState('');
  const [isAgentPickerOpen, setIsAgentPickerOpen] = useState(false);

  const agentPickerRef = useRef<HTMLDivElement | null>(null);
  const themeVars = getThemeVars();

  useEffect(() => {
    void loadReportsData();
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

  async function loadReportsData() {
    setLoading(true);

    const [
      auditsResult,
      profilesResult,
      callsResult,
      ticketsResult,
      salesResult,
      requestsResult,
      feedbackResult,
    ] = await Promise.all([
      supabase
        .from('audits')
        .select('*')
        .order('audit_date', { ascending: false }),
      supabase
        .from('profiles')
        .select('id, agent_id, agent_name, display_name, team')
        .eq('role', 'agent')
        .order('agent_name', { ascending: true }),
      supabase
        .from('calls_records')
        .select('*')
        .order('call_date', { ascending: false }),
      supabase
        .from('tickets_records')
        .select('*')
        .order('ticket_date', { ascending: false }),
      supabase
        .from('sales_records')
        .select('*')
        .order('sale_date', { ascending: false }),
      supabase
        .from('supervisor_requests')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase
        .from('agent_feedback')
        .select('*')
        .order('created_at', { ascending: false }),
    ]);

    setAudits((auditsResult.data as AuditItem[]) || []);
    setProfiles((profilesResult.data as AgentProfile[]) || []);
    setCallsRecords((callsResult.data as CallsRecord[]) || []);
    setTicketsRecords((ticketsResult.data as TicketsRecord[]) || []);
    setSalesRecords((salesResult.data as SalesRecord[]) || []);
    setSupervisorRequests((requestsResult.data as SupervisorRequest[]) || []);
    setAgentFeedback((feedbackResult.data as AgentFeedback[]) || []);

    setLoading(false);
  }

  function getDisplayName(
    agentId?: string | null,
    agentName?: string | null,
    team?: string | null
  ) {
    const matchedProfile = profiles.find(
      (profile) =>
        profile.agent_id === (agentId || null) &&
        profile.agent_name === (agentName || '') &&
        profile.team === (team || null)
    );

    return matchedProfile?.display_name || null;
  }

  function getAgentLabel(profile: AgentProfile) {
    return profile.display_name
      ? `${profile.agent_name} - ${profile.display_name}`
      : `${profile.agent_name} - ${profile.agent_id}`;
  }

  function formatDateOnly(value?: string | null) {
    if (!value) return '-';
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString();
  }

  function getAuditReference(item: AuditItem) {
    if (item.team === 'Tickets') {
      return `Ticket ID: ${item.ticket_id || '-'}`;
    }

    return `Order #: ${item.order_number || '-'} | Phone: ${item.phone_number || '-'}`;
  }

  function getShareBadgeStyle(shared?: boolean) {
    return {
      ...statusPillStyle,
      backgroundColor: shared ? '#166534' : '#475569',
      color: '#ffffff',
    };
  }

  function normalizeAgentId(value?: string | null) {
    return String(value || '').trim().replace(/\.0+$/, '');
  }

  function normalizeAgentName(value?: string | null) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }


  function matchesDate(dateValue: string) {
    const afterFrom = dateFrom ? dateValue >= dateFrom : true;
    const beforeTo = dateTo ? dateValue <= dateTo : true;
    return afterFrom && beforeTo;
  }

  function matchesSelectedAgent(
    itemAgentId?: string | null,
    itemAgentName?: string | null,
    itemTeam?: string | null
  ) {
    if (!selectedAgent) return true;

    const teamMatches = !selectedAgent.team || (itemTeam || '') === selectedAgent.team;

    if (!teamMatches) {
      return false;
    }

    const selectedId = normalizeAgentId(selectedAgent.agent_id);
    const recordId = normalizeAgentId(itemAgentId);

    if (selectedId && recordId) {
      return selectedId === recordId;
    }

    return normalizeAgentName(itemAgentName) === normalizeAgentName(selectedAgent.agent_name);
  }

  const visibleAgentProfiles = useMemo(() => {
    const scopedProfiles = teamFilter
      ? profiles.filter((profile) => profile.team === teamFilter)
      : profiles;

    const search = agentSearch.trim().toLowerCase();

    if (!search) return scopedProfiles;

    return scopedProfiles.filter((profile) => {
      const label = getAgentLabel(profile).toLowerCase();

      return (
        profile.agent_name.toLowerCase().includes(search) ||
        (profile.agent_id || '').toLowerCase().includes(search) ||
        (profile.display_name || '').toLowerCase().includes(search) ||
        label.includes(search)
      );
    });
  }, [profiles, teamFilter, agentSearch]);

  const selectedAgent =
    profiles.find((profile) => profile.id === selectedAgentProfileId) || null;

  function handleSelectAgent(profile: AgentProfile) {
    setSelectedAgentProfileId(profile.id);
    setAgentSearch(getAgentLabel(profile));
    setIsAgentPickerOpen(false);
    if (profile.team) {
      setTeamFilter(profile.team);
    }
  }

  function clearAgentFilter() {
    setSelectedAgentProfileId('');
    setAgentSearch('');
    setIsAgentPickerOpen(false);
  }

  const filteredAudits = useMemo(() => {
    return audits.filter((item) => {
      const matchesTeam = teamFilter ? item.team === teamFilter : true;
      const matchesAgent = matchesSelectedAgent(
        item.agent_id,
        item.agent_name,
        item.team
      );
      return matchesTeam && matchesAgent && matchesDate(item.audit_date);
    });
  }, [audits, teamFilter, dateFrom, dateTo, selectedAgentProfileId]);

  const filteredCalls = useMemo(() => {
    return callsRecords.filter((item) => {
      const matchesTeam = teamFilter ? teamFilter === 'Calls' : true;
      const matchesAgent = matchesSelectedAgent(
        item.agent_id,
        item.agent_name,
        'Calls'
      );
      return matchesTeam && matchesAgent && matchesDate(item.call_date);
    });
  }, [callsRecords, teamFilter, dateFrom, dateTo, selectedAgentProfileId]);

  const filteredTickets = useMemo(() => {
    return ticketsRecords.filter((item) => {
      const matchesTeam = teamFilter ? teamFilter === 'Tickets' : true;
      const matchesAgent = matchesSelectedAgent(
        item.agent_id,
        item.agent_name,
        'Tickets'
      );
      return matchesTeam && matchesAgent && matchesDate(item.ticket_date);
    });
  }, [ticketsRecords, teamFilter, dateFrom, dateTo, selectedAgentProfileId]);

  const filteredSales = useMemo(() => {
    return salesRecords.filter((item) => {
      const matchesTeam = teamFilter ? teamFilter === 'Sales' : true;
      const matchesAgent = matchesSelectedAgent(
        item.agent_id,
        item.agent_name,
        'Sales'
      );
      return matchesTeam && matchesAgent && matchesDate(item.sale_date);
    });
  }, [salesRecords, teamFilter, dateFrom, dateTo, selectedAgentProfileId]);

  const filteredRequests = useMemo(() => {
    return supervisorRequests.filter((item) => {
      const matchesTeam = teamFilter ? item.team === teamFilter : true;
      const matchesAgent = matchesSelectedAgent(
        item.agent_id || null,
        item.agent_name || null,
        item.team || null
      );
      return (
        matchesTeam && matchesAgent && matchesDate(item.created_at.slice(0, 10))
      );
    });
  }, [
    supervisorRequests,
    teamFilter,
    dateFrom,
    dateTo,
    selectedAgentProfileId,
  ]);

  const filteredFeedback = useMemo(() => {
    return agentFeedback.filter((item) => {
      const matchesTeam = teamFilter ? item.team === teamFilter : true;
      const matchesAgent = matchesSelectedAgent(
        item.agent_id || null,
        item.agent_name || null,
        item.team || null
      );
      return (
        matchesTeam && matchesAgent && matchesDate(item.created_at.slice(0, 10))
      );
    });
  }, [agentFeedback, teamFilter, dateFrom, dateTo, selectedAgentProfileId]);

  const averageQuality =
    filteredAudits.length > 0
      ? (
          filteredAudits.reduce(
            (sum, item) => sum + Number(item.quality_score),
            0
          ) / filteredAudits.length
        ).toFixed(2)
      : '0.00';

  const totalCalls = filteredCalls.reduce(
    (sum, item) => sum + Number(item.calls_count),
    0
  );
  const totalTickets = filteredTickets.reduce(
    (sum, item) => sum + Number(item.tickets_count),
    0
  );
  const totalSales = filteredSales.reduce(
    (sum, item) => sum + Number(item.amount),
    0
  );

  const openRequests = filteredRequests.filter(
    (item) => item.status !== 'Closed'
  ).length;
  const closedRequests = filteredRequests.filter(
    (item) => item.status === 'Closed'
  ).length;

  const openFeedback = filteredFeedback.filter(
    (item) => item.status !== 'Closed'
  ).length;
  const closedFeedback = filteredFeedback.filter(
    (item) => item.status === 'Closed'
  ).length;

  const callsAudits = filteredAudits.filter((item) => item.team === 'Calls');
  const ticketsAudits = filteredAudits.filter(
    (item) => item.team === 'Tickets'
  );
  const salesAudits = filteredAudits.filter((item) => item.team === 'Sales');

  const callsAverage =
    callsAudits.length > 0
      ? (
          callsAudits.reduce(
            (sum, item) => sum + Number(item.quality_score),
            0
          ) / callsAudits.length
        ).toFixed(2)
      : '0.00';

  const ticketsAverage =
    ticketsAudits.length > 0
      ? (
          ticketsAudits.reduce(
            (sum, item) => sum + Number(item.quality_score),
            0
          ) / ticketsAudits.length
        ).toFixed(2)
      : '0.00';

  const salesAverage =
    salesAudits.length > 0
      ? (
          salesAudits.reduce(
            (sum, item) => sum + Number(item.quality_score),
            0
          ) / salesAudits.length
        ).toFixed(2)
      : '0.00';

  const selectedAgentFeedbackByType = useMemo(() => {
    const grouped = new Map<string, number>();

    filteredFeedback.forEach((item) => {
      grouped.set(
        item.feedback_type,
        (grouped.get(item.feedback_type) || 0) + 1
      );
    });

    return Array.from(grouped.entries()).map(([type, count]) => ({
      type,
      count,
    }));
  }, [filteredFeedback]);

  function escapeCsvValue(value: unknown) {
    const stringValue = value == null ? '' : String(value);
    if (
      stringValue.includes(',') ||
      stringValue.includes('"') ||
      stringValue.includes('\n')
    ) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
  }

  function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
    if (rows.length === 0) {
      alert('No data to export.');
      return;
    }

    const headers = Object.keys(rows[0]);
    const csvLines = [
      headers.join(','),
      ...rows.map((row) =>
        headers.map((header) => escapeCsvValue(row[header])).join(',')
      ),
    ];

    const blob = new Blob([csvLines.join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportSummaryCsv() {
    downloadCsv('reports_summary.csv', [
      {
        date_from: dateFrom || 'All',
        date_to: dateTo || 'All',
        team_filter: teamFilter || 'All',
        selected_agent: selectedAgent
          ? getAgentLabel(selectedAgent)
          : 'All Agents',
        total_audits: filteredAudits.length,
        average_quality: averageQuality,
        total_calls: totalCalls,
        total_tickets: totalTickets,
        total_sales: totalSales.toFixed(2),
        open_supervisor_requests: openRequests,
        closed_supervisor_requests: closedRequests,
        open_agent_feedback: openFeedback,
        closed_agent_feedback: closedFeedback,
        calls_avg_quality: callsAverage,
        tickets_avg_quality: ticketsAverage,
        sales_avg_quality: salesAverage,
      },
    ]);
  }

  function exportAuditsCsv() {
    downloadCsv(
      'audits_report.csv',
      filteredAudits.map((item) => ({
        id: item.id,
        agent_id: item.agent_id,
        agent_name: item.agent_name,
        display_name:
          getDisplayName(item.agent_id, item.agent_name, item.team) || '',
        team: item.team,
        case_type: item.case_type,
        audit_date: item.audit_date,
        order_number: item.order_number || '',
        phone_number: item.phone_number || '',
        ticket_id: item.ticket_id || '',
        quality_score: Number(item.quality_score).toFixed(2),
        comments: item.comments || '',
      }))
    );
  }

  function exportCallsCsv() {
    downloadCsv(
      'calls_report.csv',
      filteredCalls.map((item) => ({
        id: item.id,
        agent_id: item.agent_id,
        agent_name: item.agent_name,
        calls_count: item.calls_count,
        call_date: item.call_date,
        notes: item.notes || '',
      }))
    );
  }

  function exportTicketsCsv() {
    downloadCsv(
      'tickets_report.csv',
      filteredTickets.map((item) => ({
        id: item.id,
        agent_id: item.agent_id,
        agent_name: item.agent_name,
        tickets_count: item.tickets_count,
        ticket_date: item.ticket_date,
        notes: item.notes || '',
      }))
    );
  }

  function exportSalesCsv() {
    downloadCsv(
      'sales_report.csv',
      filteredSales.map((item) => ({
        id: item.id,
        agent_id: item.agent_id,
        agent_name: item.agent_name,
        amount: Number(item.amount).toFixed(2),
        sale_date: item.sale_date,
        notes: item.notes || '',
      }))
    );
  }

  function exportRequestsCsv() {
    downloadCsv(
      'supervisor_requests_report.csv',
      filteredRequests.map((item) => ({
        id: item.id,
        case_reference: item.case_reference,
        team: item.team || '',
        priority: item.priority,
        status: item.status,
        created_at: item.created_at,
        agent_id: item.agent_id || '',
        agent_name: item.agent_name || '',
        display_name:
          getDisplayName(
            item.agent_id || null,
            item.agent_name || null,
            item.team || null
          ) || '',
        case_type: item.case_type || '',
        supervisor_name: item.supervisor_name || '',
        request_note: item.request_note || '',
      }))
    );
  }

  function exportFeedbackCsv() {
    downloadCsv(
      'agent_feedback_report.csv',
      filteredFeedback.map((item) => ({
        id: item.id,
        agent_id: item.agent_id || '',
        agent_name: item.agent_name,
        display_name:
          getDisplayName(
            item.agent_id || null,
            item.agent_name || null,
            item.team || null
          ) || '',
        team: item.team,
        qa_name: item.qa_name || '',
        feedback_type: item.feedback_type,
        subject: item.subject,
        feedback_note: item.feedback_note || '',
        action_plan: item.action_plan || '',
        due_date: item.due_date || '',
        status: item.status,
        created_at: item.created_at,
      }))
    );
  }

  if (loading) {
    return <div style={{ color: 'var(--screen-text)', ...(themeVars as CSSProperties) }}>Loading reports...</div>;
  }

  return (
    <div data-no-theme-invert="true" style={{ color: 'var(--screen-text)', ...(themeVars as CSSProperties) }}>
      <div style={pageHeaderStyle}>
        <div>
          <div style={sectionEyebrow}>Reporting</div>
          <h2 style={{ margin: 0, color: 'var(--screen-heading)' }}>Reports</h2>
          <p style={{ margin: '10px 0 0 0', color: 'var(--screen-muted)' }}>
            Filter by date, team, and agent to build detailed performance
            reports.
          </p>
        </div>
      </div>

      <div style={filterPanelStyle}>
        <div style={filterGridStyle}>
          <div>
            <label style={labelStyle}>Date From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              onClick={(e) => openNativeDatePicker(e.currentTarget)}
              onFocus={(e) => openNativeDatePicker(e.currentTarget)}
              style={fieldStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Date To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              onClick={(e) => openNativeDatePicker(e.currentTarget)}
              onFocus={(e) => openNativeDatePicker(e.currentTarget)}
              style={fieldStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Team Filter</label>
            <select
              value={teamFilter}
              onChange={(e) => {
                setTeamFilter(e.target.value);
                clearAgentFilter();
              }}
              style={fieldStyle}
            >
              <option value="">All Teams</option>
              <option value="Calls">Calls</option>
              <option value="Tickets">Tickets</option>
              <option value="Sales">Sales</option>
            </select>
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Agent Report Filter</label>
            <div ref={agentPickerRef} style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setIsAgentPickerOpen((prev) => !prev)}
                style={pickerButtonStyle}
              >
                <span style={{ color: selectedAgent ? 'var(--screen-heading)' : 'var(--screen-muted)' }}>
                  {selectedAgent
                    ? getAgentLabel(selectedAgent)
                    : 'Select agent'}
                </span>
                <span>▼</span>
              </button>

              {isAgentPickerOpen && (
                <div style={pickerMenuStyle}>
                  <div
                    style={{
                      padding: '12px',
                      borderBottom: '1px solid rgba(148,163,184,0.12)',
                    }}
                  >
                    <input
                      type="text"
                      value={agentSearch}
                      onChange={(e) => setAgentSearch(e.target.value)}
                      placeholder="Search by name, ID, or display name"
                      style={fieldStyle}
                    />
                  </div>

                  <div style={pickerListStyle}>
                    {visibleAgentProfiles.length === 0 ? (
                      <div style={pickerInfoStyle}>No agents found</div>
                    ) : (
                      visibleAgentProfiles.map((profile) => (
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

            <div style={filterActionsStyle}>
              <button
                type="button"
                onClick={clearAgentFilter}
                style={secondaryButton}
              >
                Clear Agent Filter
              </button>
            </div>
          </div>
        </div>
      </div>

      <div style={buttonRowStyle}>
        <button onClick={exportSummaryCsv} style={primaryButton}>
          Export Summary CSV
        </button>
        <button onClick={exportAuditsCsv} style={primaryButton}>
          Export Audits CSV
        </button>
        <button onClick={exportCallsCsv} style={primaryButton}>
          Export Calls CSV
        </button>
        <button onClick={exportTicketsCsv} style={primaryButton}>
          Export Tickets CSV
        </button>
        <button onClick={exportSalesCsv} style={primaryButton}>
          Export Sales CSV
        </button>
        <button onClick={exportRequestsCsv} style={primaryButton}>
          Export Requests CSV
        </button>
        <button onClick={exportFeedbackCsv} style={primaryButton}>
          Export Feedback CSV
        </button>
      </div>

      <h3 style={sectionTitleStyle}>Summary</h3>
      <div style={summaryGridStyle}>
        <SummaryCard
          title="Total Audits"
          value={String(filteredAudits.length)}
        />
        <SummaryCard title="Average Quality" value={`${averageQuality}%`} />
        <SummaryCard title="Total Calls" value={String(totalCalls)} />
        <SummaryCard title="Total Tickets" value={String(totalTickets)} />
        <SummaryCard title="Total Sales" value={`$${totalSales.toFixed(2)}`} />
        <SummaryCard
          title="Open Supervisor Requests"
          value={String(openRequests)}
        />
        <SummaryCard
          title="Closed Supervisor Requests"
          value={String(closedRequests)}
        />
        <SummaryCard title="Open Agent Feedback" value={String(openFeedback)} />
        <SummaryCard
          title="Closed Agent Feedback"
          value={String(closedFeedback)}
        />
      </div>

      <h3 style={sectionTitleStyle}>Team Breakdown</h3>
      <div style={summaryGridStyle}>
        <SummaryCard title="Calls Avg Quality" value={`${callsAverage}%`} />
        <SummaryCard title="Tickets Avg Quality" value={`${ticketsAverage}%`} />
        <SummaryCard title="Sales Avg Quality" value={`${salesAverage}%`} />
      </div>

      {selectedAgent && (
        <Section title={`Agent Report: ${getAgentLabel(selectedAgent)}`}>
          <div style={summaryGridStyle}>
            <SummaryCard title="Agent Team" value={selectedAgent.team || '-'} />
            <SummaryCard
              title="Agent Audits"
              value={String(filteredAudits.length)}
            />
            <SummaryCard
              title="Agent Avg Quality"
              value={`${averageQuality}%`}
            />
            {selectedAgent.team === 'Calls' && (
              <SummaryCard
                title="Agent Total Calls"
                value={String(totalCalls)}
              />
            )}
            {selectedAgent.team === 'Tickets' && (
              <SummaryCard
                title="Agent Total Tickets"
                value={String(totalTickets)}
              />
            )}
            {selectedAgent.team === 'Sales' && (
              <SummaryCard
                title="Agent Total Sales"
                value={`$${totalSales.toFixed(2)}`}
              />
            )}
            <SummaryCard
              title="Agent Feedback Items"
              value={String(filteredFeedback.length)}
            />
            <SummaryCard
              title="Agent Open Feedback"
              value={String(openFeedback)}
            />
            <SummaryCard
              title="Agent Closed Feedback"
              value={String(closedFeedback)}
            />
            <SummaryCard
              title="Agent Requests"
              value={String(filteredRequests.length)}
            />
          </div>

          <div style={detailGridStyle}>
            <div style={detailCardStyle}>
              <div style={detailLabelStyle}>Agent Details</div>
              <p>
                <strong>Agent Name:</strong> {selectedAgent.agent_name}
              </p>
              <p>
                <strong>Display Name:</strong>{' '}
                {selectedAgent.display_name || '-'}
              </p>
              <p>
                <strong>Agent ID:</strong> {selectedAgent.agent_id || '-'}
              </p>
              <p>
                <strong>Team:</strong> {selectedAgent.team || '-'}
              </p>
            </div>

            <div style={detailCardStyle}>
              <div style={detailLabelStyle}>Feedback Breakdown</div>
              {selectedAgentFeedbackByType.length === 0 ? (
                <p>No feedback items for this agent.</p>
              ) : (
                selectedAgentFeedbackByType.map((item) => (
                  <p key={item.type}>
                    <strong>{item.type}:</strong> {item.count}
                  </p>
                ))
              )}
            </div>
          </div>
        </Section>
      )}


      <Section title="Recent Audits">
        {filteredAudits.length === 0 ? (
          <p>No audits in this range.</p>
        ) : (
          <div style={auditTableWrapStyle}>
            <div style={auditTableStyle}>
              <div style={{ ...auditRowStyle, ...auditHeaderRowStyle }}>
                <div style={auditCellAgentStyle}>Agent</div>
                <div style={auditCellDateStyle}>Audit Date</div>
                <div style={auditCellCaseStyle}>Case Type</div>
                <div style={auditCellReferenceStyle}>Reference</div>
                <div style={auditCellScoreStyle}>Quality</div>
                <div style={auditCellReleaseStyle}>Release</div>
                <div style={auditCellCommentsStyle}>Comments</div>
              </div>

              {filteredAudits.slice(0, 10).map((item) => (
                <div key={item.id} style={auditEntryStyle}>
                  <div style={auditRowStyle}>
                    <div style={auditCellAgentStyle}>
                      <div style={primaryCellTextStyle}>{item.agent_name}</div>
                      <div style={secondaryCellTextStyle}>
                        {getDisplayName(item.agent_id, item.agent_name, item.team) || '-'} • {item.agent_id} • {item.team}
                      </div>
                    </div>

                    <div style={auditCellDateStyle}>
                      <div style={primaryCellTextStyle}>{formatDateOnly(item.audit_date)}</div>
                    </div>

                    <div style={auditCellCaseStyle}>
                      <div style={primaryCellTextStyle}>{item.case_type}</div>
                    </div>

                    <div style={auditCellReferenceStyle}>
                      <div style={primaryCellTextStyle}>{getAuditReference(item)}</div>
                    </div>

                    <div style={auditCellScoreStyle}>
                      <span style={scorePillStyle}>{Number(item.quality_score).toFixed(2)}%</span>
                    </div>

                    <div style={auditCellReleaseStyle}>
                      <span style={getShareBadgeStyle(item.shared_with_agent)}>{item.shared_with_agent ? 'Shared' : 'Hidden'}</span>
                    </div>

                    <div style={auditCellCommentsStyle}>
                      <div style={primaryCellTextStyle}>{item.comments?.trim() || '-'}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>

      <Section title="Recent Supervisor Requests">
        {filteredRequests.length === 0 ? (
          <p>No supervisor requests in this range.</p>
        ) : (
          <div style={{ display: 'grid', gap: '12px' }}>
            {filteredRequests.slice(0, 10).map((item) => (
              <div key={item.id} style={contentCardStyle}>
                <p>
                  <strong>Case Ref:</strong> {item.case_reference}
                </p>
                <p>
                  <strong>Agent:</strong> {item.agent_name || '-'}
                </p>
                <p>
                  <strong>Display Name:</strong>{' '}
                  {getDisplayName(
                    item.agent_id || null,
                    item.agent_name || null,
                    item.team || null
                  ) || '-'}
                </p>
                <p>
                  <strong>Team:</strong> {item.team || '-'}
                </p>
                <p>
                  <strong>Priority:</strong> {item.priority}
                </p>
                <p>
                  <strong>Status:</strong> {item.status}
                </p>
                <p>
                  <strong>Created:</strong>{' '}
                  {new Date(item.created_at).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Recent Agent Feedback">
        {filteredFeedback.length === 0 ? (
          <p>No feedback items in this range.</p>
        ) : (
          <div style={{ display: 'grid', gap: '12px' }}>
            {filteredFeedback.slice(0, 10).map((item) => (
              <div key={item.id} style={contentCardStyle}>
                <p>
                  <strong>Agent:</strong> {item.agent_name}
                </p>
                <p>
                  <strong>Display Name:</strong>{' '}
                  {getDisplayName(
                    item.agent_id || null,
                    item.agent_name || null,
                    item.team || null
                  ) || '-'}
                </p>
                <p>
                  <strong>Team:</strong> {item.team}
                </p>
                <p>
                  <strong>Type:</strong> {item.feedback_type}
                </p>
                <p>
                  <strong>Subject:</strong> {item.subject}
                </p>
                <p>
                  <strong>Status:</strong> {item.status}
                </p>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function SummaryCard({ title, value }: { title: string; value: string }) {
  return (
    <div style={summaryCardStyle}>
      <div style={summaryCardTitleStyle}>{title}</div>
      <div style={summaryCardValueStyle}>{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginTop: '35px' }}>
      <h3 style={sectionTitleStyle}>{title}</h3>
      {children}
    </div>
  );
}

const pageHeaderStyle = {
  marginBottom: '20px',
};

const sectionEyebrow = {
  color: '#60a5fa',
  fontSize: '12px',
  fontWeight: 800,
  letterSpacing: '0.18em',
  textTransform: 'uppercase' as const,
  marginBottom: '12px',
};

const filterPanelStyle = {
  background: 'var(--screen-panel-bg)',
  border: '1px solid var(--screen-border)',
  borderRadius: '20px',
  padding: '20px',
  marginBottom: '22px',
  boxShadow: 'var(--screen-shadow)',
};

const filterGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '15px',
};

const labelStyle = {
  display: 'block',
  marginBottom: '8px',
  color: 'var(--screen-heading)',
  fontWeight: 700,
  fontSize: '13px',
};

const fieldStyle = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: '12px',
  border: '1px solid var(--screen-border-strong)',
  background: 'var(--screen-field-bg)',
  color: 'var(--screen-field-text)',
};

const pickerButtonStyle = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: '12px',
  border: '1px solid var(--screen-border-strong)',
  background: 'var(--screen-field-bg)',
  textAlign: 'left' as const,
  cursor: 'pointer',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  color: 'var(--screen-field-text)',
};

const pickerMenuStyle = {
  position: 'absolute' as const,
  top: 'calc(100% + 8px)',
  left: 0,
  right: 0,
  background: 'var(--screen-menu-bg)',
  border: '1px solid var(--screen-border-strong)',
  borderRadius: '16px',
  boxShadow: 'var(--screen-shadow)',
  zIndex: 20,
  overflow: 'hidden',
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
  backgroundColor: 'var(--screen-card-soft-bg)',
  color: 'var(--screen-muted)',
};

const pickerOptionStyle = {
  padding: '12px',
  borderRadius: '8px',
  border: '1px solid var(--screen-border)',
  backgroundColor: 'var(--screen-card-soft-bg)',
  textAlign: 'left' as const,
  cursor: 'pointer',
  fontWeight: 500,
  color: 'var(--screen-text)',
};

const pickerOptionActiveStyle = {
  border: '1px solid #2563eb',
  backgroundColor: 'rgba(37,99,235,0.18)',
};

const filterActionsStyle = {
  marginTop: '10px',
  display: 'flex',
  gap: '10px',
  flexWrap: 'wrap' as const,
};

const buttonRowStyle = {
  display: 'flex',
  gap: '10px',
  flexWrap: 'wrap' as const,
  marginBottom: '28px',
};

const primaryButton = {
  padding: '10px 14px',
  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
  color: 'white',
  border: 'none',
  borderRadius: '10px',
  cursor: 'pointer',
  fontWeight: 700,
};

const secondaryButton = {
  padding: '10px 14px',
  backgroundColor: 'var(--screen-secondary-btn-bg)',
  color: 'var(--screen-secondary-btn-text)',
  border: '1px solid var(--screen-border-strong)',
  borderRadius: '10px',
  cursor: 'pointer',
  fontWeight: 700,
};

const summaryGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '16px',
  marginTop: '15px',
  marginBottom: '30px',
};

const summaryCardStyle = {
  background: 'var(--screen-card-bg)',
  border: '1px solid var(--screen-border)',
  borderRadius: '16px',
  padding: '20px',
  boxShadow: 'var(--screen-shadow)',
};

const summaryCardTitleStyle = {
  fontSize: '14px',
  color: 'var(--screen-muted)',
  marginBottom: '8px',
};

const summaryCardValueStyle = {
  fontSize: '28px',
  fontWeight: 800,
  color: 'var(--screen-heading)',
};

const sectionTitleStyle = {
  color: 'var(--screen-heading)',
  marginBottom: '14px',
};

const detailGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: '16px',
  marginTop: '18px',
};

const detailCardStyle = {
  background: 'var(--screen-card-bg)',
  border: '1px solid var(--screen-border)',
  borderRadius: '16px',
  padding: '18px',
  color: 'var(--screen-text)',
  boxShadow: 'var(--screen-shadow)',
};

const detailLabelStyle = {
  color: 'var(--screen-accent)',
  fontSize: '12px',
  fontWeight: 800,
  letterSpacing: '0.12em',
  textTransform: 'uppercase' as const,
  marginBottom: '12px',
};

const contentCardStyle = {
  background: 'var(--screen-card-bg)',
  border: '1px solid var(--screen-border)',
  borderRadius: '16px',
  padding: '18px',
  color: 'var(--screen-text)',
  boxShadow: 'var(--screen-shadow)',
};


const auditTableWrapStyle = {
  marginTop: '16px',
  overflowX: 'auto' as const,
  borderRadius: '20px',
  border: '1px solid var(--screen-border)',
  background: 'var(--screen-card-bg)',
  boxShadow: 'var(--screen-shadow)',
};

const auditTableStyle = {
  minWidth: '1380px',
};

const auditEntryStyle = {
  borderBottom: '1px solid var(--screen-border)',
};

const auditRowStyle = {
  display: 'grid',
  gridTemplateColumns:
    '220px 130px 170px minmax(260px,1.4fr) 120px 170px minmax(280px,1.8fr)',
  gap: '14px',
  alignItems: 'center',
  padding: '14px 16px',
};

const auditHeaderRowStyle = {
  position: 'sticky' as const,
  top: 0,
  zIndex: 1,
  background: 'var(--screen-table-head-bg)',
  color: '#93c5fd',
  fontSize: '12px',
  fontWeight: 800,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.12em',
};

const auditCellAgentStyle = {};
const auditCellDateStyle = {};
const auditCellCaseStyle = {};
const auditCellReferenceStyle = {};
const auditCellScoreStyle = {};
const auditCellReleaseStyle = {};
const auditCellCommentsStyle = {};

const primaryCellTextStyle = {
  color: 'var(--screen-heading)',
  fontSize: '14px',
  fontWeight: 600,
  lineHeight: 1.45,
};

const secondaryCellTextStyle = {
  marginTop: '4px',
  color: 'var(--screen-subtle)',
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
  background: 'var(--screen-score-pill-bg)',
  border: '1px solid var(--screen-score-pill-border)',
  color: 'var(--screen-score-pill-text)',
  fontSize: '13px',
  fontWeight: 800,
};

const statusPillStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '64px',
  padding: '8px 10px',
  borderRadius: '999px',
  fontSize: '12px',
  fontWeight: 800,
};

export default ReportsSupabase;
