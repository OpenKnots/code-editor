// ── Security / Presence Types ──

export interface PresenceEntry {
  key: string
  host?: string
  ip?: string
  version?: string
  platform?: string
  deviceFamily?: string
  mode?: string
  deviceId?: string
  roles?: string[]
  scopes?: string[]
  instanceId?: string
  reason?: string
  text?: string
}

export interface PairedDevice {
  id: string
  displayName?: string
  platform?: string
  lastConnectedAtMs?: number
  createdAtMs?: number
  role?: string
  scopes?: string[]
}

export interface PairedNode {
  nodeId: string
  displayName?: string
  platform?: string
  deviceFamily?: string
  status?: string
  lastConnectedAtMs?: number
  remoteIp?: string
  commands?: string[]
}

export interface SecurityConfig {
  authMode: string
  allowTailscale: boolean
  tailscaleMode: string
  bind: string
  trustedProxies: string[]
  port: number
}

// ── Gateway WebSocket Protocol Types & Helpers ──

export interface GatewayRequest {
  type: "req";
  id: string;
  method: string;
  params?: Record<string, unknown>;
}

export interface GatewayResponse {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: { code: string; message: string };
}

export interface GatewayEvent {
  type: "event";
  event: string;
  payload?: unknown;
}

export interface GatewayPing {
  type: "ping";
}

export interface GatewayPong {
  type: "pong";
}

export type GatewayFrame =
  | GatewayRequest
  | GatewayResponse
  | GatewayEvent
  | GatewayPing
  | GatewayPong;

// ── Snapshot from hello-ok ──

export interface ChannelInfo {
  id: string;
  kind: string;
  connected: boolean;
  label?: string;
}

export interface SessionInfo {
  key: string;
  kind: string;
  model?: string;
  messageCount?: number;
  label?: string;
  startedAt?: string;
  thinking_level?: string;
}

export interface GatewaySnapshot {
  uptimeMs?: number;
  sessions?: { count: number; recent: SessionInfo[] };
  connectedClients?: number;
  channels?: ChannelInfo[];
  stateVersion?: number;
  version?: string;
  protocol?: number;
}

// ── Usage Types ──

export interface UsageRecord {
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  totalTokens?: number;
  cost?: number;
  messages?: number;
  toolCalls?: number;
  sessionKey?: string;
  sessionId?: string;
  timestamp?: string;
  label?: string;
  kind?: string;
  channel?: string;
  agentId?: string;
}

export interface DailyUsage {
  date: string;
  tokens: number;
  cost: number;
  messages?: number;
  toolCalls?: number;
  errors?: number;
}

export interface ModelUsage {
  provider: string;
  model: string;
  count: number;
  tokens: number;
  cost: number;
}

export interface ToolUsageEntry {
  name: string;
  count: number;
}

export interface LatencyStats {
  count: number;
  avgMs: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
}

export interface UsageResponse {
  records?: UsageRecord[];
  totalCost?: number;
  totalTokens?: number;
  totalMessages?: number;
  totalInputTokens?: number;
  totalOutputTokens?: number;
  totalCacheReadTokens?: number;
  totalCacheWriteTokens?: number;
}

/** Aggregated stats computed client-side from UsageResponse */
export interface UsageStats {
  totalCost: number;
  totalMessages: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheWriteTokens: number;
  totalTokens: number;
  avgCostPerMessage: number;
  avgTokensPerMessage: number;
  cacheHitRate: number;
  sessionCount: number;
  records: UsageRecord[];
  /** Date range */
  startDate?: string;
  endDate?: string;
  /** Daily breakdown from aggregates */
  daily: DailyUsage[];
  /** Per-model usage from aggregates */
  byModel: ModelUsage[];
  /** Tool usage from aggregates */
  tools: ToolUsageEntry[];
  totalToolCalls: number;
  /** Latency from aggregates */
  latency?: LatencyStats;
  /** Cost breakdown */
  inputCost: number;
  outputCost: number;
  cacheReadCost: number;
  cacheWriteCost: number;
}

// ── Helpers to normalise gateway responses (snake_case ↔ camelCase) ──

function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

/** Read a numeric field trying camelCase then snake_case */
function pick(obj: Record<string, unknown>, ...keys: string[]): number {
  for (const k of keys) {
    if (obj[k] != null) return num(obj[k]);
  }
  return 0;
}

