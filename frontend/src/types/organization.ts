/**
 * Organization and multi-tenancy types for Knowledge Horizon
 */

// Re-export user types that are also used in organization context
export type { UserRole, OrgMember } from './user';
import type { UserRole } from './user';

// Stream scope
export type StreamScope = 'global' | 'organization' | 'personal';

// Organization
export interface Organization {
  org_id: number;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

export interface OrganizationWithStats extends Organization {
  member_count: number;
  stream_count: number;
}

export interface OrganizationUpdate {
  name?: string;
  is_active?: boolean;
}

// Member update
export interface OrgMemberUpdate {
  role: UserRole;
}

// Subscriptions
export interface StreamSubscriptionStatus {
  stream_id: number;
  stream_name: string;
  scope: StreamScope;
  purpose?: string;
  is_org_subscribed?: boolean;
  is_user_subscribed: boolean;
  is_user_opted_out: boolean;
  created_at: string;
}

export interface GlobalStreamLibrary {
  streams: StreamSubscriptionStatus[];
  total_count: number;
}

export interface OrgStreamList {
  streams: StreamSubscriptionStatus[];
  total_count: number;
}

// Notes
export interface ArticleNote {
  id: string;
  user_id: number;
  author_name: string;
  content: string;
  visibility: 'personal' | 'shared';
  created_at: string;
  updated_at: string;
}

export interface ArticleNoteCreate {
  content: string;
  visibility?: 'personal' | 'shared';
}

export interface ArticleNoteUpdate {
  content?: string;
  visibility?: 'personal' | 'shared';
}

export interface ArticleNotesResponse {
  report_id: number;
  article_id: number;
  notes: ArticleNote[];
  total_count: number;
}

// Admin types - use User from user.ts for full user data
export type { User as AdminUser, UserList } from './user';

// Invitation
export interface Invitation {
  invitation_id: number;
  email: string;
  org_id: number;
  org_name: string;
  role: string;
  token: string;
  invite_url: string;
  created_at: string;
  expires_at: string;
  accepted_at?: string;
  is_revoked: boolean;
  inviter_email?: string;
}
