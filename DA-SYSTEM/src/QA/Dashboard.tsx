import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { supabase } from '../lib/supabase';
import RecognitionWall from './RecognitionWall';
import DigitalTrophyCabinet from './DigitalTrophyCabinet';
import VoiceOfEmployeeSupabase from './VoiceOfEmployeeSupabase';
import {
  clearCachedValue,
  getCachedValue,
  peekCachedValue,
} from '../lib/viewCache';

type TeamName = 'Calls' | 'Tickets' | 'Sales';

type AuditItem = {
  id: string;
  agent_id: string;
  agent_name: string;
  team: TeamName | string;
  case_type: string;
  audit_date: string;
  quality_score: number;
  comments: string | null;
  shared_with_agent?: boolean | null;
};

type AgentProfile = {
  id: string;
  agent_id: string | null;
  agent_name: string;
  display_name: string | null;
  team: TeamName | null;
};


type SupervisorRequestSummary = {
  id: string;
  status: 'Open' | 'Under Review' | 'Closed';
  created_at: string;
  team: string | null;
};

type AgentFeedbackSummary = {
  id: string;
  status: 'Open' | 'In Progress' | 'Closed';
  created_at: string;
  team: string;
};

type MonitoringSummary = {
  id: string;
  status: 'active' | 'resolved';
  created_at: string;
  team: string;
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

type QuantityLeader = {
  label: string;
  quantity: number;
};

type QualityLeader = {
  label: string;
  averageQuality: number;
  auditsCount: number;
};

type HybridLeader = {
  label: string;
  quantity: number;
  averageQuality: number;
  rsd: number;
  combinedScore: number;
};

type TeamCardData = {
  title: string;
  quantityLabel: string;
  quantityValue: string;
  qualityLabel: string;
  qualityValue: string;
  auditedAgents: number;
  leader: string;
};

type RankedAuditSummary = {
  label: string;
  averageQuality: number;
  auditsCount: number;
};

type DashboardCachePayload = {
  audits: AuditItem[];
  profiles: AgentProfile[];
  callsRecords: CallsRecord[];
  ticketsRecords: TicketsRecord[];
  salesRecords: SalesRecord[];
  supervisorRequests: SupervisorRequestSummary[];
  agentFeedback: AgentFeedbackSummary[];
  monitoringItems: MonitoringSummary[];
};

const DASHBOARD_CACHE_KEY = 'dashboard:datasets:v1';
const DASHBOARD_CACHE_TTL_MS = 1000 * 60 * 5;

function normalizeAgentId(value?: string | null) {
  return String(value || '').trim().replace(/\.0+$/, '');
}

function normalizeAgentName(value?: string | null) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function getCurrentDateValue() {
  return new Date().toISOString().slice(0, 10);
}

function getMonthStartValue() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
}

function shiftDateStringByMonths(dateValue: string, monthOffset: number) {
  if (!dateValue) return '';

  const [yearText, monthText, dayText] = dateValue.split('-');
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const day = Number(dayText);

  const shiftedMonthIndex = monthIndex + monthOffset;
  const targetYear = year + Math.floor(shiftedMonthIndex / 12);
  const normalizedMonthIndex = ((shiftedMonthIndex % 12) + 12) % 12;
  const daysInTargetMonth = new Date(targetYear, normalizedMonthIndex + 1, 0).getDate();
  const safeDay = Math.min(day, daysInTargetMonth);

  const shifted = new Date(Date.UTC(targetYear, normalizedMonthIndex, safeDay));
  return shifted.toISOString().slice(0, 10);
}

function getPercentChange(current: number, previous: number) {
  if (previous === 0) {
    if (current === 0) return 0;
    return 100;
  }

  return ((current - previous) / previous) * 100;
}