function normaliseRecord(raw: Record<string, unknown>): UsageRecord {
  // The real gateway nests token/cost data inside a `.usage` sub-object
  const usage = (raw.usage as Record<string, unknown>) ?? raw;

  const messageCounts = usage.messageCounts as Record<string, unknown> | undefined;

  return {
    model: (raw.model as string) ?? undefined,
    inputTokens: pick(usage, "input", "inputTokens", "input_tokens"),
    outputTokens: pick(usage, "output", "outputTokens", "output_tokens"),
    cacheReadTokens: pick(
      usage,
      "cacheRead",
      "cacheReadTokens",
      "cache_read_tokens",
      "cacheCreationInputTokens",
      "cache_creation_input_tokens"
    ),
    cacheWriteTokens: pick(
      usage,
      "cacheWrite",
      "cacheWriteTokens",
      "cache_write_tokens",
      "cacheReadInputTokens",
      "cache_read_input_tokens"
    ),
    totalTokens: pick(usage, "totalTokens", "total_tokens"),
    cost: pick(usage, "totalCost", "cost", "total_cost"),
    messages: messageCounts
      ? pick(messageCounts, "total")
      : pick(usage, "messages", "message_count", "messageCount"),
    toolCalls: messageCounts
      ? pick(messageCounts, "toolCalls", "tool_calls")
      : pick(usage, "toolCalls", "tool_calls"),
    sessionKey:
      (raw.sessionKey as string) ??
      (raw.session_key as string) ??
      (raw.key as string) ??
      undefined,
    sessionId: (raw.sessionId as string) ?? (raw.session_id as string) ?? undefined,
    timestamp: (raw.timestamp as string) ?? undefined,
    label: (raw.label as string) ?? (raw.display_name as string) ?? undefined,
    kind: (raw.kind as string) ?? undefined,
    channel: (raw.channel as string) ?? undefined,
    agentId: (raw.agentId as string) ?? (raw.agent_id as string) ?? undefined,
  };
}

/**
 * Accepts the raw (unknown) gateway payload and normalises it into UsageStats.
 * Handles camelCase, snake_case, and various response shapes.
 */
