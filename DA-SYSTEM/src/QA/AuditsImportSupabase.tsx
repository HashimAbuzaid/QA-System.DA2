
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { supabase } from '../lib/supabase';

type TeamName = 'Calls' | 'Tickets';

type AgentProfile = {
  id: string;
  role: 'agent';
  agent_id: string | null;
  agent_name: string;
  display_name: string | null;
  team: TeamName | 'Sales' | null;
};

type CurrentProfile = {
  id: string;
  role: 'admin' | 'qa' | 'agent' | 'supervisor' | null;
  agent_name: string | null;
  email: string | null;
};

type Metric = {
  name: string;
  pass: number;
  borderline: number;
  countsTowardScore?: boolean;
  options?: string[];
  defaultValue?: string;
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

type ImportableAudit = {
  team: TeamName;
  agent_id: string;
  agent_name: string;
  display_name: string | null;
  case_type: string;
  audit_date: string;
  order_number: string | null;
  phone_number: string | null;
  ticket_id: string | null;
  quality_score: number;
  comments: string | null;
  score_details: ScoreDetail[];
  created_by_user_id: string | null;
  created_by_name: string | null;
  created_by_email: string | null;
  created_by_role: string | null;
  source_row_number: number;
  source_agent_label: string;
};

type SkippedRow = {
  rowNumber: number;
  agentLabel: string;
  reason: string;
};

type ExistingAuditRow = {
  id: string;
  team: TeamName;
  agent_id: string;
  audit_date: string;
  case_type: string;
  order_number?: string | null;
  phone_number?: string | null;
  ticket_id?: string | null;
};

const LOCKED_NA_METRICS = new Set(['Active Listening']);
const AUTO_FAIL_METRICS = new Set(['Hold (≤3 mins)', 'Procedure']);
const ISSUE_WAS_RESOLVED_METRIC = 'Issue was resolved';

const ISSUE_WAS_RESOLVED_QUESTION: Metric = {
  name: ISSUE_WAS_RESOLVED_METRIC,
  pass: 0,
  borderline: 0,
  countsTowardScore: false,
  options: ['', 'Yes', 'No'],
  defaultValue: '',
};

const callsMetrics: Metric[] = [
  { name: 'Greeting', pass: 2, borderline: 1 },
  { name: 'Friendliness', pass: 5, borderline: 3 },
  { name: 'Hold (≤3 mins)', pass: 8, borderline: 4 },
  { name: 'Call Managing', pass: 8, borderline: 4 },
  { name: 'Active Listening', pass: 5, borderline: 3 },
  { name: 'Procedure', pass: 12, borderline: 6 },
  { name: 'Notes', pass: 12, borderline: 6 },
  { name: 'Creating REF Order', pass: 12, borderline: 6 },
  { name: 'Accuracy', pass: 12, borderline: 6 },
  { name: 'A-form', pass: 6, borderline: 3 },
  { name: 'Refund Form', pass: 11, borderline: 5 },
  { name: 'Providing RL', pass: 5, borderline: 3 },
  { name: 'Ending', pass: 2, borderline: 1 },
  ISSUE_WAS_RESOLVED_QUESTION,
];

const ticketsMetrics: Metric[] = [
  { name: 'Greeting', pass: 5, borderline: 3 },
  { name: 'Friendliness', pass: 5, borderline: 3 },
  { name: 'AI Detection', pass: 10, borderline: 5 },
  { name: 'Typing mistakes', pass: 5, borderline: 3 },
  { name: 'Procedure', pass: 12, borderline: 6 },
  { name: 'Notes', pass: 12, borderline: 6 },
  { name: 'Creating REF Order', pass: 12, borderline: 6 },
  { name: 'Accuracy', pass: 12, borderline: 6 },
  { name: 'A-form', pass: 11, borderline: 5 },
  { name: 'Refund Form', pass: 6, borderline: 3 },
  { name: 'Providing RL', pass: 5, borderline: 3 },
  { name: 'Ending', pass: 5, borderline: 3 },
  ISSUE_WAS_RESOLVED_QUESTION,
];

function countsTowardScore(metric: Metric) {
  return metric.countsTowardScore !== false;
}

function normalizeText(value?: string | null) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .trim();
}

function normalizeHeader(value?: string | null) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function normalizeAgentId(value?: string | null) {
  return normalizeText(value).replace(/\.0+$/, '');
}

function normalizeAgentName(value?: string | null) {
  return normalizeText(value).toLowerCase().replace(/\s+/g, ' ');
}

function formatDateOnly(dateValue?: string | null) {
  if (!dateValue) return '-';
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateValue;
  return date.toLocaleDateString();
}

