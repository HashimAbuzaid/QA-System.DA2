export type AuditDetail = {
  metric: string;
  result: string;
  pass: number;
  borderline: number;
  adjustedWeight: number;
  earned: number;
};

export type AuditItem = {
  id?: string;
  agentId?: string;
  agentName?: string;
  agent_id?: string;
  agent_name?: string;
  team: string;
  caseType?: string;
  case_type?: string;
  auditDate?: string;
  audit_date?: string;
  qualityScore?: string;
  quality_score?: number;
  comments: string;
  scoreDetails?: AuditDetail[];
  score_details?: AuditDetail[];
};

export type SalesRecord = {
  id?: string;
  agentId?: string;
  agentName?: string;
  agent_id?: string;
  agent_name?: string;
  amount: number;
  saleDate?: string;
  sale_date?: string;
  notes: string;
};

export type CallsRecord = {
  id?: string;
  agentId?: string;
  agentName?: string;
  agent_id?: string;
  agent_name?: string;
  callsCount?: number;
  calls_count?: number;
  callDate?: string;
  call_date?: string;
  notes: string;
};

export type TicketsRecord = {
  id?: string;
  agentId?: string;
  agentName?: string;
  agent_id?: string;
  agent_name?: string;
  ticketsCount?: number;
  tickets_count?: number;
  ticketDate?: string;
  ticket_date?: string;
  notes: string;
};

export type UserAccount = {
  id: string;
  role: "admin" | "agent";
  agentId?: string;
  agentName?: string;
  team?: "Calls" | "Tickets" | "Sales" | "";
  email: string;
  password?: string;
};

export type UserProfile = {
  id: string;
  role: "admin" | "agent";
  agent_id: string | null;
  agent_name: string;
  team: "Calls" | "Tickets" | "Sales" | null;
  email: string;
};