import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
type ScoreDetail = {
  metric: string;
  result: string;
  pass: number;
  borderline: number;
  adjustedWeight: number;
  earned: number;
};
type AuditItem = {
  id: string;
  agent_id: string;
  agent_name: string;
  team: 'Calls' | 'Tickets' | 'Sales';
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
  created_by_user_id?: string | null;
  created_by_name?: string | null;
  created_by_email?: string | null;
  created_by_role?: string | null;
};
type AgentProfile = {
  id: string;
  role: 'admin' | 'qa' | 'agent';
  agent_id: string | null;
  agent_name: string;
  display_name: string | null;
  team: 'Calls' | 'Tickets' | 'Sales' | null;
};
type CurrentProfile = { id: string; role: 'admin' | 'qa' | 'agent' | null };
type Metric = { name: string; pass: number; borderline: number };
type EditFormState = {
  team: 'Calls' | 'Tickets' | 'Sales' | '';
  caseType: string;
  auditDate: string;
  orderNumber: string;
  phoneNumber: string;
  ticketId: string;
  comments: string;
};
const LOCKED_NA_METRICS = new Set(['Active Listening']);
const AUTO_FAIL_METRICS = new Set(['Hold (≤3 mins)', 'Procedure']);
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
];
function AuditsListSupabase() {
  const [audits, setAudits] = useState<AuditItem[]>([]);
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [currentProfile, setCurrentProfile] = useState<CurrentProfile | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [releaseLoadingId, setReleaseLoadingId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [caseTypeFilter, setCaseTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingAuditId, setEditingAuditId] = useState<string | null>(null);
  const [selectedAgentProfileId, setSelectedAgentProfileId] = useState('');
  const [agentSearch, setAgentSearch] = useState('');
  const [isAgentPickerOpen, setIsAgentPickerOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [editForm, setEditForm] = useState<EditFormState>({
    team: '',
    caseType: '',
    auditDate: '',
    orderNumber: '',
    phoneNumber: '',
    ticketId: '',
    comments: '',
  });
  const [editScores, setEditScores] = useState<Record<string, string>>({});
  const agentPickerRef = useRef<HTMLDivElement | null>(null);
  const isAdmin = currentProfile?.role === 'admin';
  useEffect(() => {
    void loadAuditsAndProfiles();
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
  async function loadAuditsAndProfiles() {
    setLoading(true);
    setErrorMessage('');
    setSuccessMessage('');
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) {
      setLoading(false);
      setErrorMessage(authError.message);
      return;
    }
    const userId = authData.user?.id;
    const [auditsResult, profilesResult, currentProfileResult] =
      await Promise.all([
        supabase
          .from('audits')
          .select('*')
          .order('audit_date', { ascending: false }),
        supabase
          .from('profiles')
          .select('id, role, agent_id, agent_name, display_name, team')
          .eq('role', 'agent')
          .order('agent_name', { ascending: true }),
        userId
          ? supabase
              .from('profiles')
              .select('id, role')
              .eq('id', userId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
    setLoading(false);
    if (auditsResult.error) {
      setErrorMessage(auditsResult.error.message);
      return;
    }
    if (profilesResult.error) {
      setErrorMessage(profilesResult.error.message);
      return;
    }
    if (currentProfileResult.error) {
      setErrorMessage(currentProfileResult.error.message);
      return;
    }
    setAudits((auditsResult.data as AuditItem[]) || []);
    setProfiles((profilesResult.data as AgentProfile[]) || []);
    setCurrentProfile((currentProfileResult.data as CurrentProfile) || null);
  }
  function getMetricsForTeam(team: EditFormState['team']) {
    if (team === 'Calls') return callsMetrics;
    if (team === 'Tickets') return ticketsMetrics;
    if (team === 'Sales') return salesMetrics;
    return [];
  }
  function getMetricOptions(metricName: string) {
    if (LOCKED_NA_METRICS.has(metricName)) return ['N/A'];
    const options = ['N/A', 'Pass', 'Borderline', 'Fail'];
    if (AUTO_FAIL_METRICS.has(metricName)) options.push('Auto-Fail');
    return options;
  }
  function createDefaultScores(team: EditFormState['team']) {
    const defaults: Record<string, string> = {};
    getMetricsForTeam(team).forEach((metric) => {
      defaults[metric.name] = 'N/A';
    });
    return defaults;
  }
  function buildScoreMapFromAudit(audit: AuditItem) {
    const defaults = createDefaultScores(audit.team);
    (audit.score_details || []).forEach((item) => {
      defaults[item.metric] = item.result || 'N/A';
    });
    getMetricsForTeam(audit.team).forEach((metric) => {
      if (LOCKED_NA_METRICS.has(metric.name)) {
        defaults[metric.name] = 'N/A';
      }
    });
    return defaults;
  }
  function getAdjustedScoreData(
    team: EditFormState['team'],
    scores: Record<string, string>
  ) {
    const metrics = getMetricsForTeam(team);
    const activeMetrics = metrics.filter((item) => {
      const itemResult = LOCKED_NA_METRICS.has(item.name)
        ? 'N/A'
        : scores[item.name] || 'N/A';
      return itemResult !== 'N/A';
    });
    const activeTotalWeight = activeMetrics.reduce(
      (sum, item) => sum + item.pass,
      0
    );
    const fullTotalWeight = metrics.reduce((sum, item) => sum + item.pass, 0);
    const scoreDetails = metrics.map((metric) => {
      const result = LOCKED_NA_METRICS.has(metric.name)
        ? 'N/A'
        : scores[metric.name] || 'N/A';
      const adjustedWeight =
        result === 'N/A' || activeTotalWeight === 0
          ? 0
          : (metric.pass / activeTotalWeight) * fullTotalWeight;
      let earned = 0;
      if (result === 'Pass') {
        earned = adjustedWeight;
      } else if (result === 'Borderline') {
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
      };
    });
    const hasAutoFail = scoreDetails.some(
      (item) =>
        AUTO_FAIL_METRICS.has(item.metric) && item.result === 'Auto-Fail'
    );
    const qualityScore = hasAutoFail
      ? '0.00'
      : scoreDetails.reduce((sum, item) => sum + item.earned, 0).toFixed(2);
    return { scoreDetails, qualityScore, hasAutoFail };
  }
  function getAgentLabel(profile: AgentProfile) {
    return profile.display_name
      ? `${profile.agent_name} - ${profile.display_name}`
      : `${profile.agent_name} - ${profile.agent_id}`;
  }
  function getDisplayName(audit: AuditItem) {
    const matchedProfile = profiles.find(
      (profile) =>
        profile.agent_id === audit.agent_id &&
        profile.agent_name === audit.agent_name &&
        profile.team === audit.team
    );
    return matchedProfile?.display_name || null;
  }
  function getCreatedByLabel(audit: AuditItem) {
    return audit.created_by_name || audit.created_by_email || '-';
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
  const editTeamAgents = useMemo(() => {
    return profiles.filter(
      (profile) =>
        profile.role === 'agent' &&
        profile.team === editForm.team &&
        profile.agent_id &&
        profile.agent_name
    );
  }, [profiles, editForm.team]);
  const visibleAgents = useMemo(() => {
    const search = agentSearch.trim().toLowerCase();
    if (!search) return editTeamAgents;
    return editTeamAgents.filter((profile) => {
      const label = getAgentLabel(profile);
      return (
        profile.agent_name.toLowerCase().includes(search) ||
        (profile.agent_id || '').toLowerCase().includes(search) ||
        (profile.display_name || '').toLowerCase().includes(search) ||
        label.toLowerCase().includes(search)
      );
    });
  }, [editTeamAgents, agentSearch]);
  const selectedAgent =
    editTeamAgents.find((profile) => profile.id === selectedAgentProfileId) ||
    null;
  const filteredAudits = useMemo(() => {
    const search = searchText.trim().toLowerCase();
    return audits.filter((audit) => {
      const displayName = (getDisplayName(audit) || '').toLowerCase();
      const matchesSearch =
        !search ||
        audit.agent_name.toLowerCase().includes(search) ||
        audit.agent_id.toLowerCase().includes(search) ||
        displayName.includes(search);
      const matchesTeam = teamFilter ? audit.team === teamFilter : true;
      const matchesCaseType = caseTypeFilter
        ? audit.case_type === caseTypeFilter
        : true;
      const matchesDateFrom = dateFrom ? audit.audit_date >= dateFrom : true;
      const matchesDateTo = dateTo ? audit.audit_date <= dateTo : true;
      return (
        matchesSearch &&
        matchesTeam &&
        matchesCaseType &&
        matchesDateFrom &&
        matchesDateTo
      );
    });
  }, [
    audits,
    searchText,
    teamFilter,
    caseTypeFilter,
    dateFrom,
    dateTo,
    profiles,
  ]);
  const uniqueCaseTypes = Array.from(
    new Set(audits.map((audit) => audit.case_type))
  );
  const sharedFilteredCount = filteredAudits.filter(
    (item) => item.shared_with_agent
  ).length;
  const hiddenFilteredCount = filteredAudits.length - sharedFilteredCount;
  const sharedAllCount = audits.filter((item) => item.shared_with_agent).length;
  const hiddenAllCount = audits.length - sharedAllCount;
  function startEditAudit(audit: AuditItem) {
    if (!isAdmin) {
      setErrorMessage('Only admin can edit audits.');
      return;
    }
    const matchedProfile = profiles.find(
      (profile) =>
        profile.agent_id === audit.agent_id &&
        profile.agent_name === audit.agent_name &&
        profile.team === audit.team
    );
    setErrorMessage('');
    setSuccessMessage('');
    setEditingAuditId(audit.id);
    setExpandedId(audit.id);
    setSelectedAgentProfileId(matchedProfile?.id || '');
    setAgentSearch(matchedProfile ? getAgentLabel(matchedProfile) : '');
    setIsAgentPickerOpen(false);
    setEditForm({
      team: audit.team,
      caseType: audit.case_type,
      auditDate: audit.audit_date,
      orderNumber: audit.order_number || '',
      phoneNumber: audit.phone_number || '',
      ticketId: audit.ticket_id || '',
      comments: audit.comments || '',
    });
    setEditScores(buildScoreMapFromAudit(audit));
  }
  function cancelEdit() {
    setEditingAuditId(null);
    setSelectedAgentProfileId('');
    setAgentSearch('');
    setIsAgentPickerOpen(false);
    setEditForm({
      team: '',
      caseType: '',
      auditDate: '',
      orderNumber: '',
      phoneNumber: '',
      ticketId: '',
      comments: '',
    });
    setEditScores({});
  }
  function handleTeamChange(nextTeam: EditFormState['team']) {
    setEditForm((prev) => ({
      ...prev,
      team: nextTeam,
      orderNumber: '',
      phoneNumber: '',
      ticketId: '',
    }));
    setSelectedAgentProfileId('');
    setAgentSearch('');
    setIsAgentPickerOpen(false);
    setEditScores(createDefaultScores(nextTeam));
  }
  function handleSelectAgent(profile: AgentProfile) {
    setSelectedAgentProfileId(profile.id);
    setAgentSearch(getAgentLabel(profile));
    setIsAgentPickerOpen(false);
  }
  function handleScoreChange(metricName: string, value: string) {
    if (LOCKED_NA_METRICS.has(metricName)) {
      setEditScores((prev) => ({ ...prev, [metricName]: 'N/A' }));
      return;
    }
    setEditScores((prev) => ({ ...prev, [metricName]: value }));
  }
  async function handleUpdate(auditId: string) {
    setErrorMessage('');
    setSuccessMessage('');
    if (!isAdmin) {
      setErrorMessage('Only admin can save audit changes.');
      return;
    }
    if (!editForm.team) {
      setErrorMessage('Please choose a team.');
      return;
    }
    if (!selectedAgent) {
      setErrorMessage('Please choose an agent.');
      return;
    }
    if (!editForm.caseType || !editForm.auditDate) {
      setErrorMessage('Please fill Case Type and Audit Date.');
      return;
    }
    if (
      (editForm.team === 'Calls' || editForm.team === 'Sales') &&
      !editForm.orderNumber
    ) {
      setErrorMessage('Please fill Order Number for Calls and Sales.');
      return;
    }
    if (editForm.team === 'Tickets' && !editForm.ticketId) {
      setErrorMessage('Please fill Ticket ID for Tickets.');
      return;
    }
    if (!selectedAgent.agent_id) {
      setErrorMessage('Selected agent does not have an Agent ID.');
      return;
    }
    const adjustedData = getAdjustedScoreData(editForm.team, editScores);
    setSaving(true);
    const updatePayload = {
      agent_id: selectedAgent.agent_id,
      agent_name: selectedAgent.agent_name,
      team: editForm.team,
      case_type: editForm.caseType,
      audit_date: editForm.auditDate,
      order_number:
        editForm.team === 'Calls' || editForm.team === 'Sales'
          ? editForm.orderNumber
          : null,
      phone_number:
        editForm.team === 'Calls' || editForm.team === 'Sales'
          ? editForm.phoneNumber || null
          : null,
      ticket_id: editForm.team === 'Tickets' ? editForm.ticketId : null,
      quality_score: Number(adjustedData.qualityScore),
      comments: editForm.comments,
      score_details: adjustedData.scoreDetails,
    };
    const { error } = await supabase
      .from('audits')
      .update(updatePayload)
      .eq('id', auditId);
    setSaving(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    setAudits((prev) =>
      prev.map((item) =>
        item.id === auditId ? { ...item, ...updatePayload } : item
      )
    );
    setSuccessMessage('Audit updated successfully.');
    cancelEdit();
  }
  async function handleToggleShare(audit: AuditItem) {
    setErrorMessage('');
    setSuccessMessage('');
    if (!isAdmin) {
      setErrorMessage('Only admin can share or hide audits.');
      return;
    }
    const nextSharedValue = !audit.shared_with_agent;
    const confirmed = window.confirm(
      nextSharedValue
        ? 'Share this audit with the agent?'
        : 'Hide this audit from the agent?'
    );
    if (!confirmed) return;
    setReleaseLoadingId(audit.id);
    const nextSharedAt = nextSharedValue ? new Date().toISOString() : null;
    const { data, error } = await supabase
      .from('audits')
      .update({ shared_with_agent: nextSharedValue, shared_at: nextSharedAt })
      .eq('id', audit.id)
      .select('id, shared_with_agent, shared_at')
      .maybeSingle();
    setReleaseLoadingId(null);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    if (!data) {
      setErrorMessage('Share update did not persist in Supabase.');
      return;
    }
    setAudits((prev) =>
      prev.map((item) =>
        item.id === audit.id
          ? {
              ...item,
              shared_with_agent: data.shared_with_agent,
              shared_at: data.shared_at,
            }
          : item
      )
    );
    setSuccessMessage(
      data.shared_with_agent
        ? 'Audit shared with agent successfully.'
        : 'Audit hidden from agent successfully.'
    );
  }
  async function handleBulkShare(shareValue: boolean) {
    setErrorMessage('');
    setSuccessMessage('');
    if (!isAdmin) {
      setErrorMessage('Only admin can perform bulk release actions.');
      return;
    }
    if (filteredAudits.length === 0) {
      setErrorMessage('No audits match the current filters.');
      return;
    }
    const confirmed = window.confirm(
      shareValue
        ? `Share ${filteredAudits.length} filtered audits with agents?`
        : `Hide ${filteredAudits.length} filtered audits from agents?`
    );
    if (!confirmed) return;
    setBulkSaving(true);
    const ids = filteredAudits.map((item) => item.id);
    const nextSharedAt = shareValue ? new Date().toISOString() : null;
    const { data, error } = await supabase
      .from('audits')
      .update({ shared_with_agent: shareValue, shared_at: nextSharedAt })
      .in('id', ids)
      .select('id, shared_with_agent, shared_at');
    setBulkSaving(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    if (!data || data.length === 0) {
      setErrorMessage('Bulk share or hide did not persist in Supabase.');
      return;
    }
    const updatedMap = new Map(
      data.map((row) => [
        row.id,
        { shared_with_agent: row.shared_with_agent, shared_at: row.shared_at },
      ])
    );
    setAudits((prev) =>
      prev.map((item) => {
        const updated = updatedMap.get(item.id);
        return updated ? { ...item, ...updated } : item;
      })
    );
    setSuccessMessage(
      shareValue
        ? `${data.length} filtered audit(s) shared successfully.`
        : `${data.length} filtered audit(s) hidden successfully.`
    );
  }
  async function handleHideAllAudits() {
    setErrorMessage('');
    setSuccessMessage('');
    if (!isAdmin) {
      setErrorMessage('Only admin can hide all audits.');
      return;
    }
    if (audits.length === 0) {
      setErrorMessage('There are no audits to hide.');
      return;
    }
    const confirmed = window.confirm(
      `Hide all ${audits.length} audits from agents? This ignores the current filters.`
    );
    if (!confirmed) return;
    setBulkSaving(true);
    const ids = audits.map((item) => item.id);
    const { data, error } = await supabase
      .from('audits')
      .update({ shared_with_agent: false, shared_at: null })
      .in('id', ids)
      .select('id, shared_with_agent, shared_at');
    setBulkSaving(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    if (!data || data.length === 0) {
      setErrorMessage('Hide all did not persist in Supabase.');
      return;
    }
    const updatedMap = new Map(
      data.map((row) => [
        row.id,
        { shared_with_agent: row.shared_with_agent, shared_at: row.shared_at },
      ])
    );
    setAudits((prev) =>
      prev.map((item) => {
        const updated = updatedMap.get(item.id);
        return updated ? { ...item, ...updated } : item;
      })
    );
    setSuccessMessage(`${data.length} audit(s) hidden successfully.`);
  }
  async function handleDelete(auditId: string) {
    setErrorMessage('');
    setSuccessMessage('');
    if (!isAdmin) {
      setErrorMessage('Only admin can delete audits.');
      return;
    }
    const confirmed = window.confirm('Delete this audit?');
    if (!confirmed) return;
    const { error } = await supabase.from('audits').delete().eq('id', auditId);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    setAudits((prev) => prev.filter((item) => item.id !== auditId));
    if (expandedId === auditId) setExpandedId(null);
    if (editingAuditId === auditId) cancelEdit();
    setSuccessMessage('Audit deleted successfully.');
  }
  function getResultBadgeColor(result: string) {
    if (result === 'Pass') return '#166534';
    if (result === 'Borderline') return '#92400e';
    if (result === 'Fail' || result === 'Auto-Fail') return '#991b1b';
    if (result === 'N/A') return '#374151';
    return '#1f2937';
  }
  if (loading) {
    return <div style={{ color: '#cbd5e1' }}>Loading audits...</div>;
  }
  return (
    <div style={{ color: '#e5eefb' }}>
      {' '}
      <div style={pageHeaderStyle}>
        {' '}
        <div>
          {' '}
          <div style={sectionEyebrow}>Audit Management</div>{' '}
          <h2 style={{ marginBottom: '8px' }}>Audits List</h2>{' '}
          <p style={{ margin: 0, color: '#94a3b8' }}>
            {' '}
            QA can view audits and score details. Only admin can edit, delete,
            or release audits.{' '}
          </p>{' '}
        </div>{' '}
        <button
          type="button"
          onClick={() => void loadAuditsAndProfiles()}
          style={secondaryButton}
        >
          {' '}
          Refresh{' '}
        </button>{' '}
      </div>{' '}
      {errorMessage ? <div style={errorBanner}>{errorMessage}</div> : null}{' '}
      {successMessage ? (
        <div style={successBanner}>{successMessage}</div>
      ) : null}{' '}
      <div style={panelStyle}>
        {' '}
        <div style={filterGridStyle}>
          {' '}
          <div>
            {' '}
            <label style={labelStyle}>
              {' '}
              Search by Agent Name, Display Name, or Agent ID{' '}
            </label>{' '}
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={fieldStyle}
            />{' '}
          </div>{' '}
          <div>
            {' '}
            <label style={labelStyle}>Filter by Team</label>{' '}
            <select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              style={fieldStyle}
            >
              {' '}
              <option value="">All Teams</option>{' '}
              <option value="Calls">Calls</option>{' '}
              <option value="Tickets">Tickets</option>{' '}
              <option value="Sales">Sales</option>{' '}
            </select>{' '}
          </div>{' '}
          <div>
            {' '}
            <label style={labelStyle}>Filter by Case Type</label>{' '}
            <select
              value={caseTypeFilter}
              onChange={(e) => setCaseTypeFilter(e.target.value)}
              style={fieldStyle}
            >
              {' '}
              <option value="">All Case Types</option>{' '}
              {uniqueCaseTypes.map((caseType) => (
                <option key={caseType} value={caseType}>
                  {' '}
                  {caseType}{' '}
                </option>
              ))}{' '}
            </select>{' '}
          </div>{' '}
          <div>
            {' '}
            <label style={labelStyle}>Date From</label>{' '}
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              style={fieldStyle}
            />{' '}
          </div>{' '}
          <div>
            {' '}
            <label style={labelStyle}>Date To</label>{' '}
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              style={fieldStyle}
            />{' '}
          </div>{' '}
        </div>{' '}
      </div>{' '}
      {isAdmin ? (
        <div style={{ ...panelStyle, marginTop: '18px' }}>
          {' '}
          <h3 style={{ marginTop: 0, color: '#f8fafc' }}>
            {' '}
            Weekly Release Controls{' '}
          </h3>{' '}
          <p style={{ color: '#94a3b8' }}>
            {' '}
            Use the filters above to choose the week, team, or case type, then
            share or hide filtered audits, or hide all audits at once.{' '}
          </p>{' '}
          <p>
            {' '}
            <strong>Filtered Audits:</strong> {filteredAudits.length}{' '}
          </p>{' '}
          <p>
            {' '}
            <strong>Already Shared (Filtered):</strong> {sharedFilteredCount}{' '}
          </p>{' '}
          <p>
            {' '}
            <strong>Still Hidden (Filtered):</strong> {hiddenFilteredCount}{' '}
          </p>{' '}
          <p>
            {' '}
            <strong>Total Audits:</strong> {audits.length}{' '}
          </p>{' '}
          <p>
            {' '}
            <strong>Already Shared (All):</strong> {sharedAllCount}{' '}
          </p>{' '}
          <p>
            {' '}
            <strong>Already Hidden (All):</strong> {hiddenAllCount}{' '}
          </p>{' '}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {' '}
            <button
              onClick={() => void handleBulkShare(true)}
              disabled={bulkSaving || filteredAudits.length === 0}
              style={primaryButton}
            >
              {' '}
              {bulkSaving ? 'Working...' : 'Share Filtered Audits'}{' '}
            </button>{' '}
            <button
              onClick={() => void handleBulkShare(false)}
              disabled={bulkSaving || filteredAudits.length === 0}
              style={dangerButton}
            >
              {' '}
              {bulkSaving ? 'Working...' : 'Hide Filtered Audits'}{' '}
            </button>{' '}
            <button
              onClick={() => void handleHideAllAudits()}
              disabled={bulkSaving || audits.length === 0}
              style={dangerButton}
            >
              {' '}
              {bulkSaving ? 'Working...' : 'Hide All Audits'}{' '}
            </button>{' '}
          </div>{' '}
        </div>
      ) : (
        <div style={infoBanner}>
          {' '}
          QA view is read-only on this page. Only admin can edit, delete, or
          release audits.{' '}
        </div>
      )}{' '}
      {filteredAudits.length === 0 ? (
        <p style={{ color: '#94a3b8', marginTop: '18px' }}>No audits found.</p>
      ) : (
        <div style={auditTableWrapStyle}>
          {' '}
          <div style={auditTableStyle}>
            {' '}
            <div style={{ ...auditRowStyle, ...auditHeaderRowStyle }}>
              {' '}
              <div style={auditCellAgentStyle}>Agent</div>{' '}
              <div style={auditCellDateStyle}>Audit Date</div>{' '}
              <div style={auditCellCaseStyle}>Case Type</div>{' '}
              <div style={auditCellReferenceStyle}>Reference</div>{' '}
              <div style={auditCellScoreStyle}>Quality</div>{' '}
              <div style={auditCellReleaseStyle}>Release</div>{' '}
              <div style={auditCellCreatorStyle}>Created By</div>{' '}
              <div style={auditCellCommentsStyle}>Comments</div>{' '}
              <div style={auditCellActionsStyle}>Actions</div>{' '}
            </div>{' '}
            {filteredAudits.map((audit) => {
              const isEditing = editingAuditId === audit.id;
              const isExpanded = expandedId === audit.id || isEditing;
              const adjustedEditData = isEditing
                ? getAdjustedScoreData(editForm.team, editScores)
                : null;
              return (
                <div key={audit.id} style={auditEntryStyle}>
                  {' '}
                  <div style={auditRowStyle}>
                    {' '}
                    <div style={auditCellAgentStyle}>
                      {' '}
                      <div style={primaryCellTextStyle}>
                        {audit.agent_name}
                      </div>{' '}
                      <div style={secondaryCellTextStyle}>
                        {' '}
                        {getDisplayName(audit) || '-'} • {audit.agent_id} •{' '}
                        {audit.team}{' '}
                      </div>{' '}
                    </div>{' '}
                    <div style={auditCellDateStyle}>
                      {' '}
                      <div style={primaryCellTextStyle}>
                        {' '}
                        {formatDateOnly(audit.audit_date)}{' '}
                      </div>{' '}
                    </div>{' '}
                    <div style={auditCellCaseStyle}>
                      {' '}
                      <div style={primaryCellTextStyle}>
                        {audit.case_type}
                      </div>{' '}
                    </div>{' '}
                    <div style={auditCellReferenceStyle}>
                      {' '}
                      <div style={primaryCellTextStyle}>
                        {' '}
                        {getAuditReference(audit)}{' '}
                      </div>{' '}
                    </div>{' '}
                    <div style={auditCellScoreStyle}>
                      {' '}
                      <span style={scorePillStyle}>
                        {' '}
                        {Number(audit.quality_score).toFixed(2)}%{' '}
                      </span>{' '}
                    </div>{' '}
                    <div style={auditCellReleaseStyle}>
                      {' '}
                      <span
                        style={{
                          ...pillStyle,
                          backgroundColor: audit.shared_with_agent
                            ? '#166534'
                            : '#475569',
                        }}
                      >
                        {' '}
                        {audit.shared_with_agent ? 'Shared' : 'Hidden'}{' '}
                      </span>{' '}
                      <div style={secondaryCellTextStyle}>
                        {' '}
                        {formatDate(audit.shared_at)}{' '}
                      </div>{' '}
                    </div>{' '}
                    <div style={auditCellCreatorStyle}>
                      {' '}
                      <div style={primaryCellTextStyle}>
                        {' '}
                        {getCreatedByLabel(audit)}{' '}
                      </div>{' '}
                      <div style={secondaryCellTextStyle}>
                        {' '}
                        {audit.created_by_role || '-'}{' '}
                      </div>{' '}
                    </div>{' '}
                    <div style={auditCellCommentsStyle}>
                      {' '}
                      <div style={primaryCellTextStyle}>
                        {' '}
                        {getCommentsPreview(audit.comments)}{' '}
                      </div>{' '}
                    </div>{' '}
                    <div style={auditCellActionsStyle}>
                      {' '}
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedId(
                            expandedId === audit.id ? null : audit.id
                          )
                        }
                        style={miniSecondaryButton}
                      >
                        {' '}
                        {isExpanded ? 'Hide' : 'Details'}{' '}
                      </button>{' '}
                      {isAdmin ? (
                        <>
                          {' '}
                          <button
                            type="button"
                            onClick={() => void handleToggleShare(audit)}
                            disabled={
                              releaseLoadingId === audit.id ||
                              saving ||
                              bulkSaving
                            }
                            style={
                              audit.shared_with_agent
                                ? miniDangerButton
                                : miniPrimaryButton
                            }
                          >
                            {' '}
                            {releaseLoadingId === audit.id
                              ? '...'
                              : audit.shared_with_agent
                              ? 'Hide'
                              : 'Share'}{' '}
                          </button>{' '}
                          {!isEditing ? (
                            <button
                              type="button"
                              onClick={() => startEditAudit(audit)}
                              style={miniSecondaryButton}
                            >
                              {' '}
                              Edit{' '}
                            </button>
                          ) : null}{' '}
                          <button
                            type="button"
                            onClick={() => void handleDelete(audit.id)}
                            style={miniDangerButton}
                          >
                            {' '}
                            Delete{' '}
                          </button>{' '}
                        </>
                      ) : null}{' '}
                    </div>{' '}
                  </div>{' '}
                  {isExpanded ? (
                    <div style={auditExpandedRowStyle}>
                      {' '}
                      {isEditing && isAdmin ? (
                        <div style={expandedPanelStyle}>
                          {' '}
                          <div style={sectionEyebrow}>Edit Audit</div>{' '}
                          <div style={editGridStyle}>
                            {' '}
                            <div>
                              {' '}
                              <label style={labelStyle}>Team</label>{' '}
                              <select
                                value={editForm.team}
                                onChange={(e) =>
                                  handleTeamChange(
                                    e.target.value as EditFormState['team']
                                  )
                                }
                                style={fieldStyle}
                              >
                                {' '}
                                <option value="">Select Team</option>{' '}
                                <option value="Calls">Calls</option>{' '}
                                <option value="Tickets">Tickets</option>{' '}
                                <option value="Sales">Sales</option>{' '}
                              </select>{' '}
                            </div>{' '}
                            <div style={{ gridColumn: '1 / -1' }}>
                              {' '}
                              <label style={labelStyle}>Agent</label>{' '}
                              <div
                                ref={agentPickerRef}
                                style={{ position: 'relative' }}
                              >
                                {' '}
                                <button
                                  type="button"
                                  onClick={() =>
                                    setIsAgentPickerOpen((prev) => !prev)
                                  }
                                  style={pickerButtonStyle}
                                >
                                  {' '}
                                  <span
                                    style={{
                                      color: selectedAgent
                                        ? '#f8fafc'
                                        : '#94a3b8',
                                    }}
                                  >
                                    {' '}
                                    {selectedAgent
                                      ? getAgentLabel(selectedAgent)
                                      : 'Select agent'}{' '}
                                  </span>{' '}
                                  <span>▼</span>{' '}
                                </button>{' '}
                                {isAgentPickerOpen && (
                                  <div style={pickerMenuStyle}>
                                    {' '}
                                    <div style={pickerSearchWrapStyle}>
                                      {' '}
                                      <input
                                        type="text"
                                        value={agentSearch}
                                        onChange={(e) =>
                                          setAgentSearch(e.target.value)
                                        }
                                        placeholder="Search by name, ID, or display name"
                                        style={fieldStyle}
                                      />{' '}
                                    </div>{' '}
                                    <div style={pickerListStyle}>
                                      {' '}
                                      {visibleAgents.length === 0 ? (
                                        <div style={pickerInfoStyle}>
                                          {' '}
                                          No agents found{' '}
                                        </div>
                                      ) : (
                                        visibleAgents.map((profile) => (
                                          <button
                                            key={profile.id}
                                            type="button"
                                            onClick={() =>
                                              handleSelectAgent(profile)
                                            }
                                            style={{
                                              ...pickerOptionStyle,
                                              ...(selectedAgentProfileId ===
                                              profile.id
                                                ? pickerOptionActiveStyle
                                                : {}),
                                            }}
                                          >
                                            {' '}
                                            {getAgentLabel(profile)}{' '}
                                          </button>
                                        ))
                                      )}{' '}
                                    </div>{' '}
                                  </div>
                                )}{' '}
                              </div>{' '}
                            </div>{' '}
                            <div>
                              {' '}
                              <label style={labelStyle}>Case Type</label>{' '}
                              <input
                                value={editForm.caseType}
                                onChange={(e) =>
                                  setEditForm((prev) => ({
                                    ...prev,
                                    caseType: e.target.value,
                                  }))
                                }
                                style={fieldStyle}
                              />{' '}
                            </div>{' '}
                            <div>
                              {' '}
                              <label style={labelStyle}>Audit Date</label>{' '}
                              <input
                                type="date"
                                value={editForm.auditDate}
                                onChange={(e) =>
                                  setEditForm((prev) => ({
                                    ...prev,
                                    auditDate: e.target.value,
                                  }))
                                }
                                style={fieldStyle}
                              />{' '}
                            </div>{' '}
                            {(editForm.team === 'Calls' ||
                              editForm.team === 'Sales') && (
                              <>
                                {' '}
                                <div>
                                  {' '}
                                  <label style={labelStyle}>
                                    Order Number
                                  </label>{' '}
                                  <input
                                    value={editForm.orderNumber}
                                    onChange={(e) =>
                                      setEditForm((prev) => ({
                                        ...prev,
                                        orderNumber: e.target.value,
                                      }))
                                    }
                                    style={fieldStyle}
                                  />{' '}
                                </div>{' '}
                                <div>
                                  {' '}
                                  <label style={labelStyle}>
                                    Phone Number
                                  </label>{' '}
                                  <input
                                    value={editForm.phoneNumber}
                                    onChange={(e) =>
                                      setEditForm((prev) => ({
                                        ...prev,
                                        phoneNumber: e.target.value,
                                      }))
                                    }
                                    style={fieldStyle}
                                  />{' '}
                                </div>{' '}
                              </>
                            )}{' '}
                            {editForm.team === 'Tickets' && (
                              <div>
                                {' '}
                                <label style={labelStyle}>Ticket ID</label>{' '}
                                <input
                                  value={editForm.ticketId}
                                  onChange={(e) =>
                                    setEditForm((prev) => ({
                                      ...prev,
                                      ticketId: e.target.value,
                                    }))
                                  }
                                  style={fieldStyle}
                                />{' '}
                              </div>
                            )}{' '}
                            <div style={{ gridColumn: '1 / -1' }}>
                              {' '}
                              <label style={labelStyle}>Comments</label>{' '}
                              <textarea
                                value={editForm.comments}
                                onChange={(e) =>
                                  setEditForm((prev) => ({
                                    ...prev,
                                    comments: e.target.value,
                                  }))
                                }
                                rows={4}
                                style={fieldStyle}
                              />{' '}
                            </div>{' '}
                          </div>{' '}
                          <div
                            style={{
                              marginTop: '18px',
                              display: 'grid',
                              gap: '12px',
                            }}
                          >
                            {' '}
                            {getMetricsForTeam(editForm.team).map((metric) => (
                              <div key={metric.name} style={scoreRowStyle}>
                                {' '}
                                <div
                                  style={{ color: '#cbd5e1', fontWeight: 700 }}
                                >
                                  {' '}
                                  {metric.name} ({metric.pass} pts){' '}
                                </div>{' '}
                                <select
                                  value={
                                    LOCKED_NA_METRICS.has(metric.name)
                                      ? 'N/A'
                                      : editScores[metric.name] || 'N/A'
                                  }
                                  onChange={(e) =>
                                    handleScoreChange(
                                      metric.name,
                                      e.target.value
                                    )
                                  }
                                  disabled={LOCKED_NA_METRICS.has(metric.name)}
                                  style={compactFieldStyle}
                                >
                                  {' '}
                                  {getMetricOptions(metric.name).map(
                                    (option) => (
                                      <option key={option} value={option}>
                                        {' '}
                                        {option}{' '}
                                      </option>
                                    )
                                  )}{' '}
                                </select>{' '}
                              </div>
                            ))}{' '}
                          </div>{' '}
                          {adjustedEditData ? (
                            <div style={editSummaryStyle}>
                              {' '}
                              <div style={summaryEyebrowStyle}>
                                {' '}
                                Updated Score Preview{' '}
                              </div>{' '}
                              <div style={summaryScoreStyle}>
                                {' '}
                                {adjustedEditData.qualityScore}%{' '}
                              </div>{' '}
                            </div>
                          ) : null}{' '}
                          <div
                            style={{
                              marginTop: '18px',
                              display: 'flex',
                              gap: '10px',
                              flexWrap: 'wrap',
                            }}
                          >
                            {' '}
                            <button
                              type="button"
                              onClick={() => void handleUpdate(audit.id)}
                              disabled={saving}
                              style={primaryButton}
                            >
                              {' '}
                              {saving ? 'Saving...' : 'Save Changes'}{' '}
                            </button>{' '}
                            <button
                              type="button"
                              onClick={cancelEdit}
                              style={secondaryButton}
                            >
                              {' '}
                              Cancel Edit{' '}
                            </button>{' '}
                          </div>{' '}
                        </div>
                      ) : (
                        <div style={expandedPanelStyle}>
                          {' '}
                          <div style={sectionEyebrow}>Audit Details</div>{' '}
                          <div style={detailInfoGridStyle}>
                            {' '}
                            <div style={detailInfoCardStyle}>
                              {' '}
                              <div style={detailLabelStyle}>
                                Created By
                              </div>{' '}
                              <div style={detailValueStyle}>
                                {' '}
                                {getCreatedByLabel(audit)}{' '}
                              </div>{' '}
                              <div style={detailSubValueStyle}>
                                {' '}
                                {audit.created_by_role || '-'}{' '}
                              </div>{' '}
                            </div>{' '}
                            <div style={detailInfoCardStyle}>
                              {' '}
                              <div style={detailLabelStyle}>
                                Creator Email
                              </div>{' '}
                              <div style={detailValueStyle}>
                                {' '}
                                {audit.created_by_email || '-'}{' '}
                              </div>{' '}
                            </div>{' '}
                            <div style={detailInfoCardStyle}>
                              {' '}
                              <div style={detailLabelStyle}>Reference</div>{' '}
                              <div style={detailValueStyle}>
                                {' '}
                                {getAuditReference(audit)}{' '}
                              </div>{' '}
                            </div>{' '}
                            <div style={detailInfoCardStyle}>
                              {' '}
                              <div style={detailLabelStyle}>
                                Release Date
                              </div>{' '}
                              <div style={detailValueStyle}>
                                {' '}
                                {formatDate(audit.shared_at)}{' '}
                              </div>{' '}
                            </div>{' '}
                          </div>{' '}
                          <div style={fullCommentCardStyle}>
                            {' '}
                            <div style={detailLabelStyle}>
                              Full Comment
                            </div>{' '}
                            <div style={fullCommentTextStyle}>
                              {' '}
                              {audit.comments?.trim() || '-'}{' '}
                            </div>{' '}
                          </div>{' '}
                          <div style={{ ...sectionEyebrow, marginTop: '18px' }}>
                            {' '}
                            Score Details{' '}
                          </div>{' '}
                          <div style={{ display: 'grid', gap: '10px' }}>
                            {' '}
                            {(audit.score_details || []).map((detail) => (
                              <div
                                key={`${audit.id}-${detail.metric}`}
                                style={detailRowStyle}
                              >
                                {' '}
                                <div>
                                  {' '}
                                  <div
                                    style={{
                                      color: '#f8fafc',
                                      fontWeight: 700,
                                    }}
                                  >
                                    {' '}
                                    {detail.metric}{' '}
                                  </div>{' '}
                                  <div
                                    style={{
                                      color: '#94a3b8',
                                      fontSize: '12px',
                                      marginTop: '4px',
                                    }}
                                  >
                                    {' '}
                                    Pass {detail.pass} • Borderline{' '}
                                    {detail.borderline} • Adjusted{' '}
                                    {detail.adjustedWeight.toFixed(2)}{' '}
                                  </div>{' '}
                                </div>{' '}
                                <span
                                  style={{
                                    ...pillStyle,
                                    backgroundColor: getResultBadgeColor(
                                      detail.result
                                    ),
                                  }}
                                >
                                  {' '}
                                  {detail.result}{' '}
                                </span>{' '}
                              </div>
                            ))}{' '}
                          </div>{' '}
                        </div>
                      )}{' '}
                    </div>
                  ) : null}{' '}
                </div>
              );
            })}{' '}
          </div>{' '}
        </div>
      )}{' '}
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
  textTransform: 'uppercase' as const,
  letterSpacing: '0.16em',
  marginBottom: '12px',
};
const panelStyle = {
  background:
    'linear-gradient(180deg, rgba(15,23,42,0.82) 0%, rgba(15,23,42,0.68) 100%)',
  border: '1px solid rgba(148,163,184,0.14)',
  borderRadius: '24px',
  padding: '22px',
  boxShadow: '0 18px 40px rgba(2,6,23,0.35)',
  backdropFilter: 'blur(14px)',
};
const filterGridStyle = {
  display: 'grid',
  gap: '14px',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
};
const labelStyle = {
  display: 'block',
  marginBottom: '8px',
  fontSize: '13px',
  color: '#cbd5e1',
  fontWeight: 700,
};
const fieldStyle = {
  width: '100%',
  padding: '14px 16px',
  borderRadius: '16px',
  border: '1px solid rgba(148,163,184,0.16)',
  background: 'rgba(15,23,42,0.7)',
  color: '#e5eefb',
};
const compactFieldStyle = {
  padding: '10px 12px',
  borderRadius: '12px',
  border: '1px solid rgba(148,163,184,0.16)',
  background: 'rgba(15,23,42,0.7)',
  color: '#e5eefb',
  minWidth: '170px',
};
const secondaryButton = {
  padding: '12px 16px',
  background: 'rgba(15,23,42,0.74)',
  color: '#e5eefb',
  border: '1px solid rgba(148,163,184,0.18)',
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
const dangerButton = {
  padding: '12px 16px',
  background: 'linear-gradient(135deg, #b91c1c 0%, #991b1b 100%)',
  color: '#ffffff',
  border: '1px solid rgba(252,165,165,0.2)',
  borderRadius: '14px',
  cursor: 'pointer',
  fontWeight: 700,
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
const miniPrimaryButton = {
  padding: '8px 10px',
  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
  color: '#ffffff',
  border: '1px solid rgba(96,165,250,0.24)',
  borderRadius: '10px',
  cursor: 'pointer',
  fontWeight: 700,
  fontSize: '12px',
};
const miniDangerButton = {
  padding: '8px 10px',
  background: 'linear-gradient(135deg, #b91c1c 0%, #991b1b 100%)',
  color: '#ffffff',
  border: '1px solid rgba(252,165,165,0.2)',
  borderRadius: '10px',
  cursor: 'pointer',
  fontWeight: 700,
  fontSize: '12px',
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
const infoBanner = {
  backgroundColor: 'rgba(30,64,175,0.18)',
  border: '1px solid rgba(147,197,253,0.22)',
  borderRadius: '16px',
  padding: '16px',
  marginBottom: '24px',
  color: '#bfdbfe',
  marginTop: '18px',
};
const auditTableWrapStyle = {
  marginTop: '18px',
  overflowX: 'auto' as const,
  borderRadius: '20px',
  border: '1px solid rgba(148,163,184,0.12)',
  background:
    'linear-gradient(180deg, rgba(15,23,42,0.76) 0%, rgba(15,23,42,0.58) 100%)',
};
const auditTableStyle = { minWidth: '1800px' };
const auditEntryStyle = { borderBottom: '1px solid rgba(148,163,184,0.08)' };
const auditRowStyle = {
  display: 'grid',
  gridTemplateColumns:
    '220px 130px 170px minmax(240px,1.35fr) 110px 180px 180px minmax(300px,1.8fr) 260px',
  gap: '14px',
  alignItems: 'center',
  padding: '14px 16px',
};
const auditHeaderRowStyle = {
  position: 'sticky' as const,
  top: 0,
  zIndex: 1,
  background: 'rgba(2,6,23,0.94)',
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
const auditCellCreatorStyle = {};
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
  lineHeight: 1.4,
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
const pillStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '6px 10px',
  borderRadius: '999px',
  fontSize: '12px',
  fontWeight: 800,
  color: '#ffffff',
};
const auditExpandedRowStyle = { padding: '0 16px 16px 16px' };
const expandedPanelStyle = {
  borderRadius: '18px',
  border: '1px solid rgba(148,163,184,0.12)',
  background:
    'linear-gradient(180deg, rgba(15,23,42,0.78) 0%, rgba(15,23,42,0.6) 100%)',
  padding: '18px',
};
const editGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '14px',
};
const detailInfoGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '12px',
  marginBottom: '18px',
};
const detailInfoCardStyle = {
  borderRadius: '14px',
  border: '1px solid rgba(148,163,184,0.12)',
  background: 'rgba(15,23,42,0.52)',
  padding: '14px 16px',
};
const detailLabelStyle = {
  color: '#94a3b8',
  fontSize: '12px',
  fontWeight: 700,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.08em',
  marginBottom: '8px',
};
const detailValueStyle = {
  color: '#f8fafc',
  fontSize: '14px',
  fontWeight: 700,
  lineHeight: 1.5,
};
const detailSubValueStyle = {
  color: '#64748b',
  fontSize: '12px',
  fontWeight: 600,
  marginTop: '6px',
};
const fullCommentCardStyle = {
  borderRadius: '14px',
  border: '1px solid rgba(148,163,184,0.12)',
  background: 'rgba(15,23,42,0.52)',
  padding: '14px 16px',
};
const fullCommentTextStyle = {
  color: '#f8fafc',
  fontSize: '14px',
  lineHeight: 1.7,
  whiteSpace: 'pre-wrap' as const,
  wordBreak: 'break-word' as const,
};
const pickerButtonStyle = {
  width: '100%',
  padding: '14px 16px',
  borderRadius: '16px',
  border: '1px solid rgba(148,163,184,0.16)',
  background: 'rgba(15,23,42,0.7)',
  color: '#e5eefb',
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
  background: 'rgba(15,23,42,0.96)',
  border: '1px solid rgba(148,163,184,0.16)',
  borderRadius: '18px',
  boxShadow: '0 18px 44px rgba(2,6,23,0.45)',
  zIndex: 20,
  overflow: 'hidden',
  backdropFilter: 'blur(16px)',
};
const pickerSearchWrapStyle = {
  padding: '12px',
  borderBottom: '1px solid rgba(148,163,184,0.12)',
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
  backgroundColor: 'rgba(15,23,42,0.68)',
  color: '#94a3b8',
};
const pickerOptionStyle = {
  padding: '12px 14px',
  borderRadius: '12px',
  border: '1px solid rgba(148,163,184,0.12)',
  backgroundColor: 'rgba(15,23,42,0.6)',
  textAlign: 'left' as const,
  cursor: 'pointer',
  color: '#e5eefb',
  fontWeight: 600,
};
const pickerOptionActiveStyle = {
  border: '1px solid rgba(96,165,250,0.36)',
  backgroundColor: 'rgba(30,64,175,0.32)',
};
const scoreRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '12px',
  alignItems: 'center',
  flexWrap: 'wrap' as const,
  padding: '12px 14px',
  borderRadius: '14px',
  border: '1px solid rgba(148,163,184,0.12)',
  background: 'rgba(15,23,42,0.52)',
};
const editSummaryStyle = {
  marginTop: '18px',
  borderRadius: '18px',
  padding: '18px',
  border: '1px solid rgba(96,165,250,0.2)',
  background:
    'linear-gradient(135deg, rgba(30,64,175,0.22) 0%, rgba(15,23,42,0.5) 100%)',
};
const summaryEyebrowStyle = {
  color: '#93c5fd',
  fontWeight: 800,
  textTransform: 'uppercase' as const,
  fontSize: '12px',
  letterSpacing: '0.12em',
};
const summaryScoreStyle = {
  fontSize: '32px',
  fontWeight: 800,
  color: '#f8fafc',
  marginTop: '8px',
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
export default AuditsListSupabase;
