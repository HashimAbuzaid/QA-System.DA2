import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { supabase } from '../lib/supabase';

type TeamName = 'Calls' | 'Tickets' | 'Sales';

type Viewer = {
  id?: string;
  role?: 'admin' | 'qa' | 'agent' | 'supervisor';
  team?: TeamName | null;
};

type AuditItem = {
  id: string;
  agent_id: string;
  agent_name: string;
  team: TeamName | string;
  audit_date: string;
  quality_score: number;
  shared_with_agent?: boolean | null;
};

type CallsRecord = {
  agent_id: string;
  agent_name: string;
  calls_count: number;
  call_date?: string | null;
  date_to?: string | null;
};

type TicketsRecord = {
  agent_id: string;
  agent_name: string;
  tickets_count: number;
  ticket_date?: string | null;
  date_to?: string | null;
};

type SalesRecord = {
  agent_id: string;
  agent_name: string;
  amount: number;
  sale_date?: string | null;
  date_to?: string | null;
};

type AgentProfile = {
  agent_id: string | null;
  agent_name: string;
  display_name: string | null;
  team: TeamName | null;
};

type RecognitionEntry = {
  title: string;
  value: string;
  subtitle: string;
  badge: string;
  helper: string;
  kind: 'quality' | 'volume' | 'released';
};

type RecognitionWallProps = {
  title?: string;
  compact?: boolean;
  currentUser?: Viewer | null;
};

function normalizeAgentId(value?: string | null) {
  return String(value || '').trim().replace(/\.0+$/, '');
}

function normalizeAgentName(value?: string | null) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function getAgentKey(agentId?: string | null, agentName?: string | null) {
  return `${normalizeAgentId(agentId)}|${normalizeAgentName(agentName)}`;
}

function getCurrentMonthBounds() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const start = new Date(year, month, 1).toISOString().slice(0, 10);
  const end = new Date().toISOString().slice(0, 10);
  return { start, end };
}

function matchesRange(startDate?: string | null, endDate?: string | null) {
  const { start, end } = getCurrentMonthBounds();
  const recordStart = String(startDate || '').slice(0, 10);
  const recordEnd = String(endDate || startDate || '').slice(0, 10);
  if (!recordStart) return false;
  return recordEnd >= start && recordStart <= end;
}

function getRecognitionThemeVars(): Record<string, string> {
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
    '--rw-bg': isLight
      ? 'linear-gradient(180deg, rgba(255,255,255,0.99) 0%, rgba(247,250,255,0.98) 100%)'
      : 'linear-gradient(180deg, rgba(15,23,42,0.82) 0%, rgba(15,23,42,0.68) 100%)',
    '--rw-card-bg': isLight
      ? 'linear-gradient(180deg, rgba(255,255,255,0.99) 0%, rgba(245,248,253,0.98) 100%)'
      : 'linear-gradient(180deg, rgba(15,23,42,0.82) 0%, rgba(15,23,42,0.68) 100%)',
    '--rw-border': isLight ? 'rgba(203,213,225,0.92)' : 'rgba(148,163,184,0.16)',
    '--rw-heading': isLight ? '#0f172a' : '#f8fafc',
    '--rw-text': isLight ? '#334155' : '#e5eefb',
    '--rw-muted': isLight ? '#64748b' : '#94a3b8',
    '--rw-accent': isLight ? '#2563eb' : '#60a5fa',
    '--rw-pill-bg': isLight ? 'rgba(37,99,235,0.10)' : 'rgba(37,99,235,0.18)',
    '--rw-pill-border': isLight ? 'rgba(59,130,246,0.30)' : 'rgba(96,165,250,0.26)',
    '--rw-shadow': isLight ? '0 18px 40px rgba(15,23,42,0.10)' : '0 18px 40px rgba(2,6,23,0.35)',
  };
}

