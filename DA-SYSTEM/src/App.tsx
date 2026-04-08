import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './lib/supabase';
import { usePersistentState } from './hooks/usePersistentState';
import Login from './QA/Login';
import AgentPortal from './QA/AgentPortal';
import SupervisorPortal from './QA/SupervisorPortal';

const Dashboard = lazy(() => import('./QA/Dashboard'));
const NewAuditSupabase = lazy(() => import('./QA/NewAuditSupabase'));
const CallsUploadSupabase = lazy(() => import('./QA/CallsUploadSupabase'));
const TicketsUploadSupabase = lazy(() => import('./QA/TicketsUploadSupabase'));
const SalesUploadSupabase = lazy(() => import('./QA/SalesUploadSupabase'));
const AuditsListSupabase = lazy(() => import('./QA/AuditsListSupabase'));
const AccountsSupabase = lazy(() => import('./QA/AccountsSupabase'));
const SupervisorRequestsSupabase = lazy(() =>
  import('./QA/SupervisorRequestsSupabase')
);
const AgentFeedbackSupabase = lazy(() => import('./QA/AgentFeedbackSupabase'));
const ReportsSupabase = lazy(() => import('./QA/ReportsSupabase'));
const MonitoringSupabase = lazy(() => import('./QA/MonitoringSupabase'));

export type UserProfile = {
  id: string;
  role: 'admin' | 'qa' | 'agent' | 'supervisor';
  agent_id: string | null;
  agent_name: string;
  display_name: string | null;
  team: 'Calls' | 'Tickets' | 'Sales' | null;
  email: string;
};

type StaffPage =
  | 'dashboard'
  | 'newAudit'
  | 'auditsList'
  | 'callsUpload'
  | 'ticketsUpload'
  | 'salesUpload'
  | 'agentFeedback'
  | 'monitoring'
  | 'accounts'
  | 'supervisorRequests'
  | 'reports'
  | 'profile';

type MountedPagesState = Partial<Record<StaffPage, boolean>>;
type ProfileStatus = 'idle' | 'loading' | 'loaded' | 'missing' | 'error';

