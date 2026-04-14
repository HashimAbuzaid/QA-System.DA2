import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

type Viewer = {
  id: string;
  role: 'admin' | 'qa' | 'agent' | 'supervisor';
  agent_name: string;
  display_name?: string | null;
  team?: 'Calls' | 'Tickets' | 'Sales' | null;
  email?: string;
};

type VoiceSubmission = {
  id: string;
  message: string;
  category: string;
  status: 'Open' | 'Reviewed' | 'Closed';
  created_at: string;
  team: string | null;
  is_anonymous: boolean;
};

type Props = {
  currentUser: Viewer;
  title?: string;
  showComposer?: boolean;
};

function VoiceOfEmployeeSupabase({
  currentUser,
  title = 'Voice of the Employee',
  showComposer = true,
}: Props) {
  const [category, setCategory] = useState('Idea');
  const [message, setMessage] = useState('');
  const [items, setItems] = useState<VoiceSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    void loadVoiceItems();
  }, []);

  async function loadVoiceItems() {
    setLoading(true);
    setErrorMessage('');
    const { data, error } = await supabase
      .from('voice_submissions')
      .select('id, message, category, status, created_at, team, is_anonymous')
      .order('created_at', { ascending: false })
      .limit(8);

    if (error) {
      setErrorMessage(error.message);
      setLoading(false);
      return;
    }

    setItems((data as VoiceSubmission[]) || []);
    setLoading(false);
  }

  async function handleSubmit() {
    setErrorMessage('');
    setSuccessMessage('');

    if (!message.trim()) {
      setErrorMessage('Please write a message before sending feedback.');
      return;
    }

    setSaving(true);
    const { error } = await supabase.from('voice_submissions').insert({
      message: message.trim(),
      category,
      status: 'Open',
      team: currentUser.team || null,
      submitted_by_user_id: currentUser.id,
      is_anonymous: true,
    });
    setSaving(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setMessage('');
    setSuccessMessage('Your anonymous voice submission was sent successfully.');
    void loadVoiceItems();
  }

  const visibleItems = useMemo(() => {
    if (currentUser.role === 'agent') {
      return items.slice(0, 4);
    }
    return items;
  }, [items, currentUser.role]);

  return (
    <div style={{ marginTop: '30px' }}>
      {showComposer ? (
        <>
          <div style={eyebrowStyle}>Anonymous Channel</div>
          <h3 style={{ marginTop: 0 }}>{title}</h3>
          <p style={subtextStyle}>
            Share ideas, blockers, or process improvements anonymously. Names and emails are not shown in this area.
          </p>
        </>
      ) : (
        <h3 style={{ marginTop: 0 }}>{title}</h3>
      )}

      {errorMessage ? <div style={errorStyle}>{errorMessage}</div> : null}
      {successMessage ? <div style={successStyle}>{successMessage}</div> : null}

      {showComposer ? (
        <div style={panelStyle}>
          <div style={gridStyle}>
            <div>
              <label style={labelStyle}>Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} style={fieldStyle}>
                <option value="Idea">Idea</option>
                <option value="Blocker">Blocker</option>
                <option value="Process">Process</option>
                <option value="Recognition">Recognition</option>
                <option value="Tooling">Tooling</option>
              </select>
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Message</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                style={fieldStyle}
                placeholder="What should leadership know?"
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => void handleSubmit()} style={primaryButton} disabled={saving}>
              {saving ? 'Sending...' : 'Send Anonymously'}
            </button>
            <button type="button" onClick={() => setMessage('')} style={secondaryButton} disabled={saving}>
              Clear
            </button>
          </div>
        </div>
      ) : null}

      <div style={{ marginTop: showComposer ? '20px' : '0' }}>
        {showComposer ? <div style={recentTitleStyle}>Recent anonymous themes</div> : null}
        {loading ? (
          <p style={subtextStyle}>Loading voice submissions...</p>
        ) : visibleItems.length === 0 ? (
          <p style={subtextStyle}>No voice submissions yet.</p>
        ) : (
          <div style={{ display: 'grid', gap: '12px' }}>
            {visibleItems.map((item) => (
              <div key={item.id} style={itemCardStyle}>
                <div style={itemMetaRowStyle}>
                  <span style={badgeStyle}>{item.category}</span>
                  <span style={statusStyle}>{item.status}</span>
                </div>
                <div style={itemMessageStyle}>{item.message}</div>
                <div style={itemFootStyle}>
                  Team: {item.team || 'All Teams'} • {new Date(item.created_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const eyebrowStyle = {
  color: 'var(--screen-accent, #60a5fa)',
  fontSize: '12px',
  fontWeight: 800,
  letterSpacing: '0.18em',
  textTransform: 'uppercase' as const,
  marginBottom: '10px',
};

const subtextStyle = {
  color: 'var(--screen-muted, #94a3b8)',
  marginTop: 0,
};

const panelStyle = {
  borderRadius: '24px',
  border: '1px solid var(--screen-border, rgba(148,163,184,0.16))',
  background: 'var(--screen-card-bg, rgba(15,23,42,0.7))',
  boxShadow: 'var(--screen-shadow, 0 18px 40px rgba(2,6,23,0.35))',
  padding: '22px',
  backdropFilter: 'blur(16px)',
};

const gridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '14px',
  marginBottom: '14px',
};

const labelStyle = {
  display: 'block',
  marginBottom: '8px',
  fontSize: '13px',
  fontWeight: 700,
  color: 'var(--screen-muted, #94a3b8)',
};

const fieldStyle = {
  width: '100%',
  borderRadius: '14px',
  border: '1px solid var(--screen-border, rgba(148,163,184,0.16))',
  background: 'var(--screen-field-bg, rgba(15,23,42,0.7))',
  color: 'var(--screen-field-text, #e5eefb)',
  padding: '14px 16px',
  outline: 'none',
  boxSizing: 'border-box' as const,
};

const primaryButton = {
  padding: '12px 16px',
  borderRadius: '14px',
  border: '1px solid rgba(96,165,250,0.34)',
  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
  color: '#ffffff',
  fontWeight: 800,
  cursor: 'pointer',
};

const secondaryButton = {
  padding: '12px 16px',
  borderRadius: '14px',
  border: '1px solid var(--screen-border, rgba(148,163,184,0.16))',
  background: 'var(--screen-secondary-btn-bg, rgba(15,23,42,0.78))',
  color: 'var(--screen-secondary-btn-text, #e5eefb)',
  fontWeight: 700,
  cursor: 'pointer',
};

const errorStyle = {
  marginBottom: '12px',
  padding: '12px 14px',
  borderRadius: '14px',
  background: 'rgba(153,27,27,0.16)',
  border: '1px solid rgba(248,113,113,0.24)',
  color: '#fecaca',
};

const successStyle = {
  marginBottom: '12px',
  padding: '12px 14px',
  borderRadius: '14px',
  background: 'rgba(22,101,52,0.18)',
  border: '1px solid rgba(134,239,172,0.24)',
  color: '#bbf7d0',
};

const recentTitleStyle = {
  color: 'var(--screen-heading, #f8fafc)',
  fontWeight: 800,
  marginBottom: '12px',
};

const itemCardStyle = {
  borderRadius: '20px',
  border: '1px solid var(--screen-border, rgba(148,163,184,0.16))',
  background: 'var(--screen-card-soft-bg, rgba(15,23,42,0.52))',
  padding: '14px 16px',
};

const itemMetaRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '10px',
  alignItems: 'center',
  marginBottom: '10px',
  flexWrap: 'wrap' as const,
};

const badgeStyle = {
  display: 'inline-block',
  padding: '5px 10px',
  borderRadius: '999px',
  background: 'var(--screen-score-pill-bg, rgba(37,99,235,0.18))',
  color: 'var(--screen-accent, #60a5fa)',
  fontSize: '12px',
  fontWeight: 800,
};

const statusStyle = {
  color: 'var(--screen-muted, #94a3b8)',
  fontSize: '12px',
  fontWeight: 800,
};

const itemMessageStyle = {
  color: 'var(--screen-text, #e5eefb)',
  fontSize: '14px',
  lineHeight: 1.6,
  whiteSpace: 'pre-wrap' as const,
};

const itemFootStyle = {
  marginTop: '10px',
  color: 'var(--screen-muted, #94a3b8)',
  fontSize: '12px',
  fontWeight: 700,
};

export default VoiceOfEmployeeSupabase;
