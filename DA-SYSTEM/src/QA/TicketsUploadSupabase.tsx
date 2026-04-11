import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  clearAgentProfilesCache,
  getCachedAgentProfiles,
  type CachedAgentProfile,
} from '../lib/agentProfilesCache';
import { usePersistentState } from '../hooks/usePersistentState';

type AgentProfile = CachedAgentProfile;

type TicketsDraft = {
  selectedAgentProfileId: string;
  agentSearch: string;
  ticketsCount: string;
  dateFrom: string;
  dateTo: string;
  notes: string;
};

type PreparedCsvRow = {
  rowNumber: number;
  rawAgent: string;
  matchedAgentLabel: string;
  agent_id: string;
  agent_name: string;
  tickets_count: number;
};

type SkippedCsvRow = {
  rowNumber: number;
  agentLabel: string;
  reason: string;
};

const TEAM_NAME = 'Tickets';

const emptyDraft: TicketsDraft = {
  selectedAgentProfileId: '',
  agentSearch: '',
  ticketsCount: '',
  dateFrom: '',
  dateTo: '',
  notes: '',
};

function TicketsUploadSupabase() {
  const [draft, setDraft] = usePersistentState<TicketsDraft>(
    'detroit-axle-tickets-upload-draft',
    emptyDraft
  );

  const [saving, setSaving] = useState(false);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [agentLoadError, setAgentLoadError] = useState('');
  const [agentProfiles, setAgentProfiles] = useState<AgentProfile[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isAgentPickerOpen, setIsAgentPickerOpen] = useState(false);
  const [csvFileName, setCsvFileName] = useState('');
  const [csvPreparing, setCsvPreparing] = useState(false);
  const [csvSaving, setCsvSaving] = useState(false);
  const [preparedCsvRows, setPreparedCsvRows] = useState<PreparedCsvRow[]>([]);
  const [skippedCsvRows, setSkippedCsvRows] = useState<SkippedCsvRow[]>([]);

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

  function normalizeText(value?: string | null) {
    return String(value || '').replace(/\u00a0/g, ' ').trim();
  }

  function normalizeAgentName(value?: string | null) {
    return normalizeText(value).toLowerCase().replace(/\s+/g, ' ');
  }

  function parseTicketsCount(value?: string | null) {
    const raw = normalizeText(value).replace(/,/g, '');
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  function parseCsv(textValue: string) {
    const rows: string[][] = [];
    let current = '';
    let row: string[] = [];
    let inQuotes = false;
    const input = textValue.replace(/^\ufeff/, '');

    for (let i = 0; i < input.length; i += 1) {
      const char = input[i];
      const next = input[i + 1];

      if (char === '"') {
        if (inQuotes && next === '"') {
          current += '"';
          i += 1;
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
          i += 1;
        }
        row.push(current);
        if (row.some((cell) => normalizeText(cell) !== '')) {
          rows.push(row);
        }
        row = [];
        current = '';
        continue;
      }

      current += char;
    }

    if (current.length > 0 || row.length > 0) {
      row.push(current);
      if (row.some((cell) => normalizeText(cell) !== '')) {
        rows.push(row);
      }
    }

    return rows;
  }

  function normalizeHeader(value?: string | null) {
    return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  function findMatchingAgentProfile(rawAgent: string) {
    const normalized = normalizeAgentName(rawAgent);
    if (!normalized) return null;

    const byFullLabel = agentProfiles.find(
      (profile) => normalizeAgentName(getAgentLabel(profile)) === normalized
    );
    if (byFullLabel) return byFullLabel;

    const byAgentName = agentProfiles.find(
      (profile) => normalizeAgentName(profile.agent_name) === normalized
    );
    if (byAgentName) return byAgentName;

    const byDisplayName = agentProfiles.find(
      (profile) => normalizeAgentName(profile.display_name || '') === normalized
    );
    if (byDisplayName) return byDisplayName;

    return null;
  }

  async function handleCsvFileChange(file?: File | null) {
    if (!file) return;

    setCsvPreparing(true);
    setCsvFileName(file.name);
    setPreparedCsvRows([]);
    setSkippedCsvRows([]);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const csvText = new TextDecoder('utf-8').decode(bytes);
      const rows = parseCsv(csvText);

      if (rows.length === 0) {
        setErrorMessage('The uploaded CSV is empty.');
        return;
      }

      const headers = rows[0].map((cell) => normalizeHeader(cell));
      const agentIndex = headers.indexOf('agent');
      const ticketsIndex = headers.indexOf('tickets');

      if (agentIndex === -1 || ticketsIndex === -1) {
        setErrorMessage(
          'This CSV must include Agent and Tickets columns.'
        );
        return;
      }

      const nextPrepared: PreparedCsvRow[] = [];
      const nextSkipped: SkippedCsvRow[] = [];

      rows.slice(1).forEach((cells, rowIndex) => {
        const rowNumber = rowIndex + 2;
        const rawAgent = normalizeText(cells[agentIndex]);
        const rawTickets = normalizeText(cells[ticketsIndex]);

        if (!rawAgent) {
          nextSkipped.push({
            rowNumber,
            agentLabel: '-',
            reason: 'Missing Agent value.',
          });
          return;
        }

        const matchedProfile = findMatchingAgentProfile(rawAgent);
        if (!matchedProfile?.agent_id) {
          nextSkipped.push({
            rowNumber,
            agentLabel: rawAgent,
            reason: 'No matching Tickets agent profile was found.',
          });
          return;
        }

        const ticketsCount = parseTicketsCount(rawTickets);
        if (!Number.isFinite(ticketsCount)) {
          nextSkipped.push({
            rowNumber,
            agentLabel: rawAgent,
            reason: 'Tickets value is missing or invalid.',
          });
          return;
        }

        nextPrepared.push({
          rowNumber,
          rawAgent,
          matchedAgentLabel: getAgentLabel(matchedProfile),
          agent_id: matchedProfile.agent_id,
          agent_name: matchedProfile.agent_name,
          tickets_count: ticketsCount,
        });
      });

      setPreparedCsvRows(nextPrepared);
      setSkippedCsvRows(nextSkipped);

      if (nextPrepared.length === 0) {
        setErrorMessage('No importable ticket rows were found in this CSV.');
      } else {
        setSuccessMessage(
          `${nextPrepared.length} ticket row(s) are ready to import. ${nextSkipped.length} row(s) will be skipped.`
        );
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Could not parse the Tickets CSV.'
      );
    } finally {
      setCsvPreparing(false);
    }
  }

  async function handleSaveCsv() {
    setErrorMessage('');
    setSuccessMessage('');

    if (preparedCsvRows.length === 0) {
      setErrorMessage('Please upload a valid Tickets CSV first.');
      return;
    }

    if (!draft.dateFrom || !draft.dateTo) {
      setErrorMessage('Please fill Date From and Date To once for the whole CSV import.');
      return;
    }

    if (draft.dateTo < draft.dateFrom) {
      setErrorMessage('Date To cannot be earlier than Date From.');
      return;
    }

    setCsvSaving(true);

    try {
      const payload = preparedCsvRows.map((row) => ({
        agent_id: row.agent_id,
        agent_name: row.agent_name,
        tickets_count: row.tickets_count,
        ticket_date: draft.dateFrom,
        date_to: draft.dateTo,
        notes: draft.notes || null,
      }));

      const chunkSize = 200;
      for (let start = 0; start < payload.length; start += chunkSize) {
        const chunk = payload.slice(start, start + chunkSize);
        const { error } = await supabase.from('tickets_records').insert(chunk);
        if (error) throw error;
      }

      setPreparedCsvRows([]);
      setSkippedCsvRows([]);
      setCsvFileName('');
      setSuccessMessage(
        `${payload.length} Tickets row(s) imported successfully from CSV.`
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Could not save the Tickets CSV rows.'
      );
    } finally {
      setCsvSaving(false);
    }
  }

  function clearLoadedCsv() {
    setCsvFileName('');
    setPreparedCsvRows([]);
    setSkippedCsvRows([]);
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

  const previewCsvRows = useMemo(
    () => preparedCsvRows.slice(0, 12),
    [preparedCsvRows]
  );

  const previewSkippedCsvRows = useMemo(
    () => skippedCsvRows.slice(0, 20),
    [skippedCsvRows]
  );

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
    clearLoadedCsv();
  }

  async function handleSave() {
    setErrorMessage('');
    setSuccessMessage('');

    if (!selectedAgent) {
      setErrorMessage('Please choose an agent.');
      return;
    }

    if (!draft.ticketsCount || !draft.dateFrom || !draft.dateTo) {
      setErrorMessage('Please fill Tickets Count, Date From, and Date To.');
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

    const { error } = await supabase.from('tickets_records').insert({
      agent_id: selectedAgent.agent_id,
      agent_name: selectedAgent.agent_name,
      tickets_count: Number(draft.ticketsCount),
      ticket_date: draft.dateFrom,
      date_to: draft.dateTo,
      notes: draft.notes,
    });

    setSaving(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    resetForm();
    setSuccessMessage('Tickets record saved successfully. Draft cleared.');
  }

  return (
    <div style={{ color: 'var(--da-page-text, #e5eefb)' }}>
      <div style={pageHeaderStyle}>
        <div>
          <div style={sectionEyebrow}>Operations Upload</div>
          <h2 style={{ margin: 0, fontSize: '30px' }}>Tickets Upload</h2>
          <p style={{ margin: '10px 0 0 0', color: 'var(--da-subtle-text, #94a3b8)' }}>
            Upload tickets production using the live Tickets agent directory
            from profiles.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <div style={teamBadgeStyle}>Team: Tickets</div>
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

      <div style={csvPanelStyle}>
        <div style={csvHeaderStyle}>
          <div>
            <div style={infoCardTitleStyle}>CSV Import</div>
            <p style={csvSubtextStyle}>
              Upload the Tickets quantity CSV you shared. The importer uses the
              Agent and Tickets columns, ignores the extra columns, and applies
              Date From / Date To once for the whole CSV import.
            </p>
          </div>
        </div>

        <div style={formGridStyle}>
          <div style={wideFieldStyle}>
            <label style={labelStyle}>Tickets CSV File</label>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(event) =>
                void handleCsvFileChange(event.target.files?.[0] || null)
              }
              style={fieldStyle}
            />
            <div style={helperTextStyle}>
              Expected columns from your file: Agent, Tickets, Handling Time,
              Messages sent, Internal notes, One and done.
            </div>
          </div>

          <div>
            <label style={labelStyle}>Loaded File</label>
            <div style={summaryValueCardStyle}>{csvFileName || '-'}</div>
          </div>

          <div>
            <label style={labelStyle}>Ready Rows</label>
            <div style={summaryValueCardStyle}>{preparedCsvRows.length}</div>
          </div>

          <div>
            <label style={labelStyle}>Skipped Rows</label>
            <div style={summaryValueCardStyle}>{skippedCsvRows.length}</div>
          </div>

          <div>
            <label style={labelStyle}>Date From (whole CSV)</label>
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
            <label style={labelStyle}>Date To (whole CSV)</label>
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
            <label style={labelStyle}>Notes for whole CSV import</label>
            <textarea
              value={draft.notes}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  notes: event.target.value,
                }))
              }
              rows={3}
              style={fieldStyle}
              placeholder="Optional notes applied to all imported rows"
            />
          </div>
        </div>

        <div style={actionRowStyle}>
          <button
            type="button"
            onClick={() => void handleSaveCsv()}
            disabled={csvSaving || csvPreparing || preparedCsvRows.length === 0}
            style={primaryButton}
          >
            {csvSaving ? 'Importing...' : 'Import Tickets CSV'}
          </button>

          <button
            type="button"
            onClick={clearLoadedCsv}
            disabled={csvSaving || csvPreparing}
            style={secondaryButton}
          >
            Clear Loaded CSV
          </button>
        </div>

        {previewCsvRows.length > 0 ? (
          <div style={{ marginTop: '22px' }}>
            <div style={infoCardTitleStyle}>CSV Preview</div>
            <div style={tableWrapStyle}>
              <div style={tableStyle}>
                <div style={{ ...tableRowStyle, ...tableHeaderRowStyle }}>
                  <div style={csvCellRowStyle}>Row</div>
                  <div style={csvCellAgentStyle}>Agent</div>
                  <div style={csvCellCountStyle}>Tickets</div>
                </div>

                {previewCsvRows.map((row) => (
                  <div key={`${row.rowNumber}-${row.agent_id}`} style={entryStyle}>
                    <div style={tableRowStyle}>
                      <div style={csvCellRowStyle}>
                        <div style={primaryCellTextStyle}>{row.rowNumber}</div>
                      </div>
                      <div style={csvCellAgentStyle}>
                        <div style={primaryCellTextStyle}>{row.matchedAgentLabel}</div>
                        <div style={secondaryCellTextStyle}>
                          CSV: {row.rawAgent} • {row.agent_id}
                        </div>
                      </div>
                      <div style={csvCellCountStyle}>
                        <div style={primaryCellTextStyle}>{row.tickets_count}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {previewSkippedCsvRows.length > 0 ? (
          <div style={{ marginTop: '22px' }}>
            <div style={infoCardTitleStyle}>Skipped Rows</div>
            <div style={{ display: 'grid', gap: '10px' }}>
              {previewSkippedCsvRows.map((row) => (
                <div
                  key={`${row.rowNumber}-${row.agentLabel}-${row.reason}`}
                  style={skippedRowStyle}
                >
                  <div style={primaryCellTextStyle}>
                    Row {row.rowNumber} • {row.agentLabel || '-'}
                  </div>
                  <div style={secondaryCellTextStyle}>{row.reason}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div style={panelStyle}>
        <div style={formGridStyle}>
          <div style={wideFieldStyle}>
            <div style={infoCardTitleStyle}>Manual Single Record</div>
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
                        No agents found for Tickets
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
            <label style={labelStyle}>Tickets Count</label>
            <input
              type="number"
              min="0"
              value={draft.ticketsCount}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  ticketsCount: event.target.value,
                }))
              }
              style={fieldStyle}
              placeholder="Enter tickets count"
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
          {saving ? 'Saving...' : 'Save Tickets Record'}
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
  color: 'var(--da-accent-text, #60a5fa)',
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
  background: 'var(--da-surface-bg, rgba(15, 23, 42, 0.62))',
  color: 'var(--da-muted-text, #cbd5e1)',
  fontWeight: 700,
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

const pickerErrorStyle = {
  padding: '12px',
  borderRadius: '12px',
  backgroundColor: 'var(--da-error-bg, rgba(127, 29, 29, 0.24))',
  color: 'var(--da-error-text, #fecaca)',
  border: 'var(--da-error-border, 1px solid rgba(248, 113, 113, 0.22))',
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
  backgroundColor: 'var(--da-error-bg, rgba(127, 29, 29, 0.24))',
  border: 'var(--da-warning-border, 1px solid rgba(252, 165, 165, 0.24))',
  color: 'var(--da-error-text, #fecaca)',
  fontWeight: 700,
};

const successBannerStyle = {
  marginBottom: '16px',
  padding: '14px 16px',
  borderRadius: '16px',
  backgroundColor: 'rgba(22, 101, 52, 0.24)',
  border: '1px solid rgba(134, 239, 172, 0.22)',
  color: 'var(--da-success-text, #bbf7d0)',
  fontWeight: 700,
};

const csvPanelStyle = {
  ...panelStyle,
  marginBottom: '20px',
};

const csvHeaderStyle = {
  marginBottom: '18px',
};

const csvSubtextStyle = {
  margin: '6px 0 0 0',
  color: 'var(--da-subtle-text, #94a3b8)',
  lineHeight: 1.6,
};

const helperTextStyle = {
  marginTop: '8px',
  color: 'var(--da-subtle-text, #94a3b8)',
  fontSize: '12px',
  lineHeight: 1.5,
};

const summaryValueCardStyle = {
  minHeight: '52px',
  display: 'flex',
  alignItems: 'center',
  padding: '14px 16px',
  borderRadius: '16px',
  border: '1px solid rgba(148, 163, 184, 0.16)',
  background: 'var(--da-card-bg, rgba(15, 23, 42, 0.5))',
  color: 'var(--da-title, #f8fafc)',
  fontWeight: 700,
};

const tableWrapStyle = {
  overflowX: 'auto' as const,
  borderRadius: '18px',
  border: '1px solid rgba(148, 163, 184, 0.14)',
  background: 'var(--da-card-bg, rgba(15, 23, 42, 0.5))',
};

const tableStyle = {
  minWidth: '760px',
};

const entryStyle = {
  borderBottom: '1px solid rgba(148, 163, 184, 0.08)',
};

const tableRowStyle = {
  display: 'grid',
  gridTemplateColumns: '100px minmax(320px, 1.5fr) 180px',
  gap: '14px',
  alignItems: 'center',
  padding: '14px 16px',
};

const tableHeaderRowStyle = {
  position: 'sticky' as const,
  top: 0,
  zIndex: 1,
  background: 'var(--da-widget-bg, rgba(2,6,23,0.92))',
  color: '#93c5fd',
  fontSize: '12px',
  fontWeight: 800,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.12em',
};

const csvCellRowStyle = {};
const csvCellAgentStyle = {};
const csvCellCountStyle = {};

const primaryCellTextStyle = {
  color: 'var(--da-title, #f8fafc)',
  fontSize: '14px',
  fontWeight: 700,
  lineHeight: 1.45,
};

const secondaryCellTextStyle = {
  marginTop: '4px',
  color: 'var(--da-subtle-text, #94a3b8)',
  fontSize: '12px',
  fontWeight: 600,
  lineHeight: 1.4,
};

const skippedRowStyle = {
  borderRadius: '14px',
  border: '1px solid rgba(148, 163, 184, 0.14)',
  background: 'var(--da-card-bg, rgba(15, 23, 42, 0.5))',
  padding: '14px 16px',
};

export default TicketsUploadSupabase;
