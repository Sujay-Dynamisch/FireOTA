export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agent_executions: {
        Row: {
          action: string
          agent_id: string
          app_id: string | null
          audit_log_id: string | null
          completed_at: string | null
          error: string | null
          id: string
          input: Json
          organization_id: string
          output: Json | null
          resource_id: string | null
          resource_type: string | null
          started_at: string
          status: string
        }
        Insert: {
          action: string
          agent_id: string
          app_id?: string | null
          audit_log_id?: string | null
          completed_at?: string | null
          error?: string | null
          id?: string
          input?: Json
          organization_id: string
          output?: Json | null
          resource_id?: string | null
          resource_type?: string | null
          started_at?: string
          status?: string
        }
        Update: {
          action?: string
          agent_id?: string
          app_id?: string | null
          audit_log_id?: string | null
          completed_at?: string | null
          error?: string | null
          id?: string
          input?: Json
          organization_id?: string
          output?: Json | null
          resource_id?: string | null
          resource_type?: string | null
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_executions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_executions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_permissions: {
        Row: {
          agent_id: string
          id: string
          mode: Database["public"]["Enums"]["permission_mode"]
          organization_id: string
          tool: string
        }
        Insert: {
          agent_id: string
          id?: string
          mode?: Database["public"]["Enums"]["permission_mode"]
          organization_id: string
          tool: string
        }
        Update: {
          agent_id?: string
          id?: string
          mode?: Database["public"]["Enums"]["permission_mode"]
          organization_id?: string
          tool?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_permissions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_permissions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          approval_policy: string
          capabilities: string[]
          created_at: string
          description: string
          id: string
          key: string
          last_execution_at: string | null
          name: string
          organization_id: string
          status: string
          updated_at: string
        }
        Insert: {
          approval_policy?: string
          capabilities?: string[]
          created_at?: string
          description?: string
          id?: string
          key: string
          last_execution_at?: string | null
          name: string
          organization_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          approval_policy?: string
          capabilities?: string[]
          created_at?: string
          description?: string
          id?: string
          key?: string
          last_execution_at?: string | null
          name?: string
          organization_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_events: {
        Row: {
          app_id: string
          app_version: string | null
          channel_id: string | null
          created_at: string
          event_type: string
          id: string
          installation_id: string
          metadata: Json
          native_version: string | null
          organization_id: string
          platform: Database["public"]["Enums"]["platform_type"]
          release_id: string | null
          runtime_version: string | null
        }
        Insert: {
          app_id: string
          app_version?: string | null
          channel_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          installation_id: string
          metadata?: Json
          native_version?: string | null
          organization_id: string
          platform: Database["public"]["Enums"]["platform_type"]
          release_id?: string | null
          runtime_version?: string | null
        }
        Update: {
          app_id?: string
          app_version?: string | null
          channel_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          installation_id?: string
          metadata?: Json
          native_version?: string | null
          organization_id?: string
          platform?: Database["public"]["Enums"]["platform_type"]
          release_id?: string | null
          runtime_version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_events_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_events_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_events_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "releases"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          environment: string
          expires_at: string | null
          id: string
          last_used_at: string | null
          name: string
          organization_id: string
          prefix: string
          revoked_at: string | null
          scopes: string[]
          status: string
          token_hash: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          environment?: string
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          name: string
          organization_id: string
          prefix: string
          revoked_at?: string | null
          scopes?: string[]
          status?: string
          token_hash: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          environment?: string
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          name?: string
          organization_id?: string
          prefix?: string
          revoked_at?: string | null
          scopes?: string[]
          status?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      app_platforms: {
        Row: {
          app_id: string
          bundle_identifier: string | null
          created_at: string
          id: string
          native_version: string
          organization_id: string
          package_name: string | null
          platform: Database["public"]["Enums"]["platform_type"]
          runtime_version: string
          updated_at: string
        }
        Insert: {
          app_id: string
          bundle_identifier?: string | null
          created_at?: string
          id?: string
          native_version?: string
          organization_id: string
          package_name?: string | null
          platform: Database["public"]["Enums"]["platform_type"]
          runtime_version?: string
          updated_at?: string
        }
        Update: {
          app_id?: string
          bundle_identifier?: string | null
          created_at?: string
          id?: string
          native_version?: string
          organization_id?: string
          package_name?: string | null
          platform?: Database["public"]["Enums"]["platform_type"]
          runtime_version?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_platforms_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_platforms_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_requests: {
        Row: {
          action: string
          agent_id: string | null
          app_id: string | null
          approved_at: string | null
          approved_by: string | null
          id: string
          organization_id: string
          payload: Json
          reason: string | null
          reasoning: string
          rejected_at: string | null
          rejected_by: string | null
          requested_at: string
          resource_id: string | null
          resource_type: string
          risk_level: string
          status: Database["public"]["Enums"]["approval_status"]
        }
        Insert: {
          action: string
          agent_id?: string | null
          app_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          id?: string
          organization_id: string
          payload?: Json
          reason?: string | null
          reasoning?: string
          rejected_at?: string | null
          rejected_by?: string | null
          requested_at?: string
          resource_id?: string | null
          resource_type: string
          risk_level?: string
          status?: Database["public"]["Enums"]["approval_status"]
        }
        Update: {
          action?: string
          agent_id?: string | null
          app_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          id?: string
          organization_id?: string
          payload?: Json
          reason?: string | null
          reasoning?: string
          rejected_at?: string | null
          rejected_by?: string | null
          requested_at?: string
          resource_id?: string | null
          resource_type?: string
          risk_level?: string
          status?: Database["public"]["Enums"]["approval_status"]
        }
        Relationships: [
          {
            foreignKeyName: "approval_requests_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      apps: {
        Row: {
          created_at: string
          created_by: string | null
          default_channel: string
          firebase_project_id: string | null
          storage_target_id: string | null
          id: string
          name: string
          organization_id: string
          runtime_version: string
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          default_channel?: string
          firebase_project_id?: string | null
          storage_target_id?: string | null
          id?: string
          name: string
          organization_id: string
          runtime_version?: string
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          default_channel?: string
          firebase_project_id?: string | null
          storage_target_id?: string | null
          id?: string
          name?: string
          organization_id?: string
          runtime_version?: string
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "apps_firebase_project_id_fkey"
            columns: ["firebase_project_id"]
            isOneToOne: false
            referencedRelation: "firebase_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apps_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          actor_label: string
          after: Json | null
          app_id: string | null
          app_name: string
          before: Json | null
          created_at: string
          id: string
          ip: string | null
          organization_id: string
          request_id: string | null
          resource_id: string | null
          resource_type: string
          result: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_label?: string
          after?: Json | null
          app_id?: string | null
          app_name?: string
          before?: Json | null
          created_at?: string
          id?: string
          ip?: string | null
          organization_id: string
          request_id?: string | null
          resource_id?: string | null
          resource_type: string
          result?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_label?: string
          after?: Json | null
          app_id?: string | null
          app_name?: string
          before?: Json | null
          created_at?: string
          id?: string
          ip?: string | null
          organization_id?: string
          request_id?: string | null
          resource_id?: string | null
          resource_type?: string
          result?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          active_release_id: string | null
          app_id: string
          created_at: string
          description: string
          environment: string
          id: string
          name: string
          organization_id: string
          platform: string
          rollout_percentage: number
          status: string
          update_policy: string
          updated_at: string
        }
        Insert: {
          active_release_id?: string | null
          app_id: string
          created_at?: string
          description?: string
          environment?: string
          id?: string
          name: string
          organization_id: string
          platform?: string
          rollout_percentage?: number
          status?: string
          update_policy?: string
          updated_at?: string
        }
        Update: {
          active_release_id?: string | null
          app_id?: string
          created_at?: string
          description?: string
          environment?: string
          id?: string
          name?: string
          organization_id?: string
          platform?: string
          rollout_percentage?: number
          status?: string
          update_policy?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channels_active_release_fk"
            columns: ["active_release_id"]
            isOneToOne: false
            referencedRelation: "releases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channels_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channels_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      deployments: {
        Row: {
          app_id: string
          channel_id: string | null
          created_at: string
          created_by: string | null
          created_by_label: string
          id: string
          organization_id: string
          previous_release_id: string | null
          reason: string | null
          release_id: string | null
          source: string
          status: string
          type: string
        }
        Insert: {
          app_id: string
          channel_id?: string | null
          created_at?: string
          created_by?: string | null
          created_by_label?: string
          id?: string
          organization_id: string
          previous_release_id?: string | null
          reason?: string | null
          release_id?: string | null
          source?: string
          status?: string
          type: string
        }
        Update: {
          app_id?: string
          channel_id?: string | null
          created_at?: string
          created_by?: string | null
          created_by_label?: string
          id?: string
          organization_id?: string
          previous_release_id?: string | null
          reason?: string | null
          release_id?: string | null
          source?: string
          status?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "deployments_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deployments_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deployments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deployments_previous_release_id_fkey"
            columns: ["previous_release_id"]
            isOneToOne: false
            referencedRelation: "releases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deployments_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "releases"
            referencedColumns: ["id"]
          },
        ]
      }
      device_installations: {
        Row: {
          app_id: string
          app_version: string
          channel_id: string | null
          created_at: string
          current_release_id: string | null
          id: string
          installation_id: string
          last_seen_at: string
          native_version: string
          organization_id: string
          platform: Database["public"]["Enums"]["platform_type"]
          runtime_version: string
        }
        Insert: {
          app_id: string
          app_version?: string
          channel_id?: string | null
          created_at?: string
          current_release_id?: string | null
          id?: string
          installation_id: string
          last_seen_at?: string
          native_version?: string
          organization_id: string
          platform: Database["public"]["Enums"]["platform_type"]
          runtime_version?: string
        }
        Update: {
          app_id?: string
          app_version?: string
          channel_id?: string | null
          created_at?: string
          current_release_id?: string | null
          id?: string
          installation_id?: string
          last_seen_at?: string
          native_version?: string
          organization_id?: string
          platform?: Database["public"]["Enums"]["platform_type"]
          runtime_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_installations_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_installations_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_installations_current_release_id_fkey"
            columns: ["current_release_id"]
            isOneToOne: false
            referencedRelation: "releases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_installations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      firebase_connections: {
        Row: {
          created_at: string
          created_by: string
          google_account: string
          id: string
          organization_id: string
          refresh_token_ciphertext: string | null
          scopes: string[]
          status: Database["public"]["Enums"]["connection_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          google_account?: string
          id?: string
          organization_id: string
          refresh_token_ciphertext?: string | null
          scopes?: string[]
          status?: Database["public"]["Enums"]["connection_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          google_account?: string
          id?: string
          organization_id?: string
          refresh_token_ciphertext?: string | null
          scopes?: string[]
          status?: Database["public"]["Enums"]["connection_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "firebase_connections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      firebase_projects: {
        Row: {
          created_at: string
          display_name: string
          firebase_connection_id: string | null
          firebase_project_id: string
          firestore_enabled: boolean
          google_account: string
          id: string
          last_verified_at: string | null
          organization_id: string
          permissions: Json
          project_number: string | null
          status: Database["public"]["Enums"]["connection_status"]
          storage_bucket: string | null
          storage_enabled: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          firebase_connection_id?: string | null
          firebase_project_id: string
          firestore_enabled?: boolean
          google_account?: string
          id?: string
          last_verified_at?: string | null
          organization_id: string
          permissions?: Json
          project_number?: string | null
          status?: Database["public"]["Enums"]["connection_status"]
          storage_bucket?: string | null
          storage_enabled?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          firebase_connection_id?: string | null
          firebase_project_id?: string
          firestore_enabled?: boolean
          google_account?: string
          id?: string
          last_verified_at?: string | null
          organization_id?: string
          permissions?: Json
          project_number?: string | null
          status?: Database["public"]["Enums"]["connection_status"]
          storage_bucket?: string | null
          storage_enabled?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "firebase_projects_firebase_connection_id_fkey"
            columns: ["firebase_connection_id"]
            isOneToOne: false
            referencedRelation: "firebase_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "firebase_projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          id: string
          organization_id: string
          read_at: string | null
          title: string
          tone: string
          user_id: string | null
        }
        Insert: {
          body?: string
          created_at?: string
          id?: string
          organization_id: string
          read_at?: string | null
          title: string
          tone?: string
          user_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          organization_id?: string
          read_at?: string | null
          title?: string
          tone?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_states: {
        Row: {
          code_verifier: string
          created_at: string
          organization_id: string
          redirect_to: string | null
          state: string
          user_id: string
        }
        Insert: {
          code_verifier: string
          created_at?: string
          organization_id: string
          redirect_to?: string | null
          state: string
          user_id: string
        }
        Update: {
          code_verifier?: string
          created_at?: string
          organization_id?: string
          redirect_to?: string | null
          state?: string
          user_id?: string
        }
        Relationships: []
      }
      organization_members: {
        Row: {
          created_at: string
          email: string
          id: string
          invited_by: string | null
          last_active_at: string | null
          name: string
          organization_id: string
          role: Database["public"]["Enums"]["org_role"]
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          invited_by?: string | null
          last_active_at?: string | null
          name?: string
          organization_id: string
          role?: Database["public"]["Enums"]["org_role"]
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          invited_by?: string | null
          last_active_at?: string | null
          name?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          created_by: string
          default_channel: string
          id: string
          name: string
          require_publish_confirmation: boolean
          slug: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          default_channel?: string
          id?: string
          name: string
          require_publish_confirmation?: boolean
          slug: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          default_channel?: string
          id?: string
          name?: string
          require_publish_confirmation?: boolean
          slug?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          id: string
          last_login_at: string | null
          name: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          id: string
          last_login_at?: string | null
          name?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          id?: string
          last_login_at?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      rate_limit_hits: {
        Row: {
          bucket: string
          created_at: string
          id: number
        }
        Insert: {
          bucket: string
          created_at?: string
          id?: number
        }
        Update: {
          bucket?: string
          created_at?: string
          id?: number
        }
        Relationships: []
      }
      release_assets: {
        Row: {
          content_type: string | null
          created_at: string
          hash: string | null
          id: string
          kind: string
          organization_id: string
          path: string
          release_id: string
          size_bytes: number
          status: string
        }
        Insert: {
          content_type?: string | null
          created_at?: string
          hash?: string | null
          id?: string
          kind: string
          organization_id: string
          path: string
          release_id: string
          size_bytes?: number
          status?: string
        }
        Update: {
          content_type?: string | null
          created_at?: string
          hash?: string | null
          id?: string
          kind?: string
          organization_id?: string
          path?: string
          release_id?: string
          size_bytes?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "release_assets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "release_assets_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "releases"
            referencedColumns: ["id"]
          },
        ]
      }
      releases: {
        Row: {
          app_id: string
          build_number: string | null
          bundle_hash: string | null
          bundle_size: number | null
          channel_id: string | null
          compressed_size: number | null
          created_at: string
          created_by: string | null
          created_by_label: string
          environment: string
          error_code: string | null
          error_message: string | null
          git_branch: string | null
          git_commit_sha: string | null
          id: string
          idempotency_key: string | null
          mandatory: boolean
          manifest: Json | null
          native_version_constraint: string
          number: number
          organization_id: string
          platform: Database["public"]["Enums"]["platform_type"]
          published_at: string | null
          release_notes: string
          rollout_percentage: number
          runtime_version: string
          status: Database["public"]["Enums"]["release_status"]
          storage_path: string | null
          external_bundle_url: string | null
          updated_at: string
          version: string
        }
        Insert: {
          app_id: string
          build_number?: string | null
          bundle_hash?: string | null
          bundle_size?: number | null
          channel_id?: string | null
          compressed_size?: number | null
          created_at?: string
          created_by?: string | null
          created_by_label?: string
          environment?: string
          error_code?: string | null
          error_message?: string | null
          git_branch?: string | null
          git_commit_sha?: string | null
          id?: string
          idempotency_key?: string | null
          mandatory?: boolean
          manifest?: Json | null
          native_version_constraint?: string
          number: number
          organization_id: string
          platform: Database["public"]["Enums"]["platform_type"]
          published_at?: string | null
          release_notes?: string
          rollout_percentage?: number
          runtime_version: string
          status?: Database["public"]["Enums"]["release_status"]
          storage_path?: string | null
          external_bundle_url?: string | null
          updated_at?: string
          version: string
        }
        Update: {
          app_id?: string
          build_number?: string | null
          bundle_hash?: string | null
          bundle_size?: number | null
          channel_id?: string | null
          compressed_size?: number | null
          created_at?: string
          created_by?: string | null
          created_by_label?: string
          environment?: string
          error_code?: string | null
          error_message?: string | null
          git_branch?: string | null
          git_commit_sha?: string | null
          id?: string
          idempotency_key?: string | null
          mandatory?: boolean
          manifest?: Json | null
          native_version_constraint?: string
          number?: number
          organization_id?: string
          platform?: Database["public"]["Enums"]["platform_type"]
          published_at?: string | null
          release_notes?: string
          rollout_percentage?: number
          runtime_version?: string
          status?: Database["public"]["Enums"]["release_status"]
          storage_path?: string | null
          external_bundle_url?: string | null
          updated_at?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "releases_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "releases_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "releases_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      rollouts: {
        Row: {
          app_id: string
          channel_id: string | null
          current_percentage: number
          id: string
          organization_id: string
          release_id: string
          rollback_threshold: number
          started_at: string
          status: string
          target_percentage: number
          updated_at: string
        }
        Insert: {
          app_id: string
          channel_id?: string | null
          current_percentage?: number
          id?: string
          organization_id: string
          release_id: string
          rollback_threshold?: number
          started_at?: string
          status?: string
          target_percentage?: number
          updated_at?: string
        }
        Update: {
          app_id?: string
          channel_id?: string | null
          current_percentage?: number
          id?: string
          organization_id?: string
          release_id?: string
          rollback_threshold?: number
          started_at?: string
          status?: string
          target_percentage?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rollouts_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rollouts_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rollouts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rollouts_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: true
            referencedRelation: "releases"
            referencedColumns: ["id"]
          },
        ]
      }
      storage_targets: {
        Row: {
          bucket: string | null
          config_ciphertext: string | null
          created_at: string
          endpoint: string | null
          id: string
          last_verified_at: string | null
          name: string
          organization_id: string
          provider: Database["public"]["Enums"]["storage_provider_type"]
          public_cdn_url: string | null
          region: string | null
          status: string
          updated_at: string
        }
        Insert: {
          bucket?: string | null
          config_ciphertext?: string | null
          created_at?: string
          endpoint?: string | null
          id?: string
          last_verified_at?: string | null
          name: string
          organization_id: string
          provider: Database["public"]["Enums"]["storage_provider_type"]
          public_cdn_url?: string | null
          region?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          bucket?: string | null
          config_ciphertext?: string | null
          created_at?: string
          endpoint?: string | null
          id?: string
          last_verified_at?: string | null
          name?: string
          organization_id?: string
          provider?: Database["public"]["Enums"]["storage_provider_type"]
          public_cdn_url?: string | null
          region?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "storage_targets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_deliveries: {
        Row: {
          attempt: number
          created_at: string
          error: string | null
          event: string
          id: string
          latency_ms: number | null
          organization_id: string
          status_code: number | null
          succeeded: boolean
          webhook_id: string
        }
        Insert: {
          attempt?: number
          created_at?: string
          error?: string | null
          event: string
          id?: string
          latency_ms?: number | null
          organization_id: string
          status_code?: number | null
          succeeded?: boolean
          webhook_id: string
        }
        Update: {
          attempt?: number
          created_at?: string
          error?: string | null
          event?: string
          id?: string
          latency_ms?: number | null
          organization_id?: string
          status_code?: number | null
          succeeded?: boolean
          webhook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_deliveries_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "webhooks"
            referencedColumns: ["id"]
          },
        ]
      }
      webhooks: {
        Row: {
          created_at: string
          created_by: string | null
          endpoint: string
          events: string[]
          id: string
          last_delivery_at: string | null
          organization_id: string
          secret: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          endpoint: string
          events?: string[]
          id?: string
          last_delivery_at?: string | null
          organization_id: string
          secret: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          endpoint?: string
          events?: string[]
          id?: string
          last_delivery_at?: string | null
          organization_id?: string
          secret?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhooks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_org_member: { Args: { _org: string; _user: string }; Returns: boolean }
      org_role_of: {
        Args: { _org: string; _user: string }
        Returns: Database["public"]["Enums"]["org_role"]
      }
      rate_limit_hit: {
        Args: { _bucket: string; _limit: number; _since: string }
        Returns: number
      }
    }
    Enums: {
      approval_status: "pending" | "approved" | "rejected" | "expired"
      connection_status:
        | "connected"
        | "degraded"
        | "auth_expired"
        | "permission_error"
        | "disconnected"
      org_role:
        | "owner"
        | "admin"
        | "release_manager"
        | "developer"
        | "viewer"
        | "agent"
      permission_mode: "allowed" | "denied" | "requires_approval"
      platform_type: "android" | "ios"
      release_status:
        | "draft"
        | "uploading"
        | "processing"
        | "ready"
        | "published"
        | "paused"
        | "rolled_back"
        | "archived"
        | "failed"
        | "deleted"
      storage_provider_type:
        | "s3"
        | "r2"
        | "gcs"
        | "minio"
        | "azure"
        | "firebase"
        | "external"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      approval_status: ["pending", "approved", "rejected", "expired"],
      connection_status: [
        "connected",
        "degraded",
        "auth_expired",
        "permission_error",
        "disconnected",
      ],
      org_role: [
        "owner",
        "admin",
        "release_manager",
        "developer",
        "viewer",
        "agent",
      ],
      permission_mode: ["allowed", "denied", "requires_approval"],
      platform_type: ["android", "ios"],
      release_status: [
        "draft",
        "uploading",
        "processing",
        "ready",
        "published",
        "paused",
        "rolled_back",
        "archived",
        "failed",
        "deleted",
      ],
      storage_provider_type: [
        "s3",
        "r2",
        "gcs",
        "minio",
        "azure",
        "firebase",
        "external",
      ],
    },
  },
} as const
