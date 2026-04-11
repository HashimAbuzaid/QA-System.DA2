import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

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
  acknowledged_by_agent?: boolean;
  acknowledged_at?: string | null;
};

type AgentProfile = {
  id: string;
  role: 'agent';
  agent_id: string | null;
  agent_name: string;
  display_name: string | null;
  team: 'Calls' | 'Tickets' | 'Sales' | null;
};

function AgentFeedbackSupabase() {
  const [feedbackItems, setFeedbackItems] = useState<AgentFeedback[]>([]);
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [expandedFeedbackId, setExpandedFeedbackId] = useState<string | null>(null);
  const [savedAgentFilter, setSavedAgentFilter] = useState('');
  const [savedStatusFilter, setSavedStatusFilter] = useState<'All' | 'Open' | 'In Progress' | 'Closed'>('All');

  const [selectedAgentProfileId, setSelectedAgentProfileId] = useState('');
  const [agentSearch, setAgentSearch] = useState('');
  const [isAgentPickerOpen, setIsAgentPickerOpen] = useState(false);
  const [qaName, setQaName] = useState('');
  const [feedbackType, setFeedbackType] = useState<
    'Coaching' | 'Audit Feedback' | 'Warning' | 'Follow-up'
  >('Coaching');
  const [subject, setSubject] = useState('');
  const [feedbackNote, setFeedbackNote] = useState('');
  const [dueDate, setDueDate] = useState('');

  const agentPickerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void loadFeedbackAndProfiles();
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

  async function loadFeedbackAndProfiles() {
    setLoading(true);
    setErrorMessage('');

    const [feedbackResult, profilesResult] = await Promise.all([
      supabase
        .from('agent_feedback')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase
        .from('profiles')
        .select('id, role, agent_id, agent_name, display_name, team')
        .eq('role', 'agent')
        .order('agent_name', { ascending: true }),
    ]);

    setLoading(false);

    if (feedbackResult.error) {
      setErrorMessage(feedbackResult.error.message);
      return;
    }

    if (profilesResult.error) {
      setErrorMessage(profilesResult.error.message);
      return;
    }

    setFeedbackItems((feedbackResult.data as AgentFeedback[]) || []);
    setProfiles((profilesResult.data as AgentProfile[]) || []);
  }

  const visibleAgents = useMemo(() => {
    const search = agentSearch.trim().toLowerCase();

    if (!search) return profiles;

    return profiles.filter((profile) => {
      const label = getAgentLabel(profile);

      return (
        profile.agent_name.toLowerCase().includes(search) ||
        (profile.agent_id || '').toLowerCase().includes(search) ||
        (profile.display_name || '').toLowerCase().includes(search) ||
        label.toLowerCase().includes(search)
      );
    });
  }, [profiles, agentSearch]);

  const selectedAgent =
    profiles.find((profile) => profile.id === selectedAgentProfileId) || null;

  function getAgentLabel(profile: AgentProfile) {
    return profile.display_name
      ? `${profile.agent_name} - ${profile.display_name}`
      : `${profile.agent_name} - ${profile.agent_id}`;
  }

  function getFeedbackDisplayName(item: AgentFeedback) {
    const matchedProfile = profiles.find(
      (profile) =>
        profile.agent_id === item.agent_id &&
        profile.agent_name === item.agent_name &&
        profile.team === item.team
    );

    return matchedProfile?.display_name || '-';
  }

  function getFeedbackAgentKey(item: AgentFeedback) {
    return `${item.agent_id}||${item.agent_name}||${item.team}`;
  }

  const savedAgentOptions = useMemo(() => {
    const seen = new Set<string>();
    return feedbackItems
      .filter((item) => {
        const key = getFeedbackAgentKey(item);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((item) => ({
        key: getFeedbackAgentKey(item),
        label: `${item.agent_name} - ${getFeedbackDisplayName(item)} • ${item.agent_id} • ${item.team}`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [feedbackItems, profiles]);

  const filteredFeedbackItems = useMemo(() => {
    return feedbackItems.filter((item) => {
      const matchesAgent =
        !savedAgentFilter || getFeedbackAgentKey(item) === savedAgentFilter;
      const matchesStatus =
        savedStatusFilter === 'All' || item.status === savedStatusFilter;

      return matchesAgent && matchesStatus;
    });
  }, [feedbackItems, savedAgentFilter, savedStatusFilter]);

  function handleSelectAgent(profile: AgentProfile) {
    setSelectedAgentProfileId(profile.id);
    setAgentSearch(getAgentLabel(profile));
    setIsAgentPickerOpen(false);
  }

  function resetForm() {
    setSelectedAgentProfileId('');
    setAgentSearch('');
    setIsAgentPickerOpen(false);
    setQaName('');
    setFeedbackType('Coaching');
    setSubject('');
    setFeedbackNote('');
    setDueDate('');
  }



  async function handleCreateFeedback() {
    setErrorMessage('');
    setSuccessMessage('');
    if (!selectedAgent || !qaName || !subject || !feedbackNote) {
      setErrorMessage(
        'Please choose an agent and fill QA Name, Subject, and Feedback Note.'
      );
      return;
    }

    setSaving(true);

    const { error } = await supabase.from('agent_feedback').insert({
      agent_id: selectedAgent.agent_id,
      agent_name: selectedAgent.agent_name,
      team: selectedAgent.team,
      qa_name: qaName,
      feedback_type: feedbackType,
      subject,
      feedback_note: feedbackNote,
      due_date: dueDate || null,
      status: 'Open',
    });

    setSaving(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setSuccessMessage('Agent feedback created successfully.');
    resetForm();
    void loadFeedbackAndProfiles();
  }

  async function handleStatusChange(
    feedbackId: string,
    newStatus: 'Open' | 'In Progress' | 'Closed'
  ) {
    setErrorMessage('');
    setSuccessMessage('');
    const { error } = await supabase
      .from('agent_feedback')
      .update({ status: newStatus })
      .eq('id', feedbackId);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setSuccessMessage(`Feedback status updated to ${newStatus}.`);

    setFeedbackItems((prev) =>
      prev.map((item) =>
        item.id === feedbackId ? { ...item, status: newStatus } : item
      )
    );
  }

  async function handleDelete(feedbackId: string) {
    setErrorMessage('');
    setSuccessMessage('');

    if (pendingDeleteId !== feedbackId) {
      setPendingDeleteId(feedbackId);
      setSuccessMessage('Click delete again to confirm feedback removal.');
      return;
    }

    const { error } = await supabase
      .from('agent_feedback')
      .delete()
      .eq('id', feedbackId);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setPendingDeleteId(null);
    setFeedbackItems((prev) => prev.filter((item) => item.id !== feedbackId));
    setSuccessMessage('Feedback item deleted successfully.');
  }

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

  function formatDate(dateValue?: string | null) {
    if (!dateValue) return '-';
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString();
  }

  return (
    <div style={{ color: 'var(--da-page-text, #e5eefb)' }}>
      <div style={pageHeaderStyle}>
        <div>
          <div style={sectionEyebrow}>Coaching Workspace</div>
          <h2 style={{ margin: 0, fontSize: '30px' }}>Agent Feedback</h2>
          <p style={{ margin: '10px 0 0 0', color: 'var(--da-subtle-text, #94a3b8)' }}>
            Create coaching notes, warnings, follow-ups, and audit feedback
            using the live agent directory from profiles.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadFeedbackAndProfiles()}
          style={secondaryButton}
        >
          Refresh
        </button>
      </div>

      {errorMessage ? <div style={errorBannerStyle}>{errorMessage}</div> : null}
      {successMessage ? (
        <div style={successBannerStyle}>{successMessage}</div>
      ) : null}

      <div style={panelStyle}>
        <div style={formGridStyle}>
          <div style={wideFieldStyle}>
            <label style={labelStyle}>Agent</label>
            <div ref={agentPickerRef} style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setIsAgentPickerOpen((prev) => !prev)}
                style={pickerButtonStyle}
              >
                <span style={{ color: selectedAgent ? 'var(--da-title, #f8fafc)' : 'var(--da-subtle-text, #94a3b8)' }}>
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
                    {visibleAgents.length === 0 ? (
                      <div style={pickerInfoStyle}>No agents found</div>
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
            <div style={infoCardTitleStyle}>Selected Agent</div>
            <p style={infoLineStyle}>
              <strong>Agent ID:</strong> {selectedAgent?.agent_id || '-'}
            </p>
            <p style={infoLineStyle}>
              <strong>Agent Name:</strong> {selectedAgent?.agent_name || '-'}
            </p>
            <p style={infoLineStyle}>
              <strong>Display Name:</strong>{' '}
              {selectedAgent?.display_name || '-'}
            </p>
            <p style={{ ...infoLineStyle, marginBottom: 0 }}>
              <strong>Team:</strong> {selectedAgent?.team || '-'}
            </p>
          </div>

          <div>
            <label style={labelStyle}>QA Name</label>
            <input
              type="text"
              value={qaName}
              onChange={(e) => setQaName(e.target.value)}
              style={fieldStyle}
              placeholder="Enter QA name"
            />
          </div>

          <div>
            <label style={labelStyle}>Feedback Type</label>
            <select
              value={feedbackType}
              onChange={(e) =>
                setFeedbackType(
                  e.target.value as
                    | 'Coaching'
                    | 'Audit Feedback'
                    | 'Warning'
                    | 'Follow-up'
                )
              }
              style={fieldStyle}
            >
              <option value="Coaching">Coaching</option>
              <option value="Audit Feedback">Audit Feedback</option>
              <option value="Warning">Warning</option>
              <option value="Follow-up">Follow-up</option>
            </select>
          </div>

          <div>
            <label style={labelStyle}>Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              style={fieldStyle}
              placeholder="Enter feedback subject"
            />
          </div>

          <div style={wideFieldStyle}>
            <label style={labelStyle}>Feedback Note</label>
            <textarea
              value={feedbackNote}
              onChange={(e) => setFeedbackNote(e.target.value)}
              rows={5}
              style={fieldStyle}
              placeholder="Write the feedback details"
            />
          </div>

          <div>
            <label style={labelStyle}>Due Date</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              style={fieldStyle}
            />
          </div>
        </div>
      </div>

      <div style={actionRowStyle}>
        <button
          onClick={handleCreateFeedback}
          disabled={saving}
          style={primaryButton}
        >
          {saving ? 'Saving...' : 'Create Feedback'}
        </button>
        <button
          type="button"
          onClick={resetForm}
          disabled={saving}
          style={secondaryButton}
        >
          Clear Form
        </button>
      </div>

      <div style={{ marginTop: '32px' }}>
        <div style={sectionEyebrow}>Saved Feedback Items</div>

        {!loading && feedbackItems.length > 0 ? (
          <div style={savedFilterBarStyle}>
            <div style={savedFilterGridStyle}>
              <div>
                <label style={labelStyle}>Filter by Agent</label>
                <select
                  value={savedAgentFilter}
                  onChange={(e) => setSavedAgentFilter(e.target.value)}
                  style={fieldStyle}
                >
                  <option value="">All Agents</option>
                  {savedAgentOptions.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Filter by Status</label>
                <select
                  value={savedStatusFilter}
                  onChange={(e) =>
                    setSavedStatusFilter(
                      e.target.value as 'All' | 'Open' | 'In Progress' | 'Closed'
                    )
                  }
                  style={fieldStyle}
                >
                  <option value="All">All Statuses</option>
                  <option value="Open">Open</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Closed">Closed</option>
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setSavedAgentFilter('');
                setSavedStatusFilter('All');
              }}
              style={secondaryButton}
            >
              Clear Filters
            </button>
          </div>
        ) : null}

        {loading ? (
          <p style={{ color: 'var(--da-subtle-text, #94a3b8)' }}>Loading feedback...</p>
        ) : feedbackItems.length === 0 ? (
          <p style={{ color: 'var(--da-subtle-text, #94a3b8)' }}>No feedback items found.</p>
        ) : filteredFeedbackItems.length === 0 ? (
          <p style={{ color: 'var(--da-subtle-text, #94a3b8)' }}>
            No feedback items found for the current filters.
          </p>
        ) : (
          <div style={feedbackTableWrapStyle}>
            <div style={feedbackTableStyle}>
              <div style={{ ...feedbackRowStyle, ...feedbackHeaderRowStyle }}>
                <div style={feedbackCellAgentStyle}>Agent</div>
                <div style={feedbackCellTypeStyle}>Type</div>
                <div style={feedbackCellSubjectStyle}>Subject</div>
                <div style={feedbackCellDueDateStyle}>Due Date</div>
                <div style={feedbackCellStatusStyle}>Status</div>
                <div style={feedbackCellAckStyle}>Acknowledged</div>
                <div style={feedbackCellActionsStyle}>Actions</div>
              </div>

              {filteredFeedbackItems.map((item) => {
                const isExpanded = expandedFeedbackId === item.id;

                return (
                  <div key={item.id} style={feedbackEntryStyle}>
                    <div style={feedbackRowStyle}>
                      <div style={feedbackCellAgentStyle}>
                        <div style={primaryCellTextStyle}>{item.agent_name}</div>
                        <div style={secondaryCellTextStyle}>
                          {getFeedbackDisplayName(item)} • {item.agent_id} • {item.team}
                        </div>
                      </div>

                      <div style={feedbackCellTypeStyle}>
                        <span style={statusPill(getTypeColor(item.feedback_type))}>
                          {item.feedback_type}
                        </span>
                      </div>

                      <div style={feedbackCellSubjectStyle}>
                        <div style={primaryCellTextStyle}>{item.subject}</div>
                      </div>

                      <div style={feedbackCellDueDateStyle}>
                        <div style={primaryCellTextStyle}>{item.due_date || '-'}</div>
                      </div>

                      <div style={feedbackCellStatusStyle}>
                        <span style={statusPill(getStatusColor(item.status))}>
                          {item.status}
                        </span>
                      </div>

                      <div style={feedbackCellAckStyle}>
                        {item.acknowledged_by_agent ? (
                          <span style={acknowledgedPillStyle}>Acknowledged</span>
                        ) : (
                          <span style={notAcknowledgedPillStyle}>Not yet</span>
                        )}
                      </div>

                      <div style={feedbackCellActionsStyle}>
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedFeedbackId(isExpanded ? null : item.id)
                          }
                          style={secondaryMiniButton}
                        >
                          {isExpanded ? 'Hide' : 'Details'}
                        </button>
                      </div>
                    </div>

                    {isExpanded ? (
                      <div style={expandedFeedbackWrapStyle}>
                        <div style={expandedFeedbackPanelStyle}>
                          <div style={feedbackDetailGridStyle}>
                            <div style={feedbackDetailCardStyle}>
                              <div style={feedbackDetailLabelStyle}>QA Name</div>
                              <div style={feedbackDetailValueStyle}>{item.qa_name}</div>
                            </div>
                            <div style={feedbackDetailCardStyle}>
                              <div style={feedbackDetailLabelStyle}>Created At</div>
                              <div style={feedbackDetailValueStyle}>{formatDate(item.created_at)}</div>
                            </div>
                            <div style={feedbackDetailCardStyle}>
                              <div style={feedbackDetailLabelStyle}>Due Date</div>
                              <div style={feedbackDetailValueStyle}>{item.due_date || '-'}</div>
                            </div>
                            <div style={feedbackDetailCardStyle}>
                              <div style={feedbackDetailLabelStyle}>Acknowledged</div>
                              <div style={feedbackDetailValueStyle}>
                                {item.acknowledged_by_agent
                                  ? item.acknowledged_at
                                    ? formatDate(item.acknowledged_at)
                                    : 'Yes'
                                  : 'Not yet'}
                              </div>
                            </div>
                          </div>

                          <div style={feedbackNoteCardStyle}>
                            <div style={feedbackDetailLabelStyle}>Feedback</div>
                            <div style={feedbackNoteTextStyle}>{item.feedback_note}</div>
                          </div>

                          <div style={expandedActionRowStyle}>
                            <button
                              type="button"
                              onClick={() => handleStatusChange(item.id, 'Open')}
                              style={secondaryButton}
                            >
                              Mark Open
                            </button>

                            <button
                              type="button"
                              onClick={() => handleStatusChange(item.id, 'In Progress')}
                              style={secondaryButton}
                            >
                              In Progress
                            </button>

                            <button
                              type="button"
                              onClick={() => handleStatusChange(item.id, 'Closed')}
                              style={secondaryButton}
                            >
                              Close
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDelete(item.id)}
                              style={dangerButton}
                            >
                              {pendingDeleteId === item.id ? 'Confirm Delete' : 'Delete'}
                            </button>
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
      </div>
    </div>
  );
}

function statusPill(backgroundColor: string) {
  return {
    display: 'inline-block',
    padding: '6px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 800,
    color: '#ffffff',
    backgroundColor,
  };
}

const pageHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '16px',
  alignItems: 'flex-start',
  flexWrap: 'wrap' as const,
  marginBottom: '20px',
};

const sectionEyebrow = {
  color: 'var(--da-accent-text, #60a5fa)',
  fontSize: '12px',
  fontWeight: 800,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.16em',
  marginBottom: '12px',
};

const panelStyle = {
  background:
    'var(--da-panel-bg, linear-gradient(180deg, var(--da-field-bg, rgba(15, 23, 42, 0.82)) 0%, var(--da-surface-bg, rgba(15, 23, 42, 0.68)) 100%))',
  border: '1px solid rgba(148, 163, 184, 0.14)',
  borderRadius: '24px',
  padding: '22px',
  boxShadow: '0 18px 40px rgba(2, 6, 23, 0.35)',
  backdropFilter: 'blur(14px)',
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
  color: 'var(--da-muted-text, #cbd5e1)',
  fontWeight: 700,
};

const fieldStyle = {
  width: '100%',
  padding: '14px 16px',
  borderRadius: '16px',
  border: '1px solid rgba(148, 163, 184, 0.16)',
  background: 'var(--da-surface-bg, rgba(15, 23, 42, 0.7))',
  color: 'var(--da-page-text, #e5eefb)',
};

const pickerButtonStyle = {
  width: '100%',
  padding: '14px 16px',
  borderRadius: '16px',
  border: '1px solid rgba(148, 163, 184, 0.16)',
  background: 'var(--da-surface-bg, rgba(15, 23, 42, 0.7))',
  color: 'var(--da-page-text, #e5eefb)',
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
  background: 'var(--da-menu-bg, rgba(15, 23, 42, 0.96))',
  border: '1px solid rgba(148, 163, 184, 0.16)',
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
  backgroundColor: 'var(--da-surface-bg, rgba(15, 23, 42, 0.68))',
  color: 'var(--da-subtle-text, #94a3b8)',
};

const pickerOptionStyle = {
  padding: '12px 14px',
  borderRadius: '12px',
  border: '1px solid rgba(148, 163, 184, 0.12)',
  backgroundColor: 'var(--da-surface-bg, rgba(15, 23, 42, 0.6))',
  textAlign: 'left' as const,
  cursor: 'pointer',
  fontWeight: 600,
  color: 'var(--da-page-text, #e5eefb)',
};

const pickerOptionActiveStyle = {
  border: '1px solid rgba(96, 165, 250, 0.36)',
  backgroundColor: 'var(--da-active-option-bg, rgba(30, 64, 175, 0.32))',
};

const infoCardStyle = {
  gridColumn: '1 / -1',
  borderRadius: '18px',
  padding: '18px',
  border: '1px solid rgba(148, 163, 184, 0.12)',
  background: 'var(--da-card-bg, rgba(15, 23, 42, 0.5))',
};

const infoCardTitleStyle = {
  color: 'var(--da-accent-text, #93c5fd)',
  fontSize: '12px',
  fontWeight: 800,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.12em',
  marginBottom: '10px',
};

const infoLineStyle = {
  margin: '0 0 8px 0',
  color: 'var(--da-muted-text, #cbd5e1)',
};

const actionRowStyle = {
  display: 'flex',
  gap: '10px',
  flexWrap: 'wrap' as const,
  marginTop: '24px',
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

const secondaryButton = {
  padding: '14px 18px',
  borderRadius: '16px',
  border: '1px solid rgba(148, 163, 184, 0.16)',
  background: 'var(--da-field-bg, rgba(15, 23, 42, 0.74))',
  color: 'var(--da-page-text, #e5eefb)',
  fontWeight: 700,
  cursor: 'pointer',
};

const errorBannerStyle = {
  marginBottom: '16px',
  padding: '14px 16px',
  borderRadius: '16px',
  border: 'var(--da-error-border, 1px solid rgba(248, 113, 113, 0.22))',
  background: 'var(--da-error-bg, rgba(127, 29, 29, 0.24))',
  color: 'var(--da-error-text, #fecaca)',
};


const successBannerStyle = {
  marginBottom: '16px',
  padding: '14px 16px',
  borderRadius: '16px',
  border: 'var(--da-success-border, 1px solid rgba(74, 222, 128, 0.2))',
  background: 'var(--da-success-bg, rgba(22, 101, 52, 0.16))',
  color: 'var(--da-success-text, #bbf7d0)',
};

const dangerButton = {
  padding: '14px 18px',
  borderRadius: '16px',
  border: '1px solid rgba(248, 113, 113, 0.18)',
  background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
  color: '#ffffff',
  fontWeight: 700,
  cursor: 'pointer',
};


const feedbackTableWrapStyle = {
  marginTop: '16px',
  overflowX: 'auto' as const,
  borderRadius: '18px',
  border: '1px solid rgba(148, 163, 184, 0.14)',
  background:
    'linear-gradient(180deg, rgba(255,255,255,0.99) 0%, rgba(248,250,255,0.98) 100%)',
  boxShadow: '0 18px 40px rgba(15, 23, 42, 0.08)',
};

const feedbackTableStyle = {
  minWidth: '1120px',
};

const feedbackEntryStyle = {
  borderBottom: '1px solid rgba(203, 213, 225, 0.8)',
};

const feedbackRowStyle = {
  display: 'grid',
  gridTemplateColumns:
    '280px 140px minmax(220px, 1.4fr) 140px 130px 160px 110px',
  gap: '14px',
  alignItems: 'center',
  padding: '14px 16px',
};

const feedbackHeaderRowStyle = {
  position: 'sticky' as const,
  top: 0,
  zIndex: 1,
  background: 'rgba(13, 27, 57, 0.98)',
  color: '#93c5fd',
  fontSize: '12px',
  fontWeight: 800,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.12em',
};

const feedbackCellAgentStyle = {};
const feedbackCellTypeStyle = {};
const feedbackCellSubjectStyle = {};
const feedbackCellDueDateStyle = {};
const feedbackCellStatusStyle = {};
const feedbackCellAckStyle = {};
const feedbackCellActionsStyle = {
  display: 'flex',
  gap: '8px',
  flexWrap: 'wrap' as const,
};

const primaryCellTextStyle = {
  color: '#0f172a',
  fontSize: '14px',
  fontWeight: 700,
  lineHeight: 1.4,
};

const secondaryCellTextStyle = {
  marginTop: '4px',
  color: '#64748b',
  fontSize: '12px',
  fontWeight: 600,
  lineHeight: 1.4,
};

const acknowledgedPillStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '118px',
  padding: '8px 12px',
  borderRadius: '999px',
  background: 'rgba(22, 101, 52, 0.14)',
  border: '1px solid rgba(22, 101, 52, 0.18)',
  color: '#166534',
  fontSize: '12px',
  fontWeight: 800,
};

const notAcknowledgedPillStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '118px',
  padding: '8px 12px',
  borderRadius: '999px',
  background: 'rgba(148, 163, 184, 0.12)',
  border: '1px solid rgba(148, 163, 184, 0.18)',
  color: '#475569',
  fontSize: '12px',
  fontWeight: 800,
};

const secondaryMiniButton = {
  padding: '8px 12px',
  borderRadius: '10px',
  border: '1px solid rgba(148, 163, 184, 0.24)',
  background: '#ffffff',
  color: '#475569',
  fontWeight: 700,
  cursor: 'pointer',
};

const expandedFeedbackWrapStyle = {
  padding: '0 16px 16px 16px',
};

const expandedFeedbackPanelStyle = {
  borderRadius: '18px',
  border: '1px solid rgba(203, 213, 225, 0.92)',
  background:
    'linear-gradient(180deg, rgba(255,255,255,0.99) 0%, rgba(248,250,255,0.98) 100%)',
  padding: '18px',
};

const feedbackDetailGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '12px',
  marginBottom: '16px',
};

const feedbackDetailCardStyle = {
  borderRadius: '14px',
  border: '1px solid rgba(203, 213, 225, 0.92)',
  background: '#ffffff',
  padding: '14px 16px',
};

const feedbackDetailLabelStyle = {
  color: '#94a3b8',
  fontSize: '12px',
  fontWeight: 700,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.08em',
  marginBottom: '8px',
};

const feedbackDetailValueStyle = {
  color: '#0f172a',
  fontSize: '14px',
  fontWeight: 700,
  lineHeight: 1.5,
};

const feedbackNoteCardStyle = {
  borderRadius: '14px',
  border: '1px solid rgba(203, 213, 225, 0.92)',
  background: '#ffffff',
  padding: '14px 16px',
  marginBottom: '16px',
};

const feedbackNoteTextStyle = {
  color: '#334155',
  fontSize: '14px',
  lineHeight: 1.7,
  whiteSpace: 'pre-wrap' as const,
  wordBreak: 'break-word' as const,
};

const expandedActionRowStyle = {
  display: 'flex',
  gap: '10px',
  flexWrap: 'wrap' as const,
};


const savedFilterBarStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '14px',
  alignItems: 'flex-end',
  flexWrap: 'wrap' as const,
  margin: '12px 0 18px 0',
};

const savedFilterGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 320px))',
  gap: '14px',
  flex: 1,
};

export default AgentFeedbackSupabase;
