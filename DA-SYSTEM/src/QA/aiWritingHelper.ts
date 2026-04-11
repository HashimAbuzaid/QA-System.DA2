export type WritingHelperTask =
  | 'rewrite'
  | 'feedback'
  | 'audit_comment'
  | 'request'
  | 'monitoring';

export type WritingHelperInput = {
  task: WritingHelperTask;
  text?: string;
  team?: 'Calls' | 'Tickets' | 'Sales' | null;
  feedbackType?: 'Coaching' | 'Audit Feedback' | 'Warning' | 'Follow-up';
  subject?: string;
  caseType?: string;
  failedMetrics?: string[];
};

function cleanText(value?: string | null) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

function toSentenceCase(value: string) {
  const trimmed = cleanText(value);
  if (!trimmed) return '';

  const normalized = trimmed
    .split(/\n+/)
    .map((line) => {
      const text = line.trim();
      if (!text) return '';
      return text.charAt(0).toUpperCase() + text.slice(1);
    })
    .filter(Boolean)
    .join('\n');

  return normalized;
}

function ensurePeriod(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function joinSentences(parts: Array<string | null | undefined>) {
  return parts
    .map((part) => ensurePeriod(cleanText(part)))
    .filter(Boolean)
    .join(' ');
}

function getTeamLabel(team?: 'Calls' | 'Tickets' | 'Sales' | null) {
  if (!team) return 'case';
  if (team === 'Calls') return 'call';
  if (team === 'Tickets') return 'ticket';
  return 'sales case';
}

function getDefaultSubject(
  feedbackType?: 'Coaching' | 'Audit Feedback' | 'Warning' | 'Follow-up',
  caseType?: string
) {
  const cleanedCaseType = cleanText(caseType);
  if (cleanedCaseType) return cleanedCaseType;

  if (feedbackType === 'Warning') return 'Performance Warning';
  if (feedbackType === 'Follow-up') return 'Follow-up Required';
  if (feedbackType === 'Audit Feedback') return 'Audit Feedback';
  return 'Coaching';
}

function buildRewrite(text: string) {
  const cleaned = toSentenceCase(text);
  if (!cleaned) return '';

  const sentences = cleaned
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => ensurePeriod(sentence))
    .filter(Boolean);

  return sentences.join(' ');
}

function buildFeedbackSuggestion(input: WritingHelperInput) {
  const feedbackType = input.feedbackType || 'Coaching';
  const subject =
    cleanText(input.subject) || getDefaultSubject(feedbackType, input.caseType);
  const sourceText = cleanText(input.text);
  const teamLabel = getTeamLabel(input.team);

  if (feedbackType === 'Warning') {
    return joinSentences([
      `This is a formal warning regarding the handling of the ${teamLabel}`,
      sourceText ||
        'The observed behavior did not meet the required quality standard',
      'Please correct this issue immediately and make sure the process is followed on all future cases',
    ]);
  }

  if (feedbackType === 'Follow-up') {
    return joinSentences([
      `This is a follow-up on the ${subject.toLowerCase()}`,
      sourceText ||
        `Please review the issue identified on the ${teamLabel}`,
      'Please apply the correction on upcoming cases and maintain the required process going forward',
    ]);
  }

  if (feedbackType === 'Audit Feedback') {
    return joinSentences([
      `Audit feedback for ${subject.toLowerCase()}`,
      sourceText ||
        `The ${teamLabel} needs closer attention to process and accuracy`,
      'Please review the expectations and apply them consistently on future cases',
    ]);
  }

  return joinSentences([
    `Coaching note for ${subject.toLowerCase()}`,
    sourceText ||
      `Please focus on improving the handling of the ${teamLabel}`,
    'Review the process expectations and apply them consistently on future cases',
  ]);
}

function buildAuditComment(input: WritingHelperInput) {
  const caseType = cleanText(input.caseType) || 'case';
  const failedMetrics = (input.failedMetrics || [])
    .map((item) => cleanText(item))
    .filter(Boolean);
  const sourceText = cleanText(input.text);

  const issuePart =
    failedMetrics.length > 0
      ? `The main opportunities were ${failedMetrics.join(', ')}`
      : 'The audit was reviewed based on the selected scorecard';

  return joinSentences([
    `Audit completed for ${caseType.toLowerCase()}`,
    issuePart,
    sourceText ||
      'Please review the noted points and apply the required process on future cases',
  ]);
}

function buildRequestNote(input: WritingHelperInput) {
  const caseType = cleanText(input.caseType) || 'case';
  const sourceText = cleanText(input.text);
  const teamLabel = getTeamLabel(input.team);

  return joinSentences([
    `Supervisor review requested for this ${caseType.toLowerCase()}`,
    sourceText ||
      `Please review the handling of this ${teamLabel} and take the needed action`,
    'Escalate or follow up as needed based on the case details',
  ]);
}

function buildMonitoringNote(input: WritingHelperInput) {
  const sourceText = cleanText(input.text);
  const teamLabel = getTeamLabel(input.team);

  return joinSentences([
    `Monitoring item created for this ${teamLabel}`,
    sourceText ||
      'Please watch the next interactions closely and confirm that the correct process is being followed',
    'Resolve the item once the required improvement is confirmed',
  ]);
}

export async function runAIWritingHelper(input: WritingHelperInput) {
  const cleanedText = cleanText(input.text);

  if (input.task === 'rewrite') {
    return buildRewrite(cleanedText);
  }

  if (input.task === 'feedback') {
    return buildFeedbackSuggestion(input);
  }

  if (input.task === 'audit_comment') {
    return buildAuditComment(input);
  }

  if (input.task === 'request') {
    return buildRequestNote(input);
  }

  if (input.task === 'monitoring') {
    return buildMonitoringNote(input);
  }

  return cleanedText;
}