function parseUsDateToIso(value?: string | null) {
  const raw = normalizeText(value);
  if (!raw) return '';
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return '';
  const [, month, day, year] = match;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function parsePercent(value?: string | null) {
  const raw = normalizeText(value).replace('%', '');
  if (!raw) return null;
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) return null;
  return parsed;
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let current = '';
  let row: string[] = [];
  let inQuotes = false;

  const input = text.replace(/^\ufeff/, '');

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(current);
      current = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') {
        index += 1;
      }

      row.push(current);
      const hasValue = row.some((cell) => normalizeText(cell) !== '');
      if (hasValue) rows.push(row);
      row = [];
      current = '';
      continue;
    }

    current += char;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    const hasValue = row.some((cell) => normalizeText(cell) !== '');
    if (hasValue) rows.push(row);
  }

  if (rows.length === 0) {
    return { headers: [] as string[], normalizedHeaders: [] as string[], records: [] as Array<Record<string, string>> };
  }

  const headers = rows[0].map((item) => normalizeText(item));
  const normalizedHeaders = headers.map((item) => normalizeHeader(item));
  const records = rows.slice(1).map((cells) => {
    const record: Record<string, string> = {};
    normalizedHeaders.forEach((header, idx) => {
      if (!header || header.startsWith('unnamed')) return;
      record[header] = normalizeText(cells[idx]);
    });
    return record;
  });

  return { headers, normalizedHeaders, records };
}

function detectTeam(normalizedHeaders: string[]): TeamName | '' {
  if (normalizedHeaders.includes('ticketnumber') && normalizedHeaders.includes('ticketdate')) {
    return 'Tickets';
  }

  if (normalizedHeaders.includes('dateofthecall') && normalizedHeaders.includes('casetype')) {
    return 'Calls';
  }

  return '';
}

function normalizeMetricResult(rawValue?: string | null) {
  const raw = normalizeText(rawValue).toLowerCase();

  if (!raw) return 'N/A';
  if (raw.startsWith('auto-fail')) return 'Auto-Fail';
  if (raw.startsWith('borderline')) return 'Borderline';
  if (raw.startsWith('pass')) return 'Pass';
  if (raw.startsWith('fail')) return 'Fail';
  if (raw === 'n/a') return 'N/A';

  return 'N/A';
}

function normalizeIssueResolved(rawValue?: string | null) {
  const raw = normalizeText(rawValue).toLowerCase();
  if (raw === 'yes') return 'Yes';
  if (raw === 'no') return 'No';
  return '';
}

function getMetricsForTeam(team: TeamName) {
  return team === 'Calls' ? callsMetrics : ticketsMetrics;
}

function createScoreDetails(
  team: TeamName,
  scores: Record<string, string>
): { scoreDetails: ScoreDetail[]; qualityScore: number } {
  const metrics = getMetricsForTeam(team);
  const scoredMetrics = metrics.filter((item) => countsTowardScore(item));
  const activeMetrics = scoredMetrics.filter((item) => {
    const result = scores[item.name] ?? item.defaultValue ?? 'N/A';
    return result !== '' && result !== 'N/A';
  });

  const activeTotalWeight = activeMetrics.reduce((sum, item) => sum + item.pass, 0);
  const fullTotalWeight = scoredMetrics.reduce((sum, item) => sum + item.pass, 0);

  const scoreDetails = metrics.map((metric) => {
    const result =
      LOCKED_NA_METRICS.has(metric.name)
        ? 'N/A'
        : scores[metric.name] ?? metric.defaultValue ?? 'N/A';
    const scored = countsTowardScore(metric);

    const adjustedWeight =
      !scored || result === 'N/A' || result === '' || activeTotalWeight === 0
        ? 0
        : (metric.pass / activeTotalWeight) * fullTotalWeight;

    let earned = 0;
    if (scored && result === 'Pass') {
      earned = adjustedWeight;
    } else if (scored && result === 'Borderline') {
      earned =
        metric.pass > 0 ? adjustedWeight * (metric.borderline / metric.pass) : 0;
    }

    return {
      metric: metric.name,
      result,
      pass: metric.pass,
      borderline: metric.borderline,
      adjustedWeight,
      earned,
      counts_toward_score: scored,
      metric_comment: null,
    };
  });

  const hasAutoFail = scoreDetails.some(
    (item) =>
      item.counts_toward_score !== false &&
      AUTO_FAIL_METRICS.has(item.metric) &&
      item.result === 'Auto-Fail'
  );

  const qualityScore = hasAutoFail
    ? 0
    : Number(
        scoreDetails
          .filter((item) => item.counts_toward_score !== false)
          .reduce((sum, item) => sum + item.earned, 0)
          .toFixed(2)
      );

  return { scoreDetails, qualityScore };
}

function splitAgentLabel(label: string) {
  const raw = normalizeText(label);
  if (!raw) return { agentName: '', displayName: '' };

  const parts = raw.split(' - ');
  if (parts.length >= 2) {
    return {
      agentName: normalizeText(parts[0]),
      displayName: normalizeText(parts.slice(1).join(' - ')),
    };
  }

  return {
    agentName: raw,
    displayName: '',
  };
}

function getProfileLabel(profile: AgentProfile) {
  return profile.display_name
    ? `${profile.agent_name} - ${profile.display_name}`
    : `${profile.agent_name} - ${profile.agent_id || ''}`.trim();
}

