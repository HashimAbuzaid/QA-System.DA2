import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { supabase } from '../lib/supabase';
import {
  clearAgentProfilesCache,
  getCachedAgentProfiles,
  type CachedAgentProfile,
  type TeamName,
} from '../lib/agentProfilesCache';
import { usePersistentState } from '../hooks/usePersistentState';

type Metric = {
  name: string;
  pass: number;
  borderline: number;
  countsTowardScore?: boolean;
  options?: string[];
  defaultValue?: string;
};

type TeamType = TeamName | '';

type AgentProfile = CachedAgentProfile;

type CreatorProfile = {
  id: string;
  role: 'admin' | 'qa' | 'agent';
  agent_name: string;
  display_name: string | null;
  email: string;
};

type CreatorSummary = {
  userId: string;
  name: string;
  role: 'admin' | 'qa' | 'agent' | '';
  email: string;
};

type AuthMetadata = {
  display_name?: string;
  full_name?: string;
  name?: string;
};

type AuditDraft = {
  team: TeamType;
  selectedAgentProfileId: string;
  agentSearch: string;
  caseType: string;
  auditDate: string;
  orderNumber: string;
  phoneNumber: string;
  ticketId: string;
  comments: string;
  scores: Record<string, string>;
  metricComments: Record<string, string>;
};

const LOCKED_NA_METRICS = new Set(['Active Listening']);
const AUTO_FAIL_METRICS = new Set(['Hold (≤3 mins)', 'Procedure']);
const ISSUE_WAS_RESOLVED_METRIC = 'Issue was resolved';

function countsTowardScore(metric: Metric) {
  return metric.countsTowardScore !== false;
}

function shouldShowMetricComment(result: string) {
  return (
    result === 'Borderline' || result === 'Fail' || result === 'Auto-Fail'
  );
}

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

const salesMetrics: Metric[] = [
  { name: 'Greeting', pass: 2, borderline: 1 },
  { name: 'Friendliness', pass: 5, borderline: 3 },
  { name: 'Hold (≤3 mins)', pass: 10, borderline: 5 },
  { name: 'Call Managing', pass: 10, borderline: 5 },
  { name: 'Active Listening', pass: 5, borderline: 3 },
  { name: 'Polite', pass: 5, borderline: 3 },
  { name: 'Correct address', pass: 15, borderline: 7 },
  { name: 'Correct part was chosen', pass: 15, borderline: 7 },
  { name: 'ETA provided?', pass: 15, borderline: 7 },
  { name: 'Refund Form', pass: 5, borderline: 3 },
  { name: 'Up-selling', pass: 8, borderline: 4 },
  { name: 'Ending', pass: 5, borderline: 3 },
  ISSUE_WAS_RESOLVED_QUESTION,
];

function pickPreferredName(values: Array<string | null | undefined>) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return 'Unknown User';
}

function getMetricsForTeam(teamValue: TeamType): Metric[] {
  if (teamValue === 'Calls') return callsMetrics;
  if (teamValue === 'Tickets') return ticketsMetrics;
  if (teamValue === 'Sales') return salesMetrics;
  return [];
}

function isLockedToNA(metricName: string) {
  return LOCKED_NA_METRICS.has(metricName);
}

function canAutoFail(metricName: string) {
  return AUTO_FAIL_METRICS.has(metricName);
}

function getMetricOptions(metric: Metric) {
  if (metric.options?.length) return metric.options;
  if (isLockedToNA(metric.name)) return ['N/A'];

  const options = ['N/A', 'Pass', 'Borderline', 'Fail'];
  if (canAutoFail(metric.name)) options.push('Auto-Fail');
  return options;
}

function getMetricStoredValue(metric: Metric, scores: Record<string, string>) {
  if (isLockedToNA(metric.name)) return 'N/A';
  return scores[metric.name] ?? metric.defaultValue ?? 'N/A';
}

function createDefaultScores(teamValue: TeamType) {
  const defaults: Record<string, string> = {};

  getMetricsForTeam(teamValue).forEach((metric) => {
    defaults[metric.name] = metric.defaultValue ?? 'N/A';
  });

  return defaults;
}

