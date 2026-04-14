import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import {
  clearCachedValue,
  getCachedValue,
  peekCachedValue,
} from '../lib/viewCache';
import MonitoringWidget from './MonitoringWidget';
import MonitoringDrawer from './MonitoringDrawer';
import RecognitionWall from './RecognitionWall';
import DigitalTrophyCabinet from './DigitalTrophyCabinet';
import VoiceOfEmployeeSupabase from './VoiceOfEmployeeSupabase';
import QaAcademy from './QaAcademy';

type UserProfile = {
  id: string;
  role: 'admin' | 'qa' | 'agent' | 'supervisor';
  agent_id: string | null;
  agent_name: string;
  display_name?: string | null;
  team: 'Calls' | 'Tickets' | 'Sales' | null;
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
  team: string;
  case_type: string;
  audit_date: string;
  order_number?: string | null;
  phone_number?: string | null;
  ticket_id?: string | null;
  quality_score: number;
  comments: string | null;
  score_details: ScoreDetail[];
  shared_with_agent?: boolean;
  shared_at?: string | null;
};

type CallsRecord = {
  id: string;
  agent_id: string;
  agent_name: string;
  calls_count: number;
  call_date: string;
  date_to?: string | null;
  notes: string | null;
};

type TicketsRecord = {
  id: string;
  agent_id: string;
  agent_name: string;
  tickets_count: number;
  ticket_date: string;
  date_to?: string | null;
  notes: string | null;
};

type SalesRecord = {
  id: string;
  agent_id: string;
  agent_name: string;
  amount: number;
  sale_date: string;
  date_to?: string | null;
  notes: string | null;
};

type AgentFeedback = {
  id: string;
  agent_id: string;
  agent_name: string;
  team: 'Calls' | 'Tickets' | 'Sales';
  qa_name: string;
  feedback_type: 'Coaching' | 'Audit Feedback' | 'Warning' | 'Follow-up';
  subject: string;
  feedback_note: string;
  action_plan?: string | null;
  due_date: string | null;
  status: 'Open' | 'In Progress' | 'Closed';
  created_at: string;
  acknowledged_by_agent?: boolean;
  acknowledged_at?: string | null;
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
  status: 'active' | 'resolved';
  acknowledged_by_agent: boolean;
  acknowledged_at: string | null;
  resolved_at: string | null;
  resolved_by_name: string | null;
  resolved_by_email: string | null;
};

type AgentPortalProps = {
  currentUser: UserProfile;
};

type AgentPortalCachePayload = {
  audits: AuditItem[];
  callsRecords: CallsRecord[];
  ticketsRecords: TicketsRecord[];
  salesRecords: SalesRecord[];
  feedbackItems: AgentFeedback[];
  monitoringItems: MonitoringItem[];
};

const AGENT_PORTAL_CACHE_TTL_MS = 1000 * 60 * 3;
const HIDDEN_AGENT_METRICS = new Set(['Issue was resolved']);

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
    '--screen-muted': isLight ? '#64748b' : '#94a3b8',
    '--screen-subtle': isLight ? '#64748b' : '#64748b',
    '--screen-accent': isLight ? '#2563eb' : '#60a5fa',
    '--screen-panel-bg': isLight
      ? 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(247,250,255,0.96) 100%)'
      : 'linear-gradient(180deg, rgba(15,23,42,0.82) 0%, rgba(15,23,42,0.68) 100%)',
    '--screen-card-bg': isLight
      ? 'linear-gradient(180deg, rgba(255,255,255,0.99) 0%, rgba(248,250,255,0.97) 100%)'
      : 'linear-gradient(180deg, rgba(15,23,42,0.82) 0%, rgba(15,23,42,0.68) 100%)',
    '--screen-card-soft-bg': isLight
      ? 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(245,248,253,0.96) 100%)'
      : 'rgba(15,23,42,0.52)',
    '--screen-field-bg': isLight
      ? 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(250,252,255,0.98) 100%)'
      : 'rgba(15,23,42,0.7)',
    '--screen-field-text': isLight ? '#334155' : '#e5eefb',
    '--screen-border': isLight ? 'rgba(203,213,225,0.92)' : 'rgba(148,163,184,0.14)',
    '--screen-border-strong': isLight ? 'rgba(203,213,225,1)' : 'rgba(148,163,184,0.18)',
    '--screen-table-head-bg': isLight ? 'rgba(13, 27, 57, 0.98)' : 'rgba(2,6,23,0.92)',
    '--screen-pill-bg': isLight ? 'rgba(248,250,252,0.98)' : 'rgba(15,23,42,0.56)',
    '--screen-secondary-btn-bg': isLight ? 'rgba(255,255,255,0.98)' : 'rgba(15,23,42,0.78)',
    '--screen-secondary-btn-text': isLight ? '#475569' : '#e5eefb',
    '--screen-select-option-bg': isLight ? '#ffffff' : '#0f172a',
    '--screen-select-option-text': isLight ? '#0f172a' : '#e5eefb',
    '--screen-menu-bg': isLight ? 'rgba(255,255,255,0.99)' : 'rgba(15, 23, 42, 0.96)',
    '--screen-shadow': isLight ? '0 18px 40px rgba(15,23,42,0.10)' : '0 18px 40px rgba(2,6,23,0.35)',
    '--screen-score-pill-bg': isLight ? 'rgba(37,99,235,0.10)' : 'rgba(37,99,235,0.18)',
    '--screen-score-pill-border': isLight ? 'rgba(59,130,246,0.24)' : 'rgba(96,165,250,0.26)',
    '--screen-soft-fill': isLight ? 'rgba(248,250,252,0.98)' : 'rgba(15,23,42,0.48)',
    '--screen-soft-fill-2': isLight ? 'rgba(241,245,249,0.98)' : 'rgba(15,23,42,0.62)',
    '--screen-note-bg': isLight ? 'rgba(255,255,255,0.98)' : 'rgba(15,23,42,0.52)',
    '--screen-highlight-bg': isLight
      ? 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(247,250,255,0.98) 100%)'
      : 'linear-gradient(135deg, rgba(30,64,175,0.22) 0%, rgba(15,23,42,0.5) 100%)',
  };
}

