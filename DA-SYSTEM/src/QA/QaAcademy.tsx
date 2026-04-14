import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

type TeamName = 'Calls' | 'Tickets' | 'Sales';

type Lesson = {
  id: string;
  title: string;
  team: TeamName | 'All';
  content: string;
  lesson_type: string;
  is_active?: boolean;
};

type Props = {
  team: TeamName | null;
};

type CurrentProfile = {
  id: string;
  role: 'admin' | 'qa' | 'agent' | 'supervisor';
  agent_name: string;
  display_name: string | null;
};

const fallbackLessons: Record<TeamName, Lesson[]> = {
  Calls: [
    {
      id: 'calls-1',
      title: 'Call Opening Excellence',
      team: 'Calls',
      lesson_type: 'Micro Lesson',
      content: 'Start with a confident greeting, verify the customer need quickly, and set the call tone in the first 20 seconds.',
    },
    {
      id: 'calls-2',
      title: 'Procedure and Notes',
      team: 'Calls',
      lesson_type: 'Checklist',
      content: 'Complete notes before ending the interaction, confirm procedure steps, and double-check the REF / form path.',
    },
  ],
  Tickets: [
    {
      id: 'tickets-1',
      title: 'Accuracy on Ticket Replies',
      team: 'Tickets',
      lesson_type: 'Micro Lesson',
      content: 'Slow down on product, order, and form details. Accuracy usually drives the final audit result more than speed.',
    },
    {
      id: 'tickets-2',
      title: 'Professional Closing',
      team: 'Tickets',
      lesson_type: 'Checklist',
      content: 'End with a clear next step, keep grammar clean, and avoid abrupt endings or incomplete resolution notes.',
    },
  ],
  Sales: [
    {
      id: 'sales-1',
      title: 'Upsell With Relevance',
      team: 'Sales',
      lesson_type: 'Micro Lesson',
      content: 'Tie upsell suggestions to customer need. Relevance builds trust faster than a generic extra offer.',
    },
    {
      id: 'sales-2',
      title: 'Confirm the Correct Part',
      team: 'Sales',
      lesson_type: 'Checklist',
      content: 'Pause before checkout and confirm the address, selected part, ETA, and any refund-form follow-up needs.',
    },
  ],
};

