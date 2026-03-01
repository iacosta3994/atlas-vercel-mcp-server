/**
 * Authentication middleware for Atlas MCP Server
 * Implements bearer token authentication compatible with Atlas's security model
 */

import { AuthResult, AuthenticationError } from './types.js';
import * as crypto from 'crypto';

/**
 * Authenticate incoming requests using bearer token
 * @param authHeader Authorization header value
 * @param expectedToken Expected bearer token from environment
 * @returns Authentication result with agent ID if successful
 */
export async function authenticateRequest(
  authHeader: string | undefined,
  expectedToken: string
): Promise<AuthResult> {
  try {
    // Check if auth header exists
    if (!authHeader) {
      return {
        authenticated: false,
        error: 'No authorization header provided',
      };
    }

    // Validate bearer token format
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return {
        authenticated: false,
        error: 'Invalid authorization header format. Expected: Bearer <token>',
      };
    }

    const token = parts[1];

    // Validate token is not empty
    if (!token || token.length === 0) {
      return {
        authenticated: false,
        error: 'Empty bearer token provided',
      };
    }

    // Constant-time comparison to prevent timing attacks
    const tokenValid = await constantTimeCompare(token, expectedToken);

    if (!tokenValid) {
      return {
        authenticated: false,
        error: 'Invalid bearer token',
      };
    }

    // Extract agent ID from token (if encoded) or use default
    const agentId = extractAgentIdFromToken(token);

    return {
      authenticated: true,
      agentId: agentId || 'authenticated-agent',
    };
  } catch (error) {
    return {
      authenticated: false,
      error: `Authentication error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Constant-time string comparison to prevent timing attacks
 * @param a First string
 * @param b Second string
 * @returns True if strings match
 */
async function constantTimeCompare(a: string, b: string): Promise<boolean> {
  try {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');

    if (bufA.length !== bufB.length) {
      // Still perform comparison to prevent timing attacks
      crypto.timingSafeEqual(
        Buffer.alloc(32, bufA),
        Buffer.alloc(32, bufB)
      );
      return false;
    }

    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Extract agent ID from JWT-style token if present
 * @param token Bearer token
 * @returns Agent ID or null
 */
function extractAgentIdFromToken(token: string): string | null {
  try {
    // Check if token is JWT format (3 parts separated by dots)
    const parts = token.split('.');
    if (parts.length === 3) {
      // Decode payload (second part)
      const payload = JSON.parse(
        Buffer.from(parts[1], 'base64').toString('utf8')
      );
      return payload.agentId || payload.sub || null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Generate a secure bearer token
 * @param agentId Optional agent ID to encode in token
 * @returns Generated bearer token
 */
export function generateBearerToken(agentId?: string): string {
  const randomBytes = crypto.randomBytes(32).toString('hex');
  
  if (agentId) {
    // Create a simple encoded token with agent ID
    const payload = {
      agentId,
      iat: Date.now(),
      exp: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64');
    return `atlas.${encodedPayload}.${randomBytes}`;
  }
  
  return randomBytes;
}

/**
 * Validate token expiration
 * @param token Bearer token
 * @returns True if token is valid (not expired)
 */
export function validateTokenExpiration(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(
        Buffer.from(parts[1], 'base64').toString('utf8')
      );
      if (payload.exp) {
        return Date.now() < payload.exp;
      }
    }
    // If no expiration, consider valid
    return true;
  } catch {
    return true; // Default to valid if can't parse
  }
}

/**
 * Middleware to check authentication and throw error if invalid
 * @param authHeader Authorization header
 * @param expectedToken Expected token
 */
export async function requireAuthentication(
  authHeader: string | undefined,
  expectedToken: string
): Promise<string> {
  const result = await authenticateRequest(authHeader, expectedToken);
  
  if (!result.authenticated) {
    throw new AuthenticationError(result.error || 'Authentication failed');
  }
  
  if (!validateTokenExpiration(authHeader?.split(' ')[1] || '')) {
    throw new AuthenticationError('Token has expired');
  }
  
  return result.agentId || 'authenticated-agent';
}
