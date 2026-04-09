import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import Login from './QA/Login';
import ResetPassword from './QA/ResetPassword';
import AgentPortal from './QA/AgentPortal';
import SupervisorPortal from './QA/SupervisorPortal';
import Dashboard from './QA/Dashboard';
import NewAuditSupabase from './QA/NewAuditSupabase';
import CallsUploadSupabase from './QA/CallsUploadSupabase';
import TicketsUploadSupabase from './QA/TicketsUploadSupabase';
import SalesUploadSupabase from './QA/SalesUploadSupabase';
import AuditsListSupabase from './QA/AuditsListSupabase';
import AccountsSupabase from './QA/AccountsSupabase';
import SupervisorRequestsSupabase from './QA/SupervisorRequestsSupabase';
import AgentFeedbackSupabase from './QA/AgentFeedbackSupabase';
import ReportsSupabase from './QA/ReportsSupabase';
import MonitoringSupabase from './QA/MonitoringSupabase';

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

type ProfileStatus = 'idle' | 'loading' | 'ready' | 'missing';
type ThemeMode = 'dark' | 'light';

type ThemePalette = {
  shellBackground: string;
  shellColor: string;
  bodyBackground: string;
  bodyColor: string;
  glowTop: string;
  glowBottom: string;
  headerBackground: string;
  headerBorder: string;
  headerShadow: string;
  brandEyebrow: string;
  brandTitle: string;
  brandAccent: string;
  brandAccentShadow: string;
  metaBackground: string;
  metaBorder: string;
  metaText: string;
  navButtonBackground: string;
  navButtonBorder: string;
  navButtonText: string;
  navButtonActiveBackground: string;
  navButtonActiveBorder: string;
  navButtonActiveText: string;
  navButtonActiveShadow: string;
  panelBackground: string;
  panelBorder: string;
  panelShadow: string;
  profileCardBackground: string;
  profileCardBorder: string;
  profileCardLabel: string;
  profileCardValue: string;
  buttonPrimaryBackground: string;
  buttonPrimaryBorder: string;
  buttonPrimaryText: string;
  buttonPrimaryShadow: string;
  buttonSecondaryBackground: string;
  buttonSecondaryBorder: string;
  buttonSecondaryText: string;
  loadingBackground: string;
  loadingCardBackground: string;
  loadingCardBorder: string;
  loadingDotBackground: string;
  loadingDotShadow: string;
  loadingText: string;
  loadingSubtext: string;
  errorCardBackground: string;
  errorCardBorder: string;
  errorText: string;
  contentText: string;
};

function isRecoveryLinkActive() {
  if (typeof window === 'undefined') return false;

  const hash = window.location.hash || '';
  const search = window.location.search || '';

  return hash.includes('type=recovery') || search.includes('type=recovery');
}

function clearRecoveryUrlState() {
  if (typeof window === 'undefined') return;

  const cleanUrl = `${window.location.origin}${window.location.pathname}`;
  window.history.replaceState({}, document.title, cleanUrl);
}

function readStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'dark';

  const storedValue = window.localStorage.getItem('detroit-axle-theme-mode');
  return storedValue === 'light' ? 'light' : 'dark';
}