function normalizeCaseType(value?: string | null) {
  return normalizeText(value).toLowerCase();
}

function getAuditReferenceKey(audit: {
  team: TeamName;
  order_number?: string | null;
  phone_number?: string | null;
  ticket_id?: string | null;
}) {
  if (audit.team === 'Tickets') {
    return `ticket:${normalizeText(audit.ticket_id).toLowerCase()}`;
  }

  return `order:${normalizeText(audit.order_number).toLowerCase()}|phone:${normalizeText(
    audit.phone_number
  ).toLowerCase()}`;
}

function getAuditDuplicateKey(audit: {
  team: TeamName;
  agent_id: string;
  audit_date: string;
  case_type: string;
  order_number?: string | null;
  phone_number?: string | null;
  ticket_id?: string | null;
}) {
  return [
    audit.team,
    normalizeAgentId(audit.agent_id),
    audit.audit_date,
    normalizeCaseType(audit.case_type),
    getAuditReferenceKey(audit),
  ].join('||');
}

function matchProfile(
  team: TeamName,
  rawAgentName: string,
  rawAgentId: string,
  profiles: AgentProfile[]
) {
  const teamProfiles = profiles.filter(
    (profile) => profile.role === 'agent' && profile.team === team
  );

  const agentId = normalizeAgentId(rawAgentId);
  if (agentId) {
    const byId = teamProfiles.find(
      (profile) => normalizeAgentId(profile.agent_id) === agentId
    );
    if (byId) return byId;
  }

  const normalizedLabel = normalizeAgentName(rawAgentName);
  if (normalizedLabel) {
    const byFullLabel = teamProfiles.find(
      (profile) => normalizeAgentName(getProfileLabel(profile)) === normalizedLabel
    );
    if (byFullLabel) return byFullLabel;
  }

  const { agentName, displayName } = splitAgentLabel(rawAgentName);
  if (agentName && displayName) {
    const bySplit = teamProfiles.find(
      (profile) =>
        normalizeAgentName(profile.agent_name) === normalizeAgentName(agentName) &&
        normalizeAgentName(profile.display_name) === normalizeAgentName(displayName)
    );
    if (bySplit) return bySplit;
  }

  if (agentName) {
    const byAgentName = teamProfiles.filter(
      (profile) =>
        normalizeAgentName(profile.agent_name) === normalizeAgentName(agentName)
    );
    if (byAgentName.length === 1) return byAgentName[0];
  }

  return null;
}

function buildCallsAudit(
  record: Record<string, string>,
  rowNumber: number,
  profiles: AgentProfile[],
  currentProfile: CurrentProfile | null
): { audit?: ImportableAudit; skipped?: SkippedRow } {
  const rawAgentName = record.agentname || '';
  const profile = matchProfile('Calls', rawAgentName, record.agentid || '', profiles);
  const auditDate = parseUsDateToIso(record.dateofthecall);
  const caseType = normalizeText(record.casetype);
  const orderNumber = normalizeText(record.ordernumber) || null;
  const phoneNumber = normalizeText(record.phonenumber) || null;

  if (!rawAgentName || !auditDate || !caseType) {
    return {
      skipped: {
        rowNumber,
        agentLabel: rawAgentName || '-',
        reason: 'Missing Agent Name, Date of the call, or Case Type.',
      },
    };
  }

  if (!profile?.agent_id) {
    return {
      skipped: {
        rowNumber,
        agentLabel: rawAgentName,
        reason: 'No matching Calls agent profile was found.',
      },
    };
  }

  const scoreMap: Record<string, string> = {
    Greeting: normalizeMetricResult(record.greeting),
    Friendliness: normalizeMetricResult(record.friendliness),
    'Hold (≤3 mins)': normalizeMetricResult(record.hold3mins),
    'Call Managing': normalizeMetricResult(record.callmanaging),
    'Active Listening': LOCKED_NA_METRICS.has('Active Listening')
      ? 'N/A'
      : normalizeMetricResult(record.activelistening),
    Procedure: normalizeMetricResult(record.procedure),
    Notes: normalizeMetricResult(record.notes),
    'Creating REF Order': normalizeMetricResult(record.creatingreforder),
    Accuracy: normalizeMetricResult(record.accuracy),
    'A-form': normalizeMetricResult(record.aform),
    'Refund Form': normalizeMetricResult(record.refundform),
    'Providing RL': normalizeMetricResult(record.providingrl),
    Ending: normalizeMetricResult(record.ending),
    [ISSUE_WAS_RESOLVED_METRIC]: normalizeIssueResolved(record.issuewasresolved),
  };

  const adjusted = createScoreDetails('Calls', scoreMap);

  const qualityScore = parsePercent(record.final) ?? adjusted.qualityScore;
  const comments = [normalizeText(record.feedback), normalizeText(record.feedback1)]
    .filter((item, index, arr) => item && arr.indexOf(item) === index)
    .join(' | ');

  return {
    audit: {
      team: 'Calls',
      agent_id: profile.agent_id,
      agent_name: profile.agent_name,
      display_name: profile.display_name,
      case_type: caseType,
      audit_date: auditDate,
      order_number: orderNumber,
      phone_number: phoneNumber,
      ticket_id: null,
      quality_score: Number(qualityScore.toFixed(2)),
      comments: comments || null,
      score_details: adjusted.scoreDetails,
      created_by_user_id: currentProfile?.id || null,
      created_by_name: currentProfile?.agent_name || null,
      created_by_email: currentProfile?.email || null,
      created_by_role: currentProfile?.role || null,
      source_row_number: rowNumber,
      source_agent_label: rawAgentName,
    },
  };
}

