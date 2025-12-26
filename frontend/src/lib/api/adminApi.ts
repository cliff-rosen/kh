/**
 * Admin API service for platform administration
 */

import { api } from './index';
import type {
  Organization,
  OrganizationWithStats,
  OrganizationUpdate,
  UserRole
} from '../../types/organization';
import type { User, UserList } from '../../types/user';

// Import ResearchStream type from existing types
interface ResearchStream {
  stream_id: number;
  stream_name: string;
  purpose: string;
  scope: string;
  org_id?: number;
  user_id?: number;
  created_by?: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const adminApi = {
  // ==================== Organization Management ====================

  /**
   * Get all organizations (platform admin only)
   */
  async getAllOrganizations(): Promise<OrganizationWithStats[]> {
    const response = await api.get('/api/admin/orgs');
    return response.data;
  },

  /**
   * Create a new organization (platform admin only)
   */
  async createOrganization(name: string): Promise<Organization> {
    const response = await api.post('/api/admin/orgs', null, { params: { name } });
    return response.data;
  },

  /**
   * Get organization by ID (platform admin only)
   */
  async getOrganization(orgId: number): Promise<OrganizationWithStats> {
    const response = await api.get(`/api/admin/orgs/${orgId}`);
    return response.data;
  },

  /**
   * Update organization (platform admin only)
   */
  async updateOrganization(orgId: number, data: OrganizationUpdate): Promise<Organization> {
    const response = await api.put(`/api/admin/orgs/${orgId}`, data);
    return response.data;
  },

  /**
   * Delete organization (platform admin only)
   */
  async deleteOrganization(orgId: number): Promise<void> {
    await api.delete(`/api/admin/orgs/${orgId}`);
  },

  /**
   * Assign user to organization (platform admin only)
   */
  async assignUserToOrg(orgId: number, userId: number): Promise<{ status: string; user_id: number; org_id: number }> {
    const response = await api.put(`/api/admin/orgs/${orgId}/members/${userId}`);
    return response.data;
  },

  // ==================== Global Stream Management ====================

  /**
   * Get all global streams (platform admin only)
   */
  async getGlobalStreams(): Promise<ResearchStream[]> {
    const response = await api.get('/api/admin/streams');
    return response.data;
  },

  /**
   * Promote stream to global scope (platform admin only)
   */
  async setStreamScopeGlobal(streamId: number): Promise<ResearchStream> {
    const response = await api.put(`/api/admin/streams/${streamId}/scope`);
    return response.data;
  },

  /**
   * Delete a global stream (platform admin only)
   */
  async deleteGlobalStream(streamId: number): Promise<void> {
    await api.delete(`/api/admin/streams/${streamId}`);
  },

  // ==================== User Management ====================

  /**
   * Get all users, optionally filtered by org, role, or active status (platform admin only)
   */
  async getAllUsers(params?: {
    org_id?: number;
    role?: UserRole;
    is_active?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<UserList> {
    const response = await api.get('/api/admin/users', { params });
    return response.data;
  },

  /**
   * Update user role (platform admin only)
   */
  async updateUserRole(userId: number, role: UserRole): Promise<User> {
    const response = await api.put(`/api/admin/users/${userId}/role`, null, { params: { new_role: role } });
    return response.data;
  }
};
