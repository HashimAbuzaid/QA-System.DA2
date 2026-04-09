import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { supabase } from './lib/supabase';
import { usePersistentState } from './hooks/usePersistentState';
import './App.css';
import Login from './QA/Login';
import AgentPortal from './QA/AgentPortal';
import SupervisorPortal from './QA/SupervisorPortal';
import SupervisorRequestsSupabase from './QA/SupervisorRequestsSupabase';

const Dashboard = lazy(() => import('./QA/Dashboard'));
const NewAuditSupabase = lazy(() => import('./QA/NewAuditSupabase'));
const CallsUploadSupabase = lazy(() => import('./QA/CallsUploadSupabase'));
const TicketsUploadSupabase = lazy(() => import('./QA/TicketsUploadSupabase'));
const SalesUploadSupabase = lazy(() => import('./QA/SalesUploadSupabase'));
const AuditsListSupabase = lazy(() => import('./QA/AuditsListSupabase'));
const AccountsSupabase = lazy(() => import('./QA/AccountsSupabase'));
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

export type ThemeMode = 'dark' | 'light';

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

type ThemeTokens = {
  pageBackground: string;
  pageBackgroundFlat: string;
  text: string;
  secondaryText: string;
  panelBackground: string;
  panelBorder: string;
  panelShadow: string;
  glowTop: string;
  glowBottom: string;
  metaPillBackground: string;
  metaPillText: string;
  navBackground: string;
  navText: string;
  navBorder: string;
  navActiveBackground: string;
  navActiveText: string;
  navActiveBorder: string;
  contentBackground: string;
  contentBorder: string;
  contentShadow: string;
  buttonBorder: string;
  buttonShadow: string;
  buttonBackground: string;
  buttonText: string;
};

function getThemeTokens(mode: ThemeMode): ThemeTokens {
  if (mode === 'light') {
    return {
      pageBackground:
        'radial-gradient(circle at top left, rgba(59,130,246,0.08), transparent 28%), radial-gradient(circle at bottom right, rgba(99,102,241,0.08), transparent 30%), linear-gradient(180deg, #f7fbff 0%, #eef5ff 45%, #f8fbff 100%)',
      pageBackgroundFlat: '#f7fbff',
      text: '#0f172a',
      secondaryText: '#475569',
      panelBackground:
        'linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(248,250,252,0.9) 100%)',
      panelBorder: 'rgba(148,163,184,0.24)',
      panelShadow: '0 18px 50px rgba(15,23,42,0.10)',
      glowTop:
        'radial-gradient(circle, rgba(37,99,235,0.10) 0%, transparent 68%)',
      glowBottom:
        'radial-gradient(circle, rgba(14,165,233,0.08) 0%, transparent 70%)',
      metaPillBackground: 'rgba(241,245,249,0.92)',
      metaPillText: '#334155',
      navBackground: 'rgba(255,255,255,0.9)',
      navText: '#334155',
      navBorder: 'rgba(148,163,184,0.22)',
      navActiveBackground:
        'linear-gradient(135deg, rgba(37,99,235,0.92) 0%, rgba(59,130,246,0.9) 100%)',
      navActiveText: '#ffffff',
      navActiveBorder: 'rgba(96,165,250,0.42)',
      contentBackground:
        'linear-gradient(180deg, rgba(255,255,255,0.94) 0%, rgba(248,250,252,0.9) 100%)',
      contentBorder: 'rgba(148,163,184,0.20)',
      contentShadow: '0 20px 55px rgba(15,23,42,0.08)',
      buttonBorder: 'rgba(96,165,250,0.34)',
      buttonShadow: '0 12px 28px rgba(37,99,235,0.18)',
      buttonBackground: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
      buttonText: '#ffffff',
    };
  }

  return {
    pageBackground:
      'radial-gradient(circle at top left, rgba(59,130,246,0.22), transparent 28%), radial-gradient(circle at bottom right, rgba(99,102,241,0.18), transparent 30%), linear-gradient(180deg, #07111f 0%, #0b1324 45%, #0a1020 100%)',
    pageBackgroundFlat: '#07111f',
    text: '#e5eefb',
    secondaryText: '#94a3b8',
    panelBackground:
      'linear-gradient(180deg, rgba(15,23,42,0.88) 0%, rgba(15,23,42,0.62) 100%)',
    panelBorder: 'rgba(148,163,184,0.18)',
    panelShadow: '0 18px 50px rgba(2,6,23,0.45)',
    glowTop:
      'radial-gradient(circle, rgba(37,99,235,0.18) 0%, transparent 68%)',
    glowBottom:
      'radial-gradient(circle, rgba(14,165,233,0.14) 0%, transparent 70%)',
    metaPillBackground: 'rgba(15,23,42,0.58)',
    metaPillText: '#cbd5e1',
    navBackground: 'rgba(15,23,42,0.62)',
    navText: '#cbd5e1',
    navBorder: 'rgba(148,163,184,0.16)',
    navActiveBackground:
      'linear-gradient(135deg, rgba(37,99,235,0.95) 0%, rgba(59,130,246,0.92) 100%)',
    navActiveText: '#ffffff',
    navActiveBorder: 'rgba(147,197,253,0.38)',
    contentBackground:
      'linear-gradient(180deg, rgba(15,23,42,0.78) 0%, rgba(15,23,42,0.56) 100%)',
    contentBorder: 'rgba(148,163,184,0.14)',
    contentShadow: '0 20px 55px rgba(2,6,23,0.42)',
    buttonBorder: 'rgba(96,165,250,0.34)',
    buttonShadow: '0 12px 28px rgba(37,99,235,0.28)',
    buttonBackground: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
    buttonText: '#ffffff',
  };
}