function buildTicketsAudit(
  record: Record<string, string>,
  rowNumber: number,
  profiles: AgentProfile[],
  currentProfile: CurrentProfile | null
): { audit?: ImportableAudit; skipped?: SkippedRow } {
  const rawAgentName = record.agentname || '';
  const profile = matchProfile('Tickets', rawAgentName, record.agentid || '', profiles);
  const auditDate = parseUsDateToIso(record.ticketdate);
  const caseType = normalizeText(record.question);
  const ticketId = normalizeText(record.ticketnumber) || null;

  if (!rawAgentName || !auditDate || !caseType) {
    return {
      skipped: {
        rowNumber,
        agentLabel: rawAgentName || '-',
        reason: 'Missing Agent Name, Ticket Date, or Question.',
      },
    };
  }

  if (!profile?.agent_id) {
    return {
      skipped: {
        rowNumber,
        agentLabel: rawAgentName,
        reason: 'No matching Tickets agent profile was found.',
      },
    };
  }

  const scoreMap: Record<string, string> = {
    Greeting: normalizeMetricResult(record.greeting),
    Friendliness: normalizeMetricResult(record.friendliness),
    'AI Detection': normalizeMetricResult(record.aidetection),
    'Typing mistakes': normalizeMetricResult(record.typingmistakes),
    Procedure: normalizeMetricResult(record.procedure),
    Notes: normalizeMetricResult(record.notes),
    'Creating REF Order': normalizeMetricResult(record.creatingreforder),
    Accuracy: normalizeMetricResult(record.accuracy),
    'A-form': normalizeMetricResult(record.aform),
    'Refund Form': normalizeMetricResult(record.refundform),
    'Providing RL': normalizeMetricResult(record.providingrl),
    Ending: normalizeMetricResult(record.ending),
    [ISSUE_WAS_RESOLVED_METRIC]: '',
  };

  const adjusted = createScoreDetails('Tickets', scoreMap);
  const qualityScore = parsePercent(record.finalscore) ?? adjusted.qualityScore;
  const comments = normalizeText(record.feedback);

  return {
    audit: {
      team: 'Tickets',
      agent_id: profile.agent_id,
      agent_name: profile.agent_name,
      display_name: profile.display_name,
      case_type: caseType,
      audit_date: auditDate,
      order_number: null,
      phone_number: null,
      ticket_id: ticketId,
      quality_score: Number(qualityScore.toFixed(2)),
      comments: comments || null,
      score_details: adjusted.scoreDetails,
      created_by_user_id: currentProfile?.id || null,
      created_by_name: currentProfile?.agent_name || null,
      created_by_email: currentProfile?.email || null,
      created_by_role: currentProfile?.role || null,
      source_row_number: rowNumber,
      source_agent_label: rawAgentName,
    },
  };
}