function createEmptyDraft(teamValue: TeamType = ''): AuditDraft {
  return {
    team: teamValue,
    selectedAgentProfileId: '',
    agentSearch: '',
    caseType: '',
    auditDate: '',
    orderNumber: '',
    phoneNumber: '',
    ticketId: '',
    comments: '',
    scores: createDefaultScores(teamValue),
    metricComments: {},
  };
}

function getMissingRequiredMetricLabels(
  teamValue: TeamType,
  scores: Record<string, string>
) {
  return getMetricsForTeam(teamValue)
    .filter((metric) => Array.isArray(metric.options) && metric.defaultValue === '')
    .filter((metric) => !getMetricStoredValue(metric, scores))
    .map((metric) => metric.name);
}

function getAdjustedScoreData(
  team: TeamType,
  scores: Record<string, string>,
  metricComments: Record<string, string>
) {
  const metrics = getMetricsForTeam(team);
  const scoredMetrics = metrics.filter((item) => countsTowardScore(item));

  const activeMetrics = scoredMetrics.filter((item) => {
    const itemResult = getMetricStoredValue(item, scores);
    return itemResult !== 'N/A' && itemResult !== '';
  });

  const activeTotalWeight = activeMetrics.reduce(
    (sum, item) => sum + item.pass,
    0
  );
  const fullTotalWeight = scoredMetrics.reduce((sum, item) => sum + item.pass, 0);

  const scoreDetails = metrics.map((metric) => {
    const result = getMetricStoredValue(metric, scores);
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
        metric.pass > 0
          ? adjustedWeight * (metric.borderline / metric.pass)
          : 0;
    }

    return {
      metric: metric.name,
      result,
      pass: metric.pass,
      borderline: metric.borderline,
      adjustedWeight,
      earned,
      counts_toward_score: scored,
      metric_comment:
        scored && shouldShowMetricComment(result)
          ? (metricComments[metric.name] || '').trim() || null
          : null,
    };
  });

  const hasAutoFail = scoreDetails.some(
    (item) =>
      item.counts_toward_score !== false &&
      canAutoFail(item.metric) &&
      item.result === 'Auto-Fail'
  );

  const qualityScore = hasAutoFail
    ? '0.00'
    : scoreDetails
        .filter((item) => item.counts_toward_score !== false)
        .reduce((sum, item) => sum + item.earned, 0)
        .toFixed(2);

  return { scoreDetails, qualityScore, hasAutoFail };
}

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
    '--screen-muted': isLight ? '#8a98b3' : '#94a3b8',
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

