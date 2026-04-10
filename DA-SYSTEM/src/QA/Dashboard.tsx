import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
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

function Dashboard() {
  const [audits, setAudits] = useState<AuditItem[]>([]);
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [callsRecords, setCallsRecords] = useState<CallsRecord[]>([]);
  const [ticketsRecords, setTicketsRecords] = useState<TicketsRecord[]>([]);
  const [salesRecords, setSalesRecords] = useState<SalesRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [dateFrom, setDateFrom] = useState(getMonthStartValue());
  const [dateTo, setDateTo] = useState(getCurrentDateValue());
  const [lastLoadedAt, setLastLoadedAt] = useState('');
  const dateFromInputRef = useRef<HTMLInputElement | null>(null);
  const dateToInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void loadDashboardData();
  }, []);

  function applyDashboardData(payload: DashboardCachePayload) {
    setAudits(payload.audits);
    setProfiles(payload.profiles);
    setCallsRecords(payload.callsRecords);
    setTicketsRecords(payload.ticketsRecords);
    setSalesRecords(payload.salesRecords);
  }

  async function fetchDashboardData() {
    const [
      auditsResult,
      profilesResult,
      callsResult,
      ticketsResult,
      salesResult,
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
    ]);

    const errors = [
      auditsResult.error?.message,
      profilesResult.error?.message,
      callsResult.error?.message,
      ticketsResult.error?.message,
      salesResult.error?.message,
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
    T extends { agent_id: string; agent_name: string }
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
    T extends { agent_id: string; agent_name: string }
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
    <div style={{ color: 'var(--da-page-text, #e5eefb)' }}>
      <div style={heroStyle}>
        <div>
          <div style={eyebrowStyle}>Operations Overview</div>
          <h2 style={heroTitleStyle}>Dashboard</h2>
          <p style={heroSubtitleStyle}>
            Operational quality and production overview for the selected period.
          </p>
          <div style={infoPillRowStyle}>
            <div style={metaPillStyle}>Quality Source: Audits</div>
            <div style={metaPillStyle}>Quantity Source: Uploads</div>
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

      <SectionHeader
        title="Performance Rankings"
        subtitle="Quantity from uploads. Quality from audits. Combined scores use true RSD internally."
      />
      <div style={rankingGridStyle}>
        <LeaderboardCard
          title="Top Calls Quantity"
          subtitle="Uploads in the selected date range"
          items={callsQuantityTop}
          formatValue={(value) => `${value}`}
          contextLabel="calls"
        />

        <LeaderboardCard
          title="Top Tickets Quantity"
          subtitle="Uploads in the selected date range"
          items={ticketsQuantityTop}
          formatValue={(value) => `${value}`}
          contextLabel="tickets"
        />

        <LeaderboardCard
          title="Top Sales"
          subtitle="Taken from uploads"
          items={salesTop}
          formatValue={(value) => `$${value.toFixed(2)}`}
          contextLabel="sales"
        />

        <QualityLeaderboardCard
          title="Top Calls Quality"
          subtitle="Taken from audits"
          items={callsQualityTop}
        />

        <QualityLeaderboardCard
          title="Top Tickets Quality"
          subtitle="Taken from audits"
          items={ticketsQualityTop}
        />

        <HybridLeaderboardCard
          title="Top Calls Combined"
          subtitle="Built from uploads + audits"
          items={callsHybridTop}
        />

        <HybridLeaderboardCard
          title="Top Tickets Combined"
          subtitle="Built from uploads + audits"
          items={ticketsHybridTop}
        />
      </div>

      <SectionHeader
        title="Insights & Action Items"
        subtitle="Quick operational signals to spot coaching needs and consistency."
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
      <p style={sectionSubtitleStyle}>{subtitle}</p>
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
      <p style={panelSubtitleStyle}>{subtitle}</p>

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
      <p style={panelSubtitleStyle}>{subtitle}</p>

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
      <p style={panelSubtitleStyle}>{subtitle}</p>

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
  display: 'none',
  margin: '10px 0 0 0',
  color: 'var(--da-subtitle, #94a3b8)',
  fontSize: '15px',
};

const infoPillRowStyle = {
  display: 'none',
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
  color: '#94a3b8',
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

const rankingGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
  gap: '18px',
};

const panelStyle = {
  background: 'var(--da-panel-bg, linear-gradient(180deg, rgba(15, 23, 42, 0.82) 0%, rgba(15, 23, 42, 0.68) 100%))',
  border: 'var(--da-panel-border, 1px solid rgba(148, 163, 184, 0.14))',
  borderRadius: '22px',
  padding: '22px',
  boxShadow: 'var(--da-panel-shadow, 0 18px 40px rgba(2, 6, 23, 0.35))',
  backdropFilter: 'blur(14px)',
};

const panelTitleStyle = {
  marginTop: 0,
  marginBottom: '8px',
  color: '#f8fafc',
  fontSize: '18px',
};

const panelSubtitleStyle = {
  marginTop: 0,
  color: '#94a3b8',
  fontSize: '14px',
};

const rankingListStyle = {
  display: 'grid',
  gap: '12px',
  marginTop: '18px',
};

const rowCardStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '14px',
  alignItems: 'center',
  padding: '14px 16px',
  borderRadius: '16px',
  border: 'var(--da-row-border, 1px solid rgba(148, 163, 184, 0.12))',
  background: 'var(--da-row-bg, rgba(15, 23, 42, 0.52))',
};

const rankBadgeStyle = {
  width: '42px',
  height: '42px',
  borderRadius: '999px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--da-rank-badge-bg, rgba(37, 99, 235, 0.22))',
  color: 'var(--da-rank-badge-text, #bfdbfe)',
  fontWeight: 800,
  flexShrink: 0,
};

const rowTitleStyle = {
  fontWeight: 700,
  color: 'var(--da-row-title, #f8fafc)',
};

const rowSubtitleStyle = {
  fontSize: '12px',
  color: 'var(--da-row-subtitle, #94a3b8)',
  marginTop: '4px',
};

const pillStyle = {
  padding: '8px 12px',
  borderRadius: '999px',
  background: 'var(--da-pill-bg, linear-gradient(135deg, #0f4c81 0%, #2563eb 100%))',
  color: 'var(--da-pill-text, #ffffff)',
  fontWeight: 700,
  minWidth: '96px',
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
  color: 'var(--da-insight-title, #93c5fd)',
  fontSize: '12px',
  fontWeight: 800,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.12em',
  marginBottom: '10px',
};

const insightHeadlineStyle = {
  color: 'var(--da-card-value, #f8fafc)',
  fontSize: '20px',
  fontWeight: 800,
  marginBottom: '10px',
};

const insightBodyStyle = {
  color: 'var(--da-insight-body, #cbd5e1)',
  lineHeight: 1.5,
};

const emptyStateStyle = {
  marginTop: '16px',
  padding: '18px',
  borderRadius: '16px',
  border: 'var(--da-empty-border, 1px dashed rgba(148, 163, 184, 0.24))',
  backgroundColor: 'var(--da-empty-bg, rgba(15, 23, 42, 0.52))',
  color: 'var(--da-empty-text, #94a3b8)',
  textAlign: 'center' as const,
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

export default Dashboard;
