import type { VercelRequest, VercelResponse } from '@vercel/node';

type TeamName = 'Calls' | 'Tickets' | 'Sales';
type HelperMode =
  | 'rewrite'
  | 'feedback'
  | 'coaching'
  | 'audit_comment'
  | 'monitoring_comment'
  | 'request_note';

type FeedbackType = 'Coaching' | 'Audit Feedback' | 'Warning' | 'Follow-up';

type Tone =
  | 'professional'
  | 'supportive'
  | 'firm'
  | 'clear'
  | 'friendly';

type RequestBody = {
  mode: HelperMode;
  text?: string;
  tone?: Tone;
  team?: TeamName;
  context?: Record<string, unknown>;
};

type HelperOutput = {
  mode: HelperMode;
  title: string;
  rewritten_text: string | null;
  subject: string | null;
  feedback_type: FeedbackType | null;
  feedback_note: string | null;
  audit_comment: string | null;
  monitoring_comment: string | null;
  request_note: string | null;
  due_date_hint: string | null;
  status_hint: 'Open' | 'In Progress' | 'Closed' | null;
  bullets: string[];
  warnings: string[];
};

const OPENAI_API_URL = 'https://api.openai.com/v1/responses';
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

const ALLOWED_MODES: HelperMode[] = [
  'rewrite',
  'feedback',
  'coaching',
  'audit_comment',
  'monitoring_comment',
  'request_note',
];

function json(res: VercelResponse, status: number, body: unknown) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(body));
}

function buildSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: [
      'mode',
      'title',
      'rewritten_text',
      'subject',
      'feedback_type',
      'feedback_note',
      'audit_comment',
      'monitoring_comment',
      'request_note',
      'due_date_hint',
      'status_hint',
      'bullets',
      'warnings',
    ],
    properties: {
      mode: {
        type: 'string',
        enum: ALLOWED_MODES,
      },
      title: {
        type: 'string',
      },
      rewritten_text: {
        type: ['string', 'null'],
      },
      subject: {
        type: ['string', 'null'],
      },
      feedback_type: {
        type: ['string', 'null'],
        enum: [
          'Coaching',
          'Audit Feedback',
          'Warning',
          'Follow-up',
          null,
        ],
      },
      feedback_note: {
        type: ['string', 'null'],
      },
      audit_comment: {
        type: ['string', 'null'],
      },
      monitoring_comment: {
        type: ['string', 'null'],
      },
      request_note: {
        type: ['string', 'null'],
      },
      due_date_hint: {
        type: ['string', 'null'],
      },
      status_hint: {
        type: ['string', 'null'],
        enum: ['Open', 'In Progress', 'Closed', null],
      },
      bullets: {
        type: 'array',
        items: { type: 'string' },
      },
      warnings: {
        type: 'array',
        items: { type: 'string' },
      },
    },
  };
}

function buildDeveloperPrompt(mode: HelperMode) {
  const common = `
You are the Detroit Axle QA writing helper.

Rules:
- Never invent facts that are not present in the user's text or context.
- Keep the writing concise, professional, and ready to paste into the app.
- Preserve names, IDs, order numbers, ticket IDs, phone numbers, dates, and case types exactly if they are provided.
- If important information is missing, mention that in "warnings" instead of guessing.
- Return only the structured JSON requested by the schema.
- Do not include markdown, code fences, or extra commentary.
`;

  const modeInstructions: Record<HelperMode, string> = {
    rewrite: `
Task:
- Rewrite the user's text so it is clearer, cleaner, and more professional.
- Keep the meaning the same.
- Do not add new facts.
- Put the polished result in "rewritten_text".
- Leave the other content fields null unless they are truly useful.
- "title" should be "rewrite".
`,
    feedback: `
Task:
- Create a ready-to-paste QA feedback suggestion.
- Use the provided context to decide the best feedback type among:
  Coaching, Audit Feedback, Warning, Follow-up.
- Generate:
  - "subject"
  - "feedback_type"
  - "feedback_note"
  - optional "due_date_hint"
  - optional "status_hint" (usually "Open")
  - short "bullets" with the main coaching/action points
- Keep it professional and factual.
- "title" should be "feedback_suggestion".
`,
    coaching: `
Task:
- Create a ready-to-paste coaching note.
- Always set "feedback_type" to "Coaching".
- Generate:
  - "subject"
  - "feedback_note"
  - optional "due_date_hint"
  - "status_hint" as "Open"
  - short "bullets" with the coaching/action points
- Keep the tone supportive, specific, and actionable.
- "title" should be "coaching_suggestion".
`,
    audit_comment: `
Task:
- Create a polished audit comment for the New Audit page.
- Use audit context like team, case type, quality score, metric results, and notes if they are provided.
- Put the main result in "audit_comment".
- Also put the same polished text in "rewritten_text".
- Keep it factual and audit-focused.
- "title" should be "audit_comment".
`,
    monitoring_comment: `
Task:
- Create a concise monitoring comment.
- The result should sound like an operational watch item or alert note.
- Put the result in "monitoring_comment".
- Also put the same text in "rewritten_text".
- Keep it short, clear, and action-oriented.
- "title" should be "monitoring_comment".
`,
    request_note: `
Task:
- Create a polished supervisor request note.
- Use case reference, case type, priority, and any issue summary if present.
- Put the result in "request_note".
- Also put the same text in "rewritten_text".
- Keep it professional, concise, and escalation-ready.
- "title" should be "request_note".
`,
  };

  return `${common}\n${modeInstructions[mode]}`;
}

