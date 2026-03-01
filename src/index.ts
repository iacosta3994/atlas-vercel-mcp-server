/**
 * Atlas Vercel MCP Server
 * Main entry point for MCP server with Atlas Monolith Agent integration
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { authenticateRequest } from './auth.js';
import { TailscaleManager } from './tailscale.js';
import { MonolithAgent } from './monolith.js';
import { rateLimiter } from './rateLimiter.js';
import {
  AtlasConfig,
  MCPResponse,
  AgentContext,
  LogLevel,
} from './types.js';

// Environment configuration
const CONFIG: AtlasConfig = {
  serverName: 'atlas-vercel-mcp-server',
  version: '1.0.0',
  bearerToken: process.env.ATLAS_BEARER_TOKEN || '',
  tailscaleApiKey: process.env.TAILSCALE_API_KEY || '',
  tailscaleTailnet: process.env.TAILSCALE_TAILNET || '',
  crmDatabasePath: process.env.CRM_DATABASE_PATH || './data/crm.db',
  agentMailEndpoint: process.env.AGENTMAIL_ENDPOINT || 'https://agentmail.atlas.internal',
  dcaServiceEndpoint: process.env.DCA_SERVICE_ENDPOINT || 'https://dca.atlas.internal',
  openClawGateway: process.env.OPENCLAW_GATEWAY || 'https://openclaw.atlas.internal',
  monolithAgentId: process.env.MONOLITH_AGENT_ID || 'monolith-primary',
  logLevel: (process.env.LOG_LEVEL as LogLevel) || 'info',
  enableRateLimiting: process.env.ENABLE_RATE_LIMITING !== 'false',
  maxRequestsPerMinute: parseInt(process.env.MAX_REQUESTS_PER_MINUTE || '60'),
};

// Initialize core services
const tailscaleManager = new TailscaleManager({
  apiKey: CONFIG.tailscaleApiKey,
  tailnet: CONFIG.tailscaleTailnet,
});

const monolithAgent = new MonolithAgent({
  agentId: CONFIG.monolithAgentId,
  crmDatabasePath: CONFIG.crmDatabasePath,
  agentMailEndpoint: CONFIG.agentMailEndpoint,
  dcaServiceEndpoint: CONFIG.dcaServiceEndpoint,
  openClawGateway: CONFIG.openClawGateway,
  logLevel: CONFIG.logLevel,
});

// Logger utility
class Logger {
  private level: LogLevel;

  constructor(level: LogLevel) {
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.level);
  }

  debug(message: string, meta?: any) {
    if (this.shouldLog('debug')) {
      console.debug(`[DEBUG] ${new Date().toISOString()} - ${message}`, meta || '');
    }
  }

  info(message: string, meta?: any) {
    if (this.shouldLog('info')) {
      console.info(`[INFO] ${new Date().toISOString()} - ${message}`, meta || '');
    }
  }

  warn(message: string, meta?: any) {
    if (this.shouldLog('warn')) {
      console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, meta || '');
    }
  }

  error(message: string, error?: any) {
    if (this.shouldLog('error')) {
      console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, error || '');
    }
  }
}

const logger = new Logger(CONFIG.logLevel);

// Define MCP tools
const TOOLS: Tool[] = [
  {
    name: 'query_crm',
    description: 'Query the Atlas CRM database for customer, lead, or opportunity data',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'SQL query to execute against CRM database',
        },
        params: {
          type: 'array',
          description: 'Parameters for parameterized queries',
          items: { type: 'string' },
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'send_agent_mail',
    description: 'Send a message via AgentMail for agent-to-agent communication',
    inputSchema: {
      type: 'object',
      properties: {
        recipientAgentId: {
          type: 'string',
          description: 'Target agent ID',
        },
        subject: {
          type: 'string',
          description: 'Message subject',
        },
        body: {
          type: 'string',
          description: 'Message content',
        },
        priority: {
          type: 'string',
          enum: ['low', 'normal', 'high', 'urgent'],
          description: 'Message priority level',
        },
      },
      required: ['recipientAgentId', 'subject', 'body'],
    },
  },
  {
    name: 'request_decision',
    description: 'Request decision analysis from DCA (Decision Clarity for Agents) service',
    inputSchema: {
      type: 'object',
      properties: {
        decisionContext: {
          type: 'string',
          description: 'Context for the decision',
        },
        options: {
          type: 'array',
          description: 'Available decision options',
          items: { type: 'string' },
        },
        criteria: {
          type: 'object',
          description: 'Decision criteria weights',
        },
      },
      required: ['decisionContext', 'options'],
    },
  },
  {
    name: 'openclaw_execute',
    description: 'Execute a command through OpenClaw Gateway for infrastructure operations',
    inputSchema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'Command to execute',
        },
        target: {
          type: 'string',
          description: 'Target system or resource',
        },
        parameters: {
          type: 'object',
          description: 'Command parameters',
        },
      },
      required: ['command', 'target'],
    },
  },
  {
    name: 'tailscale_list_devices',
    description: 'List all devices in the Tailscale network',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'tailscale_authorize_device',
    description: 'Authorize a new device on the Tailscale network',
    inputSchema: {
      type: 'object',
      properties: {
        deviceId: {
          type: 'string',
          description: 'Device ID to authorize',
        },
      },
      required: ['deviceId'],
    },
  },
  {
    name: 'tailscale_revoke_device',
    description: 'Revoke access for a device on the Tailscale network',
    inputSchema: {
      type: 'object',
      properties: {
        deviceId: {
          type: 'string',
          description: 'Device ID to revoke',
        },
      },
      required: ['deviceId'],
    },
  },
  {
    name: 'get_agent_status',
    description: 'Get current status of Monolith Agent and its subsystems',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

// Initialize MCP server
const server = new Server(
  {
    name: CONFIG.serverName,
    version: CONFIG.version,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool execution handler
async function handleToolCall(
  name: string,
  args: any,
  context: AgentContext
): Promise<MCPResponse> {
  logger.info(`Tool called: ${name}`, { args, agentId: context.agentId });

  try {
    // Apply rate limiting
    if (CONFIG.enableRateLimiting) {
      const rateLimitResult = rateLimiter.checkLimit(context.agentId);
      if (!rateLimitResult.allowed) {
        throw new Error(
          `Rate limit exceeded. Retry after ${rateLimitResult.retryAfter}ms`
        );
      }
    }

    switch (name) {
      case 'query_crm':
        return await monolithAgent.queryCRM(args.query, args.params);

      case 'send_agent_mail':
        return await monolithAgent.sendAgentMail({
          recipientAgentId: args.recipientAgentId,
          subject: args.subject,
          body: args.body,
          priority: args.priority || 'normal',
          senderAgentId: context.agentId,
        });

      case 'request_decision':
        return await monolithAgent.requestDecision({
          decisionContext: args.decisionContext,
          options: args.options,
          criteria: args.criteria,
          requestingAgentId: context.agentId,
        });

      case 'openclaw_execute':
        return await monolithAgent.openClawExecute({
          command: args.command,
          target: args.target,
          parameters: args.parameters,
          executingAgentId: context.agentId,
        });

      case 'tailscale_list_devices':
        return await tailscaleManager.listDevices();

      case 'tailscale_authorize_device':
        return await tailscaleManager.authorizeDevice(args.deviceId);

      case 'tailscale_revoke_device':
        return await tailscaleManager.revokeDevice(args.deviceId);

      case 'get_agent_status':
        return await monolithAgent.getStatus();

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    logger.error(`Tool execution failed: ${name}`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      data: null,
    };
  }
}

// Register handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  logger.debug('ListTools request received');
  return { tools: TOOLS };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  logger.info(`CallTool request: ${name}`);

  // Extract authentication context
  const authHeader = (request as any).headers?.authorization;
  const authResult = await authenticateRequest(authHeader, CONFIG.bearerToken);

  if (!authResult.authenticated) {
    throw new Error('Authentication failed: ' + authResult.error);
  }

  const context: AgentContext = {
    agentId: authResult.agentId || CONFIG.monolithAgentId,
    requestId: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
  };

  const result = await handleToolCall(name, args || {}, context);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
});

// Graceful shutdown handler
process.on('SIGINT', async () => {
  logger.info('Shutting down Atlas MCP server...');
  await monolithAgent.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Shutting down Atlas MCP server...');
  await monolithAgent.shutdown();
  process.exit(0);
});

// Start server
async function main() {
  try {
    logger.info('Starting Atlas Vercel MCP Server...');
    logger.info(`Configuration: ${JSON.stringify({ ...CONFIG, bearerToken: '***', tailscaleApiKey: '***' })}`);

    // Initialize services
    await monolithAgent.initialize();
    logger.info('Monolith Agent initialized');

    // Start MCP server
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logger.info('Atlas MCP server is running');
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

main();
