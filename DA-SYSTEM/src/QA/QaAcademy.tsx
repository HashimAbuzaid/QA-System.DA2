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

  useEffect(() => {
    void loadLessons();
  }, [team]);

  async function loadLessons() {
    if (!team) {
      setLessons([]);
      setLoading(false);
      return;
    }

    setLoading(true);
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

  const visibleLessons = useMemo(() => lessons.slice(0, 6), [lessons]);

  if (!team) return null;

  return (
    <div style={{ marginTop: '30px' }}>
      <div style={eyebrowStyle}>Learning</div>
      <h3 style={{ marginTop: 0 }}>QA Academy</h3>
      <p style={subtextStyle}>
        Short lessons and reminders built for the {team} team.
      </p>
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
  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
  gap: '14px',
};

const cardStyle = {
  borderRadius: '18px',
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

export default QaAcademy;
