import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

type ProfileRole = 'admin' | 'qa' | 'agent' | 'supervisor';
type TeamName = 'Calls' | 'Tickets' | 'Sales';

type SupervisorRequest = {
  id: string;
  case_reference: string;
  agent_id: string | null;
  agent_name: string | null;
  display_name?: string | null;
  team: TeamName | null;
  case_type: string;
  supervisor_name: string;
  priority: 'Low' | 'Medium' | 'High' | 'Urgent';
  request_note: string;
  status: 'Open' | 'Under Review' | 'Closed';
  created_at: string;
};

type AgentProfile = {
  id: string;
  role: 'agent';
  agent_id: string | null;
  agent_name: string;
  display_name: string | null;
  team: TeamName | null;
};

type CurrentUser = {
  id: string;
  role: ProfileRole;
  agent_name: string;
  display_name: string | null;
  team: TeamName | null;
  email: string;
};

type SupervisorRequestsSupabaseProps = {
  currentUser?: CurrentUser | null;
};

function SupervisorRequestsSupabase({
  currentUser = null,
}: SupervisorRequestsSupabaseProps) {
  const [requests, setRequests] = useState<SupervisorRequest[]>([]);
  const [agentProfiles, setAgentProfiles] = useState<AgentProfile[]>([]);
  const [currentProfile, setCurrentProfile] = useState<CurrentUser | null>(
    currentUser
  );
  const [loading, setLoading] = useState(true);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusSavingId, setStatusSavingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [agentLoadError, setAgentLoadError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [caseReference, setCaseReference] = useState('');
  const [selectedAgentProfileId, setSelectedAgentProfileId] = useState('');
  const [agentSearch, setAgentSearch] = useState('');
  const [isAgentPickerOpen, setIsAgentPickerOpen] = useState(false);
  const [caseType, setCaseType] = useState('');
  const [supervisorName, setSupervisorName] = useState(
    currentUser?.display_name || currentUser?.agent_name || ''
  );
  const [priority, setPriority] = useState<
    'Low' | 'Medium' | 'High' | 'Urgent'
  >('Medium');
  const [requestNote, setRequestNote] = useState('');

  const agentPickerRef = useRef<HTMLDivElement | null>(null);

  const viewerProfile = currentUser ?? currentProfile;
  const isAdmin = viewerProfile?.role === 'admin';
  const isQA = viewerProfile?.role === 'qa';
  const isSupervisor = viewerProfile?.role === 'supervisor';
  const canView = isAdmin || isQA || isSupervisor;
  const canCreate = isAdmin || isSupervisor;
  const canUpdateStatus = isAdmin || isQA;
  const scopedTeam = isSupervisor ? viewerProfile?.team || null : null;

  useEffect(() => {
    if (currentUser) {
      setCurrentProfile(currentUser);
      setSupervisorName(currentUser.display_name || currentUser.agent_name);
    }

    void loadRequestsAndProfiles();
  }, [
    currentUser?.id,
    currentUser?.role,
    currentUser?.team,
    currentUser?.display_name,
    currentUser?.agent_name,
  ]);

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

  async function loadRequestsAndProfiles() {
    setLoading(true);
    setErrorMessage('');
    setAgentLoadError('');

    let profile = currentUser;

    if (!profile) {
      const { data: authData, error: authError } =
        await supabase.auth.getUser();

      if (authError) {
        setLoading(false);
        setErrorMessage(authError.message);
        return;
      }

      const userId = authData.user?.id;

      if (!userId) {
        setLoading(false);
        setErrorMessage('Could not identify the logged-in user.');
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, role, agent_name, display_name, team, email')
        .eq('id', userId)
        .maybeSingle();

      if (profileError) {
        setLoading(false);
        setErrorMessage(profileError.message);
        return;
      }

      if (!profileData) {
        setLoading(false);
        setErrorMessage('Could not load current profile.');
        return;
      }

      profile = profileData as CurrentUser;
      setCurrentProfile(profile);
      setSupervisorName(profile.display_name || profile.agent_name);
    }

    if (!profile || !['admin', 'qa', 'supervisor'].includes(profile.role)) {
      setLoading(false);
      setErrorMessage('You do not have permission to view requests.');
      return;
    }

    if (profile.role === 'supervisor' && !profile.team) {
      setLoading(false);
      setErrorMessage('Supervisor profile is missing a team.');
      return;
    }

    await Promise.all([
      loadRequestsForProfile(profile),
      loadAgentProfilesForViewer(profile),
    ]);

    setLoading(false);
  }

  async function loadRequestsForProfile(profile: CurrentUser) {
    let query = supabase
      .from('supervisor_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (profile.role === 'supervisor' && profile.team) {
      query = query.eq('team', profile.team);
    }

    const { data, error } = await query;

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setRequests((data as SupervisorRequest[]) || []);
  }

  async function loadAgentProfilesForViewer(profile: CurrentUser) {
    setLoadingAgents(true);
    setAgentLoadError('');

    let query = supabase
      .from('profiles')
      .select('id, role, agent_id, agent_name, display_name, team')
      .eq('role', 'agent')
      .not('agent_id', 'is', null)
      .order('agent_name', { ascending: true });

    if (profile.role === 'supervisor' && profile.team) {
      query = query.eq('team', profile.team);
    }

    const { data, error } = await query;

    setLoadingAgents(false);

    if (error) {
      setAgentLoadError(error.message);
      setAgentProfiles([]);
      return;
    }

    setAgentProfiles((data as AgentProfile[]) || []);
  }

  const selectedAgent =
    agentProfiles.find((profile) => profile.id === selectedAgentProfileId) ||
    null;

  function getAgentLabel(profile: AgentProfile) {
    return profile.display_name
      ? `${profile.agent_name} - ${profile.display_name}`
      : `${profile.agent_name} - ${profile.agent_id}`;
  }

  function getRequestDisplayName(request: SupervisorRequest) {
    const matchedProfile = agentProfiles.find(
      (profile) =>
        profile.agent_id === (request.agent_id || null) &&
        profile.agent_name === (request.agent_name || '') &&
        profile.team === (request.team || null)
    );

    return matchedProfile?.display_name || request.display_name || '-';
  }

  const visibleAgents = useMemo(() => {
    const search = agentSearch.trim().toLowerCase();

    if (!search) return agentProfiles;

    return agentProfiles.filter((profile) => {
      const label = getAgentLabel(profile).toLowerCase();
      return (
        profile.agent_name.toLowerCase().includes(search) ||
        (profile.agent_id || '').toLowerCase().includes(search) ||
        (profile.display_name || '').toLowerCase().includes(search) ||
        label.includes(search)
      );
    });
  }, [agentProfiles, agentSearch]);

  const filteredRequests = useMemo(() => {
    const search = searchText.trim().toLowerCase();

    return requests.filter((request) => {
      const displayName = getRequestDisplayName(request).toLowerCase();
      const matchesSearch =
        !search ||
        (request.case_reference || '').toLowerCase().includes(search) ||
        (request.agent_name || '').toLowerCase().includes(search) ||
        (request.agent_id || '').toLowerCase().includes(search) ||
        displayName.includes(search) ||
        (request.case_type || '').toLowerCase().includes(search) ||
        (request.supervisor_name || '').toLowerCase().includes(search) ||
        (request.request_note || '').toLowerCase().includes(search);

      const matchesStatus = statusFilter
        ? request.status === statusFilter
        : true;

      return matchesSearch && matchesStatus;
    });
  }, [requests, searchText, statusFilter, agentProfiles]);

  function handleSelectAgent(profile: AgentProfile) {
    setSelectedAgentProfileId(profile.id);
    setAgentSearch(getAgentLabel(profile));
    setIsAgentPickerOpen(false);
  }

  function toggleExpanded(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  async function handleRefreshAgents() {
    if (!viewerProfile) return;
    await loadAgentProfilesForViewer(viewerProfile);
  }

  async function handleRefreshRequests() {
    if (!viewerProfile) return;
    setLoading(true);
    setErrorMessage('');
    await loadRequestsForProfile(viewerProfile);
    setLoading(false);
  }



  async function handleCreateRequest() {
    if (!viewerProfile || !canCreate) return;

    if (!caseReference || !caseType || !priority || !requestNote) {
      alert(
        'Please fill Case Reference, Case Type, Priority, and Request Note.'
      );
      return;
    }

    if (!supervisorName.trim()) {
      alert('Requester name is required.');
      return;
    }

    if (
      isSupervisor &&
      viewerProfile.team &&
      selectedAgent?.team &&
      selectedAgent.team !== viewerProfile.team
    ) {
      alert('Supervisors can only create requests for their own team.');
      return;
    }

    setSaving(true);

    const { error } = await supabase.from('supervisor_requests').insert({
      case_reference: caseReference,
      agent_id: selectedAgent?.agent_id || null,
      agent_name: selectedAgent?.agent_name || null,
      display_name: selectedAgent?.display_name || null,
      team: selectedAgent?.team || viewerProfile.team || null,
      case_type: caseType,
      supervisor_name: supervisorName.trim(),
      priority,
      request_note: requestNote,
      status: 'Open',
    });

    setSaving(false);

    if (error) {
      alert(error.message);
      return;
    }

    setCaseReference('');
    setSelectedAgentProfileId('');
    setAgentSearch('');
    setIsAgentPickerOpen(false);
    setCaseType('');
    setPriority('Medium');
    setRequestNote('');

    await handleRefreshRequests();
  }

  async function handleStatusChange(
    requestId: string,
    nextStatus: 'Open' | 'Under Review' | 'Closed'
  ) {
    if (!canUpdateStatus) return;

    setStatusSavingId(requestId);

    const { error } = await supabase
      .from('supervisor_requests')
      .update({ status: nextStatus })
      .eq('id', requestId);

    setStatusSavingId(null);

    if (error) {
      alert(error.message);
      return;
    }

    setRequests((prev) =>
      prev.map((item) =>
        item.id === requestId ? { ...item, status: nextStatus } : item
      )
    );
  }

  function getPriorityColor(priorityValue: string) {
    if (priorityValue === 'Urgent') return '#991b1b';
    if (priorityValue === 'High') return '#b45309';
    if (priorityValue === 'Medium') return '#1d4ed8';
    return '#374151';
  }

  function getStatusColor(statusValue: string) {
    if (statusValue === 'Closed') return '#166534';
    if (statusValue === 'Under Review') return '#92400e';
    return '#1d4ed8';
  }

  function formatDate(dateValue?: string | null) {
    if (!dateValue) return '-';
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString();
  }

  if (!loading && !canView) {
    return (
      <div style={errorBanner}>
        You do not have permission to view Supervisor Requests.
      </div>
    );
  }

  return (
    <div data-no-theme-invert="true" style={{ color: 'var(--da-page-text, #e5eefb)' }}>
      <div style={pageHeaderStyle}>
        <div>
          <div style={sectionEyebrow}>Supervisor Requests</div>
          <h2 style={{ marginBottom: '8px' }}>Supervisor Requests</h2>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => void handleRefreshAgents()}
            disabled={loadingAgents || !viewerProfile}
            style={secondaryButton}
          >
            {loadingAgents ? 'Refreshing Agents...' : 'Refresh Agents'}
          </button>
          <button
            type="button"
            onClick={() => void handleRefreshRequests()}
            disabled={loading || !viewerProfile}
            style={secondaryButton}
          >
            Refresh Requests
          </button>
        </div>
      </div>

      {errorMessage ? <div style={errorBanner}>{errorMessage}</div> : null}
      {agentLoadError ? (
        <div style={warningBanner}>{agentLoadError}</div>
      ) : null}

      {canCreate ? (
        <div style={panelStyle}>
          <h3 style={{ marginTop: 0 }}>Create Request</h3>

          <div style={scopeInfoStyle}>
            <div>
              <strong>Viewer Role:</strong> {viewerProfile?.role || '-'}
            </div>
            <div>
              <strong>Scoped Team:</strong> {scopedTeam || 'All Teams'}
            </div>
            <div>
              <strong>Agents Loaded:</strong> {agentProfiles.length}
            </div>
          </div>

          <div style={formGridStyle}>
            <div>
              <label style={labelStyle}>Case Reference</label>
              <input
                type="text"
                value={caseReference}
                onChange={(e) => setCaseReference(e.target.value)}
                style={fieldStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Agent</label>
              <div ref={agentPickerRef} style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setIsAgentPickerOpen((prev) => !prev)}
                  style={pickerButtonStyle}
                >
                  <span
                    style={{ color: selectedAgent ? 'var(--da-field-text, #e5eefb)' : 'var(--da-subtle-text, #94a3b8)' }}
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
                        value={agentSearch}
                        onChange={(e) => setAgentSearch(e.target.value)}
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
                        <div style={pickerInfoStyle}>No agents found.</div>
                      ) : (
                        visibleAgents.map((profile) => (
                          <button
                            key={profile.id}
                            type="button"
                            onClick={() => handleSelectAgent(profile)}
                            style={{
                              ...pickerOptionStyle,
                              ...(selectedAgentProfileId === profile.id
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
              <p style={{ margin: '0 0 8px 0' }}>
                <strong>Agent ID:</strong> {selectedAgent?.agent_id || '-'}
              </p>
              <p style={{ margin: '0 0 8px 0' }}>
                <strong>Agent Name:</strong> {selectedAgent?.agent_name || '-'}
              </p>
              <p style={{ margin: '0 0 8px 0' }}>
                <strong>Display Name:</strong>{' '}
                {selectedAgent?.display_name || '-'}
              </p>
              <p style={{ margin: 0 }}>
                <strong>Team:</strong>{' '}
                {selectedAgent?.team || viewerProfile?.team || '-'}
              </p>
            </div>

            <div>
              <label style={labelStyle}>Case Type</label>
              <select
                value={caseType}
                onChange={(e) => setCaseType(e.target.value)}
                style={fieldStyle}
              >
                <option value="">Select Case Type</option>
                <option value="Order status">Order status</option>
                <option value="General Inquiry">General Inquiry</option>
                <option value="Exchange">Exchange</option>
                <option value="Missing Parts">Missing Parts</option>
                <option value="Refund - Store credit">
                  Refund - Store credit
                </option>
                <option value="Delivered but not received">
                  Delivered but not received
                </option>
                <option value="FedEx Cases">FedEx Cases</option>
                <option value="Replacement">Replacement</option>
                <option value="Warranty">Warranty</option>
                <option value="Fitment issue">Fitment issue</option>
                <option value="Damaged package">Damaged package</option>
                <option value="Cancellation">Cancellation</option>
              </select>
            </div>

            <div>
              <label style={labelStyle}>Requester Name</label>
              <input
                type="text"
                value={supervisorName}
                onChange={(e) => setSupervisorName(e.target.value)}
                readOnly={isSupervisor}
                style={{ ...fieldStyle, opacity: isSupervisor ? 0.9 : 1 }}
              />
            </div>

            <div>
              <label style={labelStyle}>Priority</label>
              <select
                value={priority}
                onChange={(e) =>
                  setPriority(
                    e.target.value as 'Low' | 'Medium' | 'High' | 'Urgent'
                  )
                }
                style={fieldStyle}
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Urgent">Urgent</option>
              </select>
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Request Note</label>
              <textarea
                value={requestNote}
                onChange={(e) => setRequestNote(e.target.value)}
                rows={5}
                style={fieldStyle}
              />
            </div>

            <button
              onClick={handleCreateRequest}
              disabled={saving}
              style={primaryButton}
            >
              {saving ? 'Saving...' : 'Create Request'}
            </button>
          </div>
        </div>
      ) : null}

      <div style={{ marginTop: '28px' }}>
        <div style={requestsHeaderStyle}>
          <h3 style={{ margin: 0 }}>Saved Requests</h3>
          <div style={requestsFilterWrapStyle}>
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search case, agent, note, or requester"
              style={compactFieldStyle}
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={compactFieldStyle}
            >
              <option value="">All Statuses</option>
              <option value="Open">Open</option>
              <option value="Under Review">Under Review</option>
              <option value="Closed">Closed</option>
            </select>
          </div>
        </div>

        <div style={countPillStyle}>
          {filteredRequests.length} request
          {filteredRequests.length === 1 ? '' : 's'}
        </div>

        {loading ? (
          <p>Loading requests...</p>
        ) : filteredRequests.length === 0 ? (
          <p>No requests found.</p>
        ) : (
          <div style={{ display: 'grid', gap: '12px', marginTop: '16px' }}>
            {filteredRequests.map((request) => {
              const isExpanded = expandedId === request.id;

              return (
                <div key={request.id} style={requestCardStyle}>
                  <div style={requestSummaryRowStyle}>
                    <div style={requestSummaryMainStyle}>
                      <div style={requestTitleStyle}>
                        Case #{request.case_reference}
                      </div>
                      <div style={requestMetaStyle}>
                        {(request.agent_name || '-') +
                          ' • ' +
                          (getRequestDisplayName(request) || '-') +
                          ' • ' +
                          (request.case_type || '-')}
                      </div>
                    </div>

                    <div style={requestSummarySideStyle}>
                      <span
                        style={{
                          ...pillStyle,
                          backgroundColor: getPriorityColor(request.priority),
                        }}
                      >
                        {request.priority}
                      </span>
                      <span
                        style={{
                          ...pillStyle,
                          backgroundColor: getStatusColor(request.status),
                        }}
                      >
                        {request.status}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleExpanded(request.id)}
                        style={secondaryButton}
                      >
                        {isExpanded ? 'Hide Details' : 'Details'}
                      </button>
                    </div>
                  </div>

                  {isExpanded ? (
                    <div style={requestDetailsStyle}>
                      <div style={detailsGridStyle}>
                        <div>
                          <strong>Agent ID:</strong> {request.agent_id || '-'}
                        </div>
                        <div>
                          <strong>Agent Name:</strong>{' '}
                          {request.agent_name || '-'}
                        </div>
                        <div>
                          <strong>Display Name:</strong>{' '}
                          {getRequestDisplayName(request)}
                        </div>
                        <div>
                          <strong>Team:</strong> {request.team || '-'}
                        </div>
                        <div>
                          <strong>Case Type:</strong> {request.case_type}
                        </div>
                        <div>
                          <strong>Requester:</strong> {request.supervisor_name}
                        </div>
                        <div>
                          <strong>Priority:</strong> {request.priority}
                        </div>
                        <div>
                          <strong>Created At:</strong>{' '}
                          {formatDate(request.created_at)}
                        </div>
                      </div>

                      <div style={noteBlockStyle}>
                        <div style={noteLabelStyle}>Request Note</div>
                        <div style={noteTextStyle}>
                          {request.request_note || '-'}
                        </div>
                      </div>

                      {canUpdateStatus ? (
                        <div style={statusActionWrapStyle}>
                          <div style={noteLabelStyle}>Update Status</div>
                          <div
                            style={{
                              display: 'flex',
                              gap: '10px',
                              flexWrap: 'wrap',
                            }}
                          >
                            <button
                              type="button"
                              onClick={() =>
                                void handleStatusChange(request.id, 'Open')
                              }
                              disabled={statusSavingId === request.id}
                              style={miniButtonStyle}
                            >
                              Open
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void handleStatusChange(
                                  request.id,
                                  'Under Review'
                                )
                              }
                              disabled={statusSavingId === request.id}
                              style={miniButtonStyle}
                            >
                              Under Review
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void handleStatusChange(request.id, 'Closed')
                              }
                              disabled={statusSavingId === request.id}
                              style={miniButtonStyle}
                            >
                              Closed
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
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
  color: '#60a5fa',
  fontSize: '12px',
  fontWeight: 800,
  letterSpacing: '0.18em',
  textTransform: 'uppercase' as const,
  marginBottom: '12px',
};

const panelStyle = {
  background:
    'var(--da-panel-bg, linear-gradient(180deg, rgba(15,23,42,0.82) 0%, rgba(15,23,42,0.68) 100%))',
  border: 'var(--da-panel-border, 1px solid rgba(148,163,184,0.14))',
  borderRadius: '20px',
  padding: '20px',
  boxShadow: 'var(--da-panel-shadow, 0 10px 30px rgba(0,0,0,0.18))',
};

const formGridStyle = {
  display: 'grid',
  gap: '15px',
};

const scopeInfoStyle = {
  display: 'grid',
  gap: '8px',
  marginBottom: '18px',
  padding: '14px',
  borderRadius: '12px',
  backgroundColor: 'var(--da-card-bg, rgba(15,23,42,0.5))',
  border: '1px solid rgba(148,163,184,0.12)',
  color: 'var(--da-page-text, #cbd5e1)',
};

const labelStyle = {
  display: 'block',
  marginBottom: '8px',
  color: 'var(--da-muted-text, #475569)',
  fontWeight: 700,
  fontSize: '13px',
};

const fieldStyle = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: '12px',
  border: 'var(--da-field-border, 1px solid rgba(148,163,184,0.16))',
  background: 'var(--da-field-bg, rgba(15,23,42,0.7))',
  color: 'var(--da-field-text, #e5eefb)',
};

const compactFieldStyle = {
  padding: '10px 12px',
  borderRadius: '10px',
  border: 'var(--da-field-border, 1px solid rgba(148,163,184,0.16))',
  background: 'var(--da-field-bg, rgba(15,23,42,0.8))',
  color: 'var(--da-field-text, #e5eefb)',
  minWidth: '220px',
};

const pickerButtonStyle = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: '12px',
  border: 'var(--da-field-border, 1px solid rgba(148,163,184,0.16))',
  background: 'var(--da-field-bg, rgba(15,23,42,0.7))',
  textAlign: 'left' as const,
  cursor: 'pointer',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  color: 'var(--da-field-text, #e5eefb)',
};

const pickerMenuStyle = {
  position: 'absolute' as const,
  top: 'calc(100% + 8px)',
  left: 0,
  right: 0,
  background: 'var(--da-menu-bg, rgba(15,23,42,0.96))',
  border: 'var(--da-field-border, 1px solid rgba(148,163,184,0.16))',
  borderRadius: '16px',
  boxShadow: 'var(--da-panel-shadow, 0 10px 30px rgba(0,0,0,0.22))',
  zIndex: 20,
  overflow: 'hidden',
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
  borderRadius: '8px',
  backgroundColor: 'var(--da-card-bg, rgba(15,23,42,0.68))',
  color: 'var(--da-subtle-text, #94a3b8)',
};

const pickerErrorStyle = {
  padding: '12px',
  borderRadius: '8px',
  backgroundColor: 'rgba(127,29,29,0.24)',
  color: '#fecaca',
  border: '1px solid rgba(248,113,113,0.22)',
};

const pickerOptionStyle = {
  padding: '12px',
  borderRadius: '8px',
  border: '1px solid rgba(148,163,184,0.12)',
  backgroundColor: 'var(--da-option-bg, rgba(15,23,42,0.6))',
  textAlign: 'left' as const,
  cursor: 'pointer',
  fontWeight: 500,
  color: 'var(--da-field-text, #e5eefb)',
};

const pickerOptionActiveStyle = {
  border: '1px solid #2563eb',
  backgroundColor: 'rgba(37,99,235,0.18)',
};

const infoCardStyle = {
  backgroundColor: 'var(--da-card-bg, rgba(15,23,42,0.5))',
  border: '1px solid rgba(148,163,184,0.12)',
  borderRadius: '12px',
  padding: '14px',
  color: 'var(--da-page-text, #e5eefb)',
};

const primaryButton = {
  padding: '12px 16px',
  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
  color: 'white',
  border: 'none',
  borderRadius: '10px',
  cursor: 'pointer',
  fontWeight: 700,
};

const secondaryButton = {
  padding: '12px 16px',
  backgroundColor: 'var(--da-secondary-bg, rgba(15,23,42,0.9))',
  color: 'var(--da-secondary-text, #ffffff)',
  border: 'var(--da-secondary-border, 1px solid rgba(148,163,184,0.16))',
  borderRadius: '10px',
  cursor: 'pointer',
  fontWeight: 700,
};


const requestsHeaderStyle = {
  display: 'flex',
  gap: '12px',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexWrap: 'wrap' as const,
};

const requestsFilterWrapStyle = {
  display: 'flex',
  gap: '10px',
  flexWrap: 'wrap' as const,
};

const countPillStyle = {
  marginTop: '12px',
  display: 'inline-flex',
  alignItems: 'center',
  padding: '10px 14px',
  borderRadius: '999px',
  backgroundColor: 'var(--da-secondary-bg, rgba(15,23,42,0.62))',
  border: 'var(--da-secondary-border, 1px solid rgba(148,163,184,0.14))',
  color: 'var(--da-secondary-text, #cbd5e1)',
  fontSize: '13px',
  fontWeight: 700,
};

const requestCardStyle = {
  border: 'var(--da-panel-border, 1px solid rgba(148,163,184,0.14))',
  borderRadius: '16px',
  padding: '16px',
  background:
    'var(--da-panel-bg, linear-gradient(180deg, rgba(15,23,42,0.82) 0%, rgba(15,23,42,0.68) 100%))',
  boxShadow: 'var(--da-panel-shadow, 0 8px 24px rgba(2,6,23,0.2))',
};

const requestSummaryRowStyle = {
  display: 'flex',
  gap: '16px',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexWrap: 'wrap' as const,
};

const requestSummaryMainStyle = {
  display: 'grid',
  gap: '6px',
};

const requestSummarySideStyle = {
  display: 'flex',
  gap: '10px',
  flexWrap: 'wrap' as const,
  alignItems: 'center',
};

const requestTitleStyle = {
  color: 'var(--da-title, #0f172a)',
  fontSize: '16px',
  fontWeight: 800,
};

const requestMetaStyle = {
  color: 'var(--da-subtle-text, #64748b)',
  fontSize: '13px',
  fontWeight: 600,
};

const pillStyle = {
  color: 'white',
  padding: '6px 10px',
  borderRadius: '999px',
  fontSize: '12px',
  fontWeight: 'bold',
};

const requestDetailsStyle = {
  marginTop: '16px',
  paddingTop: '16px',
  borderTop: '1px solid rgba(148,163,184,0.12)',
  display: 'grid',
  gap: '16px',
};

const detailsGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '12px',
  color: 'var(--da-page-text, #334155)',
};

const noteBlockStyle = {
  padding: '14px',
  borderRadius: '12px',
  border: '1px solid rgba(148,163,184,0.12)',
  backgroundColor: 'var(--da-card-bg, rgba(15,23,42,0.48))',
};

const noteLabelStyle = {
  color: 'var(--da-accent-text, #2563eb)',
  fontSize: '12px',
  fontWeight: 800,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.12em',
  marginBottom: '8px',
};

const noteTextStyle = {
  color: 'var(--da-page-text, #f8fafc)',
  lineHeight: 1.6,
};

const statusActionWrapStyle = {
  padding: '14px',
  borderRadius: '12px',
  border: '1px solid rgba(148,163,184,0.12)',
  backgroundColor: 'var(--da-card-bg, rgba(15,23,42,0.48))',
};

const miniButtonStyle = {
  padding: '10px 12px',
  borderRadius: '10px',
  border: 'var(--da-secondary-border, 1px solid rgba(148,163,184,0.16))',
  backgroundColor: 'var(--da-secondary-bg, rgba(15,23,42,0.82))',
  color: 'var(--da-secondary-text, #ffffff)',
  cursor: 'pointer',
  fontWeight: 700,
};

const errorBanner = {
  marginTop: '16px',
  padding: '12px 14px',
  borderRadius: '10px',
  backgroundColor: 'rgba(127,29,29,0.24)',
  border: '1px solid rgba(248,113,113,0.22)',
  color: '#fecaca',
};

const warningBanner = {
  marginTop: '16px',
  padding: '12px 14px',
  borderRadius: '10px',
  backgroundColor: 'rgba(146,64,14,0.22)',
  border: '1px solid rgba(251,191,36,0.22)',
  color: '#fde68a',
};

export default SupervisorRequestsSupabase;
