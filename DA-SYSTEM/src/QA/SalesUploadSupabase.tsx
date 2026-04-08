import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  clearAgentProfilesCache,
  getCachedAgentProfiles,
  type CachedAgentProfile,
} from '../lib/agentProfilesCache';
import { usePersistentState } from '../hooks/usePersistentState';

type AgentProfile = CachedAgentProfile;

type SalesDraft = {
  selectedAgentProfileId: string;
  agentSearch: string;
  amount: string;
  dateFrom: string;
  dateTo: string;
  notes: string;
};

const TEAM_NAME = 'Sales';

const emptyDraft: SalesDraft = {
  selectedAgentProfileId: '',
  agentSearch: '',
  amount: '',
  dateFrom: '',
  dateTo: '',
  notes: '',
};

function SalesUploadSupabase() {
  const [draft, setDraft] = usePersistentState<SalesDraft>(
    'detroit-axle-sales-upload-draft',
    emptyDraft
  );

  const [saving, setSaving] = useState(false);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [agentLoadError, setAgentLoadError] = useState('');
  const [agentProfiles, setAgentProfiles] = useState<AgentProfile[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isAgentPickerOpen, setIsAgentPickerOpen] = useState(false);

  const agentPickerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void loadAgentProfiles();
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
      const data = await getCachedAgentProfiles(TEAM_NAME, {
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

  function handleRefreshAgents() {
    clearAgentProfilesCache(TEAM_NAME);
    void loadAgentProfiles({ force: true });
  }

  function getAgentLabel(profile: AgentProfile) {
    return profile.display_name
      ? `${profile.agent_name} - ${profile.display_name}`
      : `${profile.agent_name} - ${profile.agent_id}`;
  }

  const visibleAgents = useMemo(() => {
    const search = draft.agentSearch.trim().toLowerCase();

    if (!search) return agentProfiles;

    return agentProfiles.filter((profile) => {
      const label = getAgentLabel(profile);

      return (
        profile.agent_name.toLowerCase().includes(search) ||
        (profile.agent_id || '').toLowerCase().includes(search) ||
        (profile.display_name || '').toLowerCase().includes(search) ||
        label.toLowerCase().includes(search)
      );
    });
  }, [agentProfiles, draft.agentSearch]);

  const selectedAgent =
    agentProfiles.find(
      (profile) => profile.id === draft.selectedAgentProfileId
    ) || null;

  function handleSelectAgent(profile: AgentProfile) {
    setDraft((prev) => ({
      ...prev,
      selectedAgentProfileId: profile.id,
      agentSearch: getAgentLabel(profile),
    }));
    setIsAgentPickerOpen(false);
  }

  function resetForm() {
    setDraft(emptyDraft);
    setIsAgentPickerOpen(false);
  }

  async function handleSave() {
    setErrorMessage('');
    setSuccessMessage('');

    if (!selectedAgent) {
      setErrorMessage('Please choose an agent.');
      return;
    }

    if (!draft.amount || !draft.dateFrom || !draft.dateTo) {
      setErrorMessage('Please fill Amount, Date From, and Date To.');
      return;
    }

    if (draft.dateTo < draft.dateFrom) {
      setErrorMessage('Date To cannot be earlier than Date From.');
      return;
    }

    if (!selectedAgent.agent_id) {
      setErrorMessage('Selected agent does not have an Agent ID.');
      return;
    }

    setSaving(true);

    const { error } = await supabase.from('sales_records').insert({
      agent_id: selectedAgent.agent_id,
      agent_name: selectedAgent.agent_name,
      amount: Number(draft.amount),
      sale_date: draft.dateFrom,
      date_to: draft.dateTo,
      notes: draft.notes,
    });

    setSaving(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    resetForm();
    setSuccessMessage('Sales record saved successfully. Draft cleared.');
  }

  return (
    <div style={{ color: '#e5eefb' }}>
      <div style={pageHeaderStyle}>
        <div>
          <div style={sectionEyebrow}>Operations Upload</div>
          <h2 style={{ margin: 0, fontSize: '30px' }}>Sales Upload</h2>
          <p style={{ margin: '10px 0 0 0', color: '#94a3b8' }}>
            Upload sales production using the live Sales agent directory from
            profiles.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <div style={teamBadgeStyle}>Team: Sales</div>
          <button
            type="button"
            onClick={handleRefreshAgents}
            style={secondaryButton}
          >
            Refresh Agents
          </button>
        </div>
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
                      value={draft.agentSearch}
                      onChange={(event) =>
                        setDraft((prev) => ({
                          ...prev,
                          agentSearch: event.target.value,
                        }))
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
                      <div style={pickerInfoStyle}>
                        No agents found for Sales
                      </div>
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
            <div style={infoCardTitleStyle}>Selected Agent</div>
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
            <p style={{ ...infoLineStyle, marginBottom: 0 }}>
              <strong>Team:</strong> {selectedAgent?.team || '-'}
            </p>
          </div>

          <div>
            <label style={labelStyle}>Amount Sold</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={draft.amount}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  amount: event.target.value,
                }))
              }
              style={fieldStyle}
              placeholder="Enter amount sold"
            />
          </div>

          <div>
            <label style={labelStyle}>Date From</label>
            <input
              type="date"
              value={draft.dateFrom}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  dateFrom: event.target.value,
                }))
              }
              style={fieldStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Date To</label>
            <input
              type="date"
              value={draft.dateTo}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  dateTo: event.target.value,
                }))
              }
              style={fieldStyle}
            />
          </div>

          <div style={wideFieldStyle}>
            <label style={labelStyle}>Notes</label>
            <textarea
              value={draft.notes}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  notes: event.target.value,
                }))
              }
              rows={4}
              style={fieldStyle}
              placeholder="Optional notes for this upload"
            />
          </div>
        </div>
      </div>

      <div style={actionRowStyle}>
        <button onClick={handleSave} disabled={saving} style={primaryButton}>
          {saving ? 'Saving...' : 'Save Sales Record'}
        </button>
        <button
          type="button"
          onClick={() => {
            resetForm();
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
  alignItems: 'flex-start',
  flexWrap: 'wrap' as const,
  gap: '16px',
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

const teamBadgeStyle = {
  padding: '12px 14px',
  borderRadius: '14px',
  border: '1px solid rgba(148, 163, 184, 0.16)',
  background: 'rgba(15, 23, 42, 0.62)',
  color: '#cbd5e1',
  fontWeight: 700,
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

const pickerErrorStyle = {
  padding: '12px',
  borderRadius: '12px',
  backgroundColor: 'rgba(127, 29, 29, 0.24)',
  color: '#fecaca',
  border: '1px solid rgba(248, 113, 113, 0.22)',
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

export default SalesUploadSupabase;