function App() {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>('idle');
  const [page, setPage] = usePersistentState<StaffPage>(
    'detroit-axle-active-staff-page',
    'dashboard'
  );
  const [mountedPages, setMountedPages] = useState<MountedPagesState>({
    dashboard: true,
  });
  const [profileLoadError, setProfileLoadError] = useState('');

  const isMountedRef = useRef(true);
  const profileRequestIdRef = useRef(0);

  useEffect(() => {
    isMountedRef.current = true;
    void loadInitialSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!isMountedRef.current) return;

      setSession(newSession);

      if (newSession?.user) {
        setLoading(true);
        void loadProfile(newSession.user.id);
      } else {
        resetSignedOutState();
      }
    });

    return () => {
      isMountedRef.current = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    setMountedPages((prev) => {
      if (prev[page]) return prev;
      return { ...prev, [page]: true };
    });
  }, [page]);

  useEffect(() => {
    const preloadModules = () => {
      void import('./QA/Dashboard');
      void import('./QA/NewAuditSupabase');
      void import('./QA/AuditsListSupabase');
      void import('./QA/CallsUploadSupabase');
      void import('./QA/TicketsUploadSupabase');
      void import('./QA/SalesUploadSupabase');
      void import('./QA/AgentFeedbackSupabase');
      void import('./QA/MonitoringSupabase');
      void import('./QA/ReportsSupabase');
    };

    const timerId = window.setTimeout(preloadModules, 350);
    return () => window.clearTimeout(timerId);
  }, []);

  function resetSignedOutState() {
    setSession(null);
    setProfile(null);
    setProfileLoadError('');
    setProfileStatus('idle');
    setPage('dashboard');
    setLoading(false);
  }

  async function loadInitialSession() {
    const { data, error } = await supabase.auth.getSession();

    if (!isMountedRef.current) return;

    if (error) {
      setSession(null);
      setProfile(null);
      setProfileStatus('error');
      setProfileLoadError(error.message);
      setLoading(false);
      return;
    }

    setSession(data.session);

    if (data.session?.user) {
      await loadProfile(data.session.user.id);
    } else {
      setProfile(null);
      setProfileStatus('idle');
      setLoading(false);
    }
  }

  async function loadProfile(userId: string) {
    const requestId = ++profileRequestIdRef.current;

    setProfileStatus('loading');
    setProfileLoadError('');

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (!isMountedRef.current || requestId !== profileRequestIdRef.current) {
      return;
    }

    if (error) {
      setProfile(null);
      setProfileStatus('error');
      setProfileLoadError(error.message || 'Could not load profile.');
      setLoading(false);
      return;
    }

    if (!data) {
      setProfile(null);
      setProfileStatus('missing');
      setProfileLoadError('Profile row not found for this user.');
      setLoading(false);
      return;
    }

    setProfile(data as UserProfile);
    setProfileStatus('loaded');
    setProfileLoadError('');
    setLoading(false);
  }

  async function handleLogout() {
    setLoading(true);
    await supabase.auth.signOut();
    resetSignedOutState();
  }

  const isAdmin = profile?.role === 'admin';
  const isQA = profile?.role === 'qa';
  const isSupervisor = profile?.role === 'supervisor';
  const isStaff = isAdmin || isQA;
  const canAccessReports = isAdmin || isQA;

  const profileLabel = useMemo(() => {
    if (!profile) return '';
    return profile.display_name
      ? `${profile.agent_name} - ${profile.display_name}`
      : profile.agent_name;
  }, [profile]);

  const navItems = useMemo(() => {
    if (!profile || !isStaff) return [];

    const baseItems: Array<{ key: StaffPage; label: string }> = [
      { key: 'dashboard', label: 'Dashboard' },
      { key: 'newAudit', label: 'New Audit' },
      { key: 'auditsList', label: 'Audits List' },
      { key: 'callsUpload', label: 'Calls Upload' },
      { key: 'ticketsUpload', label: 'Tickets Upload' },
      { key: 'salesUpload', label: 'Sales Upload' },
      { key: 'agentFeedback', label: 'Agent Feedback' },
      { key: 'monitoring', label: 'Monitoring' },
    ];

    if (isAdmin) {
      baseItems.push(
        { key: 'accounts', label: 'Accounts' },
        { key: 'supervisorRequests', label: 'Supervisor Requests' }
      );
    }

    if (canAccessReports) {
      baseItems.push({ key: 'reports', label: 'Reports' });
    }

    baseItems.push({
      key: 'profile',
      label: isAdmin ? 'My Admin Profile' : 'My QA Profile',
    });

    return baseItems;
  }, [profile, isStaff, isAdmin, canAccessReports]);

  useEffect(() => {
    if (!isStaff) return;

    const allowedPages = new Set(navItems.map((item) => item.key));
    if (!allowedPages.has(page)) {
      setPage('dashboard');
    }
  }, [isStaff, navItems, page, setPage]);

  function renderStaffPage(targetPage: StaffPage) {
    switch (targetPage) {
      case 'dashboard':
        return <Dashboard />;
      case 'newAudit':
        return <NewAuditSupabase />;
      case 'auditsList':
        return <AuditsListSupabase />;
      case 'callsUpload':
        return <CallsUploadSupabase />;
      case 'ticketsUpload':
        return <TicketsUploadSupabase />;
      case 'salesUpload':
        return <SalesUploadSupabase />;
      case 'agentFeedback':
        return <AgentFeedbackSupabase />;
      case 'monitoring':
        return <MonitoringSupabase />;
      case 'accounts':
        return isAdmin ? <AccountsSupabase /> : null;
      case 'supervisorRequests':
        return isAdmin && profile ? (
          <SupervisorRequestsSupabase currentUser={profile} />
        ) : null;
      case 'reports':
        return canAccessReports ? <ReportsSupabase /> : null;
      case 'profile':
        return (
          <div style={profilePanelStyle}>
            <div style={sectionEyebrow}>Profile</div>
            <h2 style={{ marginTop: 0, marginBottom: '18px' }}>
              {isAdmin ? 'My Admin Profile' : 'My QA Profile'}
            </h2>
            <div style={profileGridStyle}>
              <ProfileInfoCard
                label="Name"
                value={profile?.agent_name || '-'}
              />
              <ProfileInfoCard
                label="Display Name"
                value={profile?.display_name || '-'}
              />
              <ProfileInfoCard label="Email" value={profile?.email || '-'} />
              <ProfileInfoCard label="Role" value={profile?.role || '-'} />
              <ProfileInfoCard
                label="Agent ID"
                value={profile?.agent_id || '-'}
              />
              <ProfileInfoCard label="Team" value={profile?.team || '-'} />
            </div>
          </div>
        );
      default:
        return <Dashboard />;
    }
  }

  const shouldShowLoading =
    loading ||
    (!!session &&
      !profile &&
      (profileStatus === 'idle' || profileStatus === 'loading'));

  if (shouldShowLoading) {
    return (
      <div style={loadingShellStyle}>
        <div style={loadingCardStyle}>
          <div style={loadingDotStyle} />
          <h1 style={{ margin: '0 0 8px 0' }}>
            Loading Detroit Axle QA System
          </h1>
          <p style={{ margin: 0, color: '#94a3b8' }}>
            Preparing your workspace...
          </p>
        </div>
      </div>
    );
  }

  if (!session) return <Login />;

  if (!profile && (profileStatus === 'missing' || profileStatus === 'error')) {
    return (
      <div style={loadingShellStyle}>
        <div style={errorCardStyle}>
          <div style={sectionEyebrow}>Profile Error</div>
          <h1 style={{ marginTop: 0 }}>Profile not found</h1>
          <p style={{ color: '#94a3b8' }}>
            {profileLoadError ||
              'This user exists in Supabase Auth but does not have a profile row yet.'}
          </p>
          <button onClick={handleLogout} style={logoutButtonStyle}>
            Logout
          </button>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div style={loadingShellStyle}>
        <div style={loadingCardStyle}>
          <div style={loadingDotStyle} />
          <h1 style={{ margin: '0 0 8px 0' }}>Loading profile</h1>
          <p style={{ margin: 0, color: '#94a3b8' }}>
            Finalizing your Detroit Axle workspace...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={appShellStyle}>
      <div style={backgroundGlowTopStyle} />
      <div style={backgroundGlowBottomStyle} />

      <header style={headerShellStyle}>
        <div style={headerLeftStyle}>
          <div style={brandWrapStyle}>
            <div style={brandAccentStyle} />
            <div>
              <div style={brandEyebrowStyle}>Detroit Axle Workspace</div>
              <h1 style={brandTitleStyle}>Detroit Axle QA System</h1>
            </div>
          </div>
          <div style={metaStripStyle}>
            <div style={metaPillStyle}>Role: {profile.role}</div>
            <div style={metaPillStyle}>User: {profileLabel}</div>
            <div style={metaPillStyle}>Email: {profile.email}</div>
          </div>
        </div>

        <button onClick={handleLogout} style={logoutButtonStyle}>
          Logout
        </button>
      </header>

      {isStaff ? (
        <>
          <nav style={navShellStyle}>
            <div style={navScrollerStyle}>
              {navItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setPage(item.key)}
                  style={{
                    ...navButtonStyle,
                    ...(page === item.key ? activeNavButtonStyle : {}),
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </nav>

          <main style={contentShellStyle}>
            <div style={contentInnerStyle}>
              {navItems.map((item) =>
                mountedPages[item.key] ? (
                  <section
                    key={item.key}
                    style={
                      page === item.key
                        ? visiblePagePaneStyle
                        : hiddenPagePaneStyle
                    }
                  >
                    <Suspense fallback={<InlinePageLoader />}>
                      {renderStaffPage(item.key)}
                    </Suspense>
                  </section>
                ) : null
              )}
            </div>
          </main>
        </>
      ) : isSupervisor ? (
        <main style={contentShellStyle}>
          <div style={contentInnerStyle}>
            <SupervisorPortal currentUser={profile} />
          </div>
        </main>
      ) : (
        <main style={contentShellStyle}>
          <div style={contentInnerStyle}>
            <AgentPortal currentUser={profile} />
          </div>
        </main>
      )}
    </div>
  );
}

function InlinePageLoader() {
  return (
    <div style={inlineLoaderStyle}>
      <div style={inlineLoaderDotStyle} />
      <div>
        <div style={{ color: '#f8fafc', fontWeight: 700 }}>
          Loading workspace...
        </div>
        <div style={{ color: '#94a3b8', fontSize: '13px', marginTop: '4px' }}>
          Preparing this page for the first time.
        </div>
      </div>
    </div>
  );
}

function ProfileInfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={profileInfoCardStyle}>
      <div style={profileInfoLabelStyle}>{label}</div>
      <div style={profileInfoValueStyle}>{value}</div>
    </div>
  );
}

