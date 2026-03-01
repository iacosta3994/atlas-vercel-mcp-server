/**
 * Monolith Agent integration layer
 * Handles CRM database, AgentMail, DCA service, and OpenClaw Gateway communication
 */

import Database from 'better-sqlite3';
import {
  MonolithConfig,
  MonolithStatus,
  CRMResult,
  AgentMailMessage,
  AgentMailResponse,
  DecisionRequest,
  DecisionResponse,
  OpenClawCommand,
  OpenClawResponse,
  MCPResponse,
  CRMError,
  AgentMailError,
  DCAError,
  OpenClawError,
  SubsystemStatus,
} from './types.js';
import * as fs from 'fs';
import * as path from 'path';

export class MonolithAgent {
  private config: MonolithConfig;
  private db: Database.Database | null = null;
  private metrics = {
    requestsProcessed: 0,
    totalResponseTime: 0,
    errorCount: 0,
  };
  private startTime: number;

  constructor(config: MonolithConfig) {
    this.config = config;
    this.startTime = Date.now();
  }

  /**
   * Initialize the Monolith Agent and its subsystems
   */
  async initialize(): Promise<void> {
    try {
      // Initialize CRM database
      await this.initializeCRMDatabase();

      // Verify connectivity to subsystems
      await this.healthCheckSubsystems();

      console.log(`Monolith Agent ${this.config.agentId} initialized successfully`);
    } catch (error) {
      throw new Error(
        `Failed to initialize Monolith Agent: ${error instanceof Error ? error.message : error}`
      );
    }
  }

  /**
   * Initialize or create CRM database
   */
  private async initializeCRMDatabase(): Promise<void> {
    try {
      // Ensure data directory exists
      const dbDir = path.dirname(this.config.crmDatabasePath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      // Open database connection
      this.db = new Database(this.config.crmDatabasePath);
      this.db.pragma('journal_mode = WAL');

      // Create tables if they don't exist
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS customers (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          phone TEXT,
          company TEXT,
          status TEXT NOT NULL DEFAULT 'lead',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          metadata TEXT
        );

        CREATE TABLE IF NOT EXISTS opportunities (
          id TEXT PRIMARY KEY,
          customer_id TEXT NOT NULL,
          title TEXT NOT NULL,
          value REAL NOT NULL,
          stage TEXT NOT NULL DEFAULT 'discovery',
          probability INTEGER NOT NULL DEFAULT 0,
          expected_close_date TEXT,
          assigned_agent_id TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (customer_id) REFERENCES customers(id)
        );

        CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
        CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);
        CREATE INDEX IF NOT EXISTS idx_opportunities_customer ON opportunities(customer_id);
        CREATE INDEX IF NOT EXISTS idx_opportunities_stage ON opportunities(stage);
      `);

      console.log('CRM database initialized');
    } catch (error) {
      throw new CRMError(
        'Failed to initialize CRM database',
        { error: error instanceof Error ? error.message : error }
      );
    }
  }

  /**
   * Query CRM database
   */
  async queryCRM(query: string, params?: any[]): Promise<MCPResponse<CRMResult>> {
    const startTime = Date.now();

    try {
      if (!this.db) {
        throw new CRMError('CRM database not initialized');
      }

      // Security: Only allow SELECT queries
      const trimmedQuery = query.trim().toLowerCase();
      if (!trimmedQuery.startsWith('select')) {
        throw new CRMError('Only SELECT queries are allowed via this interface');
      }

      const stmt = this.db.prepare(query);
      const rows = params ? stmt.all(...params) : stmt.all();
      const executionTime = Date.now() - startTime;

      this.updateMetrics(executionTime);

      return {
        success: true,
        data: {
          rows,
          rowCount: rows.length,
          executionTime,
        },
      };
    } catch (error) {
      this.metrics.errorCount++;
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'CRM query failed',
      };
    }
  }

  /**
   * Send message via AgentMail
   */
  async sendAgentMail(message: AgentMailMessage): Promise<MCPResponse<AgentMailResponse>> {
    const startTime = Date.now();

    try {
      const response = await fetch(`${this.config.agentMailEndpoint}/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Agent-Id': this.config.agentId,
        },
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        throw new AgentMailError(
          `AgentMail request failed: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      const executionTime = Date.now() - startTime;
      this.updateMetrics(executionTime);

      return {
        success: true,
        data: {
          messageId: data.messageId || `msg_${Date.now()}`,
          status: data.status || 'queued',
          timestamp: new Date().toISOString(),
          recipient: message.recipientAgentId,
        },
      };
    } catch (error) {
      this.metrics.errorCount++;
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Failed to send AgentMail',
      };
    }
  }

  /**
   * Request decision analysis from DCA service
   */
  async requestDecision(request: DecisionRequest): Promise<MCPResponse<DecisionResponse>> {
    const startTime = Date.now();

    try {
      const response = await fetch(`${this.config.dcaServiceEndpoint}/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Agent-Id': this.config.agentId,
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new DCAError(
          `DCA request failed: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      const executionTime = Date.now() - startTime;
      this.updateMetrics(executionTime);

      return {
        success: true,
        data: {
          decisionId: data.decisionId || `dec_${Date.now()}`,
          analysis: data.analysis,
          timestamp: new Date().toISOString(),
          processingTime: executionTime,
        },
      };
    } catch (error) {
      this.metrics.errorCount++;
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Decision request failed',
      };
    }
  }

  /**
   * Execute command through OpenClaw Gateway
   */
  async openClawExecute(command: OpenClawCommand): Promise<MCPResponse<OpenClawResponse>> {
    const startTime = Date.now();

    try {
      const response = await fetch(`${this.config.openClawGateway}/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Agent-Id': this.config.agentId,
        },
        body: JSON.stringify(command),
      });