function QaAcademy({ team }: Props) {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [currentProfile, setCurrentProfile] = useState<CurrentProfile | null>(null);
  const [lessonTitle, setLessonTitle] = useState('');
  const [lessonType, setLessonType] = useState('Micro Lesson');
  const [lessonTeam, setLessonTeam] = useState<TeamName | 'All'>('All');
  const [lessonContent, setLessonContent] = useState('');

  const canManageLessons =
    currentProfile?.role === 'admin' || currentProfile?.role === 'qa';

  useEffect(() => {
    void loadCurrentProfile();
  }, []);

  useEffect(() => {
    setLessonTeam(team || 'All');
    void loadLessons();
  }, [team]);

  async function loadCurrentProfile() {
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData.user?.id;

    if (!userId) {
      setCurrentProfile(null);
      return;
    }

    const { data } = await supabase
      .from('profiles')
      .select('id, role, agent_name, display_name')
      .eq('id', userId)
      .maybeSingle();

    setCurrentProfile((data as CurrentProfile) || null);
  }

  async function loadLessons() {
    if (!team) {
      setLessons([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage('');

    const { data, error } = await supabase
      .from('qa_academy_lessons')
      .select('id, title, team, content, lesson_type, is_active')
      .eq('is_active', true)
      .in('team', [team, 'All'])
      .order('created_at', { ascending: false });

    if (error || !data || data.length === 0) {
      setLessons(fallbackLessons[team] || []);
      setLoading(false);
      return;
    }

    setLessons((data as Lesson[]) || []);
    setLoading(false);
  }

  async function handleCreateLesson() {
    if (!canManageLessons) {
      setErrorMessage('Only QA and admin users can add academy lessons.');
      return;
    }

    if (!lessonTitle.trim() || !lessonContent.trim()) {
      setErrorMessage('Please fill Lesson Title and Lesson Content.');
      return;
    }

    setSaving(true);
    setErrorMessage('');
    setSuccessMessage('');

    const { error } = await supabase.from('qa_academy_lessons').insert({
      title: lessonTitle.trim(),
      team: lessonTeam,
      content: lessonContent.trim(),
      lesson_type: lessonType.trim() || 'Micro Lesson',
      is_active: true,
    });

    setSaving(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setLessonTitle('');
    setLessonType('Micro Lesson');
    setLessonTeam(team || 'All');
    setLessonContent('');
    setSuccessMessage('QA Academy lesson created successfully.');
    await loadLessons();
  }

  const visibleLessons = useMemo(() => lessons.slice(0, 6), [lessons]);

  if (!team) return null;

  return (
    <div style={{ marginTop: '30px' }}>
      <div style={eyebrowStyle}>Learning</div>
      <h3 style={{ marginTop: 0 }}>QA Academy</h3>
      <p style={subtextStyle}>
        Short lessons and reminders built for the {team} team.
      </p>

      {canManageLessons ? (
        <div style={managerPanelStyle}>
          <div style={managerPanelHeaderStyle}>Add Your Own Lesson</div>
          {errorMessage ? <div style={errorBannerStyle}>{errorMessage}</div> : null}
          {successMessage ? <div style={successBannerStyle}>{successMessage}</div> : null}
          <div style={managerGridStyle}>
            <div>
              <label style={fieldLabelStyle}>Lesson Title</label>
              <input
                type="text"
                value={lessonTitle}
                onChange={(event) => setLessonTitle(event.target.value)}
                style={fieldStyle}
                placeholder="Enter lesson title"
              />
            </div>
            <div>
              <label style={fieldLabelStyle}>Lesson Type</label>
              <input
                type="text"
                value={lessonType}
                onChange={(event) => setLessonType(event.target.value)}
                style={fieldStyle}
                placeholder="Micro Lesson, Checklist, Script, etc."
              />
            </div>
            <div>
              <label style={fieldLabelStyle}>Lesson Team</label>
              <select
                value={lessonTeam}
                onChange={(event) => setLessonTeam(event.target.value as TeamName | 'All')}
                style={fieldStyle}
              >
                <option value="All">All</option>
                <option value="Calls">Calls</option>
                <option value="Tickets">Tickets</option>
                <option value="Sales">Sales</option>
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={fieldLabelStyle}>Lesson Content</label>
              <textarea
                value={lessonContent}
                onChange={(event) => setLessonContent(event.target.value)}
                rows={4}
                style={fieldStyle}
                placeholder="Write the lesson content"
              />
            </div>
          </div>
          <div style={managerActionRowStyle}>
            <button type="button" onClick={() => void handleCreateLesson()} style={primaryButtonStyle}>
              {saving ? 'Saving...' : 'Save Lesson'}
            </button>
            <button type="button" onClick={() => void loadLessons()} style={secondaryButtonStyle}>
              Refresh Lessons
            </button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <p style={subtextStyle}>Loading academy lessons...</p>
      ) : visibleLessons.length === 0 ? (
        <p style={subtextStyle}>No lessons available yet.</p>
      ) : (
        <div style={gridStyle}>
          {visibleLessons.map((lesson) => (
            <div key={lesson.id} style={cardStyle}>
              <div style={typePillStyle}>{lesson.lesson_type}</div>
              <div style={titleStyle}>{lesson.title}</div>
              <div style={contentStyle}>{lesson.content}</div>
            </div>
          ))}
        </div>
      )}
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

const gridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: '18px',
};

const cardStyle = {
  borderRadius: '24px',
  border: '1px solid var(--screen-border, rgba(148,163,184,0.16))',
  background: 'var(--screen-card-bg, rgba(15,23,42,0.7))',
  boxShadow: 'var(--screen-shadow, 0 18px 40px rgba(2,6,23,0.35))',
  padding: '18px',
};

const typePillStyle = {
  display: 'inline-block',
  marginBottom: '12px',
  padding: '6px 10px',
  borderRadius: '999px',
  background: 'var(--screen-score-pill-bg, rgba(37,99,235,0.18))',
  color: 'var(--screen-accent, #60a5fa)',
  fontSize: '12px',
  fontWeight: 800,
};

const titleStyle = {
  color: 'var(--screen-heading, #f8fafc)',
  fontSize: '18px',
  fontWeight: 800,
  marginBottom: '10px',
};

const contentStyle = {
  color: 'var(--screen-text, #e5eefb)',
  fontSize: '14px',
  lineHeight: 1.6,
};

const managerPanelStyle = {
  borderRadius: '18px',
  border: '1px solid var(--screen-border, rgba(148,163,184,0.16))',
  background: 'var(--screen-card-bg, rgba(15,23,42,0.7))',
  boxShadow: 'var(--screen-shadow, 0 18px 40px rgba(2,6,23,0.35))',
  padding: '18px',
  marginBottom: '18px',
};

const managerPanelHeaderStyle = {
  color: 'var(--screen-heading, #f8fafc)',
  fontSize: '16px',
  fontWeight: 800,
  marginBottom: '14px',
};

const managerGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '14px',
};

const fieldLabelStyle = {
  display: 'block',
  marginBottom: '8px',
  color: 'var(--screen-text, #e5eefb)',
  fontSize: '13px',
  fontWeight: 700,
};

const fieldStyle = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: '14px',
  border: '1px solid var(--screen-border, rgba(148,163,184,0.16))',
  background: 'var(--screen-field-bg, rgba(15,23,42,0.7))',
  color: 'var(--screen-field-text, #e5eefb)',
};

const managerActionRowStyle = {
  display: 'flex',
  gap: '10px',
  flexWrap: 'wrap' as const,
  marginTop: '14px',
};

const primaryButtonStyle = {
  padding: '12px 16px',
  borderRadius: '14px',
  border: '1px solid rgba(96, 165, 250, 0.24)',
  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
  color: '#ffffff',
  fontWeight: 800,
  cursor: 'pointer',
};

const secondaryButtonStyle = {
  padding: '12px 16px',
  borderRadius: '14px',
  border: '1px solid var(--screen-border, rgba(148,163,184,0.16))',
  background: 'var(--screen-card-soft-bg, rgba(15,23,42,0.52))',
  color: 'var(--screen-text, #e5eefb)',
  fontWeight: 700,
  cursor: 'pointer',
};

const errorBannerStyle = {
  marginBottom: '12px',
  padding: '12px 14px',
  borderRadius: '14px',
  background: 'rgba(127,29,29,0.18)',
  border: '1px solid rgba(248,113,113,0.18)',
  color: '#fecaca',
};

const successBannerStyle = {
  marginBottom: '12px',
  padding: '12px 14px',
  borderRadius: '14px',
  background: 'rgba(22,101,52,0.16)',
  border: '1px solid rgba(74,222,128,0.18)',
  color: '#bbf7d0',
};

export default QaAcademy;
