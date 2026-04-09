import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import {
  clearCachedValue,
  getCachedValue,
  peekCachedValue,
} from '../lib/viewCache';
import MonitoringWidget from './MonitoringWidget';
import MonitoringDrawer from './MonitoringDrawer';
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
  action_plan: string | null;
  due_date: string | null;
  status: 'Open' | 'In Progress' | 'Closed';
  created_at: string;
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
  const totalCalls = callsRecords.reduce(
    (sum, item) => sum + Number(item.calls_count),
    0
  );
  const totalTickets = ticketsRecords.reduce(
    (sum, item) => sum + Number(item.tickets_count),
    0
  );
  const totalSales = salesRecords.reduce(
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
    <div style={{ color: '#e5eefb' }}>
      <div style={pageHeaderStyle}>
        <div>
          <div style={sectionEyebrow}>Agent Portal</div>
          <h2 style={{ marginBottom: '8px' }}>My Profile</h2>
          <p style={{ margin: 0, color: '#94a3b8' }}>
            This portal is linked to the logged-in agent account. You only see
            audits released to you by QA/Admin.
          </p>
        </div>
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
      </div>
      {errorMessage ? <div style={errorBanner}>{errorMessage}</div> : null}
      <div style={filterActionsStyle}>
        <div style={filterPillStyle}>
          Cache: {refreshing ? 'Refreshing in background' : 'Warm'}
        </div>
        <div style={filterPillStyle}>
          Last Loaded:{' '}
          {lastLoadedAt ? formatDate(lastLoadedAt) : 'Current session'}
        </div>
      </div>
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
          <div style={{ display: 'grid', gap: '12px' }}>
            {feedbackItems.map((item) => (
              <div key={item.id} style={cardStyle}>
                <p>
                  <strong>Type:</strong>{' '}
                  <span
                    style={{
                      ...pillStyle,
                      backgroundColor: getTypeColor(item.feedback_type),
                    }}
                  >
                    {item.feedback_type}
                  </span>
                </p>
                <p>
                  <strong>Subject:</strong> {item.subject}
                </p>
                <p>
                  <strong>From QA:</strong> {item.qa_name}
                </p>
                <p>
                  <strong>Feedback:</strong> {item.feedback_note}
                </p>
                <p>
                  <strong>Action Plan:</strong> {item.action_plan || '-'}
                </p>
                <p>
                  <strong>Due Date:</strong> {item.due_date || '-'}
                </p>
                <p>
                  <strong>Status:</strong>{' '}
                  <span
                    style={{
                      ...pillStyle,
                      backgroundColor: getStatusColor(item.status),
                    }}
                  >
                    {item.status}
                  </span>
                </p>
                <p>
                  <strong>Created At:</strong> {formatDate(item.created_at)}
                </p>
              </div>
            ))}
          </div>
        )}
      </Section>
      <Section title="My Released Audits">
        <div style={{ ...panelStyle, marginTop: '16px' }}>
          <div style={filterGridStyle}>
            <div>
              <label style={labelStyle}>Audit Date From</label>
              <input
                type="date"
                value={auditDateFrom}
                onChange={(e) => setAuditDateFrom(e.target.value)}
                style={fieldStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Audit Date To</label>
              <input
                type="date"
                value={auditDateTo}
                onChange={(e) => setAuditDateTo(e.target.value)}
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
                          <div style={sectionEyebrow}>Score Details</div>
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
                                        color: '#f8fafc',
                                        fontWeight: 700,
                                      }}
                                    >
                                      {detail.metric}
                                    </div>
                                    <div
                                      style={{
                                        color: '#94a3b8',
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
      </Section>
      {currentUser.team === 'Calls' && (
        <Section title="My Calls Records">
          {callsRecords.length === 0 ? (
            <p>No calls records found.</p>
          ) : (
            <div style={{ display: 'grid', gap: '12px' }}>
              {callsRecords.map((record) => (
                <div key={record.id} style={cardStyle}>
                  <p>
                    <strong>Date From:</strong> {record.call_date}
                  </p>
                  <p>
                    <strong>Date To:</strong> {record.date_to || '-'}
                  </p>
                  <p>
                    <strong>Calls Count:</strong> {record.calls_count}
                  </p>
                  <p>
                    <strong>Notes:</strong> {record.notes || '-'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}
      {currentUser.team === 'Tickets' && (
        <Section title="My Tickets Records">
          {ticketsRecords.length === 0 ? (
            <p>No tickets records found.</p>
          ) : (
            <div style={{ display: 'grid', gap: '12px' }}>
              {ticketsRecords.map((record) => (
                <div key={record.id} style={cardStyle}>
                  <p>
                    <strong>Date From:</strong> {record.ticket_date}
                  </p>
                  <p>
                    <strong>Date To:</strong> {record.date_to || '-'}
                  </p>
                  <p>
                    <strong>Tickets Count:</strong> {record.tickets_count}
                  </p>
                  <p>
                    <strong>Notes:</strong> {record.notes || '-'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}
      {currentUser.team === 'Sales' && (
        <Section title="My Sales Records">
          {salesRecords.length === 0 ? (
            <p>No sales records found.</p>
          ) : (
            <div style={{ display: 'grid', gap: '12px' }}>
              {salesRecords.map((record) => (
                <div key={record.id} style={cardStyle}>
                  <p>
                    <strong>Date From:</strong> {record.sale_date}
                  </p>
                  <p>
                    <strong>Date To:</strong> {record.date_to || '-'}
                  </p>
                  <p>
                    <strong>Amount:</strong> ${Number(record.amount).toFixed(2)}
                  </p>
                  <p>
                    <strong>Notes:</strong> {record.notes || '-'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}
      <MonitoringWidget
        count={monitoringItems.length}
        onClick={() => setMonitoringOpen(true)}
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
      <div style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '8px' }}>
        {title}
      </div>
      <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#f8fafc' }}>
        {value}
      </div>
      {subtitle ? (
        <div style={{ marginTop: '8px', fontSize: '12px', color: '#64748b' }}>
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
const pageHeaderStyle = {
  display: 'flex',
  gap: '12px',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexWrap: 'wrap' as const,
  marginBottom: '18px',
};
const sectionEyebrow = {
  color: '#60a5fa',
  fontSize: '12px',
  fontWeight: 800,
  letterSpacing: '0.18em',
  textTransform: 'uppercase' as const,
  marginBottom: '12px',
};
const panelStyle = {
  background:
    'linear-gradient(180deg, rgba(15,23,42,0.82) 0%, rgba(15,23,42,0.68) 100%)',
  border: '1px solid rgba(148,163,184,0.14)',
  borderRadius: '20px',
  padding: '20px',
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
  border: '1px solid rgba(148,163,184,0.14)',
  backgroundColor: 'rgba(15,23,42,0.56)',
  color: '#cbd5e1',
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
  background:
    'linear-gradient(180deg, rgba(15,23,42,0.82) 0%, rgba(15,23,42,0.68) 100%)',
  border: '1px solid rgba(148,163,184,0.14)',
  borderRadius: '18px',
  padding: '20px',
  boxShadow: '0 8px 24px rgba(2,6,23,0.2)',
};
const auditTableWrapStyle = {
  marginTop: '16px',
  overflowX: 'auto' as const,
  borderRadius: '18px',
  border: '1px solid rgba(148,163,184,0.14)',
  background:
    'linear-gradient(180deg, rgba(15,23,42,0.82) 0%, rgba(15,23,42,0.68) 100%)',
  boxShadow: '0 8px 24px rgba(2,6,23,0.2)',
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
  background: 'rgba(2,6,23,0.92)',
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
  color: '#f8fafc',
  fontSize: '14px',
  fontWeight: 600,
  lineHeight: 1.4,
};
const secondaryCellTextStyle = {
  marginTop: '4px',
  color: '#64748b',
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
  background: 'rgba(37,99,235,0.18)',
  border: '1px solid rgba(96,165,250,0.26)',
  color: '#dbeafe',
  fontSize: '13px',
  fontWeight: 800,
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
const secondaryButton = {
  backgroundColor: 'rgba(15,23,42,0.78)',
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
  color: '#fecaca',
};
const pillStyle = {
  color: 'white',
  padding: '4px 8px',
  borderRadius: '999px',
  fontSize: '12px',
  fontWeight: 'bold',
};
const auditExpandedRowStyle = { padding: '0 16px 16px 16px' };
const expandedPanelStyle = {
  borderRadius: '18px',
  border: '1px solid rgba(148,163,184,0.12)',
  background:
    'linear-gradient(180deg, rgba(15,23,42,0.78) 0%, rgba(15,23,42,0.6) 100%)',
  padding: '18px',
};

const detailRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '12px',
  alignItems: 'center',
  padding: '12px 14px',
  borderRadius: '14px',
  border: '1px solid rgba(148,163,184,0.12)',
  background: 'rgba(15,23,42,0.52)',
};

const metricNoteCardStyle = {
  marginTop: '10px',
  borderRadius: '12px',
  border: '1px solid rgba(148,163,184,0.12)',
  background: 'rgba(15,23,42,0.52)',
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
  color: '#e5eefb',
  fontSize: '13px',
  lineHeight: 1.55,
  whiteSpace: 'pre-wrap' as const,
};

const miniSecondaryButton = {

  padding: '8px 10px',
  background: 'rgba(15,23,42,0.82)',
  color: '#e5eefb',
  border: '1px solid rgba(148,163,184,0.18)',
  borderRadius: '10px',
  cursor: 'pointer',
  fontWeight: 700,
  fontSize: '12px',
};
export default AgentPortal;