      if (!response.ok) {
        throw new OpenClawError(
          `OpenClaw request failed: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      const executionTime = Date.now() - startTime;
      this.updateMetrics(executionTime);

      return {
        success: true,
        data: {
          commandId: data.commandId || `cmd_${Date.now()}`,
          status: data.status || 'success',
          output: data.output || '',
          exitCode: data.exitCode,
          executionTime,
          warnings: data.warnings,
        },
      };
    } catch (error) {
      this.metrics.errorCount++;
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'OpenClaw execution failed',
      };
    }
  }

  /**
   * Get agent status and health
   */
  async getStatus(): Promise<MCPResponse<MonolithStatus>> {
    try {
      const subsystems = await this.healthCheckSubsystems();
      const uptime = Date.now() - this.startTime;

      const status: MonolithStatus = {
        agentId: this.config.agentId,
        status: this.determineOverallStatus(subsystems),
        uptime,
        subsystems,
        metrics: {
          requestsProcessed: this.metrics.requestsProcessed,
          averageResponseTime:
            this.metrics.requestsProcessed > 0
              ? this.metrics.totalResponseTime / this.metrics.requestsProcessed
              : 0,
          errorRate:
            this.metrics.requestsProcessed > 0
              ? this.metrics.errorCount / this.metrics.requestsProcessed
              : 0,
        },
        lastHealthCheck: new Date().toISOString(),
      };

      return {
        success: true,
        data: status,
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Failed to get status',
      };
    }
  }

  /**
   * Health check for all subsystems
   */
  private async healthCheckSubsystems(): Promise<MonolithStatus['subsystems']> {
    const checkSubsystem = async (
      name: string,
      endpoint: string
    ): Promise<SubsystemStatus> => {
      const startTime = Date.now();
      try {
        const response = await fetch(`${endpoint}/health`, {
          method: 'GET',
          headers: { 'X-Agent-Id': this.config.agentId },
          signal: AbortSignal.timeout(5000), // 5 second timeout
        });
        const latency = Date.now() - startTime;
        return {
          name,
          status: response.ok ? 'online' : 'degraded',
          lastCheck: new Date().toISOString(),
          latency,
        };
      } catch {
        return {
          name,
          status: 'offline',
          lastCheck: new Date().toISOString(),
          errorCount: 1,
        };
      }
    };

    return {
      crm: {
        name: 'CRM Database',
        status: this.db ? 'online' : 'offline',
        lastCheck: new Date().toISOString(),
      },
      agentMail: await checkSubsystem('AgentMail', this.config.agentMailEndpoint),
      dca: await checkSubsystem('DCA', this.config.dcaServiceEndpoint),
      openClaw: await checkSubsystem('OpenClaw', this.config.openClawGateway),
    };
  }

  /**
   * Determine overall status from subsystems
   */
  private determineOverallStatus(
    subsystems: MonolithStatus['subsystems']
  ): 'healthy' | 'degraded' | 'unhealthy' {
    const statuses = Object.values(subsystems).map((s) => s.status);
    
    if (statuses.every((s) => s === 'online')) return 'healthy';
    if (statuses.some((s) => s === 'offline')) return 'degraded';
    return 'degraded';
  }

  /**
   * Update metrics
   */
  private updateMetrics(responseTime: number): void {
    this.metrics.requestsProcessed++;
    this.metrics.totalResponseTime += responseTime;
  }

  /**
   * Shutdown agent and close connections
   */
  async shutdown(): Promise<void> {
    if (this.db) {
      this.db.close();
      console.log('CRM database connection closed');
    }
  }
}
