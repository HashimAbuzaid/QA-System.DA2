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

  const [selectedAgentProfileId, setSelectedAgentProfileId] = useState('');
  const [agentSearch, setAgentSearch] = useState('');
  const [isAgentPickerOpen, setIsAgentPickerOpen] = useState(false);
  const [qaName, setQaName] = useState('');
  const [feedbackType, setFeedbackType] = useState<
    'Coaching' | 'Audit Feedback' | 'Warning' | 'Follow-up'
  >('Coaching');
  const [subject, setSubject] = useState('');
  const [feedbackNote, setFeedbackNote] = useState('');
  const [actionPlan, setActionPlan] = useState('');
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
    setActionPlan('');
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
      action_plan: actionPlan || null,
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

  return (
    <div style={{ color: '#e5eefb' }}>
      <div style={pageHeaderStyle}>
        <div>
          <div style={sectionEyebrow}>Coaching Workspace</div>
          <h2 style={{ margin: 0, fontSize: '30px' }}>Agent Feedback</h2>
          <p style={{ margin: '10px 0 0 0', color: '#94a3b8' }}>
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
                <span style={{ color: selectedAgent ? '#f8fafc' : '#94a3b8' }}>
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
            <label style={labelStyle}>Action Plan</label>
            <textarea
              value={actionPlan}
              onChange={(e) => setActionPlan(e.target.value)}
              rows={4}
              style={fieldStyle}
              placeholder="Optional action plan"
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
        {loading ? (
          <p style={{ color: '#94a3b8' }}>Loading feedback...</p>
        ) : feedbackItems.length === 0 ? (
          <p style={{ color: '#94a3b8' }}>No feedback items found.</p>
        ) : (
          <div style={{ display: 'grid', gap: '16px' }}>
            {feedbackItems.map((item) => (
              <div key={item.id} style={savedCardStyle}>
                <div style={savedCardHeaderStyle}>
                  <div>
                    <div style={savedCardTitleStyle}>{item.agent_name}</div>
                    <div style={savedCardMetaStyle}>
                      {getFeedbackDisplayName(item)} • {item.agent_id} •{' '}
                      {item.team}
                    </div>
                  </div>

                  <div style={badgeRowStyle}>
                    <span style={statusPill(getTypeColor(item.feedback_type))}>
                      {item.feedback_type}
                    </span>
                    <span style={statusPill(getStatusColor(item.status))}>
                      {item.status}
                    </span>
                  </div>
                </div>

                <div style={savedGridStyle}>
                  <p>
                    <strong>QA Name:</strong> {item.qa_name}
                  </p>
                  <p>
                    <strong>Subject:</strong> {item.subject}
                  </p>
                  <p>
                    <strong>Feedback:</strong> {item.feedback_note}
                  </p>
                  <p>
                    <strong>Action Plan:</strong> {item.action_plan || '-'}
                  </p>
                  <p>
                    <strong>Due Date:</strong> {item.due_date || '-'}
                  </p>
                  <p>
                    <strong>Created At:</strong>{' '}
                    {new Date(item.created_at).toLocaleString()}
                  </p>
                </div>

                <div style={savedActionRowStyle}>
                  <button
                    onClick={() => handleStatusChange(item.id, 'Open')}
                    style={secondaryButton}
                  >
                    Mark Open
                  </button>

                  <button
                    onClick={() => handleStatusChange(item.id, 'In Progress')}
                    style={secondaryButton}
                  >
                    In Progress
                  </button>

                  <button
                    onClick={() => handleStatusChange(item.id, 'Closed')}
                    style={secondaryButton}
                  >
                    Close
                  </button>

                  <button
                    onClick={() => handleDelete(item.id)}
                    style={dangerButton}
                  >
                    {pendingDeleteId === item.id ? 'Confirm Delete' : 'Delete'}
                  </button>
                </div>
              </div>
            ))}
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
  color: '#60a5fa',
  fontSize: '12px',
  fontWeight: 800,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.16em',
  marginBottom: '12px',
};

const panelStyle = {
  background:
    'linear-gradient(180deg, rgba(15, 23, 42, 0.82) 0%, rgba(15, 23, 42, 0.68) 100%)',
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
  color: '#cbd5e1',
  fontWeight: 700,
};

const fieldStyle = {
  width: '100%',
  padding: '14px 16px',
  borderRadius: '16px',
  border: '1px solid rgba(148, 163, 184, 0.16)',
  background: 'rgba(15, 23, 42, 0.7)',
  color: '#e5eefb',
};

const pickerButtonStyle = {
  width: '100%',
  padding: '14px 16px',
  borderRadius: '16px',
  border: '1px solid rgba(148, 163, 184, 0.16)',
  background: 'rgba(15, 23, 42, 0.7)',
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
  background: 'rgba(15, 23, 42, 0.96)',
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
  backgroundColor: 'rgba(15, 23, 42, 0.68)',
  color: '#94a3b8',
};

const pickerOptionStyle = {
  padding: '12px 14px',
  borderRadius: '12px',
  border: '1px solid rgba(148, 163, 184, 0.12)',
  backgroundColor: 'rgba(15, 23, 42, 0.6)',
  textAlign: 'left' as const,
  cursor: 'pointer',
  fontWeight: 600,
  color: '#e5eefb',
};

const pickerOptionActiveStyle = {
  border: '1px solid rgba(96, 165, 250, 0.36)',
  backgroundColor: 'rgba(30, 64, 175, 0.32)',
};

const infoCardStyle = {
  gridColumn: '1 / -1',
  borderRadius: '18px',
  padding: '18px',
  border: '1px solid rgba(148, 163, 184, 0.12)',
  background: 'rgba(15, 23, 42, 0.5)',
};

const infoCardTitleStyle = {
  color: '#93c5fd',
  fontSize: '12px',
  fontWeight: 800,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.12em',
  marginBottom: '10px',
};

const infoLineStyle = {
  margin: '0 0 8px 0',
  color: '#cbd5e1',
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
  background: 'rgba(15, 23, 42, 0.74)',
  color: '#e5eefb',
  fontWeight: 700,
  cursor: 'pointer',
};

const errorBannerStyle = {
  marginBottom: '16px',
  padding: '14px 16px',
  borderRadius: '16px',
  border: '1px solid rgba(248, 113, 113, 0.22)',
  background: 'rgba(127, 29, 29, 0.24)',
  color: '#fecaca',
};

const successBannerStyle = {
  marginBottom: '16px',
  padding: '14px 16px',
  borderRadius: '16px',
  border: '1px solid rgba(74, 222, 128, 0.2)',
  background: 'rgba(22, 101, 52, 0.16)',
  color: '#bbf7d0',
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

const savedCardStyle = {
  border: '1px solid rgba(148, 163, 184, 0.14)',
  borderRadius: '20px',
  padding: '20px',
  background:
    'linear-gradient(180deg, rgba(15, 23, 42, 0.74) 0%, rgba(15, 23, 42, 0.56) 100%)',
};

const savedCardHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '16px',
  alignItems: 'flex-start',
  flexWrap: 'wrap' as const,
  marginBottom: '14px',
};

const savedCardTitleStyle = {
  color: '#f8fafc',
  fontSize: '18px',
  fontWeight: 800,
};

const savedCardMetaStyle = {
  color: '#94a3b8',
  fontSize: '13px',
  marginTop: '6px',
};

const badgeRowStyle = {
  display: 'flex',
  gap: '8px',
  flexWrap: 'wrap' as const,
};

const savedGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '10px',
  color: '#cbd5e1',
};

const savedActionRowStyle = {
  display: 'flex',
  gap: '10px',
  flexWrap: 'wrap' as const,
  marginTop: '14px',
};

export default AgentFeedbackSupabase;
