import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

type TeamName = 'Calls' | 'Tickets' | 'Sales';

type ViewerProfile = {
  id?: string;
  role?: 'admin' | 'qa' | 'agent' | 'supervisor';
  agent_id?: string | null;
  agent_name?: string;
  display_name?: string | null;
  team?: TeamName | null;
};

type AuditItem = {
  agent_id: string;
  agent_name: string;
  team: TeamName | string;
  quality_score: number;
  shared_with_agent?: boolean | null;
};

type AgentFeedback = {
  agent_id: string;
  team: TeamName;
  acknowledged_by_agent?: boolean;
  status: 'Open' | 'In Progress' | 'Closed';
};

type MonitoringItem = {
  agent_id: string;
  team: TeamName;
  status: 'active' | 'resolved';
};

type CallsRecord = { agent_id: string; team?: TeamName; calls_count: number };
type TicketsRecord = { agent_id: string; team?: TeamName; tickets_count: number };
type SalesRecord = { agent_id: string; team?: TeamName; amount: number };

type TrophyCard = {
  title: string;
  unlocked: boolean;
  description: string;
  progress: string;
};

type DigitalTrophyCabinetProps = {
  scope: 'global' | 'team' | 'agent';
  currentUser?: ViewerProfile | null;
  title?: string;
};