function getThemePalette(mode: ThemeMode): ThemePalette {
  if (mode === 'light') {
    return {
      shellBackground:
        'radial-gradient(circle at top left, rgba(37,99,235,0.12), transparent 28%), radial-gradient(circle at bottom right, rgba(59,130,246,0.1), transparent 32%), linear-gradient(180deg, #f5f9ff 0%, #edf4ff 48%, #e6efff 100%)',
      shellColor: '#0f172a',
      bodyBackground: '#edf4ff',
      bodyColor: '#0f172a',
      glowTop: 'radial-gradient(circle, rgba(37,99,235,0.14) 0%, transparent 68%)',
      glowBottom:
        'radial-gradient(circle, rgba(14,165,233,0.12) 0%, transparent 70%)',
      headerBackground:
        'linear-gradient(180deg, rgba(255,255,255,0.94) 0%, rgba(245,249,255,0.9) 100%)',
      headerBorder: '1px solid rgba(148,163,184,0.22)',
      headerShadow: '0 18px 48px rgba(148,163,184,0.2)',
      brandEyebrow: '#2563eb',
      brandTitle: '#0f172a',
      brandAccent: 'linear-gradient(180deg, #60a5fa 0%, #2563eb 100%)',
      brandAccentShadow: '0 0 24px rgba(37,99,235,0.24)',
      metaBackground: 'rgba(255,255,255,0.82)',
      metaBorder: '1px solid rgba(148,163,184,0.22)',
      metaText: '#334155',
      navButtonBackground: 'rgba(255,255,255,0.86)',
      navButtonBorder: '1px solid rgba(148,163,184,0.18)',
      navButtonText: '#334155',
      navButtonActiveBackground:
        'linear-gradient(135deg, rgba(37,99,235,0.96) 0%, rgba(59,130,246,0.94) 100%)',
      navButtonActiveBorder: '1px solid rgba(96,165,250,0.34)',
      navButtonActiveText: '#ffffff',
      navButtonActiveShadow: '0 10px 24px rgba(37,99,235,0.22)',
      panelBackground:
        'linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(245,249,255,0.88) 100%)',
      panelBorder: '1px solid rgba(148,163,184,0.18)',
      panelShadow: '0 20px 52px rgba(148,163,184,0.18)',
      profileCardBackground: 'rgba(255,255,255,0.84)',
      profileCardBorder: '1px solid rgba(148,163,184,0.18)',
      profileCardLabel: '#2563eb',
      profileCardValue: '#0f172a',
      buttonPrimaryBackground:
        'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
      buttonPrimaryBorder: '1px solid rgba(37,99,235,0.26)',
      buttonPrimaryText: '#ffffff',
      buttonPrimaryShadow: '0 12px 28px rgba(37,99,235,0.22)',
      buttonSecondaryBackground: 'rgba(255,255,255,0.88)',
      buttonSecondaryBorder: '1px solid rgba(148,163,184,0.24)',
      buttonSecondaryText: '#0f172a',
      loadingBackground:
        'radial-gradient(circle at top left, rgba(37,99,235,0.12), transparent 28%), linear-gradient(180deg, #f5f9ff 0%, #edf4ff 100%)',
      loadingCardBackground: 'rgba(255,255,255,0.9)',
      loadingCardBorder: '1px solid rgba(148,163,184,0.18)',
      loadingDotBackground:
        'radial-gradient(circle at 30% 30%, #bfdbfe 0%, #60a5fa 55%, #2563eb 100%)',
      loadingDotShadow: '0 0 38px rgba(37,99,235,0.18)',
      loadingText: '#0f172a',
      loadingSubtext: '#64748b',
      errorCardBackground: 'rgba(255,255,255,0.92)',
      errorCardBorder: '1px solid rgba(248,113,113,0.22)',
      errorText: '#0f172a',
      contentText: '#334155',
    };
  }

  return {
    shellBackground:
      'radial-gradient(circle at top left, rgba(59,130,246,0.22), transparent 28%), radial-gradient(circle at bottom right, rgba(99,102,241,0.18), transparent 30%), linear-gradient(180deg, #07111f 0%, #0b1324 45%, #0a1020 100%)',
    shellColor: '#e5eefb',
    bodyBackground: '#07111f',
    bodyColor: '#e5eefb',
    glowTop: 'radial-gradient(circle, rgba(37,99,235,0.18) 0%, transparent 68%)',
    glowBottom:
      'radial-gradient(circle, rgba(14,165,233,0.14) 0%, transparent 70%)',
    headerBackground:
      'linear-gradient(180deg, rgba(15,23,42,0.88) 0%, rgba(15,23,42,0.62) 100%)',
    headerBorder: '1px solid rgba(148,163,184,0.18)',
    headerShadow: '0 18px 50px rgba(2,6,23,0.45)',
    brandEyebrow: '#93c5fd',
    brandTitle: '#f8fbff',
    brandAccent: 'linear-gradient(180deg, #60a5fa 0%, #2563eb 100%)',
    brandAccentShadow: '0 0 24px rgba(37,99,235,0.45)',
    metaBackground: 'rgba(15,23,42,0.58)',
    metaBorder: '1px solid rgba(148,163,184,0.14)',
    metaText: '#cbd5e1',
    navButtonBackground: 'rgba(15,23,42,0.62)',
    navButtonBorder: '1px solid rgba(148,163,184,0.16)',
    navButtonText: '#cbd5e1',
    navButtonActiveBackground:
      'linear-gradient(135deg, rgba(37,99,235,0.95) 0%, rgba(59,130,246,0.92) 100%)',
    navButtonActiveBorder: '1px solid rgba(147,197,253,0.38)',
    navButtonActiveText: '#ffffff',
    navButtonActiveShadow: '0 10px 24px rgba(37,99,235,0.25)',
    panelBackground:
      'linear-gradient(180deg, rgba(15,23,42,0.78) 0%, rgba(15,23,42,0.56) 100%)',
    panelBorder: '1px solid rgba(148,163,184,0.14)',
    panelShadow: '0 20px 55px rgba(2,6,23,0.42)',
    profileCardBackground: 'rgba(15,23,42,0.58)',
    profileCardBorder: '1px solid rgba(148,163,184,0.12)',
    profileCardLabel: '#93c5fd',
    profileCardValue: '#f8fafc',
    buttonPrimaryBackground:
      'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
    buttonPrimaryBorder: '1px solid rgba(96,165,250,0.34)',
    buttonPrimaryText: '#ffffff',
    buttonPrimaryShadow: '0 12px 28px rgba(37,99,235,0.28)',
    buttonSecondaryBackground: 'rgba(15,23,42,0.68)',
    buttonSecondaryBorder: '1px solid rgba(148,163,184,0.18)',
    buttonSecondaryText: '#e5eefb',
    loadingBackground:
      'radial-gradient(circle at top left, rgba(59,130,246,0.22), transparent 28%), linear-gradient(180deg, #07111f 0%, #0b1324 100%)',
    loadingCardBackground: 'rgba(15,23,42,0.74)',
    loadingCardBorder: '1px solid rgba(148,163,184,0.14)',
    loadingDotBackground:
      'radial-gradient(circle at 30% 30%, #93c5fd 0%, #2563eb 55%, #1e3a8a 100%)',
    loadingDotShadow: '0 0 40px rgba(37,99,235,0.35)',
    loadingText: '#f8fbff',
    loadingSubtext: '#94a3b8',
    errorCardBackground: 'rgba(15,23,42,0.74)',
    errorCardBorder: '1px solid rgba(248,113,113,0.2)',
    errorText: '#f8fafc',
    contentText: '#e5eefb',
  };
}