const appShellStyle = {
  minHeight: '100vh',
  background:
    'radial-gradient(circle at top left, rgba(59,130,246,0.22), transparent 28%), radial-gradient(circle at bottom right, rgba(99,102,241,0.18), transparent 30%), linear-gradient(180deg, #07111f 0%, #0b1324 45%, #0a1020 100%)',
  color: '#e5eefb',
  padding: '24px',
  position: 'relative' as const,
  overflow: 'hidden',
};

const backgroundGlowTopStyle = {
  position: 'absolute' as const,
  top: '-120px',
  right: '-120px',
  width: '340px',
  height: '340px',
  background:
    'radial-gradient(circle, rgba(37,99,235,0.18) 0%, transparent 68%)',
  pointerEvents: 'none' as const,
};

const backgroundGlowBottomStyle = {
  position: 'absolute' as const,
  bottom: '-180px',
  left: '-120px',
  width: '380px',
  height: '380px',
  background:
    'radial-gradient(circle, rgba(14,165,233,0.14) 0%, transparent 70%)',
  pointerEvents: 'none' as const,
};

const headerShellStyle = {
  position: 'relative' as const,
  zIndex: 1,
  display: 'flex',
  justifyContent: 'space-between',
  gap: '20px',
  alignItems: 'flex-start',
  flexWrap: 'wrap' as const,
  padding: '26px 28px',
  borderRadius: '24px',
  border: '1px solid rgba(148,163,184,0.18)',
  background:
    'linear-gradient(180deg, rgba(15,23,42,0.88) 0%, rgba(15,23,42,0.62) 100%)',
  boxShadow: '0 18px 50px rgba(2,6,23,0.45)',
  backdropFilter: 'blur(18px)',
  marginBottom: '18px',
};