function DigitalTrophyCabinet({
  scope,
  currentUser,
  title = 'Digital Trophy Cabinet',
}: DigitalTrophyCabinetProps) {
  const [audits, setAudits] = useState<AuditItem[]>([]);
  const [feedbackItems, setFeedbackItems] = useState<AgentFeedback[]>([]);
  const [monitoringItems, setMonitoringItems] = useState<MonitoringItem[]>([]);
  const [callsRecords, setCallsRecords] = useState<CallsRecord[]>([]);
  const [ticketsRecords, setTicketsRecords] = useState<TicketsRecord[]>([]);
  const [salesRecords, setSalesRecords] = useState<SalesRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadCabinetData();
  }, []);

  async function loadCabinetData() {
    setLoading(true);
    const [auditsResult, feedbackResult, monitoringResult, callsResult, ticketsResult, salesResult] =
      await Promise.all([
        supabase.from('audits').select('agent_id, agent_name, team, quality_score, shared_with_agent'),
        supabase.from('agent_feedback').select('agent_id, team, acknowledged_by_agent, status'),
        supabase.from('monitoring_items').select('agent_id, team, status'),
        supabase.from('calls_records').select('agent_id, calls_count'),
        supabase.from('tickets_records').select('agent_id, tickets_count'),
        supabase.from('sales_records').select('agent_id, amount'),
      ]);

    setAudits((auditsResult.data as AuditItem[]) || []);
    setFeedbackItems((feedbackResult.data as AgentFeedback[]) || []);
    setMonitoringItems((monitoringResult.data as MonitoringItem[]) || []);
    setCallsRecords((callsResult.data as CallsRecord[]) || []);
    setTicketsRecords((ticketsResult.data as TicketsRecord[]) || []);
    setSalesRecords((salesResult.data as SalesRecord[]) || []);
    setLoading(false);
  }

  const scopedData = useMemo(() => {
    const team = currentUser?.team || null;
    const agentId = String(currentUser?.agent_id || '').trim();

    const filterByScope = <T extends { agent_id?: string; team?: TeamName | string }>(items: T[]) => {
      if (scope === 'agent') {
        return items.filter((item) => String(item.agent_id || '').trim() === agentId);
      }
      if (scope === 'team') {
        return items.filter((item) => String(item.team || '') === String(team || ''));
      }
      return items;
    };

    return {
      audits: filterByScope(audits),
      feedbackItems: filterByScope(feedbackItems),
      monitoringItems: filterByScope(monitoringItems),
      callsRecords: filterByScope(callsRecords),
      ticketsRecords: filterByScope(ticketsRecords),
      salesRecords: filterByScope(salesRecords),
    };
  }, [scope, currentUser, audits, feedbackItems, monitoringItems, callsRecords, ticketsRecords, salesRecords]);

  const trophies = useMemo<TrophyCard[]>(() => {
    const auditCount = scopedData.audits.length;
    const averageQuality =
      auditCount > 0
        ? scopedData.audits.reduce((sum, audit) => sum + Number(audit.quality_score), 0) / auditCount
        : 0;
    const releasedCount = scopedData.audits.filter((audit) => Boolean(audit.shared_with_agent)).length;
    const totalQuantity =
      scopedData.callsRecords.reduce((sum, item) => sum + Number(item.calls_count || 0), 0) +
      scopedData.ticketsRecords.reduce((sum, item) => sum + Number(item.tickets_count || 0), 0) +
      scopedData.salesRecords.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const openMonitoring = scopedData.monitoringItems.filter((item) => item.status === 'active').length;
    const actionableFeedback = scopedData.feedbackItems.filter((item) => item.status !== 'Closed');
    const acknowledgedFeedback = actionableFeedback.filter((item) => item.acknowledged_by_agent).length;

    return [
      {
        title: 'Quality Champion',
        unlocked: averageQuality >= 95 && auditCount > 0,
        description: 'Reach an average quality score of 95% or higher.',
        progress: auditCount === 0 ? 'No audits yet' : `${averageQuality.toFixed(2)}% quality`,
      },
      {
        title: 'Productivity Pulse',
        unlocked: totalQuantity > 0,
        description: 'Have live production records during the current cycle.',
        progress: `${totalQuantity.toFixed(0)} total volume`,
      },
      {
        title: 'Release Ready',
        unlocked: releasedCount > 0,
        description: 'Receive or publish released audits in the workflow.',
        progress: `${releasedCount} released audits`,
      },
      {
        title: 'Clear Watchlist',
        unlocked: openMonitoring === 0,
        description: 'Keep active monitoring items at zero.',
        progress: `${openMonitoring} active alerts`,
      },
      {
        title: 'Coaching Response',
        unlocked: actionableFeedback.length === 0 || acknowledgedFeedback === actionableFeedback.length,
        description: 'Acknowledge every open coaching item assigned to the scope.',
        progress: `${acknowledgedFeedback}/${actionableFeedback.length} acknowledged`,
      },
    ];
  }, [scopedData]);

  return (
    <div style={{ marginTop: '30px' }}>
      <div style={eyebrowStyle}>Achievements</div>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      {loading ? (
        <p style={{ color: 'var(--screen-muted, #94a3b8)' }}>Loading trophies...</p>
      ) : (
        <div style={gridStyle}>
          {trophies.map((trophy) => (
            <div key={trophy.title} style={cardStyle(trophy.unlocked)}>
              <div style={statusPill(trophy.unlocked)}>
                {trophy.unlocked ? 'Unlocked' : 'Locked'}
              </div>
              <div style={titleStyle}>{trophy.title}</div>
              <div style={descriptionStyle}>{trophy.description}</div>
              <div style={progressStyle}>{trophy.progress}</div>
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

const gridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '14px',
};

const cardStyle = (unlocked: boolean) => ({
  borderRadius: '24px',
  border: unlocked
    ? '1px solid rgba(34,197,94,0.28)'
    : '1px solid var(--screen-border, rgba(148,163,184,0.16))',
  background: unlocked
    ? 'linear-gradient(180deg, rgba(34,197,94,0.12) 0%, var(--screen-card-bg, rgba(15,23,42,0.7)) 100%)'
    : 'var(--screen-card-bg, rgba(15,23,42,0.7))',
  boxShadow: 'var(--screen-shadow, 0 18px 40px rgba(2,6,23,0.35))',
  padding: '18px',
});

const statusPill = (unlocked: boolean) => ({
  display: 'inline-block',
  marginBottom: '12px',
  padding: '6px 10px',
  borderRadius: '999px',
  backgroundColor: unlocked ? '#166534' : '#475569',
  color: '#ffffff',
  fontSize: '12px',
  fontWeight: 800,
});

const titleStyle = {
  color: 'var(--screen-heading, #f8fafc)',
  fontSize: '18px',
  fontWeight: 800,
  marginBottom: '10px',
};

const descriptionStyle = {
  color: 'var(--screen-text, #e5eefb)',
  fontSize: '14px',
  lineHeight: 1.5,
  marginBottom: '10px',
};

const progressStyle = {
  color: 'var(--screen-muted, #94a3b8)',
  fontSize: '13px',
  fontWeight: 700,
};

export default DigitalTrophyCabinet;