function createStyles(theme: ThemePalette) {
  const secondaryButtonBase: CSSProperties = {
    padding: '12px 18px',
    borderRadius: '14px',
    border: theme.buttonSecondaryBorder,
    background: theme.buttonSecondaryBackground,
    color: theme.buttonSecondaryText,
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    flexShrink: 0,
    transition: 'transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease',
  };

  const primaryButtonBase: CSSProperties = {
    padding: '12px 18px',
    borderRadius: '14px',
    border: theme.buttonPrimaryBorder,
    background: theme.buttonPrimaryBackground,
    color: theme.buttonPrimaryText,
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    flexShrink: 0,
    boxShadow: theme.buttonPrimaryShadow,
    transition: 'transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease',
  };

  return {
    appShell: {
      minHeight: '100vh',
      background: theme.shellBackground,
      color: theme.shellColor,
      padding: '24px',
      position: 'relative',
      overflow: 'hidden',
    } as CSSProperties,
    backgroundGlowTop: {
      position: 'absolute',
      top: '-120px',
      right: '-120px',
      width: '340px',
      height: '340px',
      background: theme.glowTop,
      pointerEvents: 'none',
    } as CSSProperties,
    backgroundGlowBottom: {
      position: 'absolute',
      bottom: '-180px',
      left: '-120px',
      width: '380px',
      height: '380px',
      background: theme.glowBottom,
      pointerEvents: 'none',
    } as CSSProperties,
    headerShell: {
      position: 'sticky',
      top: '24px',
      zIndex: 30,
      display: 'flex',
      justifyContent: 'space-between',
      gap: '20px',
      alignItems: 'center',
      flexWrap: 'wrap',
      padding: '26px 28px',
      borderRadius: '24px',
      border: theme.headerBorder,
      background: theme.headerBackground,
      boxShadow: theme.headerShadow,
      backdropFilter: 'blur(18px)',
      marginBottom: '18px',
    } as CSSProperties,
    headerLeft: { display: 'grid', gap: '16px', minWidth: 0 } as CSSProperties,
    headerActions: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      flexWrap: 'nowrap',
      marginLeft: 'auto',
      flexShrink: 0,
    } as CSSProperties,
    brandWrap: {
      display: 'flex',
      gap: '16px',
      alignItems: 'center',
      minWidth: 0,
    } as CSSProperties,
    brandAccent: {
      width: '10px',
      height: '64px',
      borderRadius: '999px',
      background: theme.brandAccent,
      boxShadow: theme.brandAccentShadow,
      flexShrink: 0,
    } as CSSProperties,
    brandEyebrow: {
      color: theme.brandEyebrow,
      fontSize: '13px',
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.16em',
      marginBottom: '8px',
    } as CSSProperties,
    brandTitle: {
      margin: 0,
      fontSize: '38px',
      lineHeight: 1.05,
      fontWeight: 800,
      color: theme.brandTitle,
      wordBreak: 'break-word',
    } as CSSProperties,
    metaStrip: {
      display: 'flex',
      gap: '10px',
      flexWrap: 'wrap',
    } as CSSProperties,
    metaPill: {
      padding: '10px 14px',
      borderRadius: '999px',
      border: theme.metaBorder,
      backgroundColor: theme.metaBackground,
      color: theme.metaText,
      fontSize: '13px',
      fontWeight: 600,
      backdropFilter: 'blur(14px)',
    } as CSSProperties,
    themeButton: {
      ...secondaryButtonBase,
      minWidth: '132px',
      textAlign: 'center',
    } as CSSProperties,
    logoutButton: {
      ...primaryButtonBase,
      minWidth: '96px',
      textAlign: 'center',
    } as CSSProperties,
    navShell: {
      position: 'relative',
      zIndex: 1,
      marginBottom: '18px',
    } as CSSProperties,
    navScroller: {
      display: 'flex',
      gap: '10px',
      overflowX: 'auto',
      padding: '6px 2px 8px 2px',
    } as CSSProperties,
    navButton: {
      padding: '12px 16px',
      borderRadius: '14px',
      border: theme.navButtonBorder,
      background: theme.navButtonBackground,
      color: theme.navButtonText,
      cursor: 'pointer',
      fontWeight: 700,
      whiteSpace: 'nowrap',
      transition: 'all 0.2s ease',
      backdropFilter: 'blur(14px)',
    } as CSSProperties,
    activeNavButton: {
      background: theme.navButtonActiveBackground,
      color: theme.navButtonActiveText,
      border: theme.navButtonActiveBorder,
      boxShadow: theme.navButtonActiveShadow,
    } as CSSProperties,
    contentShell: { position: 'relative', zIndex: 1 } as CSSProperties,
    contentInner: {
      minHeight: 'calc(100vh - 240px)',
      width: '100%',
      padding: '28px',
      borderRadius: '28px',
      border: theme.panelBorder,
      background: theme.panelBackground,
      boxShadow: theme.panelShadow,
      backdropFilter: 'blur(18px)',
      color: theme.contentText,
    } as CSSProperties,
    profilePanel: {
      borderRadius: '24px',
      border: theme.panelBorder,
      background: theme.profileCardBackground,
      padding: '28px',
    } as CSSProperties,
    sectionEyebrow: {
      color: theme.brandEyebrow,
      fontSize: '12px',
      fontWeight: 800,
      letterSpacing: '0.18em',
      textTransform: 'uppercase',
      marginBottom: '12px',
    } as CSSProperties,
    profileGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
      gap: '16px',
    } as CSSProperties,
    profileInfoCard: {
      borderRadius: '18px',
      padding: '18px',
      border: theme.profileCardBorder,
      background: theme.profileCardBackground,
    } as CSSProperties,
    profileInfoLabel: {
      fontSize: '12px',
      textTransform: 'uppercase',
      letterSpacing: '0.12em',
      color: theme.profileCardLabel,
      marginBottom: '10px',
      fontWeight: 700,
    } as CSSProperties,
    profileInfoValue: {
      fontSize: '16px',
      fontWeight: 700,
      color: theme.profileCardValue,
      wordBreak: 'break-word',
    } as CSSProperties,
    loadingShell: {
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: theme.loadingBackground,
      padding: '24px',
      color: theme.loadingText,
    } as CSSProperties,
    loadingCard: {
      width: '100%',
      maxWidth: '560px',
      borderRadius: '28px',
      border: theme.loadingCardBorder,
      background: theme.loadingCardBackground,
      padding: '34px',
      textAlign: 'center',
      boxShadow: theme.headerShadow,
    } as CSSProperties,
    loadingDot: {
      width: '74px',
      height: '74px',
      borderRadius: '50%',
      margin: '0 auto 18px auto',
      background: theme.loadingDotBackground,
      boxShadow: theme.loadingDotShadow,
    } as CSSProperties,
    loadingSubtext: {
      margin: 0,
      color: theme.loadingSubtext,
    } as CSSProperties,
    errorCard: {
      width: '100%',
      maxWidth: '620px',
      borderRadius: '28px',
      border: theme.errorCardBorder,
      background: theme.errorCardBackground,
      padding: '34px',
      boxShadow: theme.headerShadow,
      color: theme.errorText,
    } as CSSProperties,
    secondaryButtonBase,
    primaryButtonBase,
  };
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<StaffPage>('dashboard');
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>('idle');
  const [profileErrorMessage, setProfileErrorMessage] = useState('');
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => readStoredTheme());

  const recoveryModeRef = useRef<boolean>(false);

  const theme = useMemo(() => getThemePalette(themeMode), [themeMode]);
  const styles = useMemo(() => createStyles(theme), [theme]);

  useEffect(() => {
    recoveryModeRef.current = recoveryMode;
  }, [recoveryMode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    window.localStorage.setItem('detroit-axle-theme-mode', themeMode);
    document.documentElement.setAttribute('data-theme-mode', themeMode);
    document.documentElement.style.colorScheme = themeMode === 'light' ? 'light' : 'dark';
    document.body.style.background = theme.bodyBackground;
    document.body.style.color = theme.bodyColor;
  }, [themeMode, theme.bodyBackground, theme.bodyColor]);

  useEffect(() => {
    void loadInitialSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);

      const shouldStayInRecovery =
        event === 'PASSWORD_RECOVERY' ||
        isRecoveryLinkActive() ||
        recoveryModeRef.current;

      if (shouldStayInRecovery && newSession?.user) {
        setRecoveryMode(true);
        setProfileStatus('idle');
        setProfileErrorMessage('');
        setLoading(false);
        return;
      }

      if (newSession?.user) {
        setRecoveryMode(false);
        void loadProfile(newSession.user.id);
      } else {
        setProfile(null);
        setProfileStatus('idle');
        setProfileErrorMessage('');
        setPage('dashboard');
        setRecoveryMode(false);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function loadInitialSession() {
    const recoveryActive = isRecoveryLinkActive();

    if (recoveryActive) {
      setRecoveryMode(true);
    }

    const { data, error } = await supabase.auth.getSession();

    if (error) {
      setLoading(false);
      setProfileStatus('idle');
      setProfileErrorMessage('');
      return;
    }

    setSession(data.session);

    if (recoveryActive && data.session?.user) {
      setProfileStatus('idle');
      setProfileErrorMessage('');
      setLoading(false);
      return;
    }

    if (data.session?.user) {
      await loadProfile(data.session.user.id);
    } else {
      setLoading(false);
      setProfileStatus('idle');
      setProfileErrorMessage('');
    }
  }

  async function loadProfile(userId: string) {
    setProfileStatus('loading');
    setProfileErrorMessage('');

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      setProfile(null);
      setProfileStatus('missing');
      setProfileErrorMessage('Could not load profile.');
      setLoading(false);
      return;
    }

    if (!data) {
      setProfile(null);
      setProfileStatus('missing');
      setProfileErrorMessage('');
      setLoading(false);
      return;
    }

    const loadedProfile = data as UserProfile;
    setProfile(loadedProfile);
    setProfileStatus('ready');
    setProfileErrorMessage('');
    setPage('dashboard');
    setLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    clearRecoveryUrlState();
    setSession(null);
    setProfile(null);
    setProfileStatus('idle');
    setProfileErrorMessage('');
    setPage('dashboard');
    setRecoveryMode(false);
  }

  function handleRecoveryComplete() {
    clearRecoveryUrlState();
    setRecoveryMode(false);
    setProfileStatus('idle');
    setProfileErrorMessage('');

    if (session?.user?.id) {
      void loadProfile(session.user.id);
    }
  }

  function handleToggleTheme() {
    setThemeMode((prev) => (prev === 'light' ? 'dark' : 'light'));
  }

  const isAdmin = profile?.role === 'admin';
  const isQA = profile?.role === 'qa';
  const isSupervisor = profile?.role === 'supervisor';
  const isStaff = isAdmin || isQA;

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
        { key: 'supervisorRequests', label: 'Supervisor Requests' },
        { key: 'reports', label: 'Reports' }
      );
    }

    baseItems.push({
      key: 'profile',
      label: isAdmin ? 'My Admin Profile' : 'My QA Profile',
    });

    return baseItems;
  }, [profile, isStaff, isAdmin]);

  function renderStaffPage() {
    switch (page) {
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
        return isAdmin ? <ReportsSupabase /> : null;
      case 'profile':
        return (
          <div style={styles.profilePanel}>
            <div style={styles.sectionEyebrow}>Profile</div>
            <h2 style={{ marginTop: 0, marginBottom: '18px', color: theme.brandTitle }}>
              {isAdmin ? 'My Admin Profile' : 'My QA Profile'}
            </h2>
            <div style={styles.profileGrid}>
              <ProfileInfoCard
                label="Name"
                value={profile?.agent_name || '-'}
                styles={styles}
              />
              <ProfileInfoCard
                label="Display Name"
                value={profile?.display_name || '-'}
                styles={styles}
              />
              <ProfileInfoCard label="Email" value={profile?.email || '-'} styles={styles} />
              <ProfileInfoCard label="Role" value={profile?.role || '-'} styles={styles} />
              <ProfileInfoCard
                label="Agent ID"
                value={profile?.agent_id || '-'}
                styles={styles}
              />
              <ProfileInfoCard label="Team" value={profile?.team || '-'} styles={styles} />
            </div>
          </div>
        );
      default:
        return <Dashboard />;
    }
  }

  if (loading || profileStatus === 'loading') {
    return (
      <div style={styles.loadingShell}>
        <div style={styles.loadingCard}>
          <div style={styles.loadingDot} />
          <h1 style={{ margin: '0 0 8px 0', color: theme.loadingText }}>
            Loading Detroit Axle QA System
          </h1>
          <p style={styles.loadingSubtext}>Preparing your workspace...</p>
        </div>
      </div>
    );
  }

  if (recoveryMode) {
    return (
      <ResetPassword
        onComplete={handleRecoveryComplete}
        onLogout={handleLogout}
      />
    );
  }

  if (!session) return <Login />;

  if (!profile) {
    return (
      <div style={styles.loadingShell}>
        <div style={styles.errorCard}>
          <div style={styles.sectionEyebrow}>Profile Error</div>
          <h1 style={{ marginTop: 0, color: theme.errorText }}>Profile not found</h1>
          <p style={{ color: theme.loadingSubtext }}>
            {profileErrorMessage ||
              'This user exists in Supabase Auth but does not have a profile row yet.'}
          </p>
          <button onClick={handleLogout} style={styles.logoutButton}>
            Logout
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.appShell}>
      <div style={styles.backgroundGlowTop} />
      <div style={styles.backgroundGlowBottom} />
      <header style={styles.headerShell}>
        <div style={styles.headerLeft}>
          <div style={styles.brandWrap}>
            <div style={styles.brandAccent} />
            <div>
              <div style={styles.brandEyebrow}>Detroit Axle Workspace</div>
              <h1 style={styles.brandTitle}>Detroit Axle QA System</h1>
            </div>
          </div>
          <div style={styles.metaStrip}>
            <div style={styles.metaPill}>Role: {profile.role}</div>
            <div style={styles.metaPill}>User: {profileLabel}</div>
            <div style={styles.metaPill}>Email: {profile.email}</div>
          </div>
        </div>

        <div style={styles.headerActions}>
          <button
            type="button"
            onClick={handleToggleTheme}
            style={styles.themeButton}
          >
            {themeMode === 'light' ? 'Dark Theme' : 'Light Theme'}
          </button>

          <button type="button" onClick={handleLogout} style={styles.logoutButton}>
            Logout
          </button>
        </div>
      </header>

      {isStaff ? (
        <>
          <nav style={styles.navShell}>
            <div style={styles.navScroller}>
              {navItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setPage(item.key)}
                  style={{
                    ...styles.navButton,
                    ...(page === item.key ? styles.activeNavButton : {}),
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </nav>
          <main style={styles.contentShell}>
            <div style={styles.contentInner}>{renderStaffPage()}</div>
          </main>
        </>
      ) : isSupervisor ? (
        <main style={styles.contentShell}>
          <div style={styles.contentInner}>
            <SupervisorPortal currentUser={profile} />
          </div>
        </main>
      ) : (
        <main style={styles.contentShell}>
          <div style={styles.contentInner}>
            <AgentPortal currentUser={profile} />
          </div>
        </main>
      )}
    </div>
  );
}

function ProfileInfoCard({
  label,
  value,
  styles,
}: {
  label: string;
  value: string;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <div style={styles.profileInfoCard}>
      <div style={styles.profileInfoLabel}>{label}</div>
      <div style={styles.profileInfoValue}>{value}</div>
    </div>
  );
}

export default App;
