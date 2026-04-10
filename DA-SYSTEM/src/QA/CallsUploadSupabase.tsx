import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  clearAgentProfilesCache,
  getCachedAgentProfiles,
  type CachedAgentProfile,
} from '../lib/agentProfilesCache';
import { usePersistentState } from '../hooks/usePersistentState';

type AgentProfile = CachedAgentProfile;

type CallsDraft = {
  selectedAgentProfileId: string;
  agentSearch: string;
  callsCount: string;
  dateFrom: string;
  dateTo: string;
  notes: string;
};

type CsvRow = {
  rowNumber: number;
  agentName: string;
  agentId: string;
  handled: string;
};

type CsvImportSummary = {
  importedCount: number;
  skippedCount: number;
  skippedRows: Array<{
    rowNumber: number;
    agentName: string;
    agentId: string;
    reason: string;
  }>;
};

const TEAM_NAME = 'Calls';

const emptyDraft: CallsDraft = {
  selectedAgentProfileId: '',
  agentSearch: '',
  callsCount: '',
  dateFrom: '',
  dateTo: '',
  notes: '',
};

function normalizeAgentId(value: string | null | undefined) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.replace(/\.0+$/, '').trim();
}

function normalizeAgentName(value: string | null | undefined) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

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
      values.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current);
  return values.map((item) => item.trim());
}

function parseCallsCsv(text: string): CsvRow[] {
  const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalizedText) {
    return [];
  }

  const lines = normalizedText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return [];
  }

  const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase());
  const agentNameIndex = headers.indexOf('agent name');
  const agentIdIndex = headers.indexOf('agent id');
  const handledIndex = headers.indexOf('handled');

  if (agentNameIndex === -1 || agentIdIndex === -1 || handledIndex === -1) {
    throw new Error(
      'CSV must contain these columns: Agent name, Agent Id, Handled.'
    );
  }

  return lines.slice(1).map((line, rowIndex) => {
    const values = parseCsvLine(line);

    return {
      rowNumber: rowIndex + 2,
      agentName: values[agentNameIndex] || '',
      agentId: normalizeAgentId(values[agentIdIndex] || ''),
      handled: String(values[handledIndex] || '').trim(),
    };
  });
}