async function detectDuplicateAudits(
  team: TeamName,
  auditsToCheck: ImportableAudit[]
): Promise<{ uniqueAudits: ImportableAudit[]; duplicateRows: SkippedRow[] }> {
  if (auditsToCheck.length === 0) {
    return { uniqueAudits: [], duplicateRows: [] };
  }

  const duplicateRows: SkippedRow[] = [];
  const seenCsvKeys = new Set<string>();
  const csvUniqueAudits: ImportableAudit[] = [];

  for (const audit of auditsToCheck) {
    const key = getAuditDuplicateKey(audit);
    if (seenCsvKeys.has(key)) {
      duplicateRows.push({
        rowNumber: audit.source_row_number,
        agentLabel: audit.source_agent_label || audit.agent_name,
        reason: 'Duplicate audit found in the uploaded CSV.',
      });
      continue;
    }

    seenCsvKeys.add(key);
    csvUniqueAudits.push(audit);
  }

  if (csvUniqueAudits.length === 0) {
    return { uniqueAudits: [], duplicateRows };
  }

  const agentIds = Array.from(
    new Set(csvUniqueAudits.map((item) => normalizeAgentId(item.agent_id)).filter(Boolean))
  );
  const auditDates = csvUniqueAudits.map((item) => item.audit_date).filter(Boolean);
  const minDate = [...auditDates].sort()[0];
  const maxDate = [...auditDates].sort().slice(-1)[0];

  let query = supabase
    .from('audits')
    .select(
      'id, team, agent_id, audit_date, case_type, order_number, phone_number, ticket_id'
    )
    .eq('team', team);

  if (agentIds.length > 0) {
    query = query.in('agent_id', agentIds);
  }

  if (minDate) {
    query = query.gte('audit_date', minDate);
  }

  if (maxDate) {
    query = query.lte('audit_date', maxDate);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  const existingRows = ((data || []) as ExistingAuditRow[]).map((item) =>
    getAuditDuplicateKey({
      team: item.team,
      agent_id: item.agent_id,
      audit_date: item.audit_date,
      case_type: item.case_type,
      order_number: item.order_number || null,
      phone_number: item.phone_number || null,
      ticket_id: item.ticket_id || null,
    })
  );

  const existingKeySet = new Set(existingRows);
  const uniqueAudits: ImportableAudit[] = [];

  for (const audit of csvUniqueAudits) {
    const key = getAuditDuplicateKey(audit);
    if (existingKeySet.has(key)) {
      duplicateRows.push({
        rowNumber: audit.source_row_number,
        agentLabel: audit.source_agent_label || audit.agent_name,
        reason: 'Duplicate audit already exists in the audits table.',
      });
      continue;
    }

    uniqueAudits.push(audit);
  }

  return { uniqueAudits, duplicateRows };
}

function getThemeVars(): Record<string, string> {
  const themeMode =
    typeof document !== 'undefined'
      ? (
          document.body.dataset.theme ||
          document.documentElement.dataset.theme ||
          window.localStorage.getItem('detroit-axle-theme-mode') ||
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
    '--screen-card-soft-bg': isLight
      ? 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(245,248,253,0.96) 100%)'
      : 'rgba(15,23,42,0.52)',
    '--screen-field-bg': isLight
      ? 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(250,252,255,0.98) 100%)'
      : 'rgba(15,23,42,0.7)',
    '--screen-border': isLight ? 'rgba(203,213,225,0.92)' : 'rgba(148,163,184,0.14)',
    '--screen-border-strong': isLight ? 'rgba(203,213,225,1)' : 'rgba(148,163,184,0.18)',
    '--screen-table-head-bg': isLight ? 'rgba(13, 27, 57, 0.98)' : 'rgba(2,6,23,0.92)',
    '--screen-secondary-btn-bg': isLight ? 'rgba(255,255,255,0.98)' : 'rgba(15,23,42,0.78)',
    '--screen-secondary-btn-text': isLight ? '#475569' : '#e5eefb',
    '--screen-shadow': isLight ? '0 18px 40px rgba(15,23,42,0.10)' : '0 18px 40px rgba(2,6,23,0.35)',
    '--screen-score-pill-bg': isLight ? 'rgba(37,99,235,0.14)' : 'rgba(37,99,235,0.18)',
    '--screen-score-pill-border': isLight ? 'rgba(59,130,246,0.34)' : 'rgba(96,165,250,0.26)',
    '--screen-score-pill-text': isLight ? '#1d4ed8' : '#dbeafe',
  };
}

