/**
 * TypeScript type definitions for Atlas Vercel MCP Server
 */

// Configuration Types
export interface AtlasConfig {
  serverName: string;
  version: string;
  bearerToken: string;
  tailscaleApiKey: string;
  tailscaleTailnet: string;
  crmDatabasePath: string;
  agentMailEndpoint: string;
  dcaServiceEndpoint: string;
  openClawGateway: string;
  monolithAgentId: string;
  logLevel: LogLevel;
  enableRateLimiting: boolean;
  maxRequestsPerMinute: number;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// Authentication Types
export interface AuthResult {
  authenticated: boolean;
  agentId?: string;
  error?: string;
}

export interface AgentContext {
  agentId: string;
  requestId: string;
  timestamp: string;
}

// MCP Response Types
export interface MCPResponse<T = any> {
  success: boolean;
  data: T | null;
  error?: string;
  metadata?: Record<string, any>;
}

// CRM Types
export interface CRMQuery {
  query: string;
  params?: any[];
}

export interface CRMResult {
  rows: any[];
  rowCount: number;
  executionTime: number;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  status: 'lead' | 'prospect' | 'customer' | 'inactive';
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, any>;
}

export interface Opportunity {
  id: string;
  customerId: string;
  title: string;
  value: number;
  stage: 'discovery' | 'proposal' | 'negotiation' | 'closed_won' | 'closed_lost';
  probability: number;
  expectedCloseDate: string;
  assignedAgentId: string;
  createdAt: string;
  updatedAt: string;
}

// AgentMail Types
export interface AgentMailMessage {
  recipientAgentId: string;
  subject: string;
  body: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  senderAgentId: string;
}

export interface AgentMailResponse {
  messageId: string;
  status: 'queued' | 'sent' | 'delivered' | 'failed';
  timestamp: string;
  recipient: string;
}

// DCA (Decision Clarity for Agents) Types
export interface DecisionRequest {
  decisionContext: string;
  options: string[];
  criteria?: Record<string, number>;
  requestingAgentId: string;
}

export interface DecisionAnalysis {
  recommendedOption: string;
  confidence: number;
  reasoning: string;
  scores: Record<string, number>;
  risks: string[];
  opportunities: string[];
}

export interface DecisionResponse {
  decisionId: string;
  analysis: DecisionAnalysis;
  timestamp: string;
  processingTime: number;
}

// OpenClaw Gateway Types
export interface OpenClawCommand {
  command: string;
  target: string;
  parameters?: Record<string, any>;
  executingAgentId: string;
}

export interface OpenClawResponse {
  commandId: string;
  status: 'success' | 'failure' | 'partial';
  output: string;
  exitCode?: number;
  executionTime: number;
  warnings?: string[];
}

// Tailscale Types
export interface TailscaleDevice {
  id: string;
  name: string;
  hostname: string;
  addresses: string[];
  user: string;
  os: string;
  lastSeen: string;
  online: boolean;
  authorized: boolean;
  keyExpiry?: string;
  tags?: string[];
}

export interface TailscaleConfig {
  apiKey: string;
  tailnet: string;
}

export interface TailscaleAuthRequest {
  deviceId: string;
}

// Monolith Agent Types
export interface MonolithConfig {
  agentId: string;
  crmDatabasePath: string;
  agentMailEndpoint: string;
  dcaServiceEndpoint: string;
  openClawGateway: string;
  logLevel: LogLevel;
}

export interface MonolithStatus {
  agentId: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  subsystems: {
    crm: SubsystemStatus;
    agentMail: SubsystemStatus;
    dca: SubsystemStatus;
    openClaw: SubsystemStatus;
  };
  metrics: {
    requestsProcessed: number;
    averageResponseTime: number;
    errorRate: number;
  };
  lastHealthCheck: string;
}

export interface SubsystemStatus {
  name: string;
  status: 'online' | 'offline' | 'degraded';
  lastCheck: string;
  latency?: number;
  errorCount?: number;
}

// Rate Limiting Types
export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
}

export interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// Error Types
export class AtlasError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = 'AtlasError';
  }
}

export class AuthenticationError extends AtlasError {
  constructor(message: string, details?: any) {
    super(message, 'AUTH_ERROR', 401, details);
    this.name = 'AuthenticationError';
  }
}

export class RateLimitError extends AtlasError {
  constructor(message: string, retryAfter: number) {
    super(message, 'RATE_LIMIT_ERROR', 429, { retryAfter });
    this.name = 'RateLimitError';
  }
}

export class CRMError extends AtlasError {
  constructor(message: string, details?: any) {
    super(message, 'CRM_ERROR', 500, details);
    this.name = 'CRMError';
  }
}

export class AgentMailError extends AtlasError {
  constructor(message: string, details?: any) {
    super(message, 'AGENTMAIL_ERROR', 500, details);
    this.name = 'AgentMailError';
  }
}

export class DCAError extends AtlasError {
  constructor(message: string, details?: any) {
    super(message, 'DCA_ERROR', 500, details);
    this.name = 'DCAError';
  }
}

export class OpenClawError extends AtlasError {
  constructor(message: string, details?: any) {
    super(message, 'OPENCLAW_ERROR', 500, details);
    this.name = 'OpenClawError';
  }
}

export class TailscaleError extends AtlasError {
  constructor(message: string, details?: any) {
    super(message, 'TAILSCALE_ERROR', 500, details);
    this.name = 'TailscaleError';
  }
}
