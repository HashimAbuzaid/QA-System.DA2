import { useEffect, useMemo, useState } from 'react';
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
  quality_score: number;
  shared_with_agent?: boolean | null;
};

type CallsRecord = {
  agent_id: string;
  agent_name: string;
  calls_count: number;
};

type TicketsRecord = {
  agent_id: string;
  agent_name: string;
  tickets_count: number;
};

type SalesRecord = {
  agent_id: string;
  agent_name: string;
  amount: number;
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

  useEffect(() => {
    void loadRecognitionData();
  }, []);

  async function loadRecognitionData() {
    setLoading(true);
    const [
      auditsResult,
      profilesResult,
      callsResult,
      ticketsResult,
      salesResult,
    ] = await Promise.all([
      supabase.from('audits').select('id, agent_id, agent_name, team, quality_score, shared_with_agent'),
      supabase.from('profiles').select('agent_id, agent_name, display_name, team').eq('role', 'agent'),
      supabase.from('calls_records').select('agent_id, agent_name, calls_count'),
      supabase.from('tickets_records').select('agent_id, agent_name, tickets_count'),
      supabase.from('sales_records').select('agent_id, agent_name, amount'),
    ]);

    setAudits((auditsResult.data as AuditItem[]) || []);
    setProfiles((profilesResult.data as AgentProfile[]) || []);
    setCallsRecords((callsResult.data as CallsRecord[]) || []);
    setTicketsRecords((ticketsResult.data as TicketsRecord[]) || []);
    setSalesRecords((salesResult.data as SalesRecord[]) || []);
    setLoading(false);
  }

  function getAgentLabel(
    agentId?: string | null,
    agentName?: string | null,
    team?: string | null
  ) {
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

  const teamScope =
    currentUser?.role === 'agent' || currentUser?.role === 'supervisor'
      ? currentUser.team || null
      : null;

  const scopedAudits = useMemo(
    () => audits.filter((audit) => (teamScope ? audit.team === teamScope : true)),
    [audits, teamScope]
  );

  const scopedCalls = useMemo(
    () => (teamScope && teamScope !== 'Calls' ? [] : callsRecords),
    [callsRecords, teamScope]
  );
  const scopedTickets = useMemo(
    () => (teamScope && teamScope !== 'Tickets' ? [] : ticketsRecords),
    [ticketsRecords, teamScope]
  );
  const scopedSales = useMemo(
    () => (teamScope && teamScope !== 'Sales' ? [] : salesRecords),
    [salesRecords, teamScope]
  );

  const entries = useMemo<RecognitionEntry[]>(() => {
    const results: RecognitionEntry[] = [];

    const qualityMap = new Map<string, { label: string; team: string; scores: number[] }>();
    scopedAudits.forEach((audit) => {
      const key = getAgentKey(audit.agent_id, audit.agent_name);
      const existing = qualityMap.get(key);
      if (existing) {
        existing.scores.push(Number(audit.quality_score));
      } else {
        qualityMap.set(key, {
          label: getAgentLabel(audit.agent_id, audit.agent_name, audit.team),
          team: String(audit.team || '-'),
          scores: [Number(audit.quality_score)],
        });
      }
    });

    const qualityLeader = Array.from(qualityMap.values())
      .map((item) => ({
        label: item.label,
        team: item.team,
        average: item.scores.reduce((sum, value) => sum + value, 0) / item.scores.length,
      }))
      .sort((a, b) => b.average - a.average)[0];

    if (qualityLeader) {
      results.push({
        title: teamScope ? `${teamScope} Quality Champion` : 'Quality Champion',
        value: `${qualityLeader.average.toFixed(2)}%`,
        subtitle: teamScope ? qualityLeader.label : `${qualityLeader.label} • ${qualityLeader.team}`,
        badge: 'Quality',
      });
    }

    if (!teamScope || teamScope === 'Calls') {
      const callsMap = new Map<string, { label: string; total: number }>();
      scopedCalls.forEach((record) => {
        const key = getAgentKey(record.agent_id, record.agent_name);
        const existing = callsMap.get(key);
        if (existing) existing.total += Number(record.calls_count || 0);
        else callsMap.set(key, {
          label: getAgentLabel(record.agent_id, record.agent_name, 'Calls'),
          total: Number(record.calls_count || 0),
        });
      });
      const leader = Array.from(callsMap.values()).sort((a, b) => b.total - a.total)[0];
      if (leader) {
        results.push({
          title: 'Calls Star',
          value: `${leader.total}`,
          subtitle: leader.label,
          badge: 'Calls',
        });
      }
    }

    if (!teamScope || teamScope === 'Tickets') {
      const ticketsMap = new Map<string, { label: string; total: number }>();
      scopedTickets.forEach((record) => {
        const key = getAgentKey(record.agent_id, record.agent_name);
        const existing = ticketsMap.get(key);
        if (existing) existing.total += Number(record.tickets_count || 0);
        else ticketsMap.set(key, {
          label: getAgentLabel(record.agent_id, record.agent_name, 'Tickets'),
          total: Number(record.tickets_count || 0),
        });
      });
      const leader = Array.from(ticketsMap.values()).sort((a, b) => b.total - a.total)[0];
      if (leader) {
        results.push({
          title: 'Tickets Star',
          value: `${leader.total}`,
          subtitle: leader.label,
          badge: 'Tickets',
        });
      }
    }

    if (!teamScope || teamScope === 'Sales') {
      const salesMap = new Map<string, { label: string; total: number }>();
      scopedSales.forEach((record) => {
        const key = getAgentKey(record.agent_id, record.agent_name);
        const existing = salesMap.get(key);
        if (existing) existing.total += Number(record.amount || 0);
        else salesMap.set(key, {
          label: getAgentLabel(record.agent_id, record.agent_name, 'Sales'),
          total: Number(record.amount || 0),
        });
      });
      const leader = Array.from(salesMap.values()).sort((a, b) => b.total - a.total)[0];
      if (leader) {
        results.push({
          title: 'Sales Star',
          value: `$${leader.total.toFixed(2)}`,
          subtitle: leader.label,
          badge: 'Sales',
        });
      }
    }

    const releasedMap = new Map<string, { label: string; count: number; team: string }>();
    scopedAudits
      .filter((audit) => Boolean(audit.shared_with_agent))
      .forEach((audit) => {
        const key = getAgentKey(audit.agent_id, audit.agent_name);
        const existing = releasedMap.get(key);
        if (existing) existing.count += 1;
        else releasedMap.set(key, {
          label: getAgentLabel(audit.agent_id, audit.agent_name, audit.team),
          count: 1,
          team: String(audit.team || '-'),
        });
      });

    const releasedLeader = Array.from(releasedMap.values()).sort((a, b) => b.count - a.count)[0];
    if (releasedLeader && !compact) {
      results.push({
        title: 'Release Ready',
        value: `${releasedLeader.count}`,
        subtitle: teamScope ? releasedLeader.label : `${releasedLeader.label} • ${releasedLeader.team}`,
        badge: 'Released',
      });
    }

    const maxItems = compact ? 2 : teamScope ? 3 : 4;
    return results.slice(0, maxItems);
  }, [scopedAudits, scopedCalls, scopedTickets, scopedSales, teamScope, compact, profiles]);

  return (
    <div style={{ marginTop: '30px' }}>
      <div style={eyebrowStyle}>Recognition</div>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      {loading ? (
        <p style={{ color: 'var(--screen-muted, #94a3b8)' }}>Loading recognition wall...</p>
      ) : entries.length === 0 ? (
        <p style={{ color: 'var(--screen-muted, #94a3b8)' }}>No recognition entries yet.</p>
      ) : (
        <div style={gridStyle(compact)}>
          {entries.map((entry) => (
            <div key={`${entry.title}-${entry.subtitle}`} style={cardStyle}>
              <div style={badgeStyle}>{entry.badge}</div>
              <div style={titleStyle}>{entry.title}</div>
              <div style={valueStyle}>{entry.value}</div>
              <div style={subtitleStyle}>{entry.subtitle}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const eyebrowStyle = {
  color: 'var(--screen-accent, #60a5fa)',
  fontSize: '12px',
  fontWeight: 800,
  letterSpacing: '0.18em',
  textTransform: 'uppercase' as const,
  marginBottom: '10px',
};

const gridStyle = (compact: boolean) => ({
  display: 'grid',
  gridTemplateColumns: compact
    ? 'repeat(auto-fit, minmax(280px, 1fr))'
    : 'repeat(auto-fit, minmax(320px, 1fr))',
  gap: '16px',
});

const cardStyle = {
  minHeight: '170px',
  display: 'flex',
  flexDirection: 'column' as const,
  justifyContent: 'flex-start',
  borderRadius: '20px',
  border: '1px solid var(--screen-border, rgba(148,163,184,0.16))',
  background:
    'linear-gradient(135deg, rgba(2, 6, 23, 0.96) 0%, rgba(15, 23, 42, 0.92) 55%, rgba(30, 41, 59, 0.9) 100%)',
  boxShadow: 'var(--screen-shadow, 0 18px 40px rgba(2,6,23,0.35))',
  padding: '18px',
};

const badgeStyle = {
  display: 'inline-block',
  alignSelf: 'flex-start',
  marginBottom: '14px',
  padding: '6px 10px',
  borderRadius: '999px',
  background: 'rgba(37,99,235,0.18)',
  border: '1px solid rgba(96,165,250,0.26)',
  color: '#93c5fd',
  fontSize: '12px',
  fontWeight: 800,
};

const titleStyle = {
  color: '#f8fafc',
  fontSize: '18px',
  fontWeight: 800,
  marginBottom: '12px',
};

const valueStyle = {
  color: '#f8fafc',
  fontSize: '40px',
  fontWeight: 900,
  marginBottom: '12px',
  lineHeight: 1,
};

const subtitleStyle = {
  color: '#e5eefb',
  fontSize: '15px',
  lineHeight: 1.55,
};

export default RecognitionWall;