function AuditsImportSupabase() {
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [currentProfile, setCurrentProfile] = useState<CurrentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [fileName, setFileName] = useState('');
  const [detectedTeam, setDetectedTeam] = useState<TeamName | ''>('');
  const [preparedAudits, setPreparedAudits] = useState<ImportableAudit[]>([]);
  const [skippedRows, setSkippedRows] = useState<SkippedRow[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const themeVars = getThemeVars();

  useEffect(() => {
    void loadProfiles();
  }, []);

  async function loadProfiles() {
    setLoading(true);
    setErrorMessage('');
    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError) {
      setLoading(false);
      setErrorMessage(authError.message);
      return;
    }

    const userId = authData.user?.id;
    const [profilesResult, currentProfileResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, role, agent_id, agent_name, display_name, team')
        .eq('role', 'agent')
        .in('team', ['Calls', 'Tickets'])
        .order('agent_name', { ascending: true }),
      userId
        ? supabase
            .from('profiles')
            .select('id, role, agent_name, email')
            .eq('id', userId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    setLoading(false);

    if (profilesResult.error) {
      setErrorMessage(profilesResult.error.message);
      return;
    }

    if (currentProfileResult.error) {
      setErrorMessage(currentProfileResult.error.message);
      return;
    }

    setProfiles((profilesResult.data as AgentProfile[]) || []);
    setCurrentProfile((currentProfileResult.data as CurrentProfile) || null);
  }

  async function handleFileChange(file?: File | null) {
    if (!file) return;

    setParsing(true);
    setErrorMessage('');
    setSuccessMessage('');
    setPreparedAudits([]);
    setSkippedRows([]);
    setFileName(file.name);

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const csvText = new TextDecoder('windows-1252').decode(bytes);
      const parsed = parseCsv(csvText);
      const team = detectTeam(parsed.normalizedHeaders);

      if (!team) {
        setDetectedTeam('');
        setErrorMessage(
          'Could not detect whether this file is Calls or Tickets. Please use the CSV format you uploaded here.'
        );
        setParsing(false);
        return;
      }

      setDetectedTeam(team);

      const nextAudits: ImportableAudit[] = [];
      const nextSkipped: SkippedRow[] = [];

      parsed.records.forEach((record, index) => {
        const rowNumber = index + 2;
        const result =
          team === 'Calls'
            ? buildCallsAudit(record, rowNumber, profiles, currentProfile)
            : buildTicketsAudit(record, rowNumber, profiles, currentProfile);

        if (result.audit) {
          nextAudits.push(result.audit);
        } else if (result.skipped) {
          nextSkipped.push(result.skipped);
        }
      });

      const dedupeResult = await detectDuplicateAudits(team, nextAudits);
      const finalSkippedRows = [...nextSkipped, ...dedupeResult.duplicateRows];

      setPreparedAudits(dedupeResult.uniqueAudits);
      setSkippedRows(finalSkippedRows);

      if (dedupeResult.uniqueAudits.length === 0) {
        setErrorMessage('No importable audits were found in this CSV after duplicate detection.');
      } else {
        setSuccessMessage(
          `${dedupeResult.uniqueAudits.length} ${team} audit row(s) are ready to import. ${finalSkippedRows.length} row(s) will be skipped, including ${dedupeResult.duplicateRows.length} duplicate row(s).`
        );
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not parse CSV.');
    } finally {
      setParsing(false);
    }
  }

  async function handleImport() {
    if (preparedAudits.length === 0 || !detectedTeam) {
      setErrorMessage('Load a valid CSV file before importing.');
      return;
    }

    setImporting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const dedupeResult = await detectDuplicateAudits(detectedTeam, preparedAudits);

      if (dedupeResult.duplicateRows.length > 0) {
        setPreparedAudits(dedupeResult.uniqueAudits);
        setSkippedRows((prev) => {
          const existingKeys = new Set(
            prev.map((item) => `${item.rowNumber}||${item.agentLabel}||${item.reason}`)
          );
          const merged = [...prev];
          dedupeResult.duplicateRows.forEach((item) => {
            const key = `${item.rowNumber}||${item.agentLabel}||${item.reason}`;
            if (!existingKeys.has(key)) {
              merged.push(item);
              existingKeys.add(key);
            }
          });
          return merged;
        });

        if (dedupeResult.uniqueAudits.length === 0) {
          setErrorMessage('All remaining rows were detected as duplicates. Nothing was imported.');
          setImporting(false);
          return;
        }
      }

      const payload = dedupeResult.uniqueAudits.map((item) => ({
        agent_id: item.agent_id,
        agent_name: item.agent_name,
        team: item.team,
        case_type: item.case_type,
        audit_date: item.audit_date,
        order_number: item.order_number,
        phone_number: item.phone_number,
        ticket_id: item.ticket_id,
        quality_score: item.quality_score,
        comments: item.comments,
        score_details: item.score_details,
        shared_with_agent: false,
        shared_at: null,
        created_by_user_id: item.created_by_user_id,
        created_by_name: item.created_by_name,
        created_by_email: item.created_by_email,
        created_by_role: item.created_by_role,
      }));

      const chunkSize = 200;
      for (let start = 0; start < payload.length; start += chunkSize) {
        const chunk = payload.slice(start, start + chunkSize);
        const { error } = await supabase.from('audits').insert(chunk);
        if (error) throw error;
      }

      setPreparedAudits([]);
      setSuccessMessage(
        `${payload.length} ${detectedTeam} audit row(s) imported successfully. ${dedupeResult.duplicateRows.length} duplicate row(s) were skipped.`
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Import failed in Supabase.'
      );
    } finally {
      setImporting(false);
    }
  }

  function clearLoadedFile() {
    setFileName('');
    setDetectedTeam('');
    setPreparedAudits([]);
    setSkippedRows([]);
    setErrorMessage('');
    setSuccessMessage('');
  }

  const previewRows = useMemo(() => preparedAudits.slice(0, 8), [preparedAudits]);
  const skippedPreviewRows = useMemo(() => skippedRows.slice(0, 20), [skippedRows]);
  const duplicateRowsCount = useMemo(
    () => skippedRows.filter((item) => item.reason.toLowerCase().includes('duplicate')).length,
    [skippedRows]
  );

  if (loading) {
    return <div style={{ color: 'var(--screen-text)' }}>Loading audit import tools...</div>;
  }

  return (
    <div
      data-no-theme-invert="true"
      style={{ color: 'var(--screen-text)', ...(themeVars as CSSProperties) }}
    >
      <div style={pageHeaderStyle}>
        <div>
          <div style={sectionEyebrow}>Audit Import</div>
          <h2 style={pageTitleStyle}>Import Calls and Tickets Audits</h2>
          <p style={pageSubtextStyle}>
            Upload one Calls or Tickets audit CSV at a time. The importer matches only agents that already exist in profiles and skips the rest.
          </p>
        </div>

        <button type="button" onClick={() => void loadProfiles()} style={secondaryButton}>
          Refresh Agents
        </button>
      </div>

      {errorMessage ? <div style={errorBanner}>{errorMessage}</div> : null}
      {successMessage ? <div style={successBanner}>{successMessage}</div> : null}

      <div style={panelStyle}>
        <div style={formGridStyle}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Audit CSV File</label>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => void handleFileChange(event.target.files?.[0] || null)}
              style={fieldStyle}
            />
            <div style={helperTextStyle}>
              Supported formats: the Calls and Tickets CSV files you uploaded in this chat. Duplicate detection checks both the uploaded CSV and existing audits already saved in Supabase.
            </div>
          </div>

          <div>
            <label style={labelStyle}>Detected Team</label>
            <div style={summaryValueCardStyle}>{detectedTeam || '-'}</div>
          </div>

          <div>
            <label style={labelStyle}>Loaded File</label>
            <div style={summaryValueCardStyle}>{fileName || '-'}</div>
          </div>

          <div>
            <label style={labelStyle}>Ready to Import</label>
            <div style={summaryValueCardStyle}>{preparedAudits.length}</div>
          </div>

          <div>
            <label style={labelStyle}>Skipped Rows</label>
            <div style={summaryValueCardStyle}>{skippedRows.length}</div>
          </div>
        </div>

        <div style={buttonRowStyle}>
          <button
            type="button"
            onClick={() => void handleImport()}
            disabled={importing || parsing || preparedAudits.length === 0}
            style={primaryButton}
          >
            {importing ? 'Importing...' : 'Import Audits'}
          </button>

          <button
            type="button"
            onClick={clearLoadedFile}
            disabled={importing || parsing}
            style={secondaryButton}
          >
            Clear Loaded File
          </button>
        </div>
      </div>

      <div style={statsGridStyle}>
        <div style={statCardStyle}>
          <div style={statLabelStyle}>Matched Agents</div>
          <div style={statValueStyle}>
            {new Set(preparedAudits.map((item) => `${item.agent_id}|${item.team}`)).size}
          </div>
        </div>

        <div style={statCardStyle}>
          <div style={statLabelStyle}>Preview Rows</div>
          <div style={statValueStyle}>{previewRows.length}</div>
        </div>

        <div style={statCardStyle}>
          <div style={statLabelStyle}>Duplicates Skipped</div>
          <div style={statValueStyle}>{duplicateRowsCount}</div>
        </div>

        <div style={statCardStyle}>
          <div style={statLabelStyle}>Team</div>
          <div style={statValueStyle}>{detectedTeam || '-'}</div>
        </div>

        <div style={statCardStyle}>
          <div style={statLabelStyle}>Importer</div>
          <div style={statValueStyle}>{currentProfile?.agent_name || currentProfile?.email || '-'}</div>
        </div>
      </div>

      <div style={panelStyle}>
        <div style={sectionEyebrow}>Preview</div>
        {previewRows.length === 0 ? (
          <p style={pageSubtextStyle}>Load a CSV file to preview the audits that will be imported.</p>
        ) : (
          <div style={tableWrapStyle}>
            <div style={tableStyle}>
              <div style={{ ...tableRowStyle, ...tableHeaderRowStyle }}>
                <div style={cellAgentStyle}>Agent</div>
                <div style={cellDateStyle}>Audit Date</div>
                <div style={cellCaseStyle}>Case Type</div>
                <div style={cellReferenceStyle}>Reference</div>
                <div style={cellScoreStyle}>Quality</div>
                <div style={cellCommentsStyle}>Comments</div>
              </div>

              {previewRows.map((item) => (
                <div key={`${item.source_row_number}-${item.agent_id}`} style={entryStyle}>
                  <div style={tableRowStyle}>
                    <div style={cellAgentStyle}>
                      <div style={primaryCellTextStyle}>{item.agent_name}</div>
                      <div style={secondaryCellTextStyle}>
                        {(item.display_name || '-') + ' • ' + item.agent_id + ' • ' + item.team}
                      </div>
                    </div>

                    <div style={cellDateStyle}>
                      <div style={primaryCellTextStyle}>{formatDateOnly(item.audit_date)}</div>
                      <div style={secondaryCellTextStyle}>CSV row {item.source_row_number}</div>
                    </div>

                    <div style={cellCaseStyle}>
                      <div style={primaryCellTextStyle}>{item.case_type}</div>
                    </div>

                    <div style={cellReferenceStyle}>
                      <div style={primaryCellTextStyle}>
                        {item.team === 'Tickets'
                          ? `Ticket ID: ${item.ticket_id || '-'}`
                          : `Order #: ${item.order_number || '-'} | Phone: ${item.phone_number || '-'}`
                        }
                      </div>
                    </div>

                    <div style={cellScoreStyle}>
                      <span style={scorePillStyle}>{item.quality_score.toFixed(2)}%</span>
                    </div>

                    <div style={cellCommentsStyle}>
                      <div style={primaryCellTextStyle}>{item.comments || '-'}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ ...panelStyle, marginTop: '18px' }}>
        <div style={sectionEyebrow}>Skipped Rows</div>
        {skippedPreviewRows.length === 0 ? (
          <p style={pageSubtextStyle}>No skipped rows yet.</p>
        ) : (
          <div style={{ display: 'grid', gap: '10px' }}>
            {skippedPreviewRows.map((item) => (
              <div key={`${item.rowNumber}-${item.agentLabel}`} style={skippedRowStyle}>
                <div style={primaryCellTextStyle}>Row {item.rowNumber} • {item.agentLabel || '-'}</div>
                <div style={secondaryCellTextStyle}>{item.reason}</div>
              </div>
            ))}
            {skippedRows.length > skippedPreviewRows.length ? (
              <div style={helperTextStyle}>
                Showing {skippedPreviewRows.length} of {skippedRows.length} skipped row(s).
              </div>
            ) : null}
          </div>
        )}
      </div>
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
  color: 'var(--screen-accent)',
  fontSize: '12px',
  fontWeight: 800,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.16em',
  marginBottom: '12px',
};

const pageTitleStyle = {
  margin: '0 0 8px 0',
  color: 'var(--screen-heading)',
};

const pageSubtextStyle = {
  margin: 0,
  color: 'var(--screen-muted)',
};

const panelStyle = {
  background: 'var(--screen-panel-bg)',
  border: '1px solid var(--screen-border)',
  borderRadius: '24px',
  padding: '22px',
  boxShadow: 'var(--screen-shadow)',
  backdropFilter: 'blur(14px)',
  marginBottom: '18px',
};

const formGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '14px',
};

const statsGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  gap: '14px',
  marginBottom: '18px',
};

const statCardStyle = {
  borderRadius: '18px',
  border: '1px solid var(--screen-border)',
  background: 'var(--screen-card-soft-bg)',
  padding: '18px',
};

const statLabelStyle = {
  color: 'var(--screen-muted)',
  fontSize: '12px',
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  marginBottom: '8px',
};

const statValueStyle = {
  color: 'var(--screen-heading)',
  fontSize: '28px',
  fontWeight: 800,
};

const labelStyle = {
  display: 'block',
  marginBottom: '8px',
  fontSize: '13px',
  color: 'var(--screen-text)',
  fontWeight: 700,
};

const fieldStyle = {
  width: '100%',
  padding: '14px 16px',
  borderRadius: '16px',
  border: '1px solid var(--screen-border-strong)',
  background: 'var(--screen-field-bg)',
  color: 'var(--screen-text)',
};

const helperTextStyle = {
  marginTop: '8px',
  color: 'var(--screen-muted)',
  fontSize: '12px',
};

const summaryValueCardStyle = {
  minHeight: '52px',
  display: 'flex',
  alignItems: 'center',
  padding: '14px 16px',
  borderRadius: '16px',
  border: '1px solid var(--screen-border)',
  background: 'var(--screen-card-soft-bg)',
  color: 'var(--screen-heading)',
  fontWeight: 700,
};

const buttonRowStyle = {
  display: 'flex',
  gap: '10px',
  flexWrap: 'wrap' as const,
  marginTop: '18px',
};

const secondaryButton = {
  padding: '12px 16px',
  background: 'var(--screen-secondary-btn-bg)',
  color: 'var(--screen-secondary-btn-text)',
  border: '1px solid var(--screen-border-strong)',
  borderRadius: '14px',
  cursor: 'pointer',
  fontWeight: 700,
};

const primaryButton = {
  padding: '12px 16px',
  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
  color: '#ffffff',
  border: '1px solid rgba(96,165,250,0.24)',
  borderRadius: '14px',
  cursor: 'pointer',
  fontWeight: 700,
};

const errorBanner = {
  marginBottom: '16px',
  padding: '14px 16px',
  borderRadius: '16px',
  backgroundColor: 'rgba(127,29,29,0.24)',
  border: '1px solid rgba(252,165,165,0.24)',
  color: '#fecaca',
};

const successBanner = {
  marginBottom: '16px',
  padding: '14px 16px',
  borderRadius: '16px',
  backgroundColor: 'rgba(22,101,52,0.24)',
  border: '1px solid rgba(134,239,172,0.22)',
  color: '#bbf7d0',
};

const tableWrapStyle = {
  overflowX: 'auto' as const,
  borderRadius: '20px',
  border: '1px solid var(--screen-border)',
  background: 'var(--screen-panel-bg)',
};

const tableStyle = {
  minWidth: '1400px',
};

const entryStyle = {
  borderBottom: '1px solid rgba(148,163,184,0.08)',
};

const tableRowStyle = {
  display: 'grid',
  gridTemplateColumns: '280px 140px 180px minmax(280px,1.5fr) 120px minmax(260px,1.8fr)',
  gap: '14px',
  alignItems: 'center',
  padding: '14px 16px',
};

const tableHeaderRowStyle = {
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

const cellAgentStyle = {};
const cellDateStyle = {};
const cellCaseStyle = {};
const cellReferenceStyle = {};
const cellScoreStyle = {};
const cellCommentsStyle = {};

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

const skippedRowStyle = {
  borderRadius: '14px',
  border: '1px solid var(--screen-border)',
  background: 'var(--screen-card-soft-bg)',
  padding: '14px 16px',
};

export default AuditsImportSupabase;