export function computeUsageStats(raw: unknown): UsageStats {
  const empty: UsageStats = {
    totalCost: 0,
    totalMessages: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCacheReadTokens: 0,
    totalCacheWriteTokens: 0,
    totalTokens: 0,
    avgCostPerMessage: 0,
    avgTokensPerMessage: 0,
    cacheHitRate: 0,
    sessionCount: 0,
    records: [],
    daily: [],
    byModel: [],
    tools: [],
    totalToolCalls: 0,
    inputCost: 0,
    outputCost: 0,
    cacheReadCost: 0,
    cacheWriteCost: 0,
  };

  if (!raw || typeof raw !== "object") return empty;
  const res = raw as Record<string, unknown>;

  // Extract records array — gateway may call it "records", "sessions", or "usage"
  const rawRecords = (
    Array.isArray(res.records)
      ? res.records
      : Array.isArray(res.sessions)
        ? res.sessions
        : Array.isArray(res.usage)
          ? res.usage
          : Array.isArray(res.data)
            ? res.data
            : []
  ) as Record<string, unknown>[];

  const records = rawRecords.map(normaliseRecord);

  // The real gateway provides a `totals` sub-object
  const totals = (res.totals as Record<string, unknown>) ?? res;

  // If the gateway provided pre-computed totals, prefer those;
  // otherwise, sum from records.
  const totalCost =
    pick(totals, "totalCost", "total_cost") ||
    records.reduce((s, r) => s + (r.cost ?? 0), 0);
  const totalInputTokens =
    pick(totals, "input", "totalInputTokens", "total_input_tokens") ||
    records.reduce((s, r) => s + (r.inputTokens ?? 0), 0);
  const totalOutputTokens =
    pick(totals, "output", "totalOutputTokens", "total_output_tokens") ||
    records.reduce((s, r) => s + (r.outputTokens ?? 0), 0);
  const totalCacheReadTokens =
    pick(totals, "cacheRead", "totalCacheReadTokens", "total_cache_read_tokens") ||
    records.reduce((s, r) => s + (r.cacheReadTokens ?? 0), 0);
  const totalCacheWriteTokens =
    pick(totals, "cacheWrite", "totalCacheWriteTokens", "total_cache_write_tokens") ||
    records.reduce((s, r) => s + (r.cacheWriteTokens ?? 0), 0);
  const totalTokens =
    pick(totals, "totalTokens", "total_tokens") ||
    records.reduce((s, r) => s + (r.totalTokens ?? 0), 0) ||
    totalInputTokens + totalOutputTokens;

  // Cost breakdown
  const inputCost = pick(totals, "inputCost", "input_cost");
  const outputCost = pick(totals, "outputCost", "output_cost");
  const cacheReadCost = pick(totals, "cacheReadCost", "cache_read_cost");
  const cacheWriteCost = pick(totals, "cacheWriteCost", "cache_write_cost");

  // Extract aggregates from the real response
  const aggregates = (res.aggregates as Record<string, unknown>) ?? {};
  const aggMessages = (aggregates.messages as Record<string, unknown>) ?? {};
  const aggTools = (aggregates.tools as Record<string, unknown>) ?? {};

  const totalMessages =
    pick(aggMessages, "total") ||
    pick(totals, "totalMessages", "total_messages") ||
    records.reduce((s, r) => s + (r.messages ?? 0), 0);

  // Daily breakdown
  const rawDaily = Array.isArray(aggregates.daily) ? aggregates.daily : [];
  const daily: DailyUsage[] = rawDaily.map((d: Record<string, unknown>) => ({
    date: (d.date as string) ?? "",
    tokens: num(d.tokens),
    cost: num(d.cost),
    messages: d.messages != null ? num(d.messages) : undefined,
    toolCalls: d.toolCalls != null ? num(d.toolCalls) : undefined,
    errors: d.errors != null ? num(d.errors) : undefined,
  }));

  // Model breakdown
  const rawByModel = Array.isArray(aggregates.byModel) ? aggregates.byModel : [];
  const byModel: ModelUsage[] = rawByModel
    .filter((m: Record<string, unknown>) => num(m.count) > 0)
    .map((m: Record<string, unknown>) => {
      const mTotals = (m.totals as Record<string, unknown>) ?? m;
      return {
        provider: (m.provider as string) ?? "",
        model: (m.model as string) ?? "",
        count: num(m.count),
        tokens: pick(mTotals, "totalTokens", "tokens"),
        cost: pick(mTotals, "totalCost", "cost"),
      };
    });

  // Tool usage
  const rawToolList = Array.isArray(aggTools.tools) ? aggTools.tools : [];
  const tools: ToolUsageEntry[] = rawToolList.map(
    (t: Record<string, unknown>) => ({
      name: (t.name as string) ?? "",
      count: num(t.count),
    })
  );
  const totalToolCalls = pick(aggTools, "totalCalls", "total_calls") ||
    tools.reduce((s, t) => s + t.count, 0);

  // Latency
  const rawLatency = aggregates.latency as Record<string, unknown> | undefined;
  const latency: LatencyStats | undefined = rawLatency
    ? {
        count: num(rawLatency.count),
        avgMs: num(rawLatency.avgMs ?? rawLatency.avg_ms),
        p95Ms: num(rawLatency.p95Ms ?? rawLatency.p95_ms),
        minMs: num(rawLatency.minMs ?? rawLatency.min_ms),
        maxMs: num(rawLatency.maxMs ?? rawLatency.max_ms),
      }
    : undefined;

  const avgCostPerMessage = totalMessages > 0 ? totalCost / totalMessages : 0;
  const avgTokensPerMessage =
    totalMessages > 0 ? totalTokens / totalMessages : 0;

  // Cache hit rate = cache read tokens / (total input + cache read)
  const promptPlusCached = totalInputTokens + totalCacheReadTokens;
  const cacheHitRate =
    promptPlusCached > 0 ? totalCacheReadTokens / promptPlusCached : 0;

  return {
    totalCost,
    totalMessages,
    totalInputTokens,
    totalOutputTokens,
    totalCacheReadTokens,
    totalCacheWriteTokens,
    totalTokens,
    avgCostPerMessage,
    avgTokensPerMessage,
    cacheHitRate,
    sessionCount: records.length,
    records,
    startDate: (res.startDate as string) ?? undefined,
    endDate: (res.endDate as string) ?? undefined,
    daily,
    byModel,
    tools,
    totalToolCalls,
    latency,
    inputCost,
    outputCost,
    cacheReadCost,
    cacheWriteCost,
  };
}

// ── Chat Types ──

export interface ChatMessage {
  role: "user" | "assistant" | "system" | "tool" | "tool_result";
  content: string;
  reasoning?: string;
  timestamp?: string;
  model?: string;
  tokens?: number;
  /** Display name of the sender — used to distinguish cross-agent messages from human "You" messages */
  name?: string;
}

// ── Model Types ──

export interface ModelInfo {
  id: string;
  name?: string;
  provider?: string;
  inputPrice?: number;
  outputPrice?: number;
}

// ── Skill Types ──

export interface SkillInfo {
  name: string;
  version?: string;
  enabled: boolean;
  description?: string;
  tags?: string[];
  missingDeps?: string[];
  eligible?: boolean;
  disabled?: boolean;
  blockedByAllowlist?: boolean;
}

// ── Helpers ──

let _idCounter = 0;

