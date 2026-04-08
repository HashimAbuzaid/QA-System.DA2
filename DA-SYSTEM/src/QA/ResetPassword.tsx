import { useState } from 'react';
import { supabase } from '../lib/supabase';

type ResetPasswordProps = {
  onComplete: () => void;
  onLogout: () => void;
};

function ResetPassword({ onComplete, onLogout }: ResetPasswordProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  async function handleUpdatePassword() {
    setErrorMessage('');
    setSuccessMessage('');

    if (!password || !confirmPassword) {
      setErrorMessage('Please enter and confirm your new password.');
      return;
    }

    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    setSaving(true);

    const { error } = await supabase.auth.updateUser({
      password,
    });

    setSaving(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setSuccessMessage('Password updated successfully. You can continue now.');
  }

  return (
    <div style={shellStyle}>
      <div style={glowTopStyle} />
      <div style={glowBottomStyle} />

      <div style={cardStyle}>
        <div style={eyebrowStyle}>Detroit Axle Workspace</div>
        <h1 style={titleStyle}>Set a New Password</h1>
        <p style={subtitleStyle}>
          Enter your new password below, then continue into the app.
        </p>

        {errorMessage ? <div style={errorBannerStyle}>{errorMessage}</div> : null}
        {successMessage ? (
          <div style={successBannerStyle}>{successMessage}</div>
        ) : null}

        <div style={formStyle}>
          <div>
            <label style={labelStyle}>New Password</label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter a new password"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Confirm your new password"
              style={inputStyle}
            />
          </div>

          <button
            type="button"
            onClick={handleUpdatePassword}
            disabled={saving}
            style={buttonStyle}
          >
            {saving ? 'Updating password...' : 'Update Password'}
          </button>

          <button
            type="button"
            onClick={onComplete}
            disabled={!successMessage}
            style={{
              ...secondaryButtonStyle,
              opacity: successMessage ? 1 : 0.65,
            }}
          >
            Continue to App
          </button>

          <button
            type="button"
            onClick={onLogout}
            style={ghostButtonStyle}
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}

const shellStyle = {
  minHeight: '100vh',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  padding: '28px',
  background:
    'radial-gradient(circle at top left, rgba(59,130,246,0.18), transparent 26%), radial-gradient(circle at bottom right, rgba(99,102,241,0.16), transparent 28%), linear-gradient(180deg, #07111f 0%, #0b1324 100%)',
  position: 'relative' as const,
  overflow: 'hidden',
};

const glowTopStyle = {
  position: 'absolute' as const,
  top: '-120px',
  left: '-120px',
  width: '360px',
  height: '360px',
  background:
    'radial-gradient(circle, rgba(37,99,235,0.22) 0%, transparent 70%)',
};

const glowBottomStyle = {
  position: 'absolute' as const,
  bottom: '-160px',
  right: '-100px',
  width: '360px',
  height: '360px',
  background:
    'radial-gradient(circle, rgba(14,165,233,0.16) 0%, transparent 70%)',
};

const cardStyle = {
  position: 'relative' as const,
  zIndex: 1,
  width: '100%',
  maxWidth: '520px',
  padding: '34px',
  borderRadius: '28px',
  border: '1px solid rgba(148,163,184,0.14)',
  background:
    'linear-gradient(180deg, rgba(15,23,42,0.82) 0%, rgba(15,23,42,0.64) 100%)',
  boxShadow: '0 22px 60px rgba(2,6,23,0.45)',
  backdropFilter: 'blur(18px)',
};

const eyebrowStyle = {
  color: '#60a5fa',
  fontSize: '12px',
  fontWeight: 800,
  letterSpacing: '0.18em',
  textTransform: 'uppercase' as const,
  marginBottom: '12px',
};

const titleStyle = {
  marginTop: 0,
  marginBottom: '10px',
  fontSize: '36px',
  lineHeight: 1.05,
  color: '#f8fafc',
};

const subtitleStyle = {
  marginTop: 0,
  marginBottom: '24px',
  color: '#94a3b8',
};

const formStyle = {
  display: 'grid',
  gap: '18px',
};

const labelStyle = {
  display: 'block',
  marginBottom: '8px',
  fontSize: '13px',
  color: '#cbd5e1',
  fontWeight: 700,
};

const inputStyle = {
  width: '100%',
  padding: '14px 16px',
  borderRadius: '16px',
  border: '1px solid rgba(148,163,184,0.16)',
  background: 'rgba(15,23,42,0.7)',
  color: '#e5eefb',
};

const buttonStyle = {
  padding: '14px 18px',
  borderRadius: '16px',
  border: '1px solid rgba(96,165,250,0.24)',
  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
  color: '#ffffff',
  fontWeight: 800,
  cursor: 'pointer',
  boxShadow: '0 16px 32px rgba(37,99,235,0.28)',
};

const secondaryButtonStyle = {
  padding: '14px 18px',
  borderRadius: '16px',
  border: '1px solid rgba(148,163,184,0.16)',
  background: 'rgba(15,23,42,0.72)',
  color: '#e5eefb',
  fontWeight: 700,
  cursor: 'pointer',
};

const ghostButtonStyle = {
  padding: '12px 16px',
  borderRadius: '14px',
  border: '1px solid rgba(148,163,184,0.12)',
  background: 'transparent',
  color: '#cbd5e1',
  fontWeight: 700,
  cursor: 'pointer',
};

const errorBannerStyle = {
  marginBottom: '16px',
  padding: '14px 16px',
  borderRadius: '16px',
  backgroundColor: 'rgba(127,29,29,0.24)',
  border: '1px solid rgba(252,165,165,0.24)',
  color: '#fecaca',
  fontWeight: 700,
};

const successBannerStyle = {
  marginBottom: '16px',
  padding: '14px 16px',
  borderRadius: '16px',
  backgroundColor: 'rgba(22,101,52,0.24)',
  border: '1px solid rgba(134,239,172,0.22)',
  color: '#bbf7d0',
  fontWeight: 700,
};

export default ResetPassword;
