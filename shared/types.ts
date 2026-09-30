export type Reasoning = 'auto' | 'none' | 'low' | 'medium' | 'high' | 'max';
export type PermissionMode = 'read-only' | 'ask' | 'trusted';
export type RunStatus =
  | 'queued'
  | 'running'
  | 'waiting_user'
  | 'waiting_approval'
  | 'waiting_children'
  | 'completed'
  | 'failed'
  | 'interrupted';
export type Transport = 'openai-chat' | 'anthropic' | 'openai-responses' | 'gemini';
export interface Usage {
  input: number;
  output: number;
  cached: number;
  reasoning?: number;
  measured: boolean;
}
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}
export interface ModelMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  calls?: ToolCall[];
  callId?: string;
  reasoning?: string;
  native?: unknown[];
  images?: string[];
}
export interface Profile {
  id: string;
  name: string;
  transport: Transport;
  baseUrl: string;
  apiKey: string;
  model: string;
  reasoning: Reasoning;
  reasoningFormat: 'none' | 'openai' | 'deepseek' | 'anthropic' | 'gemini';
  efforts: Reasoning[];
  contextWindow: number;
  maxOutputTokens: number;
  timeoutMs: number;
  vision: boolean;
  prices: { input: number | null; output: number | null; cached: number | null };
}
export type PublicProfile = Omit<Profile, 'apiKey'> & { hasKey: boolean };
export interface Settings {
  web?: {
    enabled: boolean;
    searchProfileId: string;
    searchBaseUrl: string;
    searchModel: string;
    timeoutMs: number;
  };
  profiles: Profile[];
  defaultProfileId: string;
  maxParallelRuns: number;
  maxAgentDepth: number;
  maxChildren: number;
  compactionRatio: number;
  dockerImage: string;
  commandBackend: 'approval-host' | 'docker' | 'native-windows';
  nativePython?: string;
  nativeNetwork?: 'deny' | 'host';
  embedding: { baseUrl: string; apiKey: string; model: string };
  mcp: { id: string; name: string; command: string; args: string[]; enabled: boolean }[];
}
export interface Project {
  id: string;
  name: string;
  folders: string[];
  createdAt: number;
}
export interface Conversation {
  isolationId?: string;
  teamMode?: 'hierarchy' | 'host' | 'creative';
  teamStrategy?: 'off' | 'auto' | 'prefer';
  id: string;
  title: string;
  projectId: string | null;
  profileId: string;
  reasoning: Reasoning;
  permission: PermissionMode;
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
  archived: boolean;
  parentId: string | null;
  forkEvent: number | null;
  skillIds: string[];
  knowledge: boolean;
  memory: boolean;
}
export interface ContextSample {
  fingerprint: string;
  digest: string;
  units: number;
  tokens: number;
  messageCount: number;
  toolsDigest: string;
}
export interface Run {
  recoveryOnly?: boolean;
  executionBlock?: { signature: string; reason: string };
  contextSample?: ContextSample;
  lastContextInputTokens?: number;
  lastContextMeasuredAt?: number;
  id: string;
  conversationId: string;
  status: RunStatus;
  parentRunId: string | null;
  depth: number;
  createdAt: number;
  updatedAt: number;
  error: string | null;
  checkpoints: ModelMessage[];
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  modelCalls: number;
  estimatedUsd: number | null;
  maxSteps: number;
  profileId: string;
  reasoning: Reasoning;
  providerFingerprint?: string;
  usageComplete?: boolean;
}
export interface AgentEvent {
  id: number;
  conversationId: string;
  runId: string | null;
  type: string;
  data: Record<string, any>;
  createdAt: number;
}
export interface PendingInput {
  id: string;
  runId: string;
  conversationId: string;
  kind: 'approval' | 'question';
  payload: Record<string, any>;
  status: 'pending' | 'answered' | 'denied' | 'cancelled';
  answer: string | null;
  createdAt: number;
}
export interface Attachment {
  id: string;
  conversationId: string;
  name: string;
  mime: string;
  size: number;
  path: string;
  text: string;
  createdAt: number;
}
export interface Skill {
  id: string;
  name: string;
  description: string;
  content: string;
  source: string;
  enabled: boolean;
  createdAt: number;
}
export interface Memory {
  id: string;
  scope: string;
  content: string;
  source: string;
  active: boolean;
  expiresAt: number | null;
  revision: number;
  createdAt: number;
}
export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, any>;
  effect: 'read' | 'write' | 'execute' | 'network' | 'coordinate';
}
export interface ToolResult {
  content: string;
  metadata?: Record<string, any>;
}