export function makeId(): string {
  // Use cryptographic randomness when available for unpredictable IDs
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `cd-${crypto.randomUUID()}`;
  }
  return `cd-${Date.now()}-${++_idCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface DeviceBlock {
  id: string;
  publicKey: string;
  signature: string;
  signedAt: number;
  nonce?: string;
}

export function makeConnectRequest(
  password: string,
  device?: DeviceBlock,
  storedToken?: string
): GatewayRequest {
  return {
    type: "req",
    id: makeId(),
    method: "connect",
    params: {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: "gateway-client",
        displayName: "code-flow",
        version: "1.0.0",
        platform: "web",
        mode: "ui",
      },
      role: "operator",
      scopes: ["operator.read", "operator.write", "operator.admin"],
      caps: [],
      auth: {
        password,
        // Gateway auth.mode can be token or password. The gateway checks
        // auth.token when mode is token and auth.password when mode is
        // password, so send the credential as both to cover either mode.
        // A stored device token (from prior pairing) takes precedence.
        token: storedToken || password || undefined,
      },
      ...(device ? { device } : {}),
    },
  };
}

export function makeRequest(
  method: string,
  params?: Record<string, unknown>
): GatewayRequest {
  return {
    type: "req",
    id: makeId(),
    method,
    params: params ?? {},
  };
}

export function parseFrame(data: string): GatewayFrame | null {
  try {
    return JSON.parse(data) as GatewayFrame;
  } catch {
    return null;
  }
}

export function gatewayUrlToWs(url: string): string {
  let normalized = url.trim().replace(/\/+$/, "");
  if (normalized.startsWith("https://")) {
    normalized = "wss://" + normalized.slice(8);
  } else if (normalized.startsWith("http://")) {
    normalized = "ws://" + normalized.slice(7);
  } else if (!normalized.startsWith("ws://") && !normalized.startsWith("wss://")) {
    normalized = "wss://" + normalized;
  }

  // Enforce wss:// in production contexts to prevent plaintext API key transmission
  if (
    typeof window !== "undefined" &&
    window.location.protocol === "https:" &&
    normalized.startsWith("ws://")
  ) {
    console.warn("[gateway] Insecure ws:// upgraded to wss:// in production context.");
    normalized = "wss://" + normalized.slice(5);
  }

  return normalized;
}

export function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

export function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return tokens.toString();
}

// ── Cron Job Types ──

export type CronScheduleKind = 'at' | 'every' | 'cron';

export interface CronScheduleAt {
  kind: 'at';
  at: string; // ISO-8601 timestamp
}

export interface CronScheduleEvery {
  kind: 'every';
  everyMs: number;
  anchorMs?: number;
}

export interface CronScheduleCron {
  kind: 'cron';
  expr: string; // cron expression
  tz?: string; // timezone
}

export type CronSchedule = CronScheduleAt | CronScheduleEvery | CronScheduleCron;

export interface CronPayloadSystemEvent {
  kind: 'systemEvent';
  text: string;
}

export interface CronPayloadAgentTurn {
  kind: 'agentTurn';
  message: string;
  model?: string;
  thinking?: string;
  timeoutSeconds?: number;
}

export type CronPayload = CronPayloadSystemEvent | CronPayloadAgentTurn;

export interface CronDelivery {
  mode: 'none' | 'announce';
  channel?: string;
  to?: string;
  bestEffort?: boolean;
}

export interface CronJobState {
  nextRunAtMs?: number;
  lastRunAtMs?: number;
  lastStatus?: string;
  lastDurationMs?: number;
}

export interface CronJob {
  id: string;
  agentId?: string;
  name?: string;
  enabled: boolean;
  createdAtMs: number;
  updatedAtMs?: number;
  schedule: CronSchedule;
  sessionTarget: 'main' | 'isolated';
  payload: CronPayload;
  delivery?: CronDelivery;
  state?: CronJobState;
}

export interface CronRunRecord {
  runId: string;
  jobId: string;
  startedAtMs: number;
  finishedAtMs?: number;
  status: string;
  durationMs?: number;
  error?: string;
}

export function formatSchedule(schedule: CronSchedule): string {
  switch (schedule.kind) {
    case 'at':
      return `Once at ${new Date(schedule.at).toLocaleString()}`;
    case 'every': {
      const ms = schedule.everyMs;
      if (ms >= 86400000) return `Every ${Math.round(ms / 86400000)}d`;
      if (ms >= 3600000) return `Every ${Math.round(ms / 3600000)}h`;
      if (ms >= 60000) return `Every ${Math.round(ms / 60000)}m`;
      return `Every ${Math.round(ms / 1000)}s`;
    }
    case 'cron':
      return schedule.tz ? `${schedule.expr} (${schedule.tz})` : schedule.expr;
  }
}

export function formatRelativeTime(ms: number): string {
  const now = Date.now();
  const diff = ms - now;
  const absDiff = Math.abs(diff);
  const seconds = Math.floor(absDiff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const label = diff > 0 ? 'from now' : 'ago';
  if (days > 0) return `${days}d ${hours % 24}h ${label}`;
  if (hours > 0) return `${hours}h ${minutes % 60}m ${label}`;
  if (minutes > 0) return `${minutes}m ${label}`;
  return `${seconds}s ${label}`;
}