function formatPercentDelta(current: number, previous: number) {
  const delta = getPercentChange(current, previous);
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta.toFixed(2)}% vs last month`;
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

function openNativeDatePicker(input: HTMLInputElement | null | undefined) {
  if (!input) return;

  input.focus();

  const inputWithPicker = input as HTMLInputElement & {
    showPicker?: () => void;
  };

  if (typeof inputWithPicker.showPicker === 'function') {
    inputWithPicker.showPicker();
  }
}


function getDashboardThemeVars(): Record<string, string> {
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
    '--da-subtitle': isLight ? '#64748b' : '#94a3b8',
    '--da-muted-text': isLight ? '#475569' : '#cbd5e1',
    '--da-subtle-text': isLight ? '#64748b' : '#94a3b8',
    '--da-card-label': isLight ? '#64748b' : '#94a3b8',
    '--da-card-value': isLight ? '#0f172a' : '#f8fafc',
    '--da-card-subtitle': isLight ? '#64748b' : '#94a3b8',
    '--da-team-meta': isLight ? '#475569' : '#cbd5e1',
    '--da-accent-text': isLight ? '#2563eb' : '#60a5fa',
    '--da-eyebrow': isLight ? '#3b82f6' : '#60a5fa',
    '--da-section-eyebrow': isLight ? '#3b82f6' : '#93c5fd',
    '--da-panel-bg': isLight
      ? 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(247,250,255,0.96) 100%)'
      : 'linear-gradient(180deg, rgba(15,23,42,0.82) 0%, rgba(15,23,42,0.68) 100%)',
    '--da-panel-border': isLight
      ? '1px solid rgba(203,213,225,0.92)'
      : '1px solid rgba(148,163,184,0.14)',
    '--da-panel-shadow': isLight
      ? '0 18px 40px rgba(15,23,42,0.10)'
      : '0 18px 40px rgba(2,6,23,0.35)',
    '--da-card-bg': isLight ? 'rgba(255,255,255,0.98)' : 'rgba(15,23,42,0.52)',
    '--da-row-border': isLight
      ? '1px solid rgba(203,213,225,0.92)'
      : '1px solid rgba(148,163,184,0.16)',
    '--da-empty-border': isLight
      ? '1px dashed rgba(203,213,225,0.92)'
      : '1px dashed rgba(148,163,184,0.24)',
    '--da-field-bg': isLight
      ? 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(250,252,255,0.98) 100%)'
      : 'rgba(15,23,42,0.74)',
    '--da-field-border': isLight
      ? '1px solid rgba(203,213,225,0.92)'
      : '1px solid rgba(148,163,184,0.18)',
    '--da-field-text': isLight ? '#334155' : '#e5eefb',
    '--da-secondary-bg': isLight ? 'rgba(255,255,255,0.98)' : 'rgba(15,23,42,0.74)',
    '--da-secondary-text': isLight ? '#475569' : '#e5eefb',
    '--da-secondary-border': isLight
      ? '1px solid rgba(203,213,225,0.92)'
      : '1px solid rgba(148,163,184,0.18)',
    '--da-meta-bg': isLight ? 'rgba(255,255,255,0.98)' : 'rgba(15,23,42,0.62)',
    '--da-meta-border': isLight
      ? '1px solid rgba(203,213,225,0.92)'
      : '1px solid rgba(148,163,184,0.14)',
    '--da-meta-text': isLight ? '#475569' : '#cbd5e1',
    '--da-pill-bg': isLight ? 'rgba(37,99,235,0.10)' : 'rgba(37,99,235,0.14)',
    '--da-pill-text': isLight ? '#2563eb' : '#93c5fd',
    '--da-rank-badge-bg': isLight ? 'rgba(37,99,235,0.10)' : 'rgba(37,99,235,0.14)',
    '--da-rank-badge-text': isLight ? '#2563eb' : '#60a5fa',
    '--da-error-bg': isLight ? 'rgba(254,242,242,0.98)' : 'rgba(127,29,29,0.24)',
    '--da-error-border': isLight
      ? '1px solid rgba(248,113,113,0.28)'
      : '1px solid rgba(248,113,113,0.22)',
    '--da-error-text': isLight ? '#b91c1c' : '#fecaca',
    '--screen-panel-bg': isLight
      ? 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(247,250,255,0.96) 100%)'
      : 'linear-gradient(180deg, rgba(15,23,42,0.82) 0%, rgba(15,23,42,0.68) 100%)',
    '--screen-card-bg': isLight
      ? 'linear-gradient(180deg, rgba(255,255,255,0.99) 0%, rgba(248,250,255,0.97) 100%)'
      : 'linear-gradient(180deg, rgba(15,23,42,0.82) 0%, rgba(15,23,42,0.68) 100%)',
    '--screen-card-soft-bg': isLight
      ? 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(245,248,253,0.96) 100%)'
      : 'rgba(15,23,42,0.52)',
    '--screen-heading': isLight ? '#0f172a' : '#f8fafc',
    '--screen-text': isLight ? '#334155' : '#e5eefb',
    '--screen-muted': isLight ? '#64748b' : '#94a3b8',
    '--screen-subtle': isLight ? '#64748b' : '#94a3b8',
    '--screen-border': isLight ? 'rgba(203,213,225,0.92)' : 'rgba(148,163,184,0.14)',
    '--screen-shadow': isLight
      ? '0 18px 40px rgba(15,23,42,0.10)'
      : '0 18px 40px rgba(2,6,23,0.35)',
    '--screen-pill-bg': isLight ? 'rgba(37,99,235,0.10)' : 'rgba(37,99,235,0.18)',
    '--screen-pill-border': isLight ? 'rgba(59,130,246,0.24)' : 'rgba(96,165,250,0.26)',
    '--screen-soft-fill': isLight ? 'rgba(248,250,252,0.98)' : 'rgba(15,23,42,0.48)',
    '--screen-soft-fill-2': isLight ? 'rgba(241,245,249,0.98)' : 'rgba(15,23,42,0.62)',
    '--screen-note-bg': isLight ? 'rgba(255,255,255,0.98)' : 'rgba(15,23,42,0.52)',
  };
}

function Dashboard({
  currentUser = null,
}: {
  currentUser?: {
    id?: string;
    role?: 'admin' | 'qa' | 'agent' | 'supervisor';
    agent_id?: string | null;
    agent_name?: string;
    display_name?: string | null;
    team?: TeamName | null;
    email?: string;
  } | null;
}) {
  const [audits, setAudits] = useState<AuditItem[]>([]);
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [callsRecords, setCallsRecords] = useState<CallsRecord[]>([]);
  const [ticketsRecords, setTicketsRecords] = useState<TicketsRecord[]>([]);
  const [salesRecords, setSalesRecords] = useState<SalesRecord[]>([]);
  const [supervisorRequests, setSupervisorRequests] = useState<SupervisorRequestSummary[]>([]);
  const [agentFeedback, setAgentFeedback] = useState<AgentFeedbackSummary[]>([]);
  const [monitoringItems, setMonitoringItems] = useState<MonitoringSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [dateFrom, setDateFrom] = useState(getMonthStartValue());
  const [dateTo, setDateTo] = useState(getCurrentDateValue());
  const [lastLoadedAt, setLastLoadedAt] = useState('');
  const dateFromInputRef = useRef<HTMLInputElement | null>(null);
  const dateToInputRef = useRef<HTMLInputElement | null>(null);
  const themeVars = getDashboardThemeVars();
  const roleSpotlight = useMemo(() => {
    const role = currentUser?.role || 'qa';

    if (role === 'admin') {
      return {
        title: 'Admin Spotlight',
        cards: [
          { title: 'System Pulse', description: 'Watch calls, tickets, sales, released audits, and cross-team quality trends from one place.' },
          { title: 'People Ops', description: 'Use reports, accounts, and recognition to keep every team aligned.' },
          { title: 'Action Queue', description: 'Review feedback, monitoring, and supervisor requests that need attention.' },
        ],
      };
    }

    return {
      title: 'QA Spotlight',
      cards: [
        { title: 'Coach With Context', description: 'Review quality trends, recognition, and recent uploads before coaching an agent.' },
        { title: 'Recognition & Growth', description: 'Use recognition, trophies, and academy content to reinforce strong performance.' },
        { title: 'Celebrate Wins', description: 'Recognition and trophies make quality visible, not only corrective.' },
      ],
    };
  }, [currentUser?.role]);


  useEffect(() => {
    void loadDashboardData();
  }, []);

  function applyDashboardData(payload: DashboardCachePayload) {
    setAudits(payload.audits);
    setProfiles(payload.profiles);
    setCallsRecords(payload.callsRecords);
    setTicketsRecords(payload.ticketsRecords);
    setSalesRecords(payload.salesRecords);
    setSupervisorRequests(payload.supervisorRequests);
    setAgentFeedback(payload.agentFeedback);
    setMonitoringItems(payload.monitoringItems);
  }

  async function fetchDashboardData() {
    const [
      auditsResult,
      profilesResult,
      callsResult,
      ticketsResult,
      salesResult,
      requestsResult,
      feedbackResult,
      monitoringResult,
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
        .select('id, status, created_at, team')
        .order('created_at', { ascending: false }),
      supabase
        .from('agent_feedback')
        .select('id, status, created_at, team')
        .order('created_at', { ascending: false }),
      supabase
        .from('monitoring_items')
        .select('id, status, created_at, team')
        .order('created_at', { ascending: false }),
    ]);

    const errors = [
      auditsResult.error?.message,
      profilesResult.error?.message,
      callsResult.error?.message,
      ticketsResult.error?.message,
      salesResult.error?.message,
      requestsResult.error?.message,
      feedbackResult.error?.message,
      monitoringResult.error?.message,
    ].filter(Boolean);

    if (errors.length > 0) {
      throw new Error(errors.join(' | '));
    }

    return {
      audits: (auditsResult.data as AuditItem[]) || [],
      profiles: (profilesResult.data as AgentProfile[]) || [],
      callsRecords: (callsResult.data as CallsRecord[]) || [],
      ticketsRecords: (ticketsResult.data as TicketsRecord[]) || [],
      salesRecords: (salesResult.data as SalesRecord[]) || [],
      supervisorRequests: (requestsResult.data as SupervisorRequestSummary[]) || [],
      agentFeedback: (feedbackResult.data as AgentFeedbackSummary[]) || [],
      monitoringItems: (monitoringResult.data as MonitoringSummary[]) || [],
    } satisfies DashboardCachePayload;
  }

  async function loadDashboardData(options?: {
    force?: boolean;
    background?: boolean;
  }) {
    const force = options?.force ?? false;
    const background = options?.background ?? false;
    const cached = force
      ? null
      : peekCachedValue<DashboardCachePayload>(DASHBOARD_CACHE_KEY);

    if (cached) {
      applyDashboardData(cached);
      setLoading(false);
    }

    if (background || cached) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setErrorMessage('');

    try {
      const payload = await getCachedValue(
        DASHBOARD_CACHE_KEY,
        fetchDashboardData,
        {
          ttlMs: DASHBOARD_CACHE_TTL_MS,
          force,
        }
      );

      applyDashboardData(payload);
      setLastLoadedAt(new Date().toISOString());
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Could not load dashboard data.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }
  function getDisplayName(
    agentId?: string | null,
    agentName?: string | null,
    team?: string | null
  ) {
    const normalizedId = normalizeAgentId(agentId);
    const normalizedName = normalizeAgentName(agentName);

    const matchedProfile = profiles.find((profile) => {
      if (profile.team !== (team || null)) return false;

      const profileId = normalizeAgentId(profile.agent_id);
      const profileName = normalizeAgentName(profile.agent_name);

      if (normalizedId && profileId) {
        return profileId === normalizedId;
      }

      return profileName === normalizedName;
    });

    return matchedProfile?.display_name || null;
  }

  function getAgentLabel(
    agentId?: string | null,
    agentName?: string | null,
    team?: string | null
  ) {
    const displayName = getDisplayName(agentId, agentName, team);

    if (displayName) {
      return `${agentName || '-'} - ${displayName}`;
    }

    return `${agentName || '-'} - ${agentId || '-'}`;
  }

  function getAgentKey(agentId?: string | null, agentName?: string | null) {
    const normalizedId = normalizeAgentId(agentId);
    const normalizedName = normalizeAgentName(agentName);
    return `${normalizedId}|${normalizedName}`;
  }

  function matchesSelectedRange(
    dateValue?: string | null,
    dateToValue?: string | null
  ) {
    if (!dateFrom && !dateTo) return true;
    return matchesDateRange(dateValue, dateToValue, dateFrom, dateTo);
  }

  const filteredAudits = useMemo(() => {
    return audits.filter((item) => matchesSelectedRange(item.audit_date));
  }, [audits, dateFrom, dateTo]);

  const filteredCalls = useMemo(() => {
    return callsRecords.filter((item) =>
      matchesSelectedRange(item.call_date, item.date_to || null)
    );
  }, [callsRecords, dateFrom, dateTo]);

  const filteredTickets = useMemo(() => {
    return ticketsRecords.filter((item) =>
      matchesSelectedRange(item.ticket_date, item.date_to || null)
    );
  }, [ticketsRecords, dateFrom, dateTo]);

  const filteredSales = useMemo(() => {
    return salesRecords.filter((item) =>
      matchesSelectedRange(item.sale_date, item.date_to || null)
    );
  }, [salesRecords, dateFrom, dateTo]);

  const filteredRequests = useMemo(() => {
    return supervisorRequests.filter((item) =>
      matchesSelectedRange(item.created_at.slice(0, 10), item.created_at.slice(0, 10))
    );
  }, [supervisorRequests, dateFrom, dateTo]);

  const filteredFeedback = useMemo(() => {
    return agentFeedback.filter((item) =>
      matchesSelectedRange(item.created_at.slice(0, 10), item.created_at.slice(0, 10))
    );
  }, [agentFeedback, dateFrom, dateTo]);

  const filteredMonitoring = useMemo(() => {
    return monitoringItems.filter((item) =>
      matchesSelectedRange(item.created_at.slice(0, 10), item.created_at.slice(0, 10))
    );
  }, [monitoringItems, dateFrom, dateTo]);

  const comparisonDateFrom = dateFrom || getMonthStartValue();
  const comparisonDateTo = dateTo || getCurrentDateValue();
  const previousDateFrom = useMemo(
    () => shiftDateStringByMonths(comparisonDateFrom, -1),
    [comparisonDateFrom]
  );
  const previousDateTo = useMemo(
    () => shiftDateStringByMonths(comparisonDateTo, -1),
    [comparisonDateTo]
  );

  const previousAudits = useMemo(() => {
    return audits.filter((item) =>
      matchesDateRange(item.audit_date, item.audit_date, previousDateFrom, previousDateTo)
    );
  }, [audits, previousDateFrom, previousDateTo]);

  const previousCalls = useMemo(() => {
    return callsRecords.filter((item) =>
      matchesDateRange(item.call_date, item.date_to || null, previousDateFrom, previousDateTo)
    );
  }, [callsRecords, previousDateFrom, previousDateTo]);

  const previousTickets = useMemo(() => {
    return ticketsRecords.filter((item) =>
      matchesDateRange(item.ticket_date, item.date_to || null, previousDateFrom, previousDateTo)
    );
  }, [ticketsRecords, previousDateFrom, previousDateTo]);

  const previousSales = useMemo(() => {
    return salesRecords.filter((item) =>
      matchesDateRange(item.sale_date, item.date_to || null, previousDateFrom, previousDateTo)
    );
  }, [salesRecords, previousDateFrom, previousDateTo]);

  const filteredCallsAudits = useMemo(
    () => filteredAudits.filter((item) => item.team === 'Calls'),
    [filteredAudits]
  );

  const filteredTicketsAudits = useMemo(
    () => filteredAudits.filter((item) => item.team === 'Tickets'),
    [filteredAudits]
  );

  const filteredSalesAudits = useMemo(
    () => filteredAudits.filter((item) => item.team === 'Sales'),
    [filteredAudits]
  );

  const previousCallsAudits = useMemo(
    () => previousAudits.filter((item) => item.team === 'Calls'),
    [previousAudits]
  );

  const previousTicketsAudits = useMemo(
    () => previousAudits.filter((item) => item.team === 'Tickets'),
    [previousAudits]
  );

  const previousSalesAudits = useMemo(
    () => previousAudits.filter((item) => item.team === 'Sales'),
    [previousAudits]
  );

  const auditedCallsKeys = useMemo(() => {
    return new Set(
      filteredCallsAudits.map((item) =>
        getAgentKey(item.agent_id, item.agent_name)
      )
    );
  }, [filteredCallsAudits]);

  const auditedTicketsKeys = useMemo(() => {
    return new Set(
      filteredTicketsAudits.map((item) =>
        getAgentKey(item.agent_id, item.agent_name)
      )
    );
  }, [filteredTicketsAudits]);

  function buildQuantityLeaderboard<
    T extends { agent_id: string; agent_name: string; calls_count?: number; tickets_count?: number; amount?: number }
  >(
    records: T[],
    team: 'Calls' | 'Tickets',
    getQuantity: (record: T) => number,
    allowedKeys: Set<string>
  ) {
    const grouped = new Map<string, QuantityLeader>();
    const restrictToAuditedAgents = allowedKeys.size > 0;

    records.forEach((record) => {
      const key = getAgentKey(record.agent_id, record.agent_name);
      if (restrictToAuditedAgents && !allowedKeys.has(key)) return;

      const quantity = getQuantity(record);
      const existing = grouped.get(key);

      if (existing) {
        existing.quantity += quantity;
        return;
      }

      grouped.set(key, {
        label: getAgentLabel(record.agent_id, record.agent_name, team),
        quantity,
      });
    });

    return Array.from(grouped.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 3);
  }

  function buildQualityLeaderboard(team: 'Calls' | 'Tickets') {
    const grouped = new Map<
      string,
      {
        label: string;
        scores: number[];
      }
    >();

    filteredAudits
      .filter((item) => item.team === team)
      .forEach((audit) => {
        const key = getAgentKey(audit.agent_id, audit.agent_name);
        const existing = grouped.get(key);

        if (existing) {
          existing.scores.push(Number(audit.quality_score));
          return;
        }

        grouped.set(key, {
          label: getAgentLabel(audit.agent_id, audit.agent_name, team),
          scores: [Number(audit.quality_score)],
        });
      });

    return Array.from(grouped.values())
      .map((item) => ({
        label: item.label,
        averageQuality:
          item.scores.reduce((sum, value) => sum + value, 0) /
          item.scores.length,
        auditsCount: item.scores.length,
      }))
      .sort((a, b) => b.averageQuality - a.averageQuality)
      .slice(0, 3);
  }

  function buildHybridLeaderboard<
    T extends { agent_id: string; agent_name: string; calls_count?: number; tickets_count?: number; amount?: number }
  >(
    team: 'Calls' | 'Tickets',
    records: T[],
    getQuantity: (record: T) => number
  ) {
    const teamAudits = filteredAudits.filter((item) => item.team === team);

    const quantityMap = new Map<
      string,
      {
        agent_id: string;
        agent_name: string;
        quantity: number;
      }
    >();

    records.forEach((record) => {
      const key = getAgentKey(record.agent_id, record.agent_name);
      const existing = quantityMap.get(key);

      if (existing) {
        existing.quantity += getQuantity(record);
        return;
      }

      quantityMap.set(key, {
        agent_id: record.agent_id,
        agent_name: record.agent_name,
        quantity: getQuantity(record),
      });
    });

    const qualityMap = new Map<string, number[]>();

    teamAudits.forEach((audit) => {
      const key = getAgentKey(audit.agent_id, audit.agent_name);
      const scores = qualityMap.get(key) || [];
      scores.push(Number(audit.quality_score));
      qualityMap.set(key, scores);
    });

    const quantityValues = Array.from(quantityMap.entries())
      .filter(([key]) => qualityMap.has(key))
      .map(([, value]) => value.quantity);

    const teamAverageQuantity =
      quantityValues.length > 0
        ? quantityValues.reduce((sum, value) => sum + value, 0) /
          quantityValues.length
        : 0;

    const teamAverageQuality =
      teamAudits.length > 0
        ? teamAudits.reduce(
            (sum, audit) => sum + Number(audit.quality_score),
            0
          ) / teamAudits.length
        : 0;

    const rows: HybridLeader[] = Array.from(quantityMap.entries())
      .map(([key, item]) => {
        const qualityScores = qualityMap.get(key) || [];
        if (qualityScores.length === 0) return null;

        const averageAgentQuality =
          qualityScores.reduce((sum, value) => sum + value, 0) /
          qualityScores.length;

        const agentStdDev =
          qualityScores.length > 1 ? getStandardDeviation(qualityScores) : 0;
        const agentRsd =
          averageAgentQuality > 0 ? agentStdDev / averageAgentQuality : 0;
        const quantityRatio =
          teamAverageQuantity > 0 ? item.quantity / teamAverageQuantity : 0;
        const qualityRatio =
          teamAverageQuality > 0 ? averageAgentQuality / teamAverageQuality : 0;
        const combinedScore = (quantityRatio + qualityRatio) / 2 - agentRsd;

        return {
          label: getAgentLabel(item.agent_id, item.agent_name, team),
          quantity: item.quantity,
          averageQuality: averageAgentQuality,
          rsd: agentRsd,
          combinedScore,
        };
      })
      .filter((item): item is HybridLeader => item !== null);

    return rows.sort((a, b) => b.combinedScore - a.combinedScore).slice(0, 3);
  }

  function buildSalesLeaderboard() {
    const grouped = new Map<string, QuantityLeader>();

    filteredSales.forEach((record) => {
      const key = getAgentKey(record.agent_id, record.agent_name);
      const existing = grouped.get(key);

      if (existing) {
        existing.quantity += Number(record.amount);
        return;
      }

      grouped.set(key, {
        label: getAgentLabel(record.agent_id, record.agent_name, 'Sales'),
        quantity: Number(record.amount),
      });
    });

    return Array.from(grouped.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 3);
  }

  function buildRankedAuditSummary(team?: TeamName): RankedAuditSummary[] {
    const grouped = new Map<string, { label: string; scores: number[] }>();

    filteredAudits
      .filter((item) => (team ? item.team === team : true))
      .forEach((audit) => {
        const key = getAgentKey(audit.agent_id, audit.agent_name);
        const existing = grouped.get(key);

        if (existing) {
          existing.scores.push(Number(audit.quality_score));
          return;
        }

        grouped.set(key, {
          label: getAgentLabel(
            audit.agent_id,
            audit.agent_name,
            audit.team as TeamName
          ),
          scores: [Number(audit.quality_score)],
        });
      });

    return Array.from(grouped.values())
      .map((item) => ({
        label: item.label,
        averageQuality:
          item.scores.reduce((sum, value) => sum + value, 0) /
          item.scores.length,
        auditsCount: item.scores.length,
      }))
      .sort((a, b) => b.averageQuality - a.averageQuality);
  }

  const callsQuantityTop = useMemo(() => {
    return buildQuantityLeaderboard(
      filteredCalls,
      'Calls',
      (record) => Number(record.calls_count),
      auditedCallsKeys
    );
  }, [filteredCalls, auditedCallsKeys, profiles]);

  const ticketsQuantityTop = useMemo(() => {
    return buildQuantityLeaderboard(
      filteredTickets,
      'Tickets',
      (record) => Number(record.tickets_count),
      auditedTicketsKeys
    );
  }, [filteredTickets, auditedTicketsKeys, profiles]);

  const callsQualityTop = useMemo(() => {
    return buildQualityLeaderboard('Calls');
  }, [filteredAudits, profiles]);

  const ticketsQualityTop = useMemo(() => {
    return buildQualityLeaderboard('Tickets');
  }, [filteredAudits, profiles]);

  const callsHybridTop = useMemo(() => {
    return buildHybridLeaderboard('Calls', filteredCalls, (record) =>
      Number(record.calls_count)
    );
  }, [filteredCalls, filteredAudits, profiles]);

  const ticketsHybridTop = useMemo(() => {
    return buildHybridLeaderboard('Tickets', filteredTickets, (record) =>
      Number(record.tickets_count)
    );
  }, [filteredTickets, filteredAudits, profiles]);

  const salesTop = useMemo(() => {
    return buildSalesLeaderboard();
  }, [filteredSales, profiles]);

  const totalAudits = filteredAudits.length;
  const averageQuality =
    totalAudits > 0
      ? filteredAudits.reduce(
          (sum, item) => sum + Number(item.quality_score),
          0
        ) / totalAudits
      : 0;
  const totalSales = filteredSales.reduce(
    (sum, item) => sum + Number(item.amount),
    0
  );
  const releasedAudits = filteredAudits.filter(
    (item) => item.shared_with_agent
  ).length;

  const callsCard: TeamCardData = {
    title: 'Calls',
    quantityLabel: 'Calls Volume',
    quantityValue: `${filteredCalls.reduce(
      (sum, item) => sum + Number(item.calls_count),
      0
    )}`,
    qualityLabel: 'Avg Quality',
    qualityValue: `${getTeamAverage(filteredCallsAudits).toFixed(2)}%`,
    auditedAgents: auditedCallsKeys.size,
    leader: callsHybridTop[0]?.label || callsQualityTop[0]?.label || '-',
  };

  const ticketsCard: TeamCardData = {
    title: 'Tickets',
    quantityLabel: 'Tickets Volume',
    quantityValue: `${filteredTickets.reduce(
      (sum, item) => sum + Number(item.tickets_count),
      0
    )}`,
    qualityLabel: 'Avg Quality',
    qualityValue: `${getTeamAverage(filteredTicketsAudits).toFixed(2)}%`,
    auditedAgents: auditedTicketsKeys.size,
    leader: ticketsHybridTop[0]?.label || ticketsQualityTop[0]?.label || '-',
  };

  const salesCard: TeamCardData = {
    title: 'Sales',
    quantityLabel: 'Sales Total',
    quantityValue: `$${totalSales.toFixed(2)}`,
    qualityLabel: 'Avg Quality',
    qualityValue: `${getTeamAverage(filteredSalesAudits).toFixed(2)}%`,
    auditedAgents: new Set(
      filteredSalesAudits.map((item) =>
        getAgentKey(item.agent_id, item.agent_name)
      )
    ).size,
    leader: salesTop[0]?.label || '-',
  };

  const allAuditSummaries = useMemo(
    () => buildRankedAuditSummary(),
    [filteredAudits, profiles]
  );
  const lowestQualityAgent =
    allAuditSummaries.length > 0 ? [...allAuditSummaries].reverse()[0] : null;
  const coachingOpportunity =
    allAuditSummaries
      .filter((item) => item.auditsCount >= 2)
      .sort((a, b) => a.averageQuality - b.averageQuality)[0] || null;

  const consistencyPool = [...callsHybridTop, ...ticketsHybridTop].sort(
    (a, b) => {
      if (a.rsd === b.rsd) return b.combinedScore - a.combinedScore;
      return a.rsd - b.rsd;
    }
  );
  const mostConsistentPerformer = consistencyPool[0] || null;

  const peopleOpsLeader = (() => {
    const crossTeamCombinedPool = [...callsHybridTop, ...ticketsHybridTop].sort(
      (a, b) => b.combinedScore - a.combinedScore
    );

    if (crossTeamCombinedPool.length > 0) {
      return crossTeamCombinedPool[0].label;
    }

    if (salesTop.length > 0) {
      return salesTop[0].label;
    }

    return '-';
  })();


  const currentCallsTotal = filteredCalls.reduce(
    (sum, item) => sum + Number(item.calls_count),
    0
  );
  const currentTicketsTotal = filteredTickets.reduce(
    (sum, item) => sum + Number(item.tickets_count),
    0
  );
  const currentSalesTotal = filteredSales.reduce(
    (sum, item) => sum + Number(item.amount),
    0
  );

  const previousCallsTotal = previousCalls.reduce(
    (sum, item) => sum + Number(item.calls_count),
    0
  );
  const previousTicketsTotal = previousTickets.reduce(
    (sum, item) => sum + Number(item.tickets_count),
    0
  );
  const previousSalesTotal = previousSales.reduce(
    (sum, item) => sum + Number(item.amount),
    0
  );

  const openRequestsCount = filteredRequests.filter((item) => item.status !== 'Closed').length;
  const openFeedbackCount = filteredFeedback.filter((item) => item.status !== 'Closed').length;
  const activeMonitoringCount = filteredMonitoring.filter((item) => item.status === 'active').length;
  const releasedRate = totalAudits > 0 ? (releasedAudits / totalAudits) * 100 : 0;

  const currentCallsTrend = getTeamAverage(filteredCallsAudits);
  const currentTicketsTrend = getTeamAverage(filteredTicketsAudits);
  const currentSalesTrend = getTeamAverage(filteredSalesAudits);
  const previousCallsTrend = getTeamAverage(previousCallsAudits);
  const previousTicketsTrend = getTeamAverage(previousTicketsAudits);
  const previousSalesTrend = getTeamAverage(previousSalesAudits);

  const teamCountsLabel = [
    `Calls ${currentCallsTotal} (${formatPercentDelta(currentCallsTotal, previousCallsTotal)})`,
    `Tickets ${currentTicketsTotal} (${formatPercentDelta(currentTicketsTotal, previousTicketsTotal)})`,
    `Sales $${currentSalesTotal.toFixed(2)} (${formatPercentDelta(currentSalesTotal, previousSalesTotal)})`,
  ].join('\n');

  const crossTeamTrendLabel = [
    `Calls ${currentCallsTrend.toFixed(2)}% (${formatPercentDelta(currentCallsTrend, previousCallsTrend)})`,
    `Tickets ${currentTicketsTrend.toFixed(2)}% (${formatPercentDelta(currentTicketsTrend, previousTicketsTrend)})`,
    `Sales ${currentSalesTrend.toFixed(2)}% (${formatPercentDelta(currentSalesTrend, previousSalesTrend)})`,
  ].join('\n');

  function getSpotlightStats(cardTitle: string) {
    if (cardTitle === 'System Pulse') {
      return [
        { label: 'Counts', value: teamCountsLabel },
        { label: 'Released', value: `${releasedAudits}` },
        { label: 'Trend', value: crossTeamTrendLabel },
      ];
    }

    if (cardTitle === 'People Ops') {
      return [
        { label: 'Agents', value: `${profiles.length}` },
        { label: 'Recognition', value: `${callsQualityTop.length + ticketsQualityTop.length + salesTop.length}` },
        { label: 'Leader', value: peopleOpsLeader },
      ];
    }

    if (cardTitle === 'Action Queue') {
      return [
        { label: 'Feedback', value: `${openFeedbackCount}` },
        { label: 'Monitoring', value: `${activeMonitoringCount}` },
        { label: 'Requests', value: `${openRequestsCount}` },
      ];
    }

    if (cardTitle === 'Coach With Context') {
      return [
        { label: 'Audits', value: `${totalAudits}` },
        { label: 'Avg', value: `${averageQuality.toFixed(2)}%` },
        { label: 'Focus', value: coachingOpportunity?.label || '-' },
      ];
    }

    if (cardTitle === 'Recognition & Growth') {
      return [
        { label: 'Released', value: `${releasedAudits}` },
        { label: 'Rate', value: `${releasedRate.toFixed(0)}%` },
        { label: 'Consistent', value: mostConsistentPerformer?.label || '-' },
      ];
    }

    return [
      { label: 'Top Calls', value: callsQuantityTop[0]?.label || '-' },
      { label: 'Top Tickets', value: ticketsQuantityTop[0]?.label || '-' },
      { label: 'Top Sales', value: salesTop[0]?.label || '-' },
    ];
  }

  const hasAnyData =
    audits.length > 0 ||
    profiles.length > 0 ||
    callsRecords.length > 0 ||
    ticketsRecords.length > 0 ||
    salesRecords.length > 0;

  if (loading && !hasAnyData) {
    return (
      <div style={{ padding: '20px 0', color: '#cbd5e1' }}>
        Loading dashboard...
      </div>
    );
  }

  return (
    <div
      data-no-theme-invert="true"
      style={{ color: 'var(--da-page-text, #e5eefb)', ...(themeVars as CSSProperties) }}
    >
      <div style={heroStyle}>
        <div>
          <div style={eyebrowStyle}>Operations Overview</div>
          <h2 style={heroTitleStyle}>Dashboard</h2>
          <p style={heroSubtitleStyle}>
            Operational quality and production overview for the selected period.
          </p>
          <div style={infoPillRowStyle}>
            <div style={metaPillStyle}>Quality Source: Audits</div>
            <div style={metaPillStyle}>Quantity Source: Team Totals</div>
            <div style={metaPillStyle}>
              Scope: {dateFrom || 'Any'} to {dateTo || 'Any'}
            </div>
          </div>
        </div>

        <div style={heroActionWrapStyle}>
          <div style={dateRangeWrapStyle}>
            <label style={dateFieldWrapStyle}>
              <span style={dateFieldLabelStyle}>Date From</span>
              <input
                ref={dateFromInputRef}
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                onClick={() => openNativeDatePicker(dateFromInputRef.current)}
                onFocus={() => openNativeDatePicker(dateFromInputRef.current)}
                style={fieldStyle}
              />
            </label>

            <label style={dateFieldWrapStyle}>
              <span style={dateFieldLabelStyle}>Date To</span>
              <input
                ref={dateToInputRef}
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                onClick={() => openNativeDatePicker(dateToInputRef.current)}
                onFocus={() => openNativeDatePicker(dateToInputRef.current)}
                style={fieldStyle}
              />
            </label>
          </div>
          <button
            type="button"
            onClick={() => {
              setDateFrom(getMonthStartValue());
              setDateTo(getCurrentDateValue());
            }}
            style={secondaryButton}
          >
            This Month
          </button>
          <button
            type="button"
            onClick={() => {
              setDateFrom('');
              setDateTo('');
            }}
            style={secondaryButton}
          >
            All Time
          </button>
          <button
            type="button"
            onClick={() => {
              clearCachedValue(DASHBOARD_CACHE_KEY);
              void loadDashboardData({ force: true });
            }}
            style={primaryButton}
          >
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {errorMessage ? <div style={errorBannerStyle}>{errorMessage}</div> : null}

      <div style={statusRowStyle}>
        <div style={statusPillStyle}>
          Cache: {refreshing ? 'Refreshing in background' : 'Warm'}
        </div>
        <div style={statusPillStyle}>
          Last Loaded:{' '}
          {lastLoadedAt ? formatDateTime(lastLoadedAt) : 'Current session'}
        </div>
      </div>

      <div style={spotlightPanelStyle}>
        <div style={sectionEyebrowStyle}>Smart Homepage</div>
        <h3 style={{ marginTop: 0, marginBottom: '14px' }}>{roleSpotlight.title}</h3>
        <div style={spotlightGridStyle}>
          {roleSpotlight.cards.map((card) => (
            <div key={card.title} style={spotlightCardStyle}>
              <div style={spotlightCardTitleStyle}>{card.title}</div>
              <div style={spotlightCardTextStyle}>{card.description}</div>
              <div style={spotlightStatGridStyle}>
                {getSpotlightStats(card.title).map((item) => (
                  <div key={`${card.title}-${item.label}`} style={spotlightStatRowStyle}>
                    <div style={spotlightStatLabelStyle}>{item.label}</div>
                    <div style={spotlightStatValueStyle}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={kpiGridStyle}>
        <SummaryCard
          title="Total Audits"
          value={`${totalAudits}`}
          subtitle="Audits in selected period"
        />
        <SummaryCard
          title="Average Quality"
          value={`${averageQuality.toFixed(2)}%`}
          subtitle="From all selected audits"
        />
        <SummaryCard
          title="Released Audits"
          value={`${releasedAudits}`}
          subtitle="Shared with agents"
        />
      </div>

      <div style={teamCardGridStyle}>
        <TeamCard data={callsCard} accent="#2563eb" />
        <TeamCard data={ticketsCard} accent="#7c3aed" />
        <TeamCard data={salesCard} accent="#0f766e" />
      </div>

      <RecognitionWall currentUser={currentUser as any} />
      <DigitalTrophyCabinet scope="global" currentUser={currentUser} />
      {currentUser ? <VoiceOfEmployeeSupabase currentUser={currentUser as any} title="Recent anonymous themes" showComposer={false} /> : null}
      <SectionHeader
        title="Performance Rankings"
        subtitle=""
      />
      <div style={rankingGroupsStyle}>
        <div style={rankingGroupStyle}>
          <div style={miniSectionEyebrowStyle}>Quantity</div>
          <div style={rankingGridStyle}>
            <LeaderboardCard
              title="Top Calls Quantity"
              subtitle=""
              items={callsQuantityTop}
              formatValue={(value) => `${value}`}
              contextLabel="calls"
            />

            <LeaderboardCard
              title="Top Tickets Quantity"
              subtitle=""
              items={ticketsQuantityTop}
              formatValue={(value) => `${value}`}
              contextLabel="tickets"
            />

            <LeaderboardCard
              title="Top Sales"
              subtitle=""
              items={salesTop}
              formatValue={(value) => `$${value.toFixed(2)}`}
              contextLabel="sales"
            />
          </div>
        </div>

        <div style={rankingGroupStyle}>
          <div style={miniSectionEyebrowStyle}>Quality</div>
          <div style={rankingGridStyle}>
            <QualityLeaderboardCard
              title="Top Calls Quality"
              subtitle=""
              items={callsQualityTop}
            />

            <QualityLeaderboardCard
              title="Top Tickets Quality"
              subtitle=""
              items={ticketsQualityTop}
            />
          </div>
        </div>

        <div style={rankingGroupStyle}>
          <div style={miniSectionEyebrowStyle}>Combined</div>
          <div style={rankingGridStyle}>
            <HybridLeaderboardCard
              title="Top Calls Combined"
              subtitle=""
              items={callsHybridTop}
            />

            <HybridLeaderboardCard
              title="Top Tickets Combined"
              subtitle=""
              items={ticketsHybridTop}
            />
          </div>
        </div>
      </div>


      <SectionHeader
        title="Insights & Action Items"
        subtitle=""
      />
      <div style={insightGridStyle}>
        <InsightCard
          title="Needs Attention"
          headline={
            lowestQualityAgent ? lowestQualityAgent.label : 'No audit data'
          }
          body={
            lowestQualityAgent
              ? `Lowest current quality average at ${lowestQualityAgent.averageQuality.toFixed(
                  2
                )}% across ${lowestQualityAgent.auditsCount} audit${
                  lowestQualityAgent.auditsCount === 1 ? '' : 's'
                }.`
              : 'No quality insight available for this period.'
          }
        />

        <InsightCard
          title="Most Consistent Performer"
          headline={
            mostConsistentPerformer
              ? mostConsistentPerformer.label
              : 'No combined ranking data'
          }
          body={
            mostConsistentPerformer
              ? `Lowest RSD at ${mostConsistentPerformer.rsd.toFixed(
                  3
                )} with a combined score of ${mostConsistentPerformer.combinedScore.toFixed(
                  3
                )}.`
              : 'No consistency signal available for this period.'
          }
        />

        <InsightCard
          title="Coaching Opportunity"
          headline={
            coachingOpportunity
              ? coachingOpportunity.label
              : 'No coaching target'
          }
          body={
            coachingOpportunity
              ? `${coachingOpportunity.averageQuality.toFixed(
                  2
                )}% average quality across ${
                  coachingOpportunity.auditsCount
                } audits.`
              : 'No agent with at least 2 audits is available for coaching review.'
          }
        />
      </div>
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
  subtitle: string;
}) {
  return (
    <div style={summaryCardStyle}>
      <div style={summaryCardLabelStyle}>{title}</div>
      <div style={summaryCardValueStyle}>{value}</div>
      <div style={summaryCardSubtitleStyle}>{subtitle}</div>
    </div>
  );
}

function TeamCard({ data, accent }: { data: TeamCardData; accent: string }) {
  return (
    <div style={teamCardStyle}>
      <div style={{ ...teamAccentStyle, background: accent }} />
      <div style={teamTitleStyle}>{data.title}</div>
      <div style={teamMetricGridStyle}>
        <div>
          <div style={teamMetricLabelStyle}>{data.quantityLabel}</div>
          <div style={teamMetricValueStyle}>{data.quantityValue}</div>
        </div>
        <div>
          <div style={teamMetricLabelStyle}>{data.qualityLabel}</div>
          <div style={teamMetricValueStyle}>{data.qualityValue}</div>
        </div>
      </div>
      <div style={teamMetaRowStyle}>
        <div>Audited Agents: {data.auditedAgents}</div>
        <div>Top Performer: {data.leader}</div>
      </div>
    </div>
  );
}

function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div style={sectionHeaderStyle}>
      <div style={sectionEyebrowStyle}>{title}</div>
      {subtitle ? <p style={sectionSubtitleStyle}>{subtitle}</p> : null}
    </div>
  );
}

function LeaderboardCard({
  title,
  subtitle,
  items,
  formatValue,
  contextLabel,
}: {
  title: string;
  subtitle: string;
  items: QuantityLeader[];
  formatValue: (value: number) => string;
  contextLabel: string;
}) {
  return (
    <div style={panelStyle}>
      <h3 style={panelTitleStyle}>{title}</h3>
      {subtitle ? <p style={panelSubtitleStyle}>{subtitle}</p> : null}

      {items.length === 0 ? (
        <EmptyState text="No data available for this period." />
      ) : (
        <div style={rankingListStyle}>
          {items.map((item, index) => (
            <LeaderboardRow
              key={item.label}
              rank={index + 1}
              title={item.label}
              subtitle={contextLabel}
              value={formatValue(item.quantity)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function QualityLeaderboardCard({
  title,
  subtitle,
  items,
}: {
  title: string;
  subtitle: string;
  items: QualityLeader[];
}) {
  return (
    <div style={panelStyle}>
      <h3 style={panelTitleStyle}>{title}</h3>
      {subtitle ? <p style={panelSubtitleStyle}>{subtitle}</p> : null}

      {items.length === 0 ? (
        <EmptyState text="No audit quality data available for this period." />
      ) : (
        <div style={rankingListStyle}>
          {items.map((item, index) => (
            <LeaderboardRow
              key={item.label}
              rank={index + 1}
              title={item.label}
              subtitle={`${item.auditsCount} audit${
                item.auditsCount === 1 ? '' : 's'
              }`}
              value={`${item.averageQuality.toFixed(2)}%`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function HybridLeaderboardCard({
  title,
  subtitle,
  items,
}: {
  title: string;
  subtitle: string;
  items: HybridLeader[];
}) {
  return (
    <div style={panelStyle}>
      <h3 style={panelTitleStyle}>{title}</h3>
      {subtitle ? <p style={panelSubtitleStyle}>{subtitle}</p> : null}

      {items.length === 0 ? (
        <EmptyState text="No combined ranking data available for this period." />
      ) : (
        <div style={rankingListStyle}>
          {items.map((item, index) => (
            <LeaderboardRow
              key={item.label}
              rank={index + 1}
              title={item.label}
              subtitle={`Quality ${item.averageQuality.toFixed(
                2
              )}% • RSD ${item.rsd.toFixed(3)}`}
              value={item.combinedScore.toFixed(3)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LeaderboardRow({
  rank,
  title,
  subtitle,
  value,
}: {
  rank: number;
  title: string;
  subtitle: string;
  value: string;
}) {
  return (
    <div style={rowCardStyle}>
      <div style={rankBadgeStyle}>#{rank}</div>
      <div style={{ flex: 1 }}>
        <div style={rowTitleStyle}>{title}</div>
        <div style={rowSubtitleStyle}>{subtitle}</div>
      </div>
      <div style={pillStyle}>{value}</div>
    </div>
  );
}

function InsightCard({
  title,
  headline,
  body,
}: {
  title: string;
  headline: string;
  body: string;
}) {
  return (
    <div style={insightCardStyle}>
      <div style={insightTitleStyle}>{title}</div>
      <div style={insightHeadlineStyle}>{headline}</div>
      <div style={insightBodyStyle}>{body}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div style={emptyStateStyle}>{text}</div>;
}

function getStandardDeviation(values: number[]) {
  if (values.length <= 1) return 0;

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;

  return Math.sqrt(variance);
}

function getTeamAverage(audits: AuditItem[]) {
  if (audits.length === 0) return 0;
  return (
    audits.reduce((sum, item) => sum + Number(item.quality_score), 0) /
    audits.length
  );
}

const heroStyle = {
  marginTop: '8px',
  padding: '6px 2px 2px 2px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  flexWrap: 'wrap' as const,
  gap: '16px',
  marginBottom: '22px',
};

const heroTitleStyle = {
  margin: 0,
  fontSize: '32px',
  color: 'var(--da-title, #f8fafc)',
};

const heroSubtitleStyle = {
  display: 'block',
  margin: '10px 0 0 0',
  color: 'var(--da-subtitle, #94a3b8)',
  fontSize: '15px',
};

const infoPillRowStyle = {
  display: 'flex',
  gap: '10px',
  flexWrap: 'wrap' as const,
  marginTop: '16px',
};

const metaPillStyle = {
  padding: '10px 12px',
  borderRadius: '999px',
  background: 'var(--da-meta-bg, rgba(15, 23, 42, 0.62))',
  border: 'var(--da-meta-border, 1px solid rgba(148, 163, 184, 0.14))',
  color: 'var(--da-meta-text, #cbd5e1)',
  fontWeight: 700,
  fontSize: '12px',
};

const heroActionWrapStyle = {
  display: 'flex',
  gap: '12px',
  flexWrap: 'wrap' as const,
  alignItems: 'flex-end',
  justifyContent: 'flex-end',
};

const dateRangeWrapStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(150px, 1fr))',
  gap: '12px',
  alignItems: 'end',
};

const dateFieldWrapStyle = {
  display: 'grid',
  gap: '6px',
  minWidth: '150px',
};

const dateFieldLabelStyle = {
  color: 'var(--da-muted-text, #475569)',
  fontSize: '12px',
  fontWeight: 700,
};

const eyebrowStyle = {
  color: 'var(--da-eyebrow, #60a5fa)',
  fontSize: '12px',
  fontWeight: 800,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.16em',
  marginBottom: '12px',
};

const sectionHeaderStyle = {
  marginTop: '34px',
  marginBottom: '16px',
};

const sectionEyebrowStyle = {
  color: 'var(--da-section-eyebrow, #93c5fd)',
  fontSize: '12px',
  fontWeight: 800,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.14em',
  marginBottom: '8px',
};

const sectionSubtitleStyle = {
  margin: 0,
  color: 'var(--da-subtle-text, #64748b)',
  fontWeight: 500,
};

const fieldStyle = {
  padding: '12px 14px',
  borderRadius: '14px',
  border: 'var(--da-field-border, 1px solid rgba(148, 163, 184, 0.18))',
  background: 'var(--da-field-bg, rgba(15, 23, 42, 0.74))',
  color: 'var(--da-field-text, #e5eefb)',
  minHeight: '48px',
  cursor: 'pointer',
};

const primaryButton = {
  padding: '12px 16px',
  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
  color: 'white',
  border: '1px solid rgba(96, 165, 250, 0.24)',
  borderRadius: '14px',
  cursor: 'pointer',
  fontWeight: 700,
  minHeight: '48px',
};

const secondaryButton = {
  padding: '12px 16px',
  background: 'var(--da-secondary-bg, rgba(15, 23, 42, 0.74))',
  color: 'var(--da-secondary-text, #e5eefb)',
  border: 'var(--da-secondary-border, 1px solid rgba(148, 163, 184, 0.18))',
  borderRadius: '14px',
  cursor: 'pointer',
  fontWeight: 700,
  minHeight: '48px',
};

const kpiGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '16px',
};

const summaryCardStyle = {
  background: 'var(--da-panel-bg, linear-gradient(180deg, rgba(15, 23, 42, 0.82) 0%, rgba(15, 23, 42, 0.68) 100%))',
  border: 'var(--da-panel-border, 1px solid rgba(148, 163, 184, 0.14))',
  borderRadius: '20px',
  padding: '20px',
  boxShadow: 'var(--da-panel-shadow, 0 18px 40px rgba(2, 6, 23, 0.35))',
  backdropFilter: 'blur(14px)',
};

const summaryCardLabelStyle = {
  color: 'var(--da-card-label, #94a3b8)',
  fontSize: '13px',
  fontWeight: 700,
  marginBottom: '10px',
};

const summaryCardValueStyle = {
  fontSize: '30px',
  fontWeight: 800,
  color: 'var(--da-card-value, #f8fafc)',
  marginBottom: '8px',
};

const summaryCardSubtitleStyle = {
  color: 'var(--da-card-subtitle, #64748b)',
  fontSize: '12px',
};

const teamCardGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: '18px',
  marginTop: '18px',
};

const teamCardStyle = {
  position: 'relative' as const,
  background: 'var(--da-panel-bg, linear-gradient(180deg, rgba(15, 23, 42, 0.82) 0%, rgba(15, 23, 42, 0.68) 100%))',
  border: 'var(--da-panel-border, 1px solid rgba(148, 163, 184, 0.14))',
  borderRadius: '22px',
  padding: '22px',
  boxShadow: 'var(--da-panel-shadow, 0 18px 40px rgba(2, 6, 23, 0.35))',
  backdropFilter: 'blur(14px)',
  overflow: 'hidden' as const,
};

const teamAccentStyle = {
  position: 'absolute' as const,
  top: 0,
  left: 0,
  width: '100%',
  height: '4px',
};

const teamTitleStyle = {
  color: 'var(--da-card-value, #f8fafc)',
  fontSize: '20px',
  fontWeight: 800,
  marginBottom: '18px',
};

const teamMetricGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: '16px',
};

const teamMetricLabelStyle = {
  color: 'var(--da-card-label, #94a3b8)',
  fontSize: '12px',
  fontWeight: 700,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.12em',
  marginBottom: '8px',
};

const teamMetricValueStyle = {
  color: 'var(--da-card-value, #f8fafc)',
  fontSize: '24px',
  fontWeight: 800,
};

const teamMetaRowStyle = {
  display: 'grid',
  gap: '8px',
  marginTop: '18px',
  color: 'var(--da-team-meta, #cbd5e1)',
  fontSize: '13px',
};

const rankingGroupsStyle = {
  display: 'grid',
  gap: '18px',
};

const rankingGroupStyle = {
  display: 'grid',
  gap: '12px',
};

const miniSectionEyebrowStyle = {
  color: 'var(--da-section-eyebrow, #3b82f6)',
  fontSize: '11px',
  fontWeight: 800,
  letterSpacing: '0.12em',
  textTransform: 'uppercase' as const,
};

const rankingGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
  gap: '14px',
};

const panelStyle = {
  background: 'var(--da-panel-bg, linear-gradient(180deg, rgba(15, 23, 42, 0.82) 0%, rgba(15, 23, 42, 0.68) 100%))',
  border: 'var(--da-panel-border, 1px solid rgba(148, 163, 184, 0.14))',
  borderRadius: '20px',
  padding: '20px',
  boxShadow: 'var(--da-panel-shadow, 0 18px 40px rgba(2, 6, 23, 0.35))',
  backdropFilter: 'blur(14px)',
};

const panelTitleStyle = {
  marginTop: 0,
  marginBottom: '8px',
  color: 'var(--da-title, #0f172a)',
  fontSize: '18px',
  fontWeight: 800,
};

const panelSubtitleStyle = {
  marginTop: 0,
  color: 'var(--da-subtle-text, #64748b)',
  fontSize: '14px',
  fontWeight: 500,
};

const rankingListStyle = {
  display: 'grid',
  gap: '10px',
  marginTop: '14px',
};

const rowCardStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '12px',
  alignItems: 'center',
  padding: '12px 14px',
  borderRadius: '14px',
  border: 'var(--da-row-border, 1px solid rgba(148, 163, 184, 0.16))',
  background: 'var(--da-card-bg, rgba(255, 255, 255, 0.88))',
};

const rankBadgeStyle = {
  width: '36px',
  height: '36px',
  borderRadius: '999px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--da-rank-badge-bg, rgba(37, 99, 235, 0.14))',
  color: 'var(--da-rank-badge-text, #2563eb)',
  fontWeight: 800,
  flexShrink: 0,
};

const rowTitleStyle = {
  fontWeight: 700,
  color: 'var(--da-title, #0f172a)',
  lineHeight: 1.35,
  fontSize: '14px',
};

const rowSubtitleStyle = {
  fontSize: '12px',
  color: 'var(--da-subtle-text, #64748b)',
  marginTop: '4px',
  fontWeight: 600,
};

const pillStyle = {
  padding: '7px 10px',
  borderRadius: '999px',
  background: 'var(--da-pill-bg, rgba(37, 99, 235, 0.14))',
  color: 'var(--da-pill-text, #2563eb)',
  border: '1px solid rgba(96, 165, 250, 0.28)',
  fontWeight: 800,
  minWidth: '82px',
  textAlign: 'center' as const,
  flexShrink: 0,
};

const insightGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
  gap: '18px',
};

const insightCardStyle = {
  background: 'var(--da-panel-bg, linear-gradient(180deg, rgba(15, 23, 42, 0.82) 0%, rgba(15, 23, 42, 0.68) 100%))',
  border: 'var(--da-panel-border, 1px solid rgba(148, 163, 184, 0.14))',
  borderRadius: '22px',
  padding: '22px',
  boxShadow: 'var(--da-panel-shadow, 0 18px 40px rgba(2, 6, 23, 0.35))',
  backdropFilter: 'blur(14px)',
};

const insightTitleStyle = {
  color: 'var(--da-accent-text, #2563eb)',
  fontSize: '12px',
  fontWeight: 800,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.12em',
  marginBottom: '10px',
};

const insightHeadlineStyle = {
  color: 'var(--da-title, #0f172a)',
  fontSize: '20px',
  fontWeight: 800,
  marginBottom: '10px',
};

const insightBodyStyle = {
  color: 'var(--da-page-text, #334155)',
  lineHeight: 1.6,
};

const emptyStateStyle = {
  marginTop: '16px',
  padding: '18px',
  borderRadius: '16px',
  border: 'var(--da-empty-border, 1px dashed rgba(148, 163, 184, 0.24))',
  backgroundColor: 'var(--da-card-bg, rgba(255, 255, 255, 0.88))',
  color: 'var(--da-subtle-text, #64748b)',
  textAlign: 'center' as const,
  fontWeight: 500,
};

function formatDateTime(value?: string | null) {
  if (!value) return '-';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  return date.toLocaleString();
}

const errorBannerStyle = {
  marginBottom: '18px',
  padding: '14px 16px',
  borderRadius: '16px',
  backgroundColor: 'var(--da-error-bg, rgba(127, 29, 29, 0.24))',
  border: 'var(--da-error-border, 1px solid rgba(248, 113, 113, 0.22))',
  color: 'var(--da-error-text, #fecaca)',
};

const statusRowStyle = {
  display: 'none',
  gap: '10px',
  flexWrap: 'wrap' as const,
  marginBottom: '20px',
};

const statusPillStyle = {
  padding: '10px 12px',
  borderRadius: '999px',
  background: 'var(--da-meta-bg, rgba(15, 23, 42, 0.62))',
  border: 'var(--da-meta-border, 1px solid rgba(148, 163, 184, 0.14))',
  color: 'var(--da-meta-text, #cbd5e1)',
  fontWeight: 700,
  fontSize: '12px',
};

const spotlightPanelStyle = {
  marginBottom: '28px',
  borderRadius: '30px',
  border: '1px solid rgba(148,163,184,0.14)',
  background: 'var(--screen-panel-bg, rgba(15,23,42,0.78))',
  boxShadow: 'var(--screen-shadow, 0 18px 40px rgba(2,6,23,0.35))',
  padding: '20px',
};


const spotlightGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
  gap: '18px',
  alignItems: 'stretch',
};

const spotlightCardStyle = {
  borderRadius: '24px',
  border: '1px solid rgba(148,163,184,0.14)',
  background: 'var(--screen-card-soft-bg, rgba(15,23,42,0.52))',
  padding: '18px',
  display: 'flex',
  flexDirection: 'column' as const,
  minHeight: '100%',
};

const spotlightCardTitleStyle = {
  color: 'var(--screen-heading, #f8fafc)',
  fontWeight: 900,
  fontSize: '22px',
  marginBottom: '8px',
};

const spotlightCardTextStyle = {
  color: 'var(--screen-text, #e5eefb)',
  lineHeight: 1.6,
  fontSize: '14px',
  minHeight: '48px',
};


const spotlightStatGridStyle = {
  display: 'grid',
  gap: '10px',
  marginTop: 'auto',
  paddingTop: '16px',
};

const spotlightStatRowStyle = {
  display: 'grid',
  gridTemplateColumns: '132px minmax(0, 1fr)',
  alignItems: 'start',
  gap: '14px',
  padding: '14px 16px',
  minHeight: '84px',
  borderRadius: '14px',
  border: '1px solid rgba(148,163,184,0.14)',
  background: 'var(--screen-field-bg, rgba(255,255,255,0.92))',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.32)',
};

const spotlightStatLabelStyle = {
  color: 'var(--screen-muted, #64748b)',
  fontSize: '12px',
  fontWeight: 800,
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  whiteSpace: 'nowrap' as const,
};

const spotlightStatValueStyle = {
  color: 'var(--screen-heading, #0f172a)',
  fontSize: '14px',
  fontWeight: 800,
  lineHeight: 1.6,
  wordBreak: 'break-word' as const,
  whiteSpace: 'pre-line' as const,
  textAlign: 'left' as const,
};

export default Dashboard;
