/**
 * Tailscale API integration for network management
 * Handles device authorization, listing, and network operations
 */

import {
  TailscaleConfig,
  TailscaleDevice,
  TailscaleError,
  MCPResponse,
} from './types.js';

export class TailscaleManager {
  private apiKey: string;
  private tailnet: string;
  private baseUrl = 'https://api.tailscale.com/api/v2';

  constructor(config: TailscaleConfig) {
    this.apiKey = config.apiKey;
    this.tailnet = config.tailnet;

    if (!this.apiKey || !this.tailnet) {
      throw new TailscaleError(
        'Tailscale API key and tailnet are required',
        { apiKey: !!this.apiKey, tailnet: !!this.tailnet }
      );
    }
  }

  /**
   * Make authenticated request to Tailscale API
   */
  private async makeRequest(
    endpoint: string,
    method: string = 'GET',
    body?: any
  ): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Tailscale API error: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      // Handle empty responses
      const text = await response.text();
      return text ? JSON.parse(text) : null;
    } catch (error) {
      throw new TailscaleError(
        `Failed to call Tailscale API: ${endpoint}`,
        { error: error instanceof Error ? error.message : error }
      );
    }
  }

  /**
   * List all devices in the Tailscale network
   */
  async listDevices(): Promise<MCPResponse<TailscaleDevice[]>> {
    try {
      const response = await this.makeRequest(
        `/tailnet/${this.tailnet}/devices`
      );

      const devices: TailscaleDevice[] = response.devices.map((device: any) => ({
        id: device.id,
        name: device.name,
        hostname: device.hostname,
        addresses: device.addresses || [],
        user: device.user,
        os: device.os,
        lastSeen: device.lastSeen,
        online: device.online || false,
        authorized: device.authorized || false,
        keyExpiry: device.keyExpiryDisabled ? undefined : device.expires,
        tags: device.tags || [],
      }));

      return {
        success: true,
        data: devices,
        metadata: {
          count: devices.length,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Failed to list devices',
      };
    }
  }

  /**
   * Authorize a device on the Tailscale network
   */
  async authorizeDevice(deviceId: string): Promise<MCPResponse<any>> {
    try {
      await this.makeRequest(
        `/device/${deviceId}/authorized`,
        'POST',
        { authorized: true }
      );

      return {
        success: true,
        data: {
          deviceId,
          status: 'authorized',
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Failed to authorize device',
      };
    }
  }

  /**
   * Revoke access for a device
   */
  async revokeDevice(deviceId: string): Promise<MCPResponse<any>> {
    try {
      await this.makeRequest(
        `/device/${deviceId}/authorized`,
        'POST',
        { authorized: false }
      );

      return {
        success: true,
        data: {
          deviceId,
          status: 'revoked',
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Failed to revoke device',
      };
    }
  }

  /**
   * Get device details
   */
  async getDevice(deviceId: string): Promise<MCPResponse<TailscaleDevice>> {
    try {
      const response = await this.makeRequest(`/device/${deviceId}`);

      const device: TailscaleDevice = {
        id: response.id,
        name: response.name,
        hostname: response.hostname,
        addresses: response.addresses || [],
        user: response.user,
        os: response.os,
        lastSeen: response.lastSeen,
        online: response.online || false,
        authorized: response.authorized || false,
        keyExpiry: response.keyExpiryDisabled ? undefined : response.expires,
        tags: response.tags || [],
      };

      return {
        success: true,
        data: device,
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Failed to get device',
      };
    }
  }

  /**
   * Get ACL (Access Control List) for the tailnet
   */
  async getACL(): Promise<MCPResponse<any>> {
    try {
      const response = await this.makeRequest(`/tailnet/${this.tailnet}/acl`);

      return {
        success: true,
        data: response,
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Failed to get ACL',
      };
    }
  }

  /**
   * Update ACL for the tailnet
   */
  async updateACL(acl: any): Promise<MCPResponse<any>> {
    try {
      await this.makeRequest(
        `/tailnet/${this.tailnet}/acl`,
        'POST',
        acl
      );

      return {
        success: true,
        data: {
          status: 'updated',
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Failed to update ACL',
      };
    }
  }

  /**
   * Delete a device from the network
   */
  async deleteDevice(deviceId: string): Promise<MCPResponse<any>> {
    try {
      await this.makeRequest(`/device/${deviceId}`, 'DELETE');

      return {
        success: true,
        data: {
          deviceId,
          status: 'deleted',
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Failed to delete device',
      };
    }
  }
}
