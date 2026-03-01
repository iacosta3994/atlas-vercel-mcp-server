# Atlas Vercel MCP Server

Production-ready Model Context Protocol (MCP) server integrating with Atlas Monolith Agent architecture, featuring CRM database management, AgentMail communication, DCA decision services, OpenClaw Gateway infrastructure control, and Tailscale network management.

## 🏗️ Architecture Overview

This MCP server acts as the central integration point for the Atlas ecosystem:

```
┌─────────────────────────────────────────────────────────┐
│           Atlas Vercel MCP Server                       │
├─────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐  │
│  │ Auth Layer   │  │ Rate Limiter │  │  MCP Core   │  │
│  └──────────────┘  └──────────────┘  └─────────────┘  │
└────────────┬─────────────────────────────┬──────────────┘
             │                             │
    ┌────────┴────────┐           ┌────────┴────────┐
    │                 │           │                 │
┌───▼────┐   ┌────────▼───┐   ┌──▼─────┐   ┌──────▼───┐
│  CRM   │   │ AgentMail  │   │  DCA   │   │ OpenClaw │
│  SQLite│   │  Service   │   │Service │   │ Gateway  │
└────────┘   └────────────┘   └────────┘   └──────────┘
                              │
                         ┌────▼────┐
                         │Tailscale│
                         │  API    │
                         └─────────┘
```

## ✨ Features

### Core Integration Points

- **CRM Database**: SQLite-based customer relationship management with customers and opportunities tracking
- **AgentMail**: Agent-to-agent communication system for coordinated operations
- **DCA (Decision Clarity for Agents)**: AI-powered decision analysis and recommendation engine
- **OpenClaw Gateway**: Infrastructure command execution and orchestration
- **Tailscale Network Management**: Device authorization, listing, and network control

### Security & Performance

- **Bearer Token Authentication**: Secure JWT-style token authentication with constant-time comparison
- **Rate Limiting**: Token bucket algorithm preventing abuse (60 requests/minute default)
- **Error Handling**: Comprehensive error types and graceful degradation
- **Health Monitoring**: Real-time subsystem health checks and metrics
- **Logging**: Configurable log levels (debug, info, warn, error)

### Production Ready

- **TypeScript**: Full type safety with comprehensive interfaces
- **Vercel Optimized**: Configured for serverless deployment on Vercel
- **WAL Mode**: SQLite Write-Ahead Logging for better concurrency
- **Graceful Shutdown**: Proper cleanup on SIGINT/SIGTERM
- **Metrics Tracking**: Request count, response times, error rates

## 🚀 Quick Start

### Prerequisites

- Node.js 18.x or higher
- npm or yarn
- Tailscale account (for network management features)
- Access to Atlas infrastructure endpoints

### Installation

```bash
# Clone the repository
git clone https://github.com/iacosta3994/atlas-vercel-mcp-server.git
cd atlas-vercel-mcp-server

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your configuration
# IMPORTANT: Set your bearer token and API keys
```

### Configuration

Edit `.env` file with your settings:

```env
# Authentication
ATLAS_BEARER_TOKEN=your_secure_bearer_token_here

# Tailscale Configuration
TAILSCALE_API_KEY=tskey-api-xxxxx
TAILSCALE_TAILNET=your-tailnet-name

# CRM Database
CRM_DATABASE_PATH=./data/crm.db

# Atlas Service Endpoints
AGENTMAIL_ENDPOINT=https://agentmail.atlas.internal
DCA_SERVICE_ENDPOINT=https://dca.atlas.internal
OPENCLAW_GATEWAY=https://openclaw.atlas.internal

# Monolith Agent Configuration
MONOLITH_AGENT_ID=monolith-primary

# Logging
LOG_LEVEL=info

# Rate Limiting
ENABLE_RATE_LIMITING=true
MAX_REQUESTS_PER_MINUTE=60
```

### Development

```bash
# Build TypeScript
npm run build

# Watch mode for development
npm run dev

# Run the server
npm start
```

### Vercel Deployment

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy to Vercel
vercel

# Set environment variables in Vercel dashboard
# or use CLI:
vercel env add ATLAS_BEARER_TOKEN
vercel env add TAILSCALE_API_KEY
# ... add all required env vars