function NewAuditSupabase() {
  const [draft, setDraft] = usePersistentState<AuditDraft>(
    'detroit-axle-new-audit-draft',
    createEmptyDraft('')
  );

  const [saving, setSaving] = useState(false);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [agentProfiles, setAgentProfiles] = useState<AgentProfile[]>([]);
  const [agentLoadError, setAgentLoadError] = useState('');
  const [creatorSummary, setCreatorSummary] = useState<CreatorSummary | null>(
    null
  );
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isAgentPickerOpen, setIsAgentPickerOpen] = useState(false);

  const themeVars = getThemeVars();
  const agentPickerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void loadAgentProfiles();
    void loadCurrentCreatorSummary();
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

  async function loadAgentProfiles(options?: { force?: boolean }) {
    setLoadingAgents(true);
    setAgentLoadError('');

    try {
      const data = await getCachedAgentProfiles(undefined, {
        force: options?.force,
      });
      setAgentProfiles(data);
    } catch (error) {
      setAgentLoadError(
        error instanceof Error ? error.message : 'Could not load agents.'
      );
    } finally {
      setLoadingAgents(false);
    }
  }

  async function loadCurrentCreatorSummary() {
    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError || !authData.user) {
      setCreatorSummary(null);
      return;
    }

    const authUser = authData.user;
    const authMetadata = (authUser.user_metadata || {}) as AuthMetadata;

    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('id, role, agent_name, display_name, email')
      .eq('id', authUser.id)
      .maybeSingle();

    if (profileError || !profileData) {
      setCreatorSummary({
        userId: authUser.id,
        name: pickPreferredName([
          authMetadata.display_name,
          authMetadata.full_name,
          authMetadata.name,
          authUser.email,
        ]),
        role: '',
        email: authUser.email || '',
      });
      return;
    }

    const creatorProfile = profileData as CreatorProfile;

    setCreatorSummary({
      userId: creatorProfile.id,
      name: pickPreferredName([
        authMetadata.display_name,
        authMetadata.full_name,
        authMetadata.name,
        creatorProfile.display_name,
        creatorProfile.agent_name,
        creatorProfile.email,
        authUser.email,
      ]),
      role: creatorProfile.role,
      email: creatorProfile.email || authUser.email || '',
    });
  }

  function handleRefreshAgents() {
    clearAgentProfilesCache();
    void loadAgentProfiles({ force: true });
  }

  function getAgentLabel(profile: AgentProfile) {
    return profile.display_name
      ? `${profile.agent_name} - ${profile.display_name}`
      : `${profile.agent_name} - ${profile.agent_id}`;
  }

  const teamAgents = useMemo(() => {
    return agentProfiles.filter(
      (profile) =>
        profile.role === 'agent' &&
        profile.team === draft.team &&
        profile.agent_id &&
        profile.agent_name
    );
  }, [agentProfiles, draft.team]);

  const visibleAgents = useMemo(() => {
    const search = draft.agentSearch.trim().toLowerCase();

    if (!search) return teamAgents;

    return teamAgents.filter((profile) => {
      const label = getAgentLabel(profile);

      return (
        profile.agent_name.toLowerCase().includes(search) ||
        (profile.agent_id || '').toLowerCase().includes(search) ||
        (profile.display_name || '').toLowerCase().includes(search) ||
        label.toLowerCase().includes(search)
      );
    });
  }, [teamAgents, draft.agentSearch]);

  const selectedAgent =
    teamAgents.find((profile) => profile.id === draft.selectedAgentProfileId) ||
    null;

  const adjustedData = useMemo(() => {
    return getAdjustedScoreData(draft.team, draft.scores, draft.metricComments);
  }, [draft.team, draft.scores, draft.metricComments]);

  function setDraftField<K extends keyof AuditDraft>(
    key: K,
    value: AuditDraft[K]
  ) {
    setDraft((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  function setTeamAndReset(nextTeam: TeamType) {
    setErrorMessage('');
    setSuccessMessage('');
    setIsAgentPickerOpen(false);
    setDraft(createEmptyDraft(nextTeam));
  }

  function handleScoreChange(metricName: string, value: string) {
    if (isLockedToNA(metricName)) {
      setDraft((prev) => ({
        ...prev,
        scores: {
          ...prev.scores,
          [metricName]: 'N/A',
        },
        metricComments: {
          ...prev.metricComments,
          [metricName]: '',
        },
      }));
      return;
    }

    setDraft((prev) => {
      const nextMetricComments = { ...prev.metricComments };
      if (!shouldShowMetricComment(value)) {
        delete nextMetricComments[metricName];
      }

      return {
        ...prev,
        scores: {
          ...prev.scores,
          [metricName]: value,
        },
        metricComments: nextMetricComments,
      };
    });
  }

  function handleMetricCommentChange(metricName: string, value: string) {
    setDraft((prev) => ({
      ...prev,
      metricComments: {
        ...prev.metricComments,
        [metricName]: value,
      },
    }));
  }

  function handleSelectAgent(profile: AgentProfile) {
    setDraft((prev) => ({
      ...prev,
      selectedAgentProfileId: profile.id,
      agentSearch: getAgentLabel(profile),
    }));
    setIsAgentPickerOpen(false);
  }



  async function handleSave() {
    setErrorMessage('');
    setSuccessMessage('');

    if (!draft.team) {
      setErrorMessage('Please choose a team.');
      return;
    }

    if (!selectedAgent) {
      setErrorMessage('Please choose an agent.');
      return;
    }

    if (!draft.caseType || !draft.auditDate) {
      setErrorMessage('Please fill Case Type and Audit Date.');
      return;
    }

    if (
      (draft.team === 'Calls' || draft.team === 'Sales') &&
      !draft.orderNumber
    ) {
      setErrorMessage('Please fill Order Number for Calls and Sales.');
      return;
    }

    if (draft.team === 'Tickets' && !draft.ticketId) {
      setErrorMessage('Please fill Ticket ID for Tickets.');
      return;
    }

    const missingRequiredMetricLabels = getMissingRequiredMetricLabels(
      draft.team,
      draft.scores
    );
    if (missingRequiredMetricLabels.length > 0) {
      setErrorMessage(
        `Please answer: ${missingRequiredMetricLabels.join(', ')}.`
      );
      return;
    }

    const missingMetricCommentLabels = getMetricsForTeam(draft.team)
      .filter((metric) => countsTowardScore(metric))
      .filter((metric) =>
        shouldShowMetricComment(getMetricStoredValue(metric, draft.scores))
      )
      .filter((metric) => !(draft.metricComments[metric.name] || '').trim())
      .map((metric) => metric.name);

    if (missingMetricCommentLabels.length > 0) {
      setErrorMessage(
        `Please add a short QA note for: ${missingMetricCommentLabels.join(', ')}.`
      );
      return;
    }

    if (!selectedAgent.agent_id) {
      setErrorMessage('Selected agent does not have an Agent ID.');
      return;
    }

    setSaving(true);

    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError) {
      setSaving(false);
      setErrorMessage(authError.message);
      return;
    }

    const authUser = authData.user;

    if (!authUser) {
      setSaving(false);
      setErrorMessage('Could not identify the logged-in user.');
      return;
    }

    const { data: creatorProfileData, error: creatorProfileError } =
      await supabase
        .from('profiles')
        .select('id, role, agent_name, display_name, email')
        .eq('id', authUser.id)
        .maybeSingle();

    if (creatorProfileError) {
      setSaving(false);
      setErrorMessage(creatorProfileError.message);
      return;
    }

    if (!creatorProfileData) {
      setSaving(false);
      setErrorMessage(
        'Could not load the logged-in profile for creator tracking.'
      );
      return;
    }

    const creatorProfile = creatorProfileData as CreatorProfile;
    const authMetadata = (authUser.user_metadata || {}) as AuthMetadata;

    const createdByName = pickPreferredName([
      authMetadata.display_name,
      authMetadata.full_name,
      authMetadata.name,
      creatorProfile.display_name,
      creatorProfile.agent_name,
      creatorProfile.email,
      authUser.email,
    ]);

    const { error } = await supabase.from('audits').insert({
      agent_id: selectedAgent.agent_id,
      agent_name: selectedAgent.agent_name,
      team: draft.team,
      case_type: draft.caseType,
      audit_date: draft.auditDate,
      order_number:
        draft.team === 'Calls' || draft.team === 'Sales'
          ? draft.orderNumber
          : null,
      phone_number:
        draft.team === 'Calls' || draft.team === 'Sales'
          ? draft.phoneNumber || null
          : null,
      ticket_id: draft.team === 'Tickets' ? draft.ticketId : null,
      quality_score: Number(adjustedData.qualityScore),
      comments: draft.comments,
      score_details: adjustedData.scoreDetails,
      created_by_user_id: creatorProfile.id,
      created_by_name: createdByName,
      created_by_email: creatorProfile.email || authUser.email || null,
      created_by_role: creatorProfile.role,
    });

    setSaving(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    const savedTeam = draft.team;
    setIsAgentPickerOpen(false);
    setDraft(createEmptyDraft(savedTeam));
    setSuccessMessage('Audit saved successfully. Draft cleared.');
    void loadCurrentCreatorSummary();
  }

  function renderScorecard(title: string, metrics: Metric[]) {
    return (
      <div style={{ marginTop: '30px' }}>
        <div style={sectionEyebrow}>{title}</div>

        <div style={{ display: 'grid', gap: '15px' }}>
          {metrics.map((metric) => {
            const metricOptions = getMetricOptions(metric);
            const metricValue = getMetricStoredValue(metric, draft.scores);
            const showMetricComment =
              countsTowardScore(metric) && shouldShowMetricComment(metricValue);

            return (
              <div key={metric.name} style={glassFieldCardStyle}>
                <label style={labelStyle}>
                  {countsTowardScore(metric)
                    ? `${metric.name} (${metric.pass} pts)`
                    : metric.name}
                </label>
                <select
                  value={metricValue}
                  onChange={(event) =>
                    handleScoreChange(metric.name, event.target.value)
                  }
                  disabled={isLockedToNA(metric.name)}
                  style={selectFieldStyle}
                >
                  {metricOptions.map((option) => (
                    <option key={option || '__empty__'} value={option} style={selectOptionStyle}>
                      {option || 'Select answer'}
                    </option>
                  ))}
                </select>

                {isLockedToNA(metric.name) && (
                  <div style={helpTextStyle}>Locked to N/A</div>
                )}

                {showMetricComment ? (
                  <div style={metricCommentWrapStyle}>
                    <label style={metricCommentLabelStyle}>QA note for agent</label>
                    <textarea
                      value={draft.metricComments[metric.name] || ''}
                      onChange={(event) =>
                        handleMetricCommentChange(metric.name, event.target.value)
                      }
                      rows={2}
                      placeholder="Leave a short note explaining the result"
                      style={metricCommentFieldStyle}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {adjustedData.hasAutoFail && (
          <div style={warningBannerStyle}>
            Auto-Fail triggered. Final score is 0.00%.
          </div>
        )}

        <div style={scoreCardStyle}>
          <div style={scoreLabelStyle}>Quality Score</div>
          <div style={scoreValueStyle}>{adjustedData.qualityScore}%</div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-no-theme-invert="true"
      style={{ color: 'var(--screen-text)', ...(themeVars as CSSProperties) }}
    >
      <div style={pageHeaderStyle}>
        <div>
          <div style={sectionEyebrow}>Audit Workspace</div>
          <h2 style={{ margin: 0, fontSize: '30px', color: 'var(--screen-heading)' }}>New Audit</h2>
          <p style={{ margin: '10px 0 0 0', color: 'var(--screen-muted)' }}>
            Create Detroit Axle audits using the live agent directory from
            profiles.
          </p>
        </div>

        <button
          type="button"
          onClick={handleRefreshAgents}
          style={secondaryButton}
        >
          Refresh Agents
        </button>
      </div>

      {errorMessage ? <div style={errorBannerStyle}>{errorMessage}</div> : null}
      {successMessage ? (
        <div style={successBannerStyle}>{successMessage}</div>
      ) : null}

      <div style={panelStyle}>
        <div style={teamButtonRowStyle}>
          {(['Calls', 'Tickets', 'Sales'] as Exclude<TeamType, ''>[]).map(
            (teamOption) => (
              <button
                key={teamOption}
                type="button"
                onClick={() => setTeamAndReset(teamOption)}
                style={{
                  ...teamButtonStyle,
                  ...(draft.team === teamOption ? activeTeamButtonStyle : {}),
                }}
              >
                {teamOption}
              </button>
            )
          )}
        </div>

        {draft.team && (
          <div style={formGridStyle}>
            <div style={wideFieldStyle}>
              <label style={labelStyle}>Agent</label>
              <div ref={agentPickerRef} style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setIsAgentPickerOpen((prev) => !prev)}
                  style={pickerButtonStyle}
                >
                  <span
                    style={{ color: selectedAgent ? 'var(--screen-text)' : 'var(--screen-muted)' }}
                  >
                    {selectedAgent
                      ? getAgentLabel(selectedAgent)
                      : 'Select agent'}
                  </span>
                  <span>▼</span>
                </button>

                {isAgentPickerOpen && (
                  <div style={pickerMenuStyle}>
                    <div style={pickerSearchWrapStyle}>
                      <input
                        type="text"
                        value={draft.agentSearch}
                        onChange={(event) =>
                          setDraftField('agentSearch', event.target.value)
                        }
                        placeholder="Search by name, ID, or display name"
                        style={fieldStyle}
                      />
                    </div>

                    <div style={pickerListStyle}>
                      {loadingAgents ? (
                        <div style={pickerInfoStyle}>Loading agents...</div>
                      ) : agentLoadError ? (
                        <div style={pickerErrorStyle}>
                          Could not load agents: {agentLoadError}
                        </div>
                      ) : visibleAgents.length === 0 ? (
                        <div style={pickerInfoStyle}>No agents found</div>
                      ) : (
                        visibleAgents.map((profile) => (
                          <button
                            key={profile.id}
                            type="button"
                            onClick={() => handleSelectAgent(profile)}
                            style={{
                              ...pickerOptionStyle,
                              ...(draft.selectedAgentProfileId === profile.id
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
            </div>

            <div style={infoCardStyle}>
              <p style={infoLineStyle}>
                <strong>Agent Name:</strong> {selectedAgent?.agent_name || '-'}
              </p>
              <p style={infoLineStyle}>
                <strong>Display Name:</strong>{' '}
                {selectedAgent?.display_name || '-'}
              </p>
              <p style={infoLineStyle}>
                <strong>Agent ID:</strong> {selectedAgent?.agent_id || '-'}
              </p>
              <p style={infoLineStyle}>
                <strong>Team:</strong> {selectedAgent?.team || '-'}
              </p>
              <p style={infoLineStyle}>
                <strong>Created By:</strong> {creatorSummary?.name || '-'}
              </p>
              <p style={infoLineStyle}>
                <strong>Creator Role:</strong> {creatorSummary?.role || '-'}
              </p>
              <p style={{ ...infoLineStyle, marginBottom: 0 }}>
                <strong>Creator Email:</strong> {creatorSummary?.email || '-'}
              </p>
            </div>

            <div>
              <label style={labelStyle}>Case Type</label>
              <select
                value={draft.caseType}
                onChange={(event) =>
                  setDraftField('caseType', event.target.value)
                }
                style={selectFieldStyle}
              >
                {['', 'Order status', 'General Inquiry', 'Exchange', 'Missing Parts', 'Refund - Store credit', 'Delivered but not received', 'FedEx Cases', 'Replacement', 'Warranty', 'Fitment issue', 'Damaged package', 'Cancellation'].map((option) => (
                  <option key={option || '__empty__'} value={option} style={selectOptionStyle}>
                    {option || 'Select Case Type'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Audit Date</label>
              <input
                type="date"
                value={draft.auditDate}
                onChange={(event) =>
                  setDraftField('auditDate', event.target.value)
                }
                onClick={(event) => openNativeDatePicker(event.currentTarget)}
                onFocus={(event) => openNativeDatePicker(event.currentTarget)}
                style={fieldStyle}
              />
            </div>

            {(draft.team === 'Calls' || draft.team === 'Sales') && (
              <>
                <div>
                  <label style={labelStyle}>Order Number</label>
                  <input
                    type="text"
                    value={draft.orderNumber}
                    onChange={(event) =>
                      setDraftField('orderNumber', event.target.value)
                    }
                    style={fieldStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Phone Number</label>
                  <input
                    type="text"
                    value={draft.phoneNumber}
                    onChange={(event) =>
                      setDraftField('phoneNumber', event.target.value)
                    }
                    style={fieldStyle}
                  />
                </div>
              </>
            )}

            {draft.team === 'Tickets' && (
              <div>
                <label style={labelStyle}>Ticket ID</label>
                <input
                  type="text"
                  value={draft.ticketId}
                  onChange={(event) =>
                    setDraftField('ticketId', event.target.value)
                  }
                  style={fieldStyle}
                />
              </div>
            )}

            <div style={wideFieldStyle}>
              <label style={labelStyle}>Comments</label>
              <textarea
                value={draft.comments}
                onChange={(event) =>
                  setDraftField('comments', event.target.value)
                }
                rows={4}
                style={fieldStyle}
              />
            </div>
          </div>
        )}
      </div>

      {draft.team === 'Calls' &&
        renderScorecard('QA Evaluation - Calls', callsMetrics)}
      {draft.team === 'Tickets' &&
        renderScorecard('QA Evaluation - Tickets', ticketsMetrics)}
      {draft.team === 'Sales' &&
        renderScorecard('QA Evaluation - Sales', salesMetrics)}

      <div style={actionRowStyle}>
        <button
          onClick={handleSave}
          disabled={saving || !draft.team}
          style={{
            ...primaryButton,
            opacity: !draft.team ? 0.72 : 1,
          }}
        >
          {saving ? 'Saving...' : 'Save Audit'}
        </button>

        <button
          type="button"
          onClick={() => {
            const nextTeam = draft.team;
            setIsAgentPickerOpen(false);
            setDraft(createEmptyDraft(nextTeam));
            setErrorMessage('');
            setSuccessMessage('Draft cleared.');
          }}
          disabled={saving}
          style={secondaryButton}
        >
          Clear Draft
        </button>
      </div>
    </div>
  );
}

const pageHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '16px',
  alignItems: 'flex-start',
  flexWrap: 'wrap' as const,
  marginBottom: '20px',
};

const panelStyle = {
  background: 'var(--screen-panel-bg)',
  border: '1px solid var(--screen-border)',
  borderRadius: '24px',
  padding: '22px',
  boxShadow: 'var(--screen-shadow)',
  backdropFilter: 'blur(14px)',
};

const sectionEyebrow = {
  color: 'var(--screen-accent)',
  fontSize: '12px',
  fontWeight: 800,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.16em',
  marginBottom: '12px',
};

const teamButtonRowStyle = {
  display: 'flex',
  gap: '10px',
  flexWrap: 'wrap' as const,
  marginBottom: '22px',
};

const teamButtonStyle = {
  padding: '12px 16px',
  borderRadius: '14px',
  border: '1px solid var(--screen-border-strong)',
  background: 'var(--screen-card-soft-bg)',
  color: 'var(--screen-text)',
  cursor: 'pointer',
  fontWeight: 700,
};

const activeTeamButtonStyle = {
  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
  color: '#ffffff',
  boxShadow: '0 10px 24px rgba(37, 99, 235, 0.25)',
};

const formGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
  gap: '16px',
};

const wideFieldStyle = {
  gridColumn: '1 / -1',
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
  color: 'var(--screen-field-text)',
};

const selectFieldStyle = {
  ...fieldStyle,
  appearance: 'none' as const,
  WebkitAppearance: 'none' as const,
  MozAppearance: 'none' as const,
  paddingRight: '44px',
  backgroundImage:
    'linear-gradient(45deg, transparent 50%, #cbd5e1 50%), linear-gradient(135deg, #cbd5e1 50%, transparent 50%)',
  backgroundPosition: 'calc(100% - 22px) calc(50% - 3px), calc(100% - 16px) calc(50% - 3px)',
  backgroundSize: '6px 6px, 6px 6px',
  backgroundRepeat: 'no-repeat',
  colorScheme: 'normal' as const,
};

const selectOptionStyle = {
  backgroundColor: 'var(--screen-select-option-bg)',
  color: 'var(--screen-select-option-text)',
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
  padding: '14px 18px',
  borderRadius: '16px',
  border: '1px solid rgba(96, 165, 250, 0.24)',
  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
  color: '#ffffff',
  fontWeight: 800,
  cursor: 'pointer',
  boxShadow: '0 16px 32px rgba(37, 99, 235, 0.28)',
};

const pickerButtonStyle = {
  width: '100%',
  padding: '14px 16px',
  borderRadius: '16px',
  border: '1px solid var(--screen-border-strong)',
  background: 'var(--screen-field-bg)',
  color: 'var(--screen-field-text)',
  textAlign: 'left' as const,
  cursor: 'pointer',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const pickerMenuStyle = {
  position: 'absolute' as const,
  top: 'calc(100% + 8px)',
  left: 0,
  right: 0,
  background: 'var(--screen-menu-bg)',
  border: '1px solid var(--screen-border-strong)',
  borderRadius: '18px',
  boxShadow: '0 18px 44px rgba(2, 6, 23, 0.45)',
  zIndex: 20,
  overflow: 'hidden',
  backdropFilter: 'blur(16px)',
};

const pickerSearchWrapStyle = {
  padding: '12px',
  borderBottom: '1px solid rgba(148, 163, 184, 0.12)',
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
  borderRadius: '12px',
  backgroundColor: 'var(--screen-soft-fill)',
  color: 'var(--screen-muted)',
};

const pickerErrorStyle = {
  padding: '12px',
  borderRadius: '12px',
  backgroundColor: 'rgba(127, 29, 29, 0.24)',
  color: '#fca5a5',
  border: '1px solid rgba(252, 165, 165, 0.24)',
};

const pickerOptionStyle = {
  padding: '12px 14px',
  borderRadius: '12px',
  border: '1px solid var(--screen-border)',
  backgroundColor: 'var(--screen-soft-fill)',
  textAlign: 'left' as const,
  cursor: 'pointer',
  color: 'var(--screen-text)',
  fontWeight: 600,
};

const pickerOptionActiveStyle = {
  border: '1px solid rgba(96, 165, 250, 0.36)',
  backgroundColor: 'rgba(30, 64, 175, 0.32)',
};

const infoCardStyle = {
  gridColumn: '1 / -1',
  borderRadius: '18px',
  padding: '18px',
  border: '1px solid var(--screen-border)',
  background: 'var(--screen-card-soft-bg)',
};

const infoLineStyle = {
  margin: '0 0 8px 0',
  color: 'var(--screen-text)',
};

const glassFieldCardStyle = {
  borderRadius: '18px',
  padding: '16px',
  border: '1px solid var(--screen-border)',
  background: 'var(--screen-card-soft-bg)',
};

const helpTextStyle = {
  marginTop: '8px',
  fontSize: '12px',
  color: 'var(--screen-muted)',
};

const metricCommentWrapStyle = {
  marginTop: '12px',
  display: 'grid',
  gap: '8px',
};

const metricCommentLabelStyle = {
  fontSize: '12px',
  color: '#93c5fd',
  fontWeight: 800,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.1em',
};

const metricCommentFieldStyle = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: '14px',
  border: '1px solid var(--screen-border-strong)',
  background: 'var(--screen-field-bg)',
  color: 'var(--screen-text)',
  resize: 'vertical' as const,
};

const warningBannerStyle = {
  marginTop: '18px',
  padding: '14px 16px',
  borderRadius: '16px',
  backgroundColor: 'rgba(127, 29, 29, 0.22)',
  border: '1px solid rgba(252, 165, 165, 0.24)',
  color: '#fecaca',
  fontWeight: 700,
};

const scoreCardStyle = {
  marginTop: '20px',
  borderRadius: '18px',
  padding: '18px',
  border: '1px solid rgba(96, 165, 250, 0.2)',
  background: 'var(--screen-highlight-bg)',
};

const scoreLabelStyle = {
  color: '#93c5fd',
  fontSize: '13px',
  fontWeight: 800,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.12em',
  marginBottom: '10px',
};

const scoreValueStyle = {
  fontSize: '36px',
  fontWeight: 800,
  color: 'var(--screen-heading)',
};


const actionRowStyle = {
  display: 'flex',
  gap: '10px',
  flexWrap: 'wrap' as const,
  marginTop: '24px',
};

const errorBannerStyle = {
  marginBottom: '16px',
  padding: '14px 16px',
  borderRadius: '16px',
  backgroundColor: 'rgba(127, 29, 29, 0.24)',
  border: '1px solid rgba(252, 165, 165, 0.24)',
  color: '#fecaca',
  fontWeight: 700,
};

const successBannerStyle = {
  marginBottom: '16px',
  padding: '14px 16px',
  borderRadius: '16px',
  backgroundColor: 'rgba(22, 101, 52, 0.24)',
  border: '1px solid rgba(134, 239, 172, 0.22)',
  color: '#bbf7d0',
  fontWeight: 700,
};

export default NewAuditSupabase;