function AgentPortal({ currentUser }: AgentPortalProps) {
  const [audits, setAudits] = useState<AuditItem[]>([]);
  const [callsRecords, setCallsRecords] = useState<CallsRecord[]>([]);
  const [ticketsRecords, setTicketsRecords] = useState<TicketsRecord[]>([]);
  const [salesRecords, setSalesRecords] = useState<SalesRecord[]>([]);
  const [feedbackItems, setFeedbackItems] = useState<AgentFeedback[]>([]);
  const [monitoringItems, setMonitoringItems] = useState<MonitoringItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [monitoringOpen, setMonitoringOpen] = useState(false);
  const [auditDateFrom, setAuditDateFrom] = useState('');
  const [auditDateTo, setAuditDateTo] = useState('');
  const [lastLoadedAt, setLastLoadedAt] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [auditsVisible, setAuditsVisible] = useState(true);

  const themeVars = getThemeVars();

  const cacheKey = useMemo(() => {
    return `agent-portal:${currentUser.id}:${
      currentUser.agent_id || 'no-agent'
    }:${currentUser.team || 'no-team'}`;
  }, [currentUser.id, currentUser.agent_id, currentUser.team]);

  useEffect(() => {
    void loadAgentData();
  }, [cacheKey]);

  function applyAgentData(payload: AgentPortalCachePayload) {
    setAudits(payload.audits);
    setCallsRecords(payload.callsRecords);
    setTicketsRecords(payload.ticketsRecords);
    setSalesRecords(payload.salesRecords);
    setFeedbackItems(payload.feedbackItems);
    setMonitoringItems(payload.monitoringItems);
  }

  async function fetchAgentData() {
    if (!currentUser.agent_id || !currentUser.team) {
      throw new Error('Your profile is missing agent_id or team.');
    }

    const auditsPromise = supabase
      .from('audits')
      .select('*')
      .eq('agent_id', currentUser.agent_id)
      .eq('team', currentUser.team)
      .eq('shared_with_agent', true)
      .order('audit_date', { ascending: false });

    const callsPromise =
      currentUser.team === 'Calls'
        ? supabase
            .from('calls_records')
            .select('*')
            .eq('agent_id', currentUser.agent_id)
            .order('call_date', { ascending: false })
        : Promise.resolve({ data: [], error: null });

    const ticketsPromise =
      currentUser.team === 'Tickets'
        ? supabase
            .from('tickets_records')
            .select('*')
            .eq('agent_id', currentUser.agent_id)
            .order('ticket_date', { ascending: false })
        : Promise.resolve({ data: [], error: null });

    const salesPromise =
      currentUser.team === 'Sales'
        ? supabase
            .from('sales_records')
            .select('*')
            .eq('agent_id', currentUser.agent_id)
            .order('sale_date', { ascending: false })
        : Promise.resolve({ data: [], error: null });

    const feedbackPromise = supabase
      .from('agent_feedback')
      .select('*')
      .eq('agent_id', currentUser.agent_id)
      .eq('team', currentUser.team)
      .neq('status', 'Closed')
      .order('created_at', { ascending: false });

    const monitoringPromise = supabase
      .from('monitoring_items')
      .select('*')
      .eq('agent_id', currentUser.agent_id)
      .eq('team', currentUser.team)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    const [
      auditsResult,
      callsResult,
      ticketsResult,
      salesResult,
      feedbackResult,
      monitoringResult,
    ] = await Promise.all([
      auditsPromise,
      callsPromise,
      ticketsPromise,
      salesPromise,
      feedbackPromise,
      monitoringPromise,
    ]);

    const errors = [
      auditsResult.error?.message,
      callsResult.error?.message,
      ticketsResult.error?.message,
      salesResult.error?.message,
      feedbackResult.error?.message,
      monitoringResult.error?.message,
    ].filter(Boolean);

    if (errors.length > 0) {
      throw new Error(errors.join(' | '));
    }

    return {
      audits: (auditsResult.data as AuditItem[]) || [],
      callsRecords: (callsResult.data as CallsRecord[]) || [],
      ticketsRecords: (ticketsResult.data as TicketsRecord[]) || [],
      salesRecords: (salesResult.data as SalesRecord[]) || [],
      feedbackItems: (feedbackResult.data as AgentFeedback[]) || [],
      monitoringItems: (monitoringResult.data as MonitoringItem[]) || [],
    } satisfies AgentPortalCachePayload;
  }

  async function loadAgentData(options?: {
    force?: boolean;
    background?: boolean;
  }) {
    if (!currentUser.agent_id || !currentUser.team) {
      setAudits([]);
      setCallsRecords([]);
      setTicketsRecords([]);
      setSalesRecords([]);
      setFeedbackItems([]);
      setMonitoringItems([]);
      setErrorMessage('Your profile is missing agent_id or team.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const force = options?.force ?? false;
    const background = options?.background ?? false;
    const cached = force
      ? null
      : peekCachedValue<AgentPortalCachePayload>(cacheKey);

    if (cached) {
      applyAgentData(cached);
      setLoading(false);
    }

    if (background || cached) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setErrorMessage('');

    try {
      const payload = await getCachedValue(cacheKey, fetchAgentData, {
        ttlMs: AGENT_PORTAL_CACHE_TTL_MS,
        force,
      });

      applyAgentData(payload);
      setLastLoadedAt(new Date().toISOString());
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Could not load profile data.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function handleAcknowledgeFeedback(feedbackId: string) {
    setErrorMessage('');

    const { data, error } = await supabase
      .from('agent_feedback')
      .update({
        acknowledged_by_agent: true,
      })
      .eq('id', feedbackId)
      .select('id, acknowledged_by_agent')
      .maybeSingle();

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    if (!data) {
      setErrorMessage(
        'Acknowledge did not update. Please check the agent_feedback update policy in Supabase.'
      );
      return;
    }

    setFeedbackItems((prev) =>
      prev.map((item) =>
        item.id === feedbackId
          ? {
              ...item,
              acknowledged_by_agent: true,
            }
          : item
      )
    );

    void loadAgentData({ force: true, background: true });
  }

  const filteredAudits = useMemo(() => {
    return audits.filter((audit) => {
      const matchesFrom = auditDateFrom
        ? audit.audit_date >= auditDateFrom
        : true;
      const matchesTo = auditDateTo ? audit.audit_date <= auditDateTo : true;
      return matchesFrom && matchesTo;
    });
  }, [audits, auditDateFrom, auditDateTo]);

  const averageQuality =
    filteredAudits.length > 0
      ? (
          filteredAudits.reduce(
            (sum, item) => sum + Number(item.quality_score),
            0
          ) / filteredAudits.length
        ).toFixed(2)
      : '0.00';

  const filteredCallsRecords = useMemo(() => {
    return callsRecords.filter((record) =>
      matchesRecordRange(record.call_date, record.date_to || null, auditDateFrom, auditDateTo)
    );
  }, [callsRecords, auditDateFrom, auditDateTo]);

  const filteredTicketsRecords = useMemo(() => {
    return ticketsRecords.filter((record) =>
      matchesRecordRange(record.ticket_date, record.date_to || null, auditDateFrom, auditDateTo)
    );
  }, [ticketsRecords, auditDateFrom, auditDateTo]);

  const filteredSalesRecords = useMemo(() => {
    return salesRecords.filter((record) =>
      matchesRecordRange(record.sale_date, record.date_to || null, auditDateFrom, auditDateTo)
    );
  }, [salesRecords, auditDateFrom, auditDateTo]);

  const totalCalls = filteredCallsRecords.reduce(
    (sum, item) => sum + Number(item.calls_count),
    0
  );
  const totalTickets = filteredTicketsRecords.reduce(
    (sum, item) => sum + Number(item.tickets_count),
    0
  );
  const totalSales = filteredSalesRecords.reduce(
    (sum, item) => sum + Number(item.amount),
    0
  );

  function getStatusColor(statusValue: string) {
    if (statusValue === 'Closed') return '#166534';
    if (statusValue === 'In Progress') return '#92400e';
    return '#1d4ed8';
  }

  function getTypeColor(typeValue: string) {
    if (typeValue === 'Warning') return '#991b1b';
    if (typeValue === 'Audit Feedback') return '#7c3aed';
    if (typeValue === 'Follow-up') return '#b45309';
    return '#166534';
  }

  function getResultBadgeColor(result: string) {
    if (result === 'Pass') return '#166534';
    if (result === 'Borderline') return '#92400e';
    if (result === 'Fail' || result === 'Auto-Fail') return '#991b1b';
    if (result === 'N/A') return '#374151';
    return '#1f2937';
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

  function clearAuditDateFilters() {
    setAuditDateFrom('');
    setAuditDateTo('');
  }

  function matchesRecordRange(
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

  const hasVisibleData =
    audits.length > 0 ||
    callsRecords.length > 0 ||
    ticketsRecords.length > 0 ||
    salesRecords.length > 0 ||
    feedbackItems.length > 0 ||
    monitoringItems.length > 0;

  if (loading && !hasVisibleData) {
    return <div style={{ color: '#cbd5e1' }}>Loading profile data...</div>;
  }

  return (
    <div
      data-no-theme-invert="true"
      style={{ color: 'var(--screen-text)', ...(themeVars as CSSProperties) }}
    >
      <div style={pageHeaderStyle}>
        <div>
          <div style={sectionEyebrow}>Agent Portal</div>
          <h2 style={{ marginBottom: '8px', color: 'var(--screen-heading)' }}>My Profile</h2>
        </div>

        <div style={pageHeaderActionsStyle}>
          <button
            type="button"
            onClick={() => {
              clearCachedValue(cacheKey);
              void loadAgentData({ force: true });
            }}
            disabled={refreshing}
            style={secondaryButton}
          >
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>

          <div style={headerMetaPillStyle}>
            Last Loaded: {lastLoadedAt ? formatDate(lastLoadedAt) : 'Current session'}
          </div>
        </div>
      </div>

      {errorMessage ? <div style={errorBanner}>{errorMessage}</div> : null}

      <div style={panelStyle}>
        <p>
          <strong>Name:</strong> {currentUser.agent_name}
        </p>
        <p>
          <strong>Display Name:</strong> {currentUser.display_name || '-'}
        </p>
        <p>
          <strong>Agent ID:</strong> {currentUser.agent_id}
        </p>
        <p>
          <strong>Email:</strong> {currentUser.email}
        </p>
        <p>
          <strong>Team:</strong> {currentUser.team}
        </p>
        <p>
          <strong>Role:</strong> {currentUser.role}
        </p>
      </div>

      <div style={summaryGridStyle}>
        <SummaryCard
          title="Released Audits"
          value={String(filteredAudits.length)}
          subtitle="Filtered by audit dates"
        />
        <SummaryCard
          title="Average Quality"
          value={`${averageQuality}%`}
          subtitle="Based on filtered audits"
        />
        <SummaryCard
          title="My Feedback Items"
          value={String(feedbackItems.length)}
          subtitle="All coaching items"
        />
        <SummaryCard
          title="Monitoring Alerts"
          value={String(monitoringItems.length)}
          subtitle="Active monitoring only"
        />
        {currentUser.team === 'Calls' && (
          <SummaryCard
            title="Total Calls"
            value={String(totalCalls)}
            subtitle="Production records"
          />
        )}
        {currentUser.team === 'Tickets' && (
          <SummaryCard
            title="Total Tickets"
            value={String(totalTickets)}
            subtitle="Production records"
          />
        )}
        {currentUser.team === 'Sales' && (
          <SummaryCard
            title="Total Sales"
            value={`$${totalSales.toFixed(2)}`}
            subtitle="Production records"
          />
        )}
      </div>

      <Section title="My Feedback / Coaching">
        {feedbackItems.length === 0 ? (
          <p>No feedback found.</p>
        ) : (
          <div style={feedbackTableWrapStyle}>
            <div style={feedbackTableStyle}>
              <div style={{ ...feedbackRowStyle, ...feedbackHeaderRowStyle }}>
                <div style={feedbackCellTypeStyle}>Type</div>
                <div style={feedbackCellSubjectStyle}>Subject</div>
                <div style={feedbackCellFromStyle}>From QA</div>
                <div style={feedbackCellDueDateStyle}>Due Date</div>
                <div style={feedbackCellStatusStyle}>Status</div>
                <div style={feedbackCellAckStyle}>Acknowledged</div>
                <div style={feedbackCellActionsStyle}>Actions</div>
              </div>

              {feedbackItems.map((item) => {
                const isExpanded = expandedId === `feedback-${item.id}`;

                return (
                  <div key={item.id} style={auditEntryStyle}>
                    <div style={feedbackRowStyle}>
                      <div style={feedbackCellTypeStyle}>
                        <span
                          style={{
                            ...pillStyle,
                            backgroundColor: getTypeColor(item.feedback_type),
                          }}
                        >
                          {item.feedback_type}
                        </span>
                      </div>

                      <div style={feedbackCellSubjectStyle}>
                        <div style={primaryCellTextStyle}>{item.subject}</div>
                      </div>

                      <div style={feedbackCellFromStyle}>
                        <div style={primaryCellTextStyle}>{item.qa_name}</div>
                      </div>

                      <div style={feedbackCellDueDateStyle}>
                        <div style={primaryCellTextStyle}>
                          {item.due_date || '-'}
                        </div>
                      </div>

                      <div style={feedbackCellStatusStyle}>
                        <span
                          style={{
                            ...pillStyle,
                            backgroundColor: getStatusColor(item.status),
                          }}
                        >
                          {item.status}
                        </span>
                      </div>

                      <div style={feedbackCellAckStyle}>
                        {item.acknowledged_by_agent ? (
                          <span style={feedbackAcknowledgedPillStyle}>
                            Acknowledged
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void handleAcknowledgeFeedback(item.id)}
                            style={feedbackAcknowledgeButtonStyle}
                          >
                            Acknowledge
                          </button>
                        )}
                      </div>

                      <div style={feedbackCellActionsStyle}>
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedId(
                              expandedId === `feedback-${item.id}`
                                ? null
                                : `feedback-${item.id}`
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
                              <div style={detailLabelStyle}>Type</div>
                              <div style={detailValueStyle}>
                                {item.feedback_type}
                              </div>
                            </div>

                            <div style={detailInfoCardStyle}>
                              <div style={detailLabelStyle}>From QA</div>
                              <div style={detailValueStyle}>{item.qa_name}</div>
                            </div>

                            <div style={detailInfoCardStyle}>
                              <div style={detailLabelStyle}>Due Date</div>
                              <div style={detailValueStyle}>
                                {item.due_date || '-'}
                              </div>
                            </div>

                            <div style={detailInfoCardStyle}>
                              <div style={detailLabelStyle}>Created At</div>
                              <div style={detailValueStyle}>
                                {formatDate(item.created_at)}
                              </div>
                            </div>
                          </div>

                          <div style={fullCommentCardStyle}>
                            <div style={detailLabelStyle}>Subject</div>
                            <div style={fullCommentTextStyle}>{item.subject}</div>
                          </div>

                          <div style={fullCommentCardStyle}>
                            <div style={detailLabelStyle}>Feedback</div>
                            <div style={fullCommentTextStyle}>
                              {item.feedback_note || '-'}
                            </div>
                          </div>

                          <div style={detailInfoGridStyle}>
                            <div style={detailInfoCardStyle}>
                              <div style={detailLabelStyle}>Status</div>
                              <div style={detailValueStyle}>{item.status}</div>
                            </div>
                            <div style={detailInfoCardStyle}>
                              <div style={detailLabelStyle}>Acknowledged</div>
                              <div style={detailValueStyle}>
                                {item.acknowledged_by_agent ? 'Yes' : 'Not yet'}
                              </div>
                            </div>
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

      <Section title="My Released Audits">
        <div style={sectionHeaderActionsStyle}>
          <button
            type="button"
            onClick={() => setAuditsVisible((prev) => !prev)}
            style={miniSecondaryButton}
          >
            {auditsVisible ? 'Hide Audits' : 'Show Audits'}
          </button>
        </div>
        {auditsVisible ? (
          <>
        <div style={{ ...panelStyle, marginTop: '16px' }}>
          <div style={filterGridStyle}>
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
          </div>

          <div style={filterActionsStyle}>
            <button
              type="button"
              onClick={clearAuditDateFilters}
              style={secondaryButton}
            >
              Clear Audit Dates
            </button>

            <div style={filterPillStyle}>
              Showing {filteredAudits.length} audit
              {filteredAudits.length === 1 ? '' : 's'} • Average Quality{' '}
              {averageQuality}%
            </div>
          </div>
        </div>

        {filteredAudits.length === 0 ? (
          <p>No audits were released to you for this date range.</p>
        ) : (
          <div style={auditTableWrapStyle}>
            <div style={auditTableStyle}>
              <div style={{ ...auditRowStyle, ...auditHeaderRowStyle }}>
                <div style={auditCellDateStyle}>Audit Date</div>
                <div style={auditCellCaseStyle}>Case Type</div>
                <div style={auditCellReferenceStyle}>Reference</div>
                <div style={auditCellScoreStyle}>Quality</div>
                <div style={auditCellReleasedStyle}>Released</div>
                <div style={auditCellCommentsStyle}>Comments</div>
                <div style={auditCellActionsStyle}>Actions</div>
              </div>

              {filteredAudits.map((audit) => {
                const isExpanded = expandedId === audit.id;
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
                        <div style={primaryCellTextStyle}>{audit.case_type}</div>
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

                      <div style={auditCellReleasedStyle}>
                        <div style={primaryCellTextStyle}>
                          {formatDate(audit.shared_at)}
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
                            setExpandedId(
                              expandedId === audit.id ? null : audit.id
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
                              <div style={detailLabelStyle}>Reference</div>
                              <div style={detailValueStyle}>{getAuditReference(audit)}</div>
                            </div>
                            <div style={detailInfoCardStyle}>
                              <div style={detailLabelStyle}>Released</div>
                              <div style={detailValueStyle}>{formatDate(audit.shared_at)}</div>
                            </div>
                            <div style={detailInfoCardStyle}>
                              <div style={detailLabelStyle}>Quality</div>
                              <div style={detailValueStyle}>{Number(audit.quality_score).toFixed(2)}%</div>
                            </div>
                          </div>

                          <div style={fullCommentCardStyle}>
                            <div style={detailLabelStyle}>Full Comment</div>
                            <div style={fullCommentTextStyle}>
                              {audit.comments?.trim() || '-'}
                            </div>
                          </div>

                          <div style={{ ...sectionEyebrow, marginTop: '18px' }}>Score Details</div>
                          <div style={{ display: 'grid', gap: '10px' }}>
                            {(audit.score_details || [])
                              .filter(
                                (detail) => !HIDDEN_AGENT_METRICS.has(detail.metric)
                              )
                              .map((detail) => (
                                <div
                                  key={`${audit.id}-${detail.metric}`}
                                  style={detailRowStyle}
                                >
                                  <div>
                                    <div
                                      style={{
                                        color: 'var(--screen-heading)',
                                        fontWeight: 700,
                                      }}
                                    >
                                      {detail.metric}
                                    </div>
                                    <div
                                      style={{
                                        color: 'var(--screen-muted)',
                                        fontSize: '12px',
                                        marginTop: '4px',
                                      }}
                                    >
                                      {detail.counts_toward_score === false
                                        ? 'Administrative question'
                                        : `Pass ${detail.pass} • Borderline ${detail.borderline} • Adjusted ${detail.adjustedWeight.toFixed(2)}`}
                                    </div>
                                    {detail.metric_comment ? (
                                      <div style={metricNoteCardStyle}>
                                        <div style={metricNoteLabelStyle}>QA Note</div>
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
          </>
        ) : (
          <div style={collapsedMessageStyle}>Audits are hidden for now.</div>
        )}
      </Section>

      {currentUser.team === 'Calls' && (
        <Section title="My Calls Records">
          {filteredCallsRecords.length === 0 ? (
            <p>No calls records found for this audit date range.</p>
          ) : (
            <div style={recordsTableWrapStyle}>
              <div style={recordsTableStyle}>
                <div style={{ ...recordsRowStyle, ...recordsHeaderRowStyle }}>
                  <div style={recordsCellDateFromStyle}>Date From</div>
                  <div style={recordsCellDateToStyle}>Date To</div>
                  <div style={recordsCellValueStyle}>Calls Count</div>
                  <div style={recordsCellNotesStyle}>Notes</div>
                </div>

                {filteredCallsRecords.map((record) => (
                  <div key={record.id} style={recordsEntryStyle}>
                    <div style={recordsRowStyle}>
                      <div style={recordsCellDateFromStyle}>
                        <div style={primaryCellTextStyle}>
                          {formatDateOnly(record.call_date)}
                        </div>
                      </div>

                      <div style={recordsCellDateToStyle}>
                        <div style={primaryCellTextStyle}>
                          {record.date_to ? formatDateOnly(record.date_to) : '-'}
                        </div>
                      </div>

                      <div style={recordsCellValueStyle}>
                        <div style={primaryCellTextStyle}>{record.calls_count}</div>
                      </div>

                      <div style={recordsCellNotesStyle}>
                        <div style={primaryCellTextStyle}>
                          {record.notes?.trim() || '-'}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>
      )}

      {currentUser.team === 'Tickets' && (
        <Section title="My Tickets Records">
          {filteredTicketsRecords.length === 0 ? (
            <p>No tickets records found for this audit date range.</p>
          ) : (
            <div style={recordsTableWrapStyle}>
              <div style={recordsTableStyle}>
                <div style={{ ...recordsRowStyle, ...recordsHeaderRowStyle }}>
                  <div style={recordsCellDateFromStyle}>Date From</div>
                  <div style={recordsCellDateToStyle}>Date To</div>
                  <div style={recordsCellValueStyle}>Tickets Count</div>
                  <div style={recordsCellNotesStyle}>Notes</div>
                </div>

                {filteredTicketsRecords.map((record) => (
                  <div key={record.id} style={recordsEntryStyle}>
                    <div style={recordsRowStyle}>
                      <div style={recordsCellDateFromStyle}>
                        <div style={primaryCellTextStyle}>
                          {formatDateOnly(record.ticket_date)}
                        </div>
                      </div>

                      <div style={recordsCellDateToStyle}>
                        <div style={primaryCellTextStyle}>
                          {record.date_to ? formatDateOnly(record.date_to) : '-'}
                        </div>
                      </div>

                      <div style={recordsCellValueStyle}>
                        <div style={primaryCellTextStyle}>{record.tickets_count}</div>
                      </div>

                      <div style={recordsCellNotesStyle}>
                        <div style={primaryCellTextStyle}>
                          {record.notes?.trim() || '-'}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>
      )}

      {currentUser.team === 'Sales' && (
        <Section title="My Sales Records">
          {filteredSalesRecords.length === 0 ? (
            <p>No sales records found for this audit date range.</p>
          ) : (
            <div style={recordsTableWrapStyle}>
              <div style={recordsTableStyle}>
                <div style={{ ...recordsRowStyle, ...recordsHeaderRowStyle }}>
                  <div style={recordsCellDateFromStyle}>Date From</div>
                  <div style={recordsCellDateToStyle}>Date To</div>
                  <div style={recordsCellValueStyle}>Amount</div>
                  <div style={recordsCellNotesStyle}>Notes</div>
                </div>

                {filteredSalesRecords.map((record) => (
                  <div key={record.id} style={recordsEntryStyle}>
                    <div style={recordsRowStyle}>
                      <div style={recordsCellDateFromStyle}>
                        <div style={primaryCellTextStyle}>
                          {formatDateOnly(record.sale_date)}
                        </div>
                      </div>

                      <div style={recordsCellDateToStyle}>
                        <div style={primaryCellTextStyle}>
                          {record.date_to ? formatDateOnly(record.date_to) : '-'}
                        </div>
                      </div>

                      <div style={recordsCellValueStyle}>
                        <div style={primaryCellTextStyle}>
                          ${Number(record.amount).toFixed(2)}
                        </div>
                      </div>

                      <div style={recordsCellNotesStyle}>
                        <div style={primaryCellTextStyle}>
                          {record.notes?.trim() || '-'}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>
      )}

      <DigitalTrophyCabinet scope="agent" currentUser={currentUser} />
      <RecognitionWall compact currentUser={currentUser as any} />
      <QaAcademy team={currentUser.team} />
      <VoiceOfEmployeeSupabase currentUser={currentUser} />

      <MonitoringWidget
        count={monitoringItems.length}
        onClick={() => {
          setMonitoringOpen(true);
          if (typeof window !== 'undefined') {
            window.requestAnimationFrame(() => {
              window.scrollTo({ top: 0, behavior: 'smooth' });
            });
          }
        }}
      />
      <MonitoringDrawer
        open={monitoringOpen}
        onClose={() => setMonitoringOpen(false)}
        items={monitoringItems}
        mode="agent"
        onItemUpdated={() => loadAgentData({ force: true, background: true })}
      />
    </div>
  );
}

function SummaryCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: '14px', color: 'var(--screen-muted)', marginBottom: '8px' }}>
        {title}
      </div>
      <div style={{ fontSize: '28px', fontWeight: 'bold', color: 'var(--screen-heading)' }}>
        {value}
      </div>
      {subtitle ? (
        <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--screen-subtle)' }}>
          {subtitle}
        </div>
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginTop: '35px' }}>
      <h3>{title}</h3>
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
  color: 'var(--screen-muted, #94a3b8)',
  fontWeight: 600,
  padding: '10px 2px',
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
  color: 'var(--screen-accent)',
  fontSize: '12px',
  fontWeight: 800,
  letterSpacing: '0.18em',
  textTransform: 'uppercase' as const,
  marginBottom: '12px',
};

const panelStyle = {
  background: 'var(--screen-card-bg)',
  border: '1px solid var(--screen-border)',
  borderRadius: '24px',
  padding: '22px',
  boxShadow: 'var(--screen-shadow)',
  backdropFilter: 'blur(16px)',
};

const filterGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '16px',
};

const filterActionsStyle = {
  marginTop: '12px',
  display: 'flex',
  gap: '10px',
  flexWrap: 'wrap' as const,
  alignItems: 'center',
  justifyContent: 'space-between',
};

const filterPillStyle = {
  padding: '10px 14px',
  borderRadius: '999px',
  border: '1px solid var(--screen-border)',
  backgroundColor: 'var(--screen-pill-bg)',
  color: 'var(--screen-text)',
  fontSize: '13px',
  fontWeight: 600,
};

const summaryGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '16px',
  marginTop: '24px',
  marginBottom: '30px',
};

const cardStyle = {
  background: 'var(--screen-card-bg)',
  border: '1px solid var(--screen-border)',
  borderRadius: '22px',
  padding: '22px',
  boxShadow: 'var(--screen-shadow)',
  backdropFilter: 'blur(16px)',
};

const auditTableWrapStyle = {
  marginTop: '18px',
  overflowX: 'auto' as const,
  borderRadius: '22px',
  border: '1px solid var(--screen-border)',
  background: 'var(--screen-card-bg)',
  boxShadow: 'var(--screen-shadow)',
};

const auditTableStyle = {
  minWidth: '1040px',
};

const auditEntryStyle = { borderBottom: '1px solid rgba(148,163,184,0.08)' };

const auditRowStyle = {
  display: 'grid',
  gridTemplateColumns:
    '140px 170px minmax(260px, 1.5fr) 120px 190px minmax(240px, 2fr) 100px',
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

const auditCellDateStyle = {};
const auditCellCaseStyle = {};
const auditCellReferenceStyle = {};
const auditCellScoreStyle = {};
const auditCellReleasedStyle = {};
const auditCellCommentsStyle = {};
const auditCellActionsStyle = {
  display: 'flex',
  gap: '8px',
  flexWrap: 'wrap' as const,
};

const primaryCellTextStyle = {
  color: 'var(--screen-heading)',
  fontSize: '14px',
  fontWeight: 600,
  lineHeight: 1.4,
};

const secondaryCellTextStyle = {
  marginTop: '4px',
  color: 'var(--screen-subtle)',
  fontSize: '12px',
  fontWeight: 600,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.08em',
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
  color: 'var(--screen-heading)',
  fontSize: '13px',
  fontWeight: 800,
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
  color: 'var(--screen-text)',
};

const secondaryButton = {
  backgroundColor: 'var(--screen-secondary-btn-bg)',
  color: 'var(--screen-secondary-btn-text)',
  border: '1px solid var(--screen-border-strong)',
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
  color: '#fecaca',
};

const pillStyle = {
  color: '#ffffff',
  padding: '4px 10px',
  borderRadius: '999px',
  fontSize: '12px',
  fontWeight: 800,
  border: '1px solid rgba(15,23,42,0.08)',
  boxShadow: '0 6px 14px rgba(15,23,42,0.08)',
};

const auditExpandedRowStyle = { padding: '0 16px 16px 16px' };

const expandedPanelStyle = {
  borderRadius: '18px',
  border: '1px solid var(--screen-border)',
  background: 'var(--screen-panel-bg)',
  padding: '18px',
};

const detailRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '12px',
  alignItems: 'center',
  padding: '12px 14px',
  borderRadius: '14px',
  border: '1px solid var(--screen-border)',
  background: 'var(--screen-card-soft-bg)',
};

const metricNoteCardStyle = {
  marginTop: '10px',
  borderRadius: '12px',
  border: '1px solid var(--screen-border)',
  background: 'var(--screen-card-soft-bg)',
  padding: '10px 12px',
};

const metricNoteLabelStyle = {
  color: '#93c5fd',
  fontSize: '11px',
  fontWeight: 800,
  letterSpacing: '0.1em',
  textTransform: 'uppercase' as const,
  marginBottom: '6px',
};

const metricNoteTextStyle = {
  color: 'var(--screen-text)',
  fontSize: '13px',
  lineHeight: 1.55,
  whiteSpace: 'pre-wrap' as const,
};

const feedbackTableWrapStyle = {
  marginTop: '16px',
  overflowX: 'auto' as const,
  borderRadius: '18px',
  border: '1px solid var(--screen-border)',
  background: 'var(--screen-card-bg)',
  boxShadow: 'var(--screen-shadow)',
};

const feedbackTableStyle = {
  minWidth: '980px',
};

const feedbackRowStyle = {
  display: 'grid',
  gridTemplateColumns: '140px minmax(220px, 1.5fr) 160px 140px 120px 170px 100px',
  gap: '14px',
  alignItems: 'center',
  padding: '14px 16px',
};

const feedbackHeaderRowStyle = {
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

const feedbackCellTypeStyle = {};
const feedbackCellSubjectStyle = {};
const feedbackCellFromStyle = {};
const feedbackCellDueDateStyle = {};
const feedbackCellStatusStyle = {};
const feedbackCellAckStyle = {};
const feedbackCellActionsStyle = {
  display: 'flex',
  gap: '8px',
  flexWrap: 'wrap' as const,
};

const feedbackAcknowledgeButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '118px',
  padding: '10px 14px',
  borderRadius: '12px',
  border: '1px solid rgba(96,165,250,0.34)',
  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
  color: '#ffffff',
  cursor: 'pointer',
  fontWeight: 800,
  fontSize: '13px',
  boxShadow: '0 10px 22px rgba(37,99,235,0.18)',
};

const feedbackAcknowledgedPillStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '118px',
  padding: '10px 14px',
  borderRadius: '999px',
  border: '1px solid rgba(74,222,128,0.24)',
  background: 'rgba(22,101,52,0.16)',
  color: '#166534',
  fontWeight: 800,
  fontSize: '13px',
};

const miniSecondaryButton = {
  padding: '8px 10px',
  background: 'var(--screen-secondary-btn-bg)',
  color: 'var(--screen-secondary-btn-text)',
  border: '1px solid var(--screen-border-strong)',
  borderRadius: '10px',
  cursor: 'pointer',
  fontWeight: 700,
  fontSize: '12px',
};

const detailInfoGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '12px',
  marginBottom: '18px',
};

const detailInfoCardStyle = {
  borderRadius: '14px',
  border: '1px solid var(--screen-border)',
  background: 'var(--screen-card-soft-bg)',
  padding: '14px 16px',
};

const detailLabelStyle = {
  color: 'var(--screen-muted)',
  fontSize: '12px',
  fontWeight: 700,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.08em',
  marginBottom: '8px',
};

const detailValueStyle = {
  color: 'var(--screen-heading)',
  fontSize: '14px',
  fontWeight: 700,
  lineHeight: 1.5,
};

const pageHeaderActionsStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: '10px',
  flexWrap: 'wrap' as const,
};

const headerMetaPillStyle = {
  padding: '10px 14px',
  borderRadius: '999px',
  border: '1px solid var(--screen-border)',
  backgroundColor: 'var(--screen-pill-bg)',
  color: 'var(--screen-muted)',
  fontSize: '13px',
  fontWeight: 700,
  textAlign: 'left' as const,
};

const fullCommentCardStyle = {
  borderRadius: '14px',
  border: '1px solid var(--screen-border)',
  background: 'var(--screen-card-soft-bg)',
  padding: '14px 16px',
  marginBottom: '18px',
};

const fullCommentTextStyle = {
  color: 'var(--screen-text)',
  fontSize: '14px',
  lineHeight: 1.7,
  whiteSpace: 'pre-wrap' as const,
  wordBreak: 'break-word' as const,
};

const recordsTableWrapStyle = {
  marginTop: '16px',
  overflowX: 'auto' as const,
  borderRadius: '18px',
  border: '1px solid var(--screen-border)',
  background: 'var(--screen-card-bg)',
  boxShadow: 'var(--screen-shadow)',
};

const recordsTableStyle = {
  minWidth: '820px',
};

const recordsEntryStyle = {
  borderBottom: '1px solid rgba(148,163,184,0.08)',
};

const recordsRowStyle = {
  display: 'grid',
  gridTemplateColumns: '180px 180px 160px minmax(220px, 1.5fr)',
  gap: '14px',
  alignItems: 'center',
  padding: '14px 16px',
};

const recordsHeaderRowStyle = {
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

const recordsCellDateFromStyle = {};
const recordsCellDateToStyle = {};
const recordsCellValueStyle = {};
const recordsCellNotesStyle = {};

export default AgentPortal;
