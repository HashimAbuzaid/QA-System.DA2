import { useState } from 'react';
import { supabase } from '../lib/supabase';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  async function handleLogin() {
    setErrorMessage('');

    if (!email || !password) {
      setErrorMessage('Please enter email and password.');
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }
  }

  return (
    <div style={shellStyle}>
      <div style={glowTopStyle} />
      <div style={glowBottomStyle} />

      <div style={loginCardStyle}>
        <div style={eyebrowStyle}>Detroit Axle Workspace</div>
        <h1 style={titleStyle}>Detroit Axle QA System</h1>

        {errorMessage ? (
          <div style={errorBannerStyle}>{errorMessage}</div>
        ) : null}

        <div style={formStyle}>
          <div>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errorMessage) setErrorMessage('');
              }}
              placeholder="you@detroitaxle.com"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (errorMessage) setErrorMessage('');
              }}
              placeholder="Enter your password"
              style={inputStyle}
            />
          </div>

          <button onClick={handleLogin} disabled={loading} style={buttonStyle}>
            {loading ? 'Logging in...' : 'Login'}
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

const loginCardStyle = {
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
  marginBottom: '24px',
  fontSize: '36px',
  lineHeight: 1.05,
  color: '#f8fafc',
};

const errorBannerStyle = {
  marginBottom: '20px',
  padding: '14px 16px',
  borderRadius: '16px',
  border: '1px solid rgba(248,113,113,0.22)',
  background: 'rgba(127,29,29,0.24)',
  color: '#fecaca',
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

export default Login;
