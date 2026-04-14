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
    const { error } = await supabase.auth.updateUser({ password });
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
        <div style={heroColumnStyle}>
          <div style={logoWrapStyle}>
            <img src="/hero.png" alt="Detroit Axle" style={logoStyle} />
          </div>
          <div style={eyebrowStyle}>Recovery Mode</div>
          <h1 style={titleStyle}>Set a new password</h1>
          <p style={subtitleStyle}>Finish the recovery step, then continue into your workspace.</p>
        </div>
        <div style={formColumnStyle}>
          {errorMessage ? <div style={errorBannerStyle}>{errorMessage}</div> : null}
          {successMessage ? <div style={successBannerStyle}>{successMessage}</div> : null}

          <div style={formStyle}>
            <div>
              <label style={labelStyle}>New Password</label>
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter a new password" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Confirm Password</label>
              <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Confirm your new password" style={inputStyle} />
            </div>
            <button type="button" onClick={handleUpdatePassword} disabled={saving} style={primaryButtonStyle}>
              {saving ? 'Updating password...' : 'Update Password'}
            </button>
            <button type="button" onClick={onComplete} disabled={!successMessage} style={{ ...secondaryButtonStyle, opacity: successMessage ? 1 : 0.64 }}>
              Continue to App
            </button>
            <button type="button" onClick={onLogout} style={ghostButtonStyle}>Logout</button>
          </div>
        </div>
      </div>
    </div>
  );
}

const shellStyle = { minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '28px', background: 'radial-gradient(circle at top left, rgba(59,130,246,0.18), transparent 26%), radial-gradient(circle at bottom right, rgba(168,85,247,0.16), transparent 28%), linear-gradient(180deg, #07111f 0%, #0b1324 100%)', position: 'relative' as const, overflow: 'hidden' };
const glowTopStyle = { position: 'absolute' as const, top: '-140px', left: '-120px', width: '380px', height: '380px', background: 'radial-gradient(circle, rgba(37,99,235,0.24) 0%, transparent 72%)' };
const glowBottomStyle = { position: 'absolute' as const, right: '-120px', bottom: '-150px', width: '380px', height: '380px', background: 'radial-gradient(circle, rgba(168,85,247,0.18) 0%, transparent 72%)' };
const cardStyle = { width: '100%', maxWidth: '980px', display: 'grid', gridTemplateColumns: 'minmax(260px, 0.95fr) minmax(360px, 1fr)', borderRadius: '30px', border: '1px solid rgba(148,163,184,0.16)', background: 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(247,250,255,0.96) 100%)', boxShadow: '0 24px 64px rgba(2,6,23,0.4)', overflow: 'hidden' as const };
const heroColumnStyle = { background: 'linear-gradient(180deg, rgba(15,23,42,0.92) 0%, rgba(15,23,42,0.72) 100%)', color: '#e5eefb', padding: '34px', display: 'grid', alignContent: 'start', gap: '14px' };
const formColumnStyle = { padding: '34px' };
const logoWrapStyle = { width: '84px', height: '84px', borderRadius: '24px', background: 'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)', border: '1px solid rgba(148,163,184,0.16)', display: 'grid', placeItems: 'center' };
const logoStyle = { width: '56px', height: '56px', objectFit: 'contain' as const };
const eyebrowStyle = { color: '#93c5fd', fontSize: '12px', fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase' as const };
const titleStyle = { margin: 0, fontSize: '34px', lineHeight: 1.08, color: '#f8fafc', fontWeight: 900 };
const subtitleStyle = { margin: 0, color: '#cbd5e1', lineHeight: 1.7 };
const formStyle = { display: 'grid', gap: '16px' };
const labelStyle = { display: 'block', marginBottom: '8px', fontWeight: 700, color: '#475569' };
const inputStyle = { width: '100%', padding: '16px 18px', borderRadius: '18px', border: '1px solid rgba(203,213,225,0.92)', background: 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,255,0.98) 100%)', color: '#0f172a', boxSizing: 'border-box' as const };
const primaryButtonStyle = { padding: '15px 18px', borderRadius: '18px', border: '1px solid rgba(96,165,250,0.24)', background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)', color: '#fff', fontWeight: 800, cursor: 'pointer', boxShadow: '0 18px 32px rgba(37,99,235,0.22)' };
const secondaryButtonStyle = { padding: '15px 18px', borderRadius: '18px', border: '1px solid rgba(203,213,225,0.92)', background: 'rgba(255,255,255,0.92)', color: '#334155', fontWeight: 700, cursor: 'pointer' };
const ghostButtonStyle = { padding: '15px 18px', borderRadius: '18px', border: '1px solid rgba(148,163,184,0.2)', background: 'transparent', color: '#475569', fontWeight: 700, cursor: 'pointer' };
const errorBannerStyle = { marginBottom: '16px', padding: '13px 16px', borderRadius: '16px', background: 'rgba(254,242,242,0.98)', border: '1px solid rgba(248,113,113,0.24)', color: '#b91c1c', fontWeight: 700 };
const successBannerStyle = { marginBottom: '16px', padding: '13px 16px', borderRadius: '16px', background: 'rgba(240,253,244,0.98)', border: '1px solid rgba(74,222,128,0.24)', color: '#166534', fontWeight: 700 };

export default ResetPassword;
