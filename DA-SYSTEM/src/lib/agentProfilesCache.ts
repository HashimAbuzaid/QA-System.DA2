import { supabase } from './supabase';

export type TeamName = 'Calls' | 'Tickets' | 'Sales';

export type CachedAgentProfile = {
  id: string;
  role: 'admin' | 'qa' | 'agent';
  agent_id: string | null;
  agent_name: string;
  display_name: string | null;
  team: TeamName | null;
};

type CacheEntry = {
  value: CachedAgentProfile[];
  expiresAt: number;
};

const CACHE_TTL_MS = 1000 * 60 * 5;
const profileCache = new Map<string, CacheEntry>();
const pendingRequests = new Map<string, Promise<CachedAgentProfile[]>>();

function getCacheKey(team?: TeamName | '' | null) {
  return team ? `agent-profiles:${team}` : 'agent-profiles:all';
}

async function fetchAgentProfiles(team?: TeamName | '' | null) {
  let query = supabase
    .from('profiles')
    .select('id, role, agent_id, agent_name, display_name, team')
    .eq('role', 'agent')
    .order('agent_name', { ascending: true });

  if (team) {
    query = query.eq('team', team);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return ((data as CachedAgentProfile[]) || []).filter(
    (profile) => profile.role === 'agent'
  );
}

export async function getCachedAgentProfiles(
  team?: TeamName | '' | null,
  options?: { force?: boolean }
) {
  const cacheKey = getCacheKey(team);
  const now = Date.now();
  const cached = profileCache.get(cacheKey);

  if (!options?.force && cached && cached.expiresAt > now) {
    return cached.value;
  }

  const existingRequest = pendingRequests.get(cacheKey);
  if (existingRequest) {
    return existingRequest;
  }

  const request = fetchAgentProfiles(team)
    .then((profiles) => {
      profileCache.set(cacheKey, {
        value: profiles,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
      return profiles;
    })
    .finally(() => {
      pendingRequests.delete(cacheKey);
    });

  pendingRequests.set(cacheKey, request);
  return request;
}

export function clearAgentProfilesCache(team?: TeamName | '' | null) {
  if (team) {
    profileCache.delete(getCacheKey(team));
    pendingRequests.delete(getCacheKey(team));
    return;
  }

  profileCache.clear();
  pendingRequests.clear();
}

export function primeAgentProfilesCache(team?: TeamName | '' | null) {
  void getCachedAgentProfiles(team).catch(() => {
    // silent warm-up
  });
}