function App({ theme }: { theme: ThemeMode }) {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = usePersistentState<StaffPage>(
    'detroit-axle-active-staff-page',
    'dashboard'
  );
  const [mountedPages, setMountedPages] = useState<MountedPagesState>({
    dashboard: true,
  });
  const [profileLoadError, setProfileLoadError] = useState('');

  const themeTokens = useMemo(() => getThemeTokens(theme), [theme]);

  useEffect(() => {
    void loadInitialSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);

      if (newSession?.user) {
        void loadProfile(newSession.user.id);
      } else {
        setProfile(null);
        setProfileLoadError('');
        setPage('dashboard');
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    setMountedPages((prev) => {
      if (prev[page]) return prev;
      return { ...prev, [page]: true };
    });
  }, [page]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.style.backgroundColor =
      themeTokens.pageBackgroundFlat;
    document.body.style.backgroundColor = themeTokens.pageBackgroundFlat;
  }, [themeTokens]);

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

  async function loadInitialSession() {
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      setLoading(false);
      setProfileLoadError(error.message);
      return;
    }

    setSession(data.session);

    if (data.session?.user) {
      await loadProfile(data.session.user.id);
    } else {
      setLoading(false);
    }
  }

  async function loadProfile(userId: string) {
    setProfileLoadError('');

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      setProfile(null);
      setLoading(false);
      setProfileLoadError(error.message || 'Could not load profile.');
      return;
    }

    if (!data) {
      setProfile(null);
      setLoading(false);
      setProfileLoadError('Profile row not found for this user.');
      return;
    }

    const loadedProfile = data as UserProfile;
    setProfile(loadedProfile);
    setLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setProfileLoadError('');
    setPage('dashboard');
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
          <div
            style={{
              ...profilePanelStyle,
              border: `1px solid ${themeTokens.contentBorder}`,
              background: themeTokens.panelBackground,
            }}
          >
            <div
              style={{
                ...sectionEyebrow,
                color: theme === 'light' ? '#2563eb' : '#60a5fa',
              }}
            >
              Profile
            </div>
            <h2
              style={{
                marginTop: 0,
                marginBottom: '18px',
                color: themeTokens.text,
              }}
            >
              {isAdmin ? 'My Admin Profile' : 'My QA Profile'}
            </h2>
            <div style={profileGridStyle}>
              <ProfileInfoCard
                label="Name"
                value={profile?.agent_name || '-'}
                theme={themeTokens}
              />
              <ProfileInfoCard
                label="Display Name"
                value={profile?.display_name || '-'}
                theme={themeTokens}
              />
              <ProfileInfoCard
                label="Email"
                value={profile?.email || '-'}
                theme={themeTokens}
              />
              <ProfileInfoCard
                label="Role"
                value={profile?.role || '-'}
                theme={themeTokens}
              />
              <ProfileInfoCard
                label="Agent ID"
                value={profile?.agent_id || '-'}
                theme={themeTokens}
              />
              <ProfileInfoCard
                label="Team"
                value={profile?.team || '-'}
                theme={themeTokens}
              />
            </div>
          </div>
        );
      default:
        return <Dashboard />;
    }
  }

  if (loading) {
    return (
      <div
        style={{
          ...loadingShellStyle,
          background: themeTokens.pageBackground,
        }}
      >
        <div
          style={{
            ...loadingCardStyle,
            border: `1px solid ${themeTokens.panelBorder}`,
            background: themeTokens.panelBackground,
            boxShadow: themeTokens.panelShadow,
            color: themeTokens.text,
          }}
        >
          <div style={loadingDotStyle} />
          <h1 style={{ margin: '0 0 8px 0' }}>
            Loading Detroit Axle QA System
          </h1>
          <p style={{ margin: 0, color: themeTokens.secondaryText }}>
            Preparing your workspace...
          </p>
        </div>
      </div>
    );
  }

  if (!session) return <Login />;

  if (!profile) {
    return (
      <div
        style={{
          ...loadingShellStyle,
          background: themeTokens.pageBackground,
        }}
      >
        <div
          style={{
            ...errorCardStyle,
            border: '1px solid rgba(248,113,113,0.2)',
            background: themeTokens.panelBackground,
            boxShadow: themeTokens.panelShadow,
            color: themeTokens.text,
          }}
        >
          <div style={{ ...sectionEyebrow, color: '#ef4444' }}>
            Profile Error
          </div>
          <h1 style={{ marginTop: 0 }}>Profile not found</h1>
          <p style={{ color: themeTokens.secondaryText }}>
            {profileLoadError ||
              'This user exists in Supabase Auth but does not have a profile row yet.'}
          </p>
          <button
            onClick={handleLogout}
            style={{
              ...logoutButtonStyle,
              border: `1px solid ${themeTokens.buttonBorder}`,
              background: themeTokens.buttonBackground,
              color: themeTokens.buttonText,
              boxShadow: themeTokens.buttonShadow,
            }}
          >
            Logout
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        ...appShellStyle,
        background: themeTokens.pageBackground,
        color: themeTokens.text,
      }}
    >
      <div
        style={{
          ...backgroundGlowTopStyle,
          background: themeTokens.glowTop,
        }}
      />
      <div
        style={{
          ...backgroundGlowBottomStyle,
          background: themeTokens.glowBottom,
        }}
      />

      <header
        style={{
          ...headerShellStyle,
          border: `1px solid ${themeTokens.panelBorder}`,
          background: themeTokens.panelBackground,
          boxShadow: themeTokens.panelShadow,
        }}
      >
        <div style={headerLeftStyle}>
          <div style={brandWrapStyle}>
            <div style={brandAccentStyle} />
            <div>
              <div
                style={{
                  ...brandEyebrowStyle,
                  color: theme === 'light' ? '#2563eb' : '#93c5fd',
                }}
              >
                Detroit Axle Workspace
              </div>
              <h1
                style={{
                  ...brandTitleStyle,
                  color: theme === 'light' ? '#0f172a' : '#f8fbff',
                }}
              >
                Detroit Axle QA System
              </h1>
            </div>
          </div>
          <div style={metaStripStyle}>
            <div
              style={{
                ...metaPillStyle,
                backgroundColor: themeTokens.metaPillBackground,
                color: themeTokens.metaPillText,
                border: `1px solid ${themeTokens.navBorder}`,
              }}
            >
              Role: {profile.role}
            </div>
            <div
              style={{
                ...metaPillStyle,
                backgroundColor: themeTokens.metaPillBackground,
                color: themeTokens.metaPillText,
                border: `1px solid ${themeTokens.navBorder}`,
              }}
            >
              User: {profileLabel}
            </div>
            <div
              style={{
                ...metaPillStyle,
                backgroundColor: themeTokens.metaPillBackground,
                color: themeTokens.metaPillText,
                border: `1px solid ${themeTokens.navBorder}`,
              }}
            >
              Email: {profile.email}
            </div>
          </div>
        </div>

        <div style={headerActionsStyle}>
          <button
            onClick={handleLogout}
            style={{
              ...logoutButtonStyle,
              border: `1px solid ${themeTokens.buttonBorder}`,
              background: themeTokens.buttonBackground,
              color: themeTokens.buttonText,
              boxShadow: themeTokens.buttonShadow,
            }}
          >
            Logout
          </button>
        </div>
      </header>

      {isStaff ? (
        <>
          <nav style={navShellStyle}>
            <div className="app-nav-scroller" style={navScrollerStyle}>
              {navItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setPage(item.key)}
                  style={{
                    ...navButtonStyle,
                    background: themeTokens.navBackground,
                    color: themeTokens.navText,
                    border: `1px solid ${themeTokens.navBorder}`,
                    ...(page === item.key
                      ? {
                          background: themeTokens.navActiveBackground,
                          color: themeTokens.navActiveText,
                          border: `1px solid ${themeTokens.navActiveBorder}`,
                          boxShadow: themeTokens.buttonShadow,
                        }
                      : {}),
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </nav>

          <main style={contentShellStyle}>
            <div
              style={{
                ...contentInnerStyle,
                border: `1px solid ${themeTokens.contentBorder}`,
                background: themeTokens.contentBackground,
                boxShadow: themeTokens.contentShadow,
              }}
            >
              {navItems.map((item) =>
                mountedPages[item.key] ? (
                  <section
                    key={item.key}
                    style={
                      page === item.key ? visiblePagePaneStyle : hiddenPagePaneStyle
                    }
                  >
                    <Suspense fallback={<InlinePageLoader theme={themeTokens} />}>
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
          <div
            style={{
              ...contentInnerStyle,
              border: `1px solid ${themeTokens.contentBorder}`,
              background: themeTokens.contentBackground,
              boxShadow: themeTokens.contentShadow,
            }}
          >
            <SupervisorPortal currentUser={profile} />
          </div>
        </main>
      ) : (
        <main style={contentShellStyle}>
          <div
            style={{
              ...contentInnerStyle,
              border: `1px solid ${themeTokens.contentBorder}`,
              background: themeTokens.contentBackground,
              boxShadow: themeTokens.contentShadow,
            }}
          >
            <AgentPortal currentUser={profile} />
          </div>
        </main>
      )}
    </div>
  );
}

function InlinePageLoader({ theme }: { theme: ThemeTokens }) {
  return (
    <div
      style={{
        ...inlineLoaderStyle,
        border: `1px solid ${theme.contentBorder}`,
        background: theme.panelBackground,
      }}
    >
      <div style={inlineLoaderDotStyle} />
      <div>
        <div style={{ color: theme.text, fontWeight: 700 }}>
          Loading workspace...
        </div>
        <div
          style={{
            color: theme.secondaryText,
            fontSize: '13px',
            marginTop: '4px',
          }}
        >
          Preparing this page for the first time.
        </div>
      </div>
    </div>
  );
}

function ProfileInfoCard({
  label,
  value,
  theme,
}: {
  label: string;
  value: string;
  theme: ThemeTokens;
}) {
  return (
    <div
      style={{
        ...profileInfoCardStyle,
        border: `1px solid ${theme.contentBorder}`,
        background: theme.navBackground,
      }}
    >
      <div
        style={{
          ...profileInfoLabelStyle,
          color: '#60a5fa',
        }}
      >
        {label}
      </div>
      <div
        style={{
          ...profileInfoValueStyle,
          color: theme.text,
        }}
      >
        {value}
      </div>
    </div>
  );
}

const appShellStyle = {
  minHeight: '100vh',
  padding: '24px',
  position: 'relative' as const,
};

const backgroundGlowTopStyle = {
  position: 'absolute' as const,
  top: '-120px',
  right: '-120px',
  width: '340px',
  height: '340px',
  pointerEvents: 'none' as const,
};

const backgroundGlowBottomStyle = {
  position: 'absolute' as const,
  bottom: '-180px',
  left: '-120px',
  width: '380px',
  height: '380px',
  pointerEvents: 'none' as const,
};

const headerShellStyle = {
  position: 'relative' as const,
  zIndex: 2,
  display: 'flex',
  justifyContent: 'space-between',
  gap: '20px',
  alignItems: 'center',
  flexWrap: 'wrap' as const,
  padding: '24px 28px',
  borderRadius: '24px',
  backdropFilter: 'blur(18px)',
  marginBottom: '18px',
};

const headerLeftStyle = {
  display: 'grid',
  gap: '16px',
  minWidth: 0,
  flex: '1 1 520px',
};

const headerActionsStyle = {
  display: 'flex',
  gap: '12px',
  alignItems: 'center',
  justifyContent: 'flex-end',
  flex: '0 0 auto',
  flexWrap: 'nowrap' as const,
};

const brandWrapStyle = { display: 'flex', gap: '16px', alignItems: 'center' };

const brandAccentStyle = {
  width: '10px',
  height: '64px',
  borderRadius: '999px',
  background: 'linear-gradient(180deg, #60a5fa 0%, #2563eb 100%)',
  boxShadow: '0 0 24px rgba(37,99,235,0.45)',
};

const brandEyebrowStyle = {
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
};

const metaStripStyle = {
  display: 'flex',
  gap: '10px',
  flexWrap: 'wrap' as const,
};

const metaPillStyle = {
  padding: '10px 14px',
  borderRadius: '999px',
  fontSize: '13px',
  fontWeight: 600,
};

const logoutButtonStyle = {
  padding: '12px 18px',
  borderRadius: '14px',
  fontWeight: 700,
  cursor: 'pointer',
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
  overflowY: 'hidden' as const,
  padding: '6px 2px 8px 2px',
  scrollbarWidth: 'none' as const,
  msOverflowStyle: 'none' as const,
};

const navButtonStyle = {
  padding: '12px 16px',
  borderRadius: '14px',
  cursor: 'pointer',
  fontWeight: 700,
  whiteSpace: 'nowrap' as const,
  transition: 'all 0.2s ease',
  backdropFilter: 'blur(14px)',
};

const contentShellStyle = { position: 'relative' as const, zIndex: 1 };

const contentInnerStyle = {
  minHeight: 'calc(100vh - 240px)',
  width: '100%',
  padding: '28px',
  borderRadius: '28px',
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
  padding: '28px',
};

const sectionEyebrow = {
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
};

const profileInfoLabelStyle = {
  fontSize: '12px',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.12em',
  marginBottom: '10px',
  fontWeight: 700,
};

const profileInfoValueStyle = {
  fontSize: '16px',
  fontWeight: 700,
  wordBreak: 'break-word' as const,
};

const loadingShellStyle = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px',
};

const loadingCardStyle = {
  width: '100%',
  maxWidth: '560px',
  borderRadius: '28px',
  padding: '34px',
  textAlign: 'center' as const,
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
  padding: '34px',
};

export default App;