function buildUserPrompt(body: RequestBody) {
  return JSON.stringify(
    {
      mode: body.mode,
      tone: body.tone || 'professional',
      team: body.team || null,
      text: body.text || '',
      context: body.context || {},
    },
    null,
    2
  );
}

function extractOutputText(responseJson: any): string {
  if (
    typeof responseJson?.output_text === 'string' &&
    responseJson.output_text.trim()
  ) {
    return responseJson.output_text.trim();
  }

  const chunks: string[] = [];

  for (const item of responseJson?.output || []) {
    if (item?.type !== 'message') continue;
    for (const content of item?.content || []) {
      if (content?.type === 'output_text' && typeof content?.text === 'string') {
        chunks.push(content.text);
      }
    }
  }

  return chunks.join('').trim();
}

function validateRequestBody(body: any): body is RequestBody {
  return (
    body &&
    typeof body === 'object' &&
    typeof body.mode === 'string' &&
    ALLOWED_MODES.includes(body.mode)
  );
}

async function callOpenAI(body: RequestBody): Promise<HelperOutput> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing OPENAI_API_KEY.');
  }

  const payload = {
    model: MODEL,
    input: [
      {
        role: 'developer',
        content: [
          {
            type: 'input_text',
            text: buildDeveloperPrompt(body.mode),
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: buildUserPrompt(body),
          },
        ],
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'ai_writing_helper_response',
        strict: true,
        schema: buildSchema(),
      },
    },
  };

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const responseJson = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      responseJson?.error?.message ||
      `OpenAI request failed with status ${response.status}.`;
    throw new Error(message);
  }

  const outputText = extractOutputText(responseJson);
  if (!outputText) {
    throw new Error('The model returned no output.');
  }

  let parsed: HelperOutput;
  try {
    parsed = JSON.parse(outputText) as HelperOutput;
  } catch {
    throw new Error('The model returned invalid JSON.');
  }

  return parsed;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return json(res, 405, {
      ok: false,
      error: 'Method not allowed. Use POST.',
    });
  }

  const body =
    typeof req.body === 'string'
      ? (() => {
          try {
            return JSON.parse(req.body);
          } catch {
            return null;
          }
        })()
      : req.body;

  if (!validateRequestBody(body)) {
    return json(res, 400, {
      ok: false,
      error:
        'Invalid body. Expected { mode, text?, tone?, team?, context? }.',
    });
  }

  if (
    (!body.text || !String(body.text).trim()) &&
    (!body.context || Object.keys(body.context).length === 0)
  ) {
    return json(res, 400, {
      ok: false,
      error: 'Provide text and/or context.',
    });
  }

  try {
    const result = await callOpenAI(body);

    return json(res, 200, {
      ok: true,
      model: MODEL,
      result,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unexpected server error.';

    return json(res, 500, {
      ok: false,
      error: message,
    });
  }
}