# Deploy to production
vercel --prod
```

## 📚 MCP Tools

### CRM Operations

#### `query_crm`
Query the Atlas CRM database for customer and opportunity data.

```json
{
  "query": "SELECT * FROM customers WHERE status = ?",
  "params": ["customer"]
}
```

### Agent Communication

#### `send_agent_mail`
Send messages between agents via AgentMail.

```json
{
  "recipientAgentId": "agent-002",
  "subject": "Task Assignment",
  "body": "New customer lead requires attention",
  "priority": "high"
}
```

### Decision Support

#### `request_decision`
Request decision analysis from DCA service.

```json
{
  "decisionContext": "Customer upgrade path selection",
  "options": ["Standard Plan", "Premium Plan", "Enterprise Plan"],
  "criteria": {
    "cost": 0.3,
    "features": 0.5,
    "support": 0.2
  }
}
```

### Infrastructure Control

#### `openclaw_execute`
Execute infrastructure commands through OpenClaw Gateway.

```json
{
  "command": "deploy",
  "target": "production",
  "parameters": {
    "service": "api-gateway",
    "version": "v1.2.3"
  }
}
```

### Network Management

#### `tailscale_list_devices`
List all devices in the Tailscale network.

```json
{}
```

#### `tailscale_authorize_device`
Authorize a new device.

```json
{
  "deviceId": "device-12345"
}
```

#### `tailscale_revoke_device`
Revoke device access.

```json
{
  "deviceId": "device-12345"
}
```

### Health Monitoring

#### `get_agent_status`
Get comprehensive status of Monolith Agent and all subsystems.

```json
{}
```

## 🔒 Security

### Authentication

All requests must include a bearer token:

```
Authorization: Bearer your_token_here
```

Tokens support JWT-style encoding with agent ID:

```javascript
// Generate a token with agent ID
import { generateBearerToken } from './src/auth.js';

const token = generateBearerToken('my-agent-id');
```

### Rate Limiting

Default: 60 requests per minute per agent ID

Customize in `.env`:
```env
MAX_REQUESTS_PER_MINUTE=120
```

### Security Best Practices

1. **Never commit `.env` file** - Use environment variables in production
2. **Rotate tokens regularly** - Generate new bearer tokens periodically
3. **Use HTTPS only** - Ensure all endpoints use TLS encryption
4. **Limit CRM queries** - Only SELECT statements allowed via MCP interface
5. **Monitor metrics** - Track error rates and unusual patterns

## 📊 Monitoring & Metrics

The server tracks:

- **Requests Processed**: Total number of successful requests
- **Average Response Time**: Mean time to process requests
- **Error Rate**: Percentage of failed requests
- **Subsystem Health**: Real-time status of all integrated services
- **Rate Limit Stats**: Current usage and throttling metrics

Access via `get_agent_status` tool.

## 🛠️ Development

### Project Structure

```
atlas-vercel-mcp-server/
├── src/
│   ├── index.ts          # Main MCP server
│   ├── types.ts          # TypeScript definitions
│   ├── auth.ts           # Authentication middleware
│   ├── tailscale.ts      # Tailscale API integration
│   ├── monolith.ts       # Monolith Agent integration
│   └── rateLimiter.ts    # Rate limiting logic
├── dist/                 # Compiled JavaScript
├── data/                 # SQLite database files
├── vercel.json          # Vercel configuration
├── package.json         # Dependencies
├── tsconfig.json        # TypeScript config
├── .env.example         # Environment template
└── README.md           # This file
```

### Adding New Tools

1. Define tool schema in `TOOLS` array in `index.ts`
2. Add handler case in `handleToolCall()` function
3. Implement business logic in appropriate module
4. Update TypeScript types in `types.ts`
5. Add documentation to README

### Testing

```bash
# Run tests (when implemented)
npm test

# Lint code
npm run lint

# Format code
npm run format
```

## 🐛 Troubleshooting

### Common Issues

**Database locked errors**
- Ensure WAL mode is enabled (automatic on initialization)
- Check file permissions on `data/` directory

**Authentication failures**
- Verify `ATLAS_BEARER_TOKEN` is set correctly
- Check authorization header format: `Bearer <token>`

**Rate limit exceeded**
- Wait for window reset (shown in error message)
- Increase `MAX_REQUESTS_PER_MINUTE` if needed

**Subsystem offline**
- Check service endpoints are accessible
- Verify network connectivity (Tailscale VPN if required)
- Review service logs for errors

### Debug Mode

Enable detailed logging:

```env
LOG_LEVEL=debug
```

## 🤝 Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🔗 Related Projects

- [Model Context Protocol](https://github.com/modelcontextprotocol)
- [Tailscale API](https://tailscale.com/api)
- [Vercel Platform](https://vercel.com)

## 📞 Support

For issues and questions:
- Open an issue on GitHub
- Contact: Ian Acosta
- Documentation: [MCP Protocol Docs](https://modelcontextprotocol.io)

---

**Built with ❤️ for the Atlas Agent ecosystem**