const headerLeftStyle = { display: 'grid', gap: '16px' };

const brandWrapStyle = { display: 'flex', gap: '16px', alignItems: 'center' };

const brandAccentStyle = {
  width: '10px',
  height: '64px',
  borderRadius: '999px',
  background: 'linear-gradient(180deg, #60a5fa 0%, #2563eb 100%)',
  boxShadow: '0 0 24px rgba(37,99,235,0.45)',
};

const brandEyebrowStyle = {
  color: '#93c5fd',
  fontSize: '13px',
  fontWeight: 700,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.16em',
  marginBottom: '8px',
};

const brandTitleStyle = {
  margin: 0,
  fontSize: '38px',
  lineHeight: 1.05,
  fontWeight: 800,
  color: '#f8fbff',
};

const metaStripStyle = {
  display: 'flex',
  gap: '10px',
  flexWrap: 'wrap' as const,
};

const metaPillStyle = {
  padding: '10px 14px',
  borderRadius: '999px',
  border: '1px solid rgba(148,163,184,0.14)',
  backgroundColor: 'rgba(15,23,42,0.58)',
  color: '#cbd5e1',
  fontSize: '13px',
  fontWeight: 600,
};

const logoutButtonStyle = {
  padding: '12px 18px',
  borderRadius: '14px',
  border: '1px solid rgba(96,165,250,0.34)',
  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
  color: 'white',
  fontWeight: 700,
  cursor: 'pointer',
  boxShadow: '0 12px 28px rgba(37,99,235,0.28)',
};

const navShellStyle = {
  position: 'relative' as const,
  zIndex: 1,
  marginBottom: '18px',
};

const navScrollerStyle = {
  display: 'flex',
  gap: '10px',
  overflowX: 'auto' as const,
  padding: '6px 2px 8px 2px',
};