function RecognitionWall({
  title = 'Recognition Wall',
  compact = false,
  currentUser = null,
}: RecognitionWallProps) {
  const [audits, setAudits] = useState<AuditItem[]>([]);
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [callsRecords, setCallsRecords] = useState<CallsRecord[]>([]);
  const [ticketsRecords, setTicketsRecords] = useState<TicketsRecord[]>([]);
  const [salesRecords, setSalesRecords] = useState<SalesRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const themeVars = getRecognitionThemeVars();

  useEffect(() => {
    void loadRecognitionData();
  }, []);

  async function loadRecognitionData() {
    setLoading(true);
    const [auditsResult, profilesResult, callsResult, ticketsResult, salesResult] = await Promise.all([
      supabase.from('audits').select('id, agent_id, agent_name, team, audit_date, quality_score, shared_with_agent'),
      supabase.from('profiles').select('agent_id, agent_name, display_name, team').eq('role', 'agent'),
      supabase.from('calls_records').select('agent_id, agent_name, calls_count, call_date, date_to'),
      supabase.from('tickets_records').select('agent_id, agent_name, tickets_count, ticket_date, date_to'),
      supabase.from('sales_records').select('agent_id, agent_name, amount, sale_date, date_to'),
    ]);

    setAudits((auditsResult.data as AuditItem[]) || []);
    setProfiles((profilesResult.data as AgentProfile[]) || []);
    setCallsRecords((callsResult.data as CallsRecord[]) || []);
    setTicketsRecords((ticketsResult.data as TicketsRecord[]) || []);
    setSalesRecords((salesResult.data as SalesRecord[]) || []);
    setLoading(false);
  }

  function getAgentLabel(agentId?: string | null, agentName?: string | null, team?: string | null) {
    const key = getAgentKey(agentId, agentName);
    const matched = profiles.find(
      (profile) =>
        getAgentKey(profile.agent_id, profile.agent_name) === key &&
        profile.team === (team || null)
    );

    if (matched?.display_name) {
      return `${agentName || '-'} - ${matched.display_name}`;
    }

    return `${agentName || '-'} - ${agentId || '-'}`;
  }

  function getQualityLeader(team: TeamName, scopedAudits: AuditItem[]) {
    const grouped = new Map<string, { label: string; scores: number[] }>();

    scopedAudits
      .filter((audit) => audit.team === team)
      .forEach((audit) => {
        const key = getAgentKey(audit.agent_id, audit.agent_name);
        const existing = grouped.get(key);
        if (existing) {
          existing.scores.push(Number(audit.quality_score));
        } else {
          grouped.set(key, {
            label: getAgentLabel(audit.agent_id, audit.agent_name, team),
            scores: [Number(audit.quality_score)],
          });
        }
      });

    return Array.from(grouped.values())
      .map((item) => ({
        label: item.label,
        average: item.scores.reduce((sum, value) => sum + value, 0) / item.scores.length,
      }))
      .sort((a, b) => b.average - a.average)[0] || null;
  }

  function getVolumeLeader(team: TeamName, records: Array<CallsRecord | TicketsRecord | SalesRecord>) {
    const grouped = new Map<string, { label: string; total: number }>();
    records.forEach((record) => {
      const key = getAgentKey(record.agent_id, record.agent_name);
      const existing = grouped.get(key);
      const amount =
        team === 'Calls'
          ? Number((record as CallsRecord).calls_count || 0)
          : team === 'Tickets'
          ? Number((record as TicketsRecord).tickets_count || 0)
          : Number((record as SalesRecord).amount || 0);

      if (existing) {
        existing.total += amount;
      } else {
        grouped.set(key, {
          label: getAgentLabel(record.agent_id, record.agent_name, team),
          total: amount,
        });
      }
    });

    return Array.from(grouped.values()).sort((a, b) => b.total - a.total)[0] || null;
  }

  const teamScope =
    currentUser?.role === 'agent' || currentUser?.role === 'supervisor'
      ? currentUser.team || null
      : null;

  const monthAudits = useMemo(
    () => audits.filter((audit) => matchesRange(audit.audit_date, audit.audit_date)),
    [audits]
  );
  const monthCalls = useMemo(
    () => callsRecords.filter((record) => matchesRange(record.call_date, record.date_to || null)),
    [callsRecords]
  );
  const monthTickets = useMemo(
    () => ticketsRecords.filter((record) => matchesRange(record.ticket_date, record.date_to || null)),
    [ticketsRecords]
  );
  const monthSales = useMemo(
    () => salesRecords.filter((record) => matchesRange(record.sale_date, record.date_to || null)),
    [salesRecords]
  );

  const scopedAudits = useMemo(
    () => monthAudits.filter((audit) => (teamScope ? audit.team === teamScope : true)),
    [monthAudits, teamScope]
  );
  const scopedCalls = useMemo(
    () => (teamScope && teamScope !== 'Calls' ? [] : monthCalls),
    [monthCalls, teamScope]
  );
  const scopedTickets = useMemo(
    () => (teamScope && teamScope !== 'Tickets' ? [] : monthTickets),
    [monthTickets, teamScope]
  );
  const scopedSales = useMemo(
    () => (teamScope && teamScope !== 'Sales' ? [] : monthSales),
    [monthSales, teamScope]
  );

  const entries = useMemo<RecognitionEntry[]>(() => {
    const results: RecognitionEntry[] = [];

    if (teamScope) {
      const qualityLeader = getQualityLeader(teamScope, scopedAudits);
      if (qualityLeader) {
        results.push({
          title: `${teamScope} Quality Champion`,
          value: `${qualityLeader.average.toFixed(2)}%`,
          subtitle: qualityLeader.label,
          badge: 'Quality',
          helper: 'Based on this month audit rankings',
          kind: 'quality',
        });
      }

      if (teamScope === 'Calls') {
        const leader = getVolumeLeader('Calls', scopedCalls);
        if (leader) {
          results.push({
            title: 'Calls Star',
            value: `${leader.total}`,
            subtitle: leader.label,
            badge: 'Calls',
            helper: 'Top calls quantity for this month',
            kind: 'volume',
          });
        }
      }

      if (teamScope === 'Tickets') {
        const leader = getVolumeLeader('Tickets', scopedTickets);
        if (leader) {
          results.push({
            title: 'Tickets Star',
            value: `${leader.total}`,
            subtitle: leader.label,
            badge: 'Tickets',
            helper: 'Top tickets quantity for this month',
            kind: 'volume',
          });
        }
      }

      if (teamScope === 'Sales') {
        const leader = getVolumeLeader('Sales', scopedSales);
        if (leader) {
          results.push({
            title: 'Sales Star',
            value: `$${leader.total.toFixed(2)}`,
            subtitle: leader.label,
            badge: 'Sales',
            helper: 'Top sales amount for this month',
            kind: 'volume',
          });
        }
      }
    } else {
      const callsQualityLeader = getQualityLeader('Calls', scopedAudits);
      if (callsQualityLeader) {
        results.push({
          title: 'Calls Quality Champion',
          value: `${callsQualityLeader.average.toFixed(2)}%`,
          subtitle: callsQualityLeader.label,
          badge: 'Calls Quality',
          helper: 'Based on this month audit rankings',
          kind: 'quality',
        });
      }

      const ticketsQualityLeader = getQualityLeader('Tickets', scopedAudits);
      if (ticketsQualityLeader) {
        results.push({
          title: 'Tickets Quality Champion',
          value: `${ticketsQualityLeader.average.toFixed(2)}%`,
          subtitle: ticketsQualityLeader.label,
          badge: 'Tickets Quality',
          helper: 'Based on this month audit rankings',
          kind: 'quality',
        });
      }

      const callsLeader = getVolumeLeader('Calls', scopedCalls);
      if (callsLeader) {
        results.push({
          title: 'Calls Star',
          value: `${callsLeader.total}`,
          subtitle: callsLeader.label,
          badge: 'Calls',
          helper: 'Top calls quantity for this month',
          kind: 'volume',
        });
      }

      const ticketsLeader = getVolumeLeader('Tickets', scopedTickets);
      if (ticketsLeader) {
        results.push({
          title: 'Tickets Star',
          value: `${ticketsLeader.total}`,
          subtitle: ticketsLeader.label,
          badge: 'Tickets',
          helper: 'Top tickets quantity for this month',
          kind: 'volume',
        });
      }

      const salesLeader = getVolumeLeader('Sales', scopedSales);
      if (salesLeader) {
        results.push({
          title: 'Sales Star',
          value: `$${salesLeader.total.toFixed(2)}`,
          subtitle: salesLeader.label,
          badge: 'Sales',
          helper: 'Top sales amount for this month',
          kind: 'volume',
        });
      }
    }

    const releasedMap = new Map<string, { label: string; count: number; team: string }>();
    scopedAudits
      .filter((audit) => Boolean(audit.shared_with_agent))
      .forEach((audit) => {
        const key = getAgentKey(audit.agent_id, audit.agent_name);
        const existing = releasedMap.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          releasedMap.set(key, {
            label: getAgentLabel(audit.agent_id, audit.agent_name, audit.team),
            count: 1,
            team: String(audit.team || '-'),
          });
        }
      });

    const releasedLeader = Array.from(releasedMap.values()).sort((a, b) => b.count - a.count)[0];
    if (releasedLeader && !compact) {
      results.push({
        title: 'Release Ready',
        value: `${releasedLeader.count}`,
        subtitle: teamScope ? releasedLeader.label : `${releasedLeader.label} • ${releasedLeader.team}`,
        badge: 'Released',
        helper: 'Most shared audits this month',
        kind: 'released',
      });
    }

    return compact ? results.slice(0, 3) : results;
  }, [compact, scopedAudits, scopedCalls, scopedTickets, scopedSales, teamScope]);

  return (
    <div data-no-theme-invert="true" style={{ marginTop: '30px', ...(themeVars as CSSProperties) }}>
      <div style={eyebrowStyle}>Recognition</div>
      <div style={headerRowStyle}>
        <div>
          <h3 style={{ marginTop: 0, marginBottom: '6px', color: 'var(--rw-heading, #0f172a)' }}>{title}</h3>
          <p style={subtextStyle}>Based on current month performance rankings.</p>
        </div>
      </div>

      {loading ? (
        <p style={subtextStyle}>Loading recognition wall...</p>
      ) : entries.length === 0 ? (
        <p style={subtextStyle}>No recognition entries yet for this month.</p>
      ) : (
        <div style={gridStyle(compact, teamScope, entries.length)}>
          {entries.map((entry) => (
            <div key={`${entry.title}-${entry.subtitle}`} style={cardStyle}>
              <div style={badgeStyle}>{entry.badge}</div>
              <div style={titleStyle}>{entry.title}</div>
              <div style={valueStyle}>{entry.value}</div>
              <div style={subtitleStyle}>{entry.subtitle}</div>
              <div style={helperStyle}>{entry.helper}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const eyebrowStyle = {
  color: 'var(--rw-accent, #2563eb)',
  fontSize: '12px',
  fontWeight: 800,
  letterSpacing: '0.18em',
  textTransform: 'uppercase' as const,
  marginBottom: '10px',
};

const headerRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: '12px',
  marginBottom: '14px',
};

const subtextStyle = {
  color: 'var(--rw-muted, #64748b)',
  marginTop: 0,
  marginBottom: 0,
};

const gridStyle = (
  compact: boolean,
  teamScope?: TeamName | null,
  entryCount?: number
) => ({
  display: 'grid',
  gridTemplateColumns: compact
    ? 'repeat(auto-fit, minmax(250px, 1fr))'
    : teamScope
    ? 'repeat(auto-fit, minmax(320px, 1fr))'
    : entryCount && entryCount <= 2
    ? 'repeat(2, minmax(320px, 1fr))'
    : 'repeat(auto-fit, minmax(320px, 1fr))',
  gap: '16px',
});

const cardStyle = {
  borderRadius: '28px',
  border: '1px solid var(--rw-border, rgba(203,213,225,0.92))',
  background: 'var(--rw-card-bg, #ffffff)',
  boxShadow: 'var(--rw-shadow, 0 18px 40px rgba(15,23,42,0.10))',
  padding: '24px',
  minHeight: '240px',
  display: 'grid',
  alignContent: 'start',
};

const badgeStyle = {
  display: 'inline-block',
  marginBottom: '14px',
  padding: '6px 12px',
  borderRadius: '999px',
  background: 'var(--rw-pill-bg, rgba(37,99,235,0.10))',
  border: '1px solid var(--rw-pill-border, rgba(59,130,246,0.30))',
  color: 'var(--rw-accent, #2563eb)',
  fontSize: '12px',
  fontWeight: 800,
};

const titleStyle = {
  color: 'var(--rw-heading, #0f172a)',
  fontSize: '32px',
  fontWeight: 900,
  lineHeight: 1.25,
  marginBottom: '14px',
};

const valueStyle = {
  color: 'var(--rw-heading, #0f172a)',
  fontSize: '56px',
  fontWeight: 900,
  lineHeight: 1,
  marginBottom: '12px',
};

const subtitleStyle = {
  color: 'var(--rw-text, #334155)',
  fontSize: '15px',
  lineHeight: 1.5,
  fontWeight: 700,
  marginBottom: '8px',
};

const helperStyle = {
  color: 'var(--rw-muted, #64748b)',
  fontSize: '13px',
  lineHeight: 1.5,
};

export default RecognitionWall;
