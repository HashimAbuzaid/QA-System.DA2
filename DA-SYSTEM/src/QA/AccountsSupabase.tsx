import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type ProfileRole = 'admin' | 'qa' | 'agent' | 'supervisor';

type ProfileRow = {
  id: string;
  role: ProfileRole;
  agent_id: string | null;
  agent_name: string;
  display_name: string | null;
  team: 'Calls' | 'Tickets' | 'Sales' | null;
  email: string;
  created_at?: string;
};

function roleNeedsTeam(role: ProfileRole) {
  return role === 'agent' || role === 'supervisor';
}

function roleNeedsAgentId(role: ProfileRole) {
  return role === 'agent';
}

function roleNeedsDisplayName(role: ProfileRole) {
  return role === 'agent';
}

function AccountsSupabase() {
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const [id, setId] = useState('');
  const [role, setRole] = useState<ProfileRole>('agent');
  const [agentId, setAgentId] = useState('');
  const [agentName, setAgentName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [team, setTeam] = useState<'Calls' | 'Tickets' | 'Sales' | ''>('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    void loadProfiles();
  }, []);

  async function loadProfiles() {
    setLoading(true);
    setErrorMessage('');

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    setLoading(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setProfiles((data as ProfileRow[]) || []);
  }

  function resetForm() {
    setErrorMessage('');
    setSuccessMessage('');
    setId('');
    setRole('agent');
    setAgentId('');
    setAgentName('');
    setDisplayName('');
    setTeam('');
    setEmail('');
    setEditingProfileId(null);
  }

  function startEditProfile(profile: ProfileRow) {
    setErrorMessage('');
    setSuccessMessage('');
    setPendingDeleteId(null);
    setEditingProfileId(profile.id);
    setId(profile.id);
    setRole(profile.role);
    setAgentId(roleNeedsAgentId(profile.role) ? profile.agent_id || '' : '');
    setAgentName(profile.agent_name);
    setDisplayName(
      roleNeedsDisplayName(profile.role) ? profile.display_name || '' : ''
    );
    setTeam(roleNeedsTeam(profile.role) ? profile.team || '' : '');
    setEmail(profile.email);
  }

  async function validateAgentUniqueness(profileIdToIgnore?: string) {
    if (role !== 'agent') return true;

    setErrorMessage('');

    const cleanAgentId = agentId.trim();

    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'agent')
      .eq('agent_id', cleanAgentId)
      .eq('team', team);

    if (error) {
      setErrorMessage(error.message);
      return false;
    }

    const duplicate = (data || []).find(
      (item) => item.id !== profileIdToIgnore
    );

    if (duplicate) {
      setErrorMessage(
        `Agent ID ${cleanAgentId} already exists in ${team}. Please use a different Agent ID or edit the existing row.`
      );
      return false;
    }

    return true;
  }

  async function handleCreateProfile() {
    setErrorMessage('');
    setSuccessMessage('');
    const cleanId = id.trim();
    const cleanAgentId = agentId.trim();
    const cleanAgentName = agentName.trim();
    const cleanDisplayName = displayName.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanId || !cleanAgentName || !cleanEmail || !role) {
      setErrorMessage('Please fill UUID, Name, Email, and Role.');
      return;
    }

    if (role === 'agent' && (!cleanAgentId || !team)) {
      setErrorMessage('Please fill Agent ID and Team for an agent.');
      return;
    }

    if (role === 'supervisor' && !team) {
      setErrorMessage('Please select a Team for a supervisor.');
      return;
    }

    setSaving(true);

    const { data: existingProfile, error: existingProfileError } =
      await supabase
        .from('profiles')
        .select('id')
        .eq('id', cleanId)
        .maybeSingle();

    if (existingProfileError) {
      setSaving(false);
      setErrorMessage(existingProfileError.message);
      return;
    }

    if (existingProfile) {
      setSaving(false);
      setErrorMessage(
        'This Auth User UUID already has a profile. Use a different UUID or edit the existing profile.'
      );
      return;
    }

    const isUnique = await validateAgentUniqueness();
    if (!isUnique) {
      setSaving(false);
      return;
    }

    const { error } = await supabase.from('profiles').insert({
      id: cleanId,
      role,
      agent_id: role === 'agent' ? cleanAgentId : null,
      agent_name: cleanAgentName,
      display_name: role === 'agent' ? cleanDisplayName || null : null,
      team: roleNeedsTeam(role) ? team : null,
      email: cleanEmail,
    });

    setSaving(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setSuccessMessage('Profile created successfully.');
    resetForm();
    void loadProfiles();
  }

  async function handleUpdateProfile() {
    if (!editingProfileId) return;

    setErrorMessage('');
    setSuccessMessage('');

    const cleanAgentId = agentId.trim();
    const cleanAgentName = agentName.trim();
    const cleanDisplayName = displayName.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanAgentName || !cleanEmail || !role) {
      setErrorMessage('Please fill Name, Email, and Role.');
      return;
    }

    if (role === 'agent' && (!cleanAgentId || !team)) {
      setErrorMessage('Please fill Agent ID and Team for an agent.');
      return;
    }

    if (role === 'supervisor' && !team) {
      setErrorMessage('Please select a Team for a supervisor.');
      return;
    }

    setSaving(true);

    const isUnique = await validateAgentUniqueness(editingProfileId);
    if (!isUnique) {
      setSaving(false);
      return;
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        role,
        agent_id: role === 'agent' ? cleanAgentId : null,
        agent_name: cleanAgentName,
        display_name: role === 'agent' ? cleanDisplayName || null : null,
        team: roleNeedsTeam(role) ? team : null,
        email: cleanEmail,
      })
      .eq('id', editingProfileId);

    setSaving(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setSuccessMessage('Profile updated successfully.');
    resetForm();
    void loadProfiles();
  }

  async function handleDeleteProfile(
    profileId: string,
    profileRole: ProfileRole
  ) {
    setErrorMessage('');
    setSuccessMessage('');

    if (
      profileRole === 'admin' ||
      profileRole === 'qa' ||
      profileRole === 'supervisor'
    ) {
      setErrorMessage(
        'Do not delete admin, QA, or supervisor profiles from here.'
      );
      return;
    }

    if (pendingDeleteId !== profileId) {
      setPendingDeleteId(profileId);
      setSuccessMessage('Click delete again to confirm profile removal.');
      return;
    }

    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', profileId);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    if (editingProfileId === profileId) {
      resetForm();
    }

    setPendingDeleteId(null);
    setProfiles((prev) => prev.filter((item) => item.id !== profileId));
    setSuccessMessage('Profile deleted successfully.');
  }

  return (
    <div style={{ color: '#e5eefb' }}>
      <div style={pageHeaderStyle}>
        <div>
          <div style={sectionEyebrow}>Access Management</div>
          <h2 style={{ margin: 0, fontSize: '30px' }}>Accounts</h2>
          <p style={{ margin: '10px 0 0 0', color: '#94a3b8' }}>
            Create and manage profile rows after the user already exists in
            Supabase Authentication.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadProfiles()}
          style={secondaryButton}
        >
          Refresh Profiles
        </button>
      </div>

      {errorMessage ? <div style={errorBannerStyle}>{errorMessage}</div> : null}
      {successMessage ? (
        <div style={successBannerStyle}>{successMessage}</div>
      ) : null}

      <div style={panelStyle}>
        <h3 style={{ marginTop: 0, color: '#f8fafc' }}>
          {editingProfileId ? 'Edit Profile' : 'Create Profile'}
        </h3>

        <div style={formGridStyle}>
          <div style={wideFieldStyle}>
            <label style={labelStyle}>Auth User UUID</label>
            <input
              type="text"
              value={id}
              onChange={(e) => setId(e.target.value)}
              disabled={Boolean(editingProfileId)}
              style={{
                ...fieldStyle,
                opacity: editingProfileId ? 0.7 : 1,
              }}
              placeholder="Paste UUID from Supabase Authentication"
            />
          </div>

          <div>
            <label style={labelStyle}>Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as ProfileRole)}
              style={fieldStyle}
            >
              <option value="agent">Agent</option>
              <option value="qa">QA</option>
              <option value="supervisor">Supervisor</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          {roleNeedsAgentId(role) && (
            <div>
              <label style={labelStyle}>Agent ID</label>
              <input
                type="text"
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                style={fieldStyle}
                placeholder="Enter agent ID"
              />
            </div>
          )}

          {roleNeedsTeam(role) && (
            <div>
              <label style={labelStyle}>Team</label>
              <select
                value={team}
                onChange={(e) =>
                  setTeam(e.target.value as 'Calls' | 'Tickets' | 'Sales' | '')
                }
                style={fieldStyle}
              >
                <option value="">Select Team</option>
                <option value="Calls">Calls</option>
                <option value="Tickets">Tickets</option>
                <option value="Sales">Sales</option>
              </select>
            </div>
          )}

          <div>
            <label style={labelStyle}>Name</label>
            <input
              type="text"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              style={fieldStyle}
              placeholder="Enter full name"
            />
          </div>

          {roleNeedsDisplayName(role) && (
            <div>
              <label style={labelStyle}>Display Name / Nickname</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Example: Kurt"
                style={fieldStyle}
              />
            </div>
          )}

          <div>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={fieldStyle}
              placeholder="name@detroitaxle.com"
            />
          </div>
        </div>
      </div>

      <div style={actionRowStyle}>
        {editingProfileId ? (
          <>
            <button
              onClick={handleUpdateProfile}
              disabled={saving}
              style={primaryButton}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>

            <button onClick={resetForm} type="button" style={secondaryButton}>
              Cancel Edit
            </button>
          </>
        ) : (
          <button
            onClick={handleCreateProfile}
            disabled={saving}
            style={primaryButton}
          >
            {saving ? 'Saving...' : 'Create Profile'}
          </button>
        )}
      </div>

      <div style={{ marginTop: '32px' }}>
        <div style={sectionEyebrow}>Saved Profiles</div>
        {loading ? (
          <p style={{ color: '#94a3b8' }}>Loading accounts...</p>
        ) : profiles.length === 0 ? (
          <p style={{ color: '#94a3b8' }}>No profiles found.</p>
        ) : (
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={headerCell}>UUID</th>
                  <th style={headerCell}>Role</th>
                  <th style={headerCell}>Agent ID</th>
                  <th style={headerCell}>Name</th>
                  <th style={headerCell}>Display Name</th>
                  <th style={headerCell}>Team</th>
                  <th style={headerCell}>Email</th>
                  <th style={headerCell}>Action</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((profile) => (
                  <tr key={profile.id}>
                    <td style={bodyCell}>{profile.id}</td>
                    <td style={bodyCell}>{profile.role}</td>
                    <td style={bodyCell}>{profile.agent_id || '-'}</td>
                    <td style={bodyCell}>{profile.agent_name}</td>
                    <td style={bodyCell}>{profile.display_name || '-'}</td>
                    <td style={bodyCell}>{profile.team || '-'}</td>
                    <td style={bodyCell}>{profile.email}</td>
                    <td style={bodyCell}>
                      <div
                        style={{
                          display: 'flex',
                          gap: '8px',
                          flexWrap: 'wrap',
                        }}
                      >
                        <button
                          onClick={() => startEditProfile(profile)}
                          style={smallPrimaryButton}
                        >
                          Edit
                        </button>

                        <button
                          onClick={() =>
                            handleDeleteProfile(profile.id, profile.role)
                          }
                          style={smallDangerButton}
                        >
                          {pendingDeleteId === profile.id
                            ? 'Confirm Delete'
                            : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={warningCardStyle}>
        <strong>Important:</strong> This page creates profile rows only. Real
        email and password users must still be created first in Supabase
        Authentication.
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

const tableWrapStyle = {
  overflowX: 'auto' as const,
  borderRadius: '20px',
  border: '1px solid rgba(148, 163, 184, 0.14)',
  background:
    'linear-gradient(180deg, rgba(15, 23, 42, 0.74) 0%, rgba(15, 23, 42, 0.56) 100%)',
};

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse' as const,
  minWidth: '960px',
};

const headerCell = {
  padding: '14px 16px',
  textAlign: 'left' as const,
  whiteSpace: 'nowrap' as const,
  color: '#93c5fd',
  borderBottom: '1px solid rgba(148, 163, 184, 0.14)',
  backgroundColor: 'rgba(15, 23, 42, 0.42)',
};

const bodyCell = {
  padding: '14px 16px',
  verticalAlign: 'top' as const,
  color: '#e5eefb',
  borderBottom: '1px solid rgba(148, 163, 184, 0.1)',
};

const smallPrimaryButton = {
  padding: '10px 12px',
  borderRadius: '10px',
  border: '1px solid rgba(96, 165, 250, 0.24)',
  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
  color: '#ffffff',
  fontWeight: 700,
  cursor: 'pointer',
};

const smallDangerButton = {
  padding: '10px 12px',
  borderRadius: '10px',
  border: '1px solid rgba(248, 113, 113, 0.18)',
  background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
  color: '#ffffff',
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

const warningCardStyle = {
  marginTop: '24px',
  borderRadius: '16px',
  padding: '16px 18px',
  border: '1px solid rgba(251, 191, 36, 0.2)',
  background: 'rgba(146, 64, 14, 0.16)',
  color: '#fde68a',
};

export default AccountsSupabase;