const navButtonStyle = {
  padding: '12px 16px',
  borderRadius: '14px',
  border: '1px solid rgba(148,163,184,0.16)',
  background: 'rgba(15,23,42,0.62)',
  color: '#cbd5e1',
  cursor: 'pointer',
  fontWeight: 700,
  whiteSpace: 'nowrap' as const,
  transition: 'all 0.2s ease',
  backdropFilter: 'blur(14px)',
};

const activeNavButtonStyle = {
  background:
    'linear-gradient(135deg, rgba(37,99,235,0.95) 0%, rgba(59,130,246,0.92) 100%)',
  color: '#ffffff',
  border: '1px solid rgba(147,197,253,0.38)',
  boxShadow: '0 10px 24px rgba(37,99,235,0.25)',
};

const contentShellStyle = { position: 'relative' as const, zIndex: 1 };

const contentInnerStyle = {
  minHeight: 'calc(100vh - 240px)',
  width: '100%',
  padding: '28px',
  borderRadius: '28px',
  border: '1px solid rgba(148,163,184,0.14)',
  background:
    'linear-gradient(180deg, rgba(15,23,42,0.78) 0%, rgba(15,23,42,0.56) 100%)',
  boxShadow: '0 20px 55px rgba(2,6,23,0.42)',
  backdropFilter: 'blur(18px)',
};

const visiblePagePaneStyle = {
  display: 'block',
};

const hiddenPagePaneStyle = {
  display: 'none',
};

const inlineLoaderStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '14px',
  padding: '16px',
  borderRadius: '16px',
  border: '1px solid rgba(148,163,184,0.12)',
  background: 'rgba(15,23,42,0.5)',
};

const inlineLoaderDotStyle = {
  width: '18px',
  height: '18px',
  borderRadius: '999px',
  background: 'linear-gradient(135deg, #60a5fa 0%, #2563eb 100%)',
  boxShadow: '0 0 18px rgba(37,99,235,0.35)',
};

const profilePanelStyle = {
  borderRadius: '24px',
  border: '1px solid rgba(148,163,184,0.14)',
  background: 'rgba(15,23,42,0.46)',
  padding: '28px',
};

const sectionEyebrow = {
  color: '#60a5fa',
  fontSize: '12px',
  fontWeight: 800,
  letterSpacing: '0.18em',
  textTransform: 'uppercase' as const,
  marginBottom: '12px',
};

const profileGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '16px',
};

const profileInfoCardStyle = {
  borderRadius: '18px',
  padding: '18px',
  border: '1px solid rgba(148,163,184,0.12)',
  background: 'rgba(15,23,42,0.58)',
};

const profileInfoLabelStyle = {
  fontSize: '12px',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.12em',
  color: '#93c5fd',
  marginBottom: '10px',
  fontWeight: 700,
};

const profileInfoValueStyle = {
  fontSize: '16px',
  fontWeight: 700,
  color: '#f8fafc',
  wordBreak: 'break-word' as const,
};

const loadingShellStyle = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background:
    'radial-gradient(circle at top left, rgba(59,130,246,0.22), transparent 28%), linear-gradient(180deg, #07111f 0%, #0b1324 100%)',
  padding: '24px',
};

const loadingCardStyle = {
  width: '100%',
  maxWidth: '560px',
  borderRadius: '28px',
  border: '1px solid rgba(148,163,184,0.14)',
  background: 'rgba(15,23,42,0.74)',
  padding: '34px',
  textAlign: 'center' as const,
  boxShadow: '0 24px 60px rgba(2,6,23,0.5)',
};

const loadingDotStyle = {
  width: '74px',
  height: '74px',
  borderRadius: '50%',
  margin: '0 auto 18px auto',
  background:
    'radial-gradient(circle at 30% 30%, #93c5fd 0%, #2563eb 55%, #1e3a8a 100%)',
  boxShadow: '0 0 40px rgba(37,99,235,0.35)',
};

const errorCardStyle = {
  width: '100%',
  maxWidth: '620px',
  borderRadius: '28px',
  border: '1px solid rgba(248,113,113,0.2)',
  background: 'rgba(15,23,42,0.74)',
  padding: '34px',
  boxShadow: '0 24px 60px rgba(2,6,23,0.5)',
  color: '#f8fafc',
};

export default App;
