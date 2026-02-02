/**
 * Admin API service for platform administration
 */

import { api } from './index';
import type {
  Organization,
  OrganizationWithStats,
  OrganizationUpdate,
  UserRole,
  Invitation,
  StreamSubscriptionStatus
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
  },

  /**
   * Delete a user (platform admin only)
   */
  async deleteUser(userId: number): Promise<void> {
    await api.delete(`/api/admin/users/${userId}`);
  },

  // ==================== Invitation Management ====================

  /**
   * Get all invitations (platform admin only)
   */
  async getInvitations(params?: {
    org_id?: number;
    include_accepted?: boolean;
    include_expired?: boolean;
  }): Promise<Invitation[]> {
    const response = await api.get('/api/admin/invitations', { params });
    return response.data;
  },

  /**
   * Create a new invitation (platform admin only)
   */
  async createInvitation(data: {
    email: string;
    org_id?: number;
    role?: UserRole;
    expires_in_days?: number;
  }): Promise<Invitation> {
    const response = await api.post('/api/admin/invitations', data);
    return response.data;
  },

  /**
   * Revoke an invitation (platform admin only)
   */
  async revokeInvitation(invitationId: number): Promise<void> {
    await api.delete(`/api/admin/invitations/${invitationId}`);
  },

  /**
   * Create a user directly (platform admin only)
   */
  async createUser(data: {
    email: string;
    password: string;
    full_name?: string;
    org_id: number;
    role?: UserRole;
  }): Promise<User> {
    const response = await api.post('/api/admin/users/create', data);
    return response.data;
  },

  // ==================== Organization Stream Subscriptions ====================

  /**
   * Get global streams with subscription status for an org (platform admin only)
   */
  async getOrgGlobalStreams(orgId: number): Promise<StreamSubscriptionStatus[]> {
    const response = await api.get(`/api/admin/orgs/${orgId}/global-streams`);
    return response.data;
  },

  /**
   * Subscribe an org to a global stream (platform admin only)
   */
  async subscribeOrgToGlobalStream(orgId: number, streamId: number): Promise<void> {
    await api.post(`/api/admin/orgs/${orgId}/global-streams/${streamId}`);
  },

  /**
   * Unsubscribe an org from a global stream (platform admin only)
   */
  async unsubscribeOrgFromGlobalStream(orgId: number, streamId: number): Promise<void> {
    await api.delete(`/api/admin/orgs/${orgId}/global-streams/${streamId}`);
  },

  // ==================== Chat System Configuration ====================

  /**
   * Get chat system configuration (platform admin only)
   */
  async getChatConfig(): Promise<ChatConfigResponse> {
    const response = await api.get('/api/admin/chat-config');
    return response.data;
  },

  // ==================== Help Content Management ====================

  /**
   * Get all help sections (platform admin only)
   */
  async getHelpSections(): Promise<HelpSectionsResponse> {
    const response = await api.get('/api/admin/help/sections');
    return response.data;
  },

  /**
   * Get a specific help section with full content (platform admin only)
   */
  async getHelpSection(sectionId: string): Promise<HelpSectionDetail> {
    const response = await api.get(`/api/admin/help/sections/${sectionId}`);
    return response.data;
  },

  /**
   * Preview TOC as seen by each role (platform admin only)
   */
  async getHelpTocPreview(): Promise<HelpTOCPreview[]> {
    const response = await api.get('/api/admin/help/toc-preview');
    return response.data;
  },

  /**
   * Reload help content from YAML files (platform admin only)
   */
  async reloadHelpContent(): Promise<{ status: string; sections_loaded: number }> {
    const response = await api.post('/api/admin/help/reload');
    return response.data;
  },

  // ==================== Unified Chat Config Management ====================

  /**
   * Get all stream chat configs (platform admin only)
   */
  async getStreamConfigs(): Promise<StreamConfigInfo[]> {
    const response = await api.get('/api/admin/chat-config/streams');
    return response.data;
  },

  /**
   * Get chat config for a specific stream (platform admin only)
   */
  async getStreamConfig(streamId: number): Promise<StreamConfigInfo> {
    const response = await api.get(`/api/admin/chat-config/streams/${streamId}`);
    return response.data;
  },

  /**
   * Update chat config for a stream (platform admin only)
   */
  async updateStreamConfig(streamId: number, instructions: string | null): Promise<StreamConfigInfo> {
    const response = await api.put(`/api/admin/chat-config/streams/${streamId}`, {
      instructions
    });
    return response.data;
  },

  /**
   * Get all page chat configs (platform admin only)
   */
  async getPageConfigs(): Promise<PageConfigIdentityInfo[]> {
    const response = await api.get('/api/admin/chat-config/pages');
    return response.data;
  },

  /**
   * Get chat config for a specific page (platform admin only)
   */
  async getPageConfig(page: string): Promise<PageConfigIdentityInfo> {
    const response = await api.get(`/api/admin/chat-config/pages/${encodeURIComponent(page)}`);
    return response.data;
  },

  /**
   * Update chat config for a page (platform admin only)
   */
  async updatePageConfig(page: string, identity: string | null): Promise<PageConfigIdentityInfo> {
    const response = await api.put(`/api/admin/chat-config/pages/${encodeURIComponent(page)}`, {
      identity
    });
    return response.data;
  },

  /**
   * Delete chat config override for a page (platform admin only)
   */
  async deletePageConfig(page: string): Promise<{ status: string; page: string }> {
    const response = await api.delete(`/api/admin/chat-config/pages/${encodeURIComponent(page)}`);
    return response.data;
  }
};