function CallsUploadSupabase() {
  const [draft, setDraft] = usePersistentState<CallsDraft>(
    'detroit-axle-calls-upload-draft',
    emptyDraft
  );

  const [saving, setSaving] = useState(false);
  const [csvSaving, setCsvSaving] = useState(false);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [agentLoadError, setAgentLoadError] = useState('');
  const [agentProfiles, setAgentProfiles] = useState<AgentProfile[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isAgentPickerOpen, setIsAgentPickerOpen] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvDateFrom, setCsvDateFrom] = useState('');
  const [csvDateTo, setCsvDateTo] = useState('');
  const [csvNotes, setCsvNotes] = useState('');
  const [csvSummary, setCsvSummary] = useState<CsvImportSummary | null>(null);

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

  function resetCsvForm() {
    setCsvFile(null);
    setCsvDateFrom('');
    setCsvDateTo('');
    setCsvNotes('');
    setCsvSummary(null);
  }

  async function handleSave() {
    setErrorMessage('');
    setSuccessMessage('');
    setCsvSummary(null);

    if (!selectedAgent) {
      setErrorMessage('Please choose an agent.');
      return;
    }

    if (!draft.callsCount || !draft.dateFrom || !draft.dateTo) {
      setErrorMessage('Please fill Calls Count, Date From, and Date To.');
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

    const { error } = await supabase.from('calls_records').insert({
      agent_id: selectedAgent.agent_id,
      agent_name: selectedAgent.agent_name,
      calls_count: Number(draft.callsCount),
      call_date: draft.dateFrom,
      date_to: draft.dateTo,
      notes: draft.notes,
    });

    setSaving(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    resetForm();
    setSuccessMessage('Calls record saved successfully. Draft cleared.');
  }

  async function handleCsvImport() {
    setErrorMessage('');
    setSuccessMessage('');
    setCsvSummary(null);

    if (!csvFile) {
      setErrorMessage('Please choose a CSV file.');
      return;
    }

    if (!csvDateFrom || !csvDateTo) {
      setErrorMessage('Please fill Date From and Date To for the CSV import.');
      return;
    }

    if (csvDateTo < csvDateFrom) {
      setErrorMessage('CSV Date To cannot be earlier than Date From.');
      return;
    }

    if (agentProfiles.length === 0) {
      setErrorMessage('No Calls team profiles are available for matching.');
      return;
    }

    setCsvSaving(true);

    try {
      const csvText = await csvFile.text();
      const parsedRows = parseCallsCsv(csvText);

      if (parsedRows.length === 0) {
        throw new Error('The CSV file does not contain any data rows.');
      }

      const agentIdMap = new Map<string, AgentProfile>();
      const agentNameMap = new Map<string, AgentProfile>();

      agentProfiles.forEach((profile) => {
        if (profile.agent_id) {
          agentIdMap.set(normalizeAgentId(profile.agent_id), profile);
        }
        agentNameMap.set(normalizeAgentName(profile.agent_name), profile);
      });

      const rowsToInsert: Array<{
        agent_id: string;
        agent_name: string;
        calls_count: number;
        call_date: string;
        date_to: string;
        notes: string;
      }> = [];

      const skippedRows: CsvImportSummary['skippedRows'] = [];

      parsedRows.forEach((row) => {
        const matchedById = row.agentId ? agentIdMap.get(row.agentId) : null;
        const matchedByName = agentNameMap.get(normalizeAgentName(row.agentName));
        const matchedProfile = matchedById || matchedByName || null;

        const handledCount = Number(String(row.handled || '').replace(/,/g, ''));

        if (!matchedProfile || !matchedProfile.agent_id) {
          skippedRows.push({
            rowNumber: row.rowNumber,
            agentName: row.agentName,
            agentId: row.agentId,
            reason: 'No Calls team profile match found.',
          });
          return;
        }

        if (!Number.isFinite(handledCount)) {
          skippedRows.push({
            rowNumber: row.rowNumber,
            agentName: row.agentName,
            agentId: row.agentId,
            reason: 'Handled value is not a valid number.',
          });
          return;
        }

        rowsToInsert.push({
          agent_id: matchedProfile.agent_id,
          agent_name: matchedProfile.agent_name,
          calls_count: handledCount,
          call_date: csvDateFrom,
          date_to: csvDateTo,
          notes: csvNotes,
        });
      });

      if (rowsToInsert.length === 0) {
        setCsvSummary({
          importedCount: 0,
          skippedCount: skippedRows.length,
          skippedRows,
        });
        throw new Error(
          'No rows were imported. All CSV rows were skipped because they did not match Calls team profiles or had invalid Handled values.'
        );
      }

      const { error } = await supabase.from('calls_records').insert(rowsToInsert);

      if (error) {
        throw new Error(error.message);
      }

      setCsvSummary({
        importedCount: rowsToInsert.length,
        skippedCount: skippedRows.length,
        skippedRows,
      });
      setSuccessMessage(
        `CSV imported successfully. Imported ${rowsToInsert.length} row(s)${
          skippedRows.length > 0 ? ` and skipped ${skippedRows.length}.` : '.'
        }`
      );
      resetCsvForm();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'CSV import failed.'
      );
    } finally {
      setCsvSaving(false);
    }
  }

  return (
    <div style={{ color: '#e5eefb' }}>
      <div style={pageHeaderStyle}>
        <div>
          <div style={sectionEyebrow}>Operations Upload</div>
          <h2 style={{ margin: 0, fontSize: '30px' }}>Calls Upload</h2>
          <p style={{ margin: '10px 0 0 0', color: '#94a3b8' }}>
            Upload calls production using the live Calls agent directory from
            profiles.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <div style={teamBadgeStyle}>Team: Calls</div>
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

      {csvSummary ? (
        <div style={summaryCardStyle}>
          <div style={infoCardTitleStyle}>CSV Import Summary</div>
          <p style={infoLineStyle}>
            <strong>Imported:</strong> {csvSummary.importedCount}
          </p>
          <p style={infoLineStyle}>
            <strong>Skipped:</strong> {csvSummary.skippedCount}
          </p>

          {csvSummary.skippedRows.length > 0 ? (
            <div style={{ marginTop: '12px' }}>
              <div style={summarySubTitleStyle}>Skipped Rows</div>
              <div style={skippedListStyle}>
                {csvSummary.skippedRows.map((row) => (
                  <div key={`${row.rowNumber}-${row.agentId}-${row.agentName}`} style={skippedItemStyle}>
                    Row {row.rowNumber} • {row.agentName || '-'} • {row.agentId || '-'} • {row.reason}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div style={panelStyle}>
        <div style={sectionMiniTitleStyle}>Manual Upload</div>

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
                        No agents found for Calls
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
            <label style={labelStyle}>Calls Count</label>
            <input
              type="number"
              min="0"
              value={draft.callsCount}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  callsCount: event.target.value,
                }))
              }
              style={fieldStyle}
              placeholder="Enter calls count"
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
          {saving ? 'Saving...' : 'Save Calls Record'}
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

      <div style={{ ...panelStyle, marginTop: '26px' }}>
        <div style={sectionMiniTitleStyle}>CSV Import</div>
        <p style={sectionSupportTextStyle}>
          Upload your calls CSV, enter Date From and Date To once for the whole
          batch, and only rows that match profiles in the Calls team will be
          imported. All other rows will be ignored.
        </p>

        <div style={formGridStyle}>
          <div style={wideFieldStyle}>
            <label style={labelStyle}>CSV File</label>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(event) =>
                setCsvFile(event.target.files?.[0] || null)
              }
              style={fileInputStyle}
            />
            <div style={helperTextStyle}>
              Required columns: Agent name, Agent Id, Handled
            </div>
            {csvFile ? (
              <div style={helperTextStyle}>Selected file: {csvFile.name}</div>
            ) : null}
          </div>

          <div>
            <label style={labelStyle}>Date From</label>
            <input
              type="date"
              value={csvDateFrom}
              onChange={(event) => setCsvDateFrom(event.target.value)}
              style={fieldStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Date To</label>
            <input
              type="date"
              value={csvDateTo}
              onChange={(event) => setCsvDateTo(event.target.value)}
              style={fieldStyle}
            />
          </div>

          <div style={wideFieldStyle}>
            <label style={labelStyle}>Notes</label>
            <textarea
              value={csvNotes}
              onChange={(event) => setCsvNotes(event.target.value)}
              rows={4}
              style={fieldStyle}
              placeholder="Optional notes for this whole CSV import batch"
            />
          </div>
        </div>

        <div style={actionRowStyle}>
          <button
            type="button"
            onClick={handleCsvImport}
            disabled={csvSaving}
            style={primaryButton}
          >
            {csvSaving ? 'Importing CSV...' : 'Import CSV'}
          </button>

          <button
            type="button"
            onClick={() => {
              resetCsvForm();
              setErrorMessage('');
              setSuccessMessage('CSV import form cleared.');
            }}
            disabled={csvSaving}
            style={secondaryButton}
          >
            Clear CSV Form
          </button>
        </div>
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

const sectionMiniTitleStyle = {
  color: '#93c5fd',
  fontSize: '13px',
  fontWeight: 800,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.12em',
  marginBottom: '10px',
};

const sectionSupportTextStyle = {
  color: '#94a3b8',
  marginTop: 0,
  marginBottom: '18px',
  lineHeight: 1.6,
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

const summaryCardStyle = {
  marginBottom: '20px',
  borderRadius: '20px',
  border: '1px solid rgba(96, 165, 250, 0.18)',
  background:
    'linear-gradient(180deg, rgba(15, 23, 42, 0.82) 0%, rgba(10, 16, 32, 0.88) 100%)',
  padding: '18px',
};

const summarySubTitleStyle = {
  color: '#93c5fd',
  fontSize: '12px',
  fontWeight: 800,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.12em',
  marginBottom: '10px',
};

const skippedListStyle = {
  display: 'grid',
  gap: '8px',
};

const skippedItemStyle = {
  padding: '10px 12px',
  borderRadius: '12px',
  backgroundColor: 'rgba(15, 23, 42, 0.62)',
  border: '1px solid rgba(148, 163, 184, 0.12)',
  color: '#cbd5e1',
  fontSize: '13px',
  lineHeight: 1.5,
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

const helperTextStyle = {
  marginTop: '8px',
  color: '#94a3b8',
  fontSize: '12px',
};

const fieldStyle = {
  width: '100%',
  padding: '14px 16px',
  borderRadius: '16px',
  border: '1px solid rgba(148, 163, 184, 0.16)',
  background: 'rgba(15, 23, 42, 0.7)',
  color: '#e5eefb',
};

const fileInputStyle = {
  ...fieldStyle,
  padding: '12px 14px',
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

export default CallsUploadSupabase;