// Chat config types
export interface PayloadTypeInfo {
  name: string;
  description: string;
  source: 'tool' | 'llm';
  is_global: boolean;
  parse_marker?: string;
  has_parser: boolean;
  has_instructions: boolean;
}

export interface ToolInfo {
  name: string;
  description: string;
  category: string;
  is_global: boolean;
  payload_type?: string;
  streaming: boolean;
}

export interface SubTabConfigInfo {
  payloads: string[];
  tools: string[];
}

export interface TabConfigInfo {
  payloads: string[];
  tools: string[];
  subtabs: Record<string, SubTabConfigInfo>;
}

export interface PageConfigInfo {
  page: string;
  has_context_builder: boolean;
  payloads: string[];
  tools: string[];
  tabs: Record<string, TabConfigInfo>;
  client_actions: string[];
}

export interface StreamInstructionsInfo {
  stream_id: number;
  stream_name: string;
  has_instructions: boolean;
  instructions_preview?: string;
}

export interface ChatConfigResponse {
  payload_types: PayloadTypeInfo[];
  tools: ToolInfo[];
  pages: PageConfigInfo[];
  stream_instructions: StreamInstructionsInfo[];
  summary: {
    total_payload_types: number;
    global_payloads: number;
    llm_payloads: number;
    tool_payloads: number;
    total_tools: number;
    global_tools: number;
    total_pages: number;
    total_streams: number;
    streams_with_instructions: number;
  };
}

// Help content types
export interface HelpSectionSummary {
  id: string;
  title: string;
  summary: string;
  roles: string[];
  order: number;
}

export interface HelpSectionDetail extends HelpSectionSummary {
  content: string;
}

export interface HelpSectionsResponse {
  sections: HelpSectionSummary[];
  total: number;
}

export interface HelpTOCPreview {
  role: string;
  toc: string;
}

// Unified Chat Config types
export interface StreamConfigInfo {
  stream_id: number;
  stream_name: string;
  instructions: string | null;
  has_override: boolean;
}

export interface PageConfigIdentityInfo {
  page: string;
  identity: string | null;
  has_override: boolean;
  default_identity: string | null;
}

export interface ChatConfigUpdate {
  identity?: string | null;
  instructions?: string | null;
}
