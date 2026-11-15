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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          after_data: Json | null
          before_data: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          request_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          request_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          request_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          published_at: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          published_at?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          published_at?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      comments: {
        Row: {
          body: string
          content_id: string
          created_at: string
          deleted_at: string | null
          id: string
          parent_comment_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          content_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          parent_comment_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          content_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          parent_comment_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      content_items: {
        Row: {
          banner_asset_id: string | null
          content_type: string
          created_at: string
          description: string | null
          id: string
          is_featured: boolean | null
          is_new: boolean | null
          language: string | null
          legacy_created_date: string | null
          legacy_id: number
          narrator: string | null
          narrator_image_asset_id: string | null
          poster_asset_id: string | null
          published_at: string | null
          quality: string | null
          release_year: number | null
          slug: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          banner_asset_id?: string | null
          content_type: string
          created_at?: string
          description?: string | null
          id?: string
          is_featured?: boolean | null
          is_new?: boolean | null
          language?: string | null
          legacy_created_date?: string | null
          legacy_id: number
          narrator?: string | null
          narrator_image_asset_id?: string | null
          poster_asset_id?: string | null
          published_at?: string | null
          quality?: string | null
          release_year?: number | null
          slug: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          banner_asset_id?: string | null
          content_type?: string
          created_at?: string
          description?: string | null
          id?: string
          is_featured?: boolean | null
          is_new?: boolean | null
          language?: string | null
          legacy_created_date?: string | null
          legacy_id?: number
          narrator?: string | null
          narrator_image_asset_id?: string | null
          poster_asset_id?: string | null
          published_at?: string | null
          quality?: string | null
          release_year?: number | null
          slug?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_banner_asset_fk"
            columns: ["banner_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_narrator_asset_fk"
            columns: ["narrator_image_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_poster_asset_fk"
            columns: ["poster_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          joined_at: string
          left_at: string | null
          user_id: string
        }
        Insert: {
          conversation_id: string
          joined_at?: string
          left_at?: string | null
          user_id: string
        }
        Update: {
          conversation_id?: string
          joined_at?: string
          left_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          closed_at: string | null
          conversation_type: string
          created_at: string
          created_by: string | null
          direct_user_high: string | null
          direct_user_low: string | null
          id: string
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          conversation_type?: string
          created_at?: string
          created_by?: string | null
          direct_user_high?: string | null
          direct_user_low?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          conversation_type?: string
          created_at?: string
          created_by?: string | null
          direct_user_high?: string | null
          direct_user_low?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_direct_user_high_fkey"
            columns: ["direct_user_high"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_direct_user_low_fkey"
            columns: ["direct_user_low"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      episodes: {
        Row: {
          created_at: string
          description: string | null
          duration_seconds: number | null
          episode_number: number
          id: string
          legacy_id: string | null
          published_at: string | null
          quality: string | null
          season_id: string
          status: string
          thumbnail_asset_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          episode_number: number
          id?: string
          legacy_id?: string | null
          published_at?: string | null
          quality?: string | null
          season_id: string
          status?: string
          thumbnail_asset_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          episode_number?: number
          id?: string
          legacy_id?: string | null
          published_at?: string | null
          quality?: string | null
          season_id?: string
          status?: string
          thumbnail_asset_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "episode_thumbnail_asset_fk"
            columns: ["thumbnail_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episodes_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      external_links: {
        Row: {
          content_id: string
          created_at: string
          id: string
          is_active: boolean
          label: string
          link_kind: string
          sort_order: number
          url: string
        }
        Insert: {
          content_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          link_kind: string
          sort_order?: number
          url: string
        }
        Update: {
          content_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          link_kind?: string
          sort_order?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_links_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          content_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          content_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          content_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      genres: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      media_assets: {
        Row: {
          asset_type: string
          bucket: string | null
          byte_size: number | null
          created_at: string
          created_by: string | null
          height: number | null
          id: string
          mime_type: string | null
          object_key: string
          provider: string
          width: number | null
        }
        Insert: {
          asset_type: string
          bucket?: string | null
          byte_size?: number | null
          created_at?: string
          created_by?: string | null
          height?: number | null
          id?: string
          mime_type?: string | null
          object_key: string
          provider: string
          width?: number | null
        }
        Update: {
          asset_type?: string
          bucket?: string | null
          byte_size?: number | null
          created_at?: string
          created_by?: string | null
          height?: number | null
          id?: string
          mime_type?: string | null
          object_key?: string
          provider?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "media_asset_creator_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      media_sources: {
        Row: {
          created_at: string
          created_by: string | null
          episode_id: string | null
          external_reference: string
          id: string
          is_active: boolean
          is_primary: boolean
          is_public: boolean
          language: string | null
          movie_part_id: string | null
          provider: string | null
          quality: string | null
          sort_order: number
          source_kind: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          episode_id?: string | null
          external_reference: string
          id?: string
          is_active?: boolean
          is_primary?: boolean
          is_public?: boolean
          language?: string | null
          movie_part_id?: string | null
          provider?: string | null
          quality?: string | null
          sort_order?: number
          source_kind: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          episode_id?: string | null
          external_reference?: string
          id?: string
          is_active?: boolean
          is_primary?: boolean
          is_public?: boolean
          language?: string | null
          movie_part_id?: string | null
          provider?: string | null
          quality?: string | null
          sort_order?: number
          source_kind?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_source_creator_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_sources_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_sources_movie_part_id_fkey"
            columns: ["movie_part_id"]
            isOneToOne: false
            referencedRelation: "movie_parts"
            referencedColumns: ["id"]
          },
        ]
      }
      message_attachments: {
        Row: {
          created_at: string
          id: string
          media_asset_id: string
          message_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          media_asset_id: string
          message_id: string
        }
        Update: {
          created_at?: string
          id?: string
          media_asset_id?: string
          message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_attachments_media_asset_id_fkey"
            columns: ["media_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_read_receipts: {
        Row: {
          message_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          message_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          message_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_read_receipts_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_read_receipts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reports: {
        Row: {
          assigned_to: string | null
          created_at: string
          details: string | null
          id: string
          message_id: string
          reason: string
          reporter_id: string
          resolved_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          details?: string | null
          id?: string
          message_id: string
          reason: string
          reporter_id: string
          resolved_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          details?: string | null
          id?: string
          message_id?: string
          reason?: string
          reporter_id?: string
          resolved_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reports_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reports_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string | null
          conversation_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          moderation_status: string
          sender_id: string
        }
        Insert: {
          body?: string | null
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          moderation_status?: string
          sender_id: string
        }
        Update: {
          body?: string | null
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          moderation_status?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_actions: {
        Row: {
          action: string
          comment_id: string | null
          created_at: string
          id: string
          message_id: string | null
          message_report_id: string | null
          moderator_id: string | null
          reason: string | null
          report_id: string | null
          review_id: string | null
        }
        Insert: {
          action: string
          comment_id?: string | null
          created_at?: string
          id?: string
          message_id?: string | null
          message_report_id?: string | null
          moderator_id?: string | null
          reason?: string | null
          report_id?: string | null
          review_id?: string | null
        }
        Update: {
          action?: string
          comment_id?: string | null
          created_at?: string
          id?: string
          message_id?: string | null
          message_report_id?: string | null
          moderator_id?: string | null
          reason?: string | null
          report_id?: string | null
          review_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "moderation_actions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_actions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_actions_message_report_id_fkey"
            columns: ["message_report_id"]
            isOneToOne: false
            referencedRelation: "message_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_actions_moderator_id_fkey"
            columns: ["moderator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_actions_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_actions_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      movie_genres: {
        Row: {
          created_at: string
          genre_id: string
          movie_id: string
        }
        Insert: {
          created_at?: string
          genre_id: string
          movie_id: string
        }
        Update: {
          created_at?: string
          genre_id?: string
          movie_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "movie_genres_genre_id_fkey"
            columns: ["genre_id"]
            isOneToOne: false
            referencedRelation: "genres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movie_genres_movie_id_fkey"
            columns: ["movie_id"]
            isOneToOne: false
            referencedRelation: "movies"
            referencedColumns: ["content_id"]
          },
        ]
      }
      movie_parts: {
        Row: {
          created_at: string
          id: string
          legacy_id: string | null
          movie_id: string
          part_number: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          legacy_id?: string | null
          movie_id: string
          part_number: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          legacy_id?: string | null
          movie_id?: string
          part_number?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "movie_parts_movie_id_fkey"
            columns: ["movie_id"]
            isOneToOne: false
            referencedRelation: "movies"
            referencedColumns: ["content_id"]
          },
        ]
      }
      movies: {
        Row: {
          category_id: string | null
          content_id: string
          rating: number | null
          views_label: string | null
        }
        Insert: {
          category_id?: string | null
          content_id: string
          rating?: number | null
          views_label?: string | null
        }
        Update: {
          category_id?: string | null
          content_id?: string
          rating?: number | null
          views_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movies_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movies_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: true
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          email_enabled: boolean
          in_app_enabled: boolean
          notification_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          email_enabled?: boolean
          in_app_enabled?: boolean
          notification_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          email_enabled?: boolean
          in_app_enabled?: boolean
          notification_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_url: string | null
          announcement_id: string | null
          content_item_id: string | null
          created_at: string
          deduplication_key: string | null
          episode_id: string | null
          id: string
          message: string
          message_id: string | null
          notification_type: string
          read_at: string | null
          recipient_id: string
          title: string
        }
        Insert: {
          action_url?: string | null
          announcement_id?: string | null
          content_item_id?: string | null
          created_at?: string
          deduplication_key?: string | null
          episode_id?: string | null
          id?: string
          message: string
          message_id?: string | null
          notification_type: string
          read_at?: string | null
          recipient_id: string
          title: string
        }
        Update: {
          action_url?: string | null
          announcement_id?: string | null
          content_item_id?: string | null
          created_at?: string
          deduplication_key?: string | null
          episode_id?: string | null
          id?: string
          message?: string
          message_id?: string | null
          notification_type?: string
          read_at?: string | null
          recipient_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          description: string | null
          id: number
          name: string
        }
        Insert: {
          description?: string | null
          id?: number
          name: string
        }
        Update: {
          description?: string | null
          id?: number
          name?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_status: string
          display_name: string | null
          id: string
          profile_picture_asset_id: string | null
          registered_at: string
          updated_at: string
        }
        Insert: {
          account_status?: string
          display_name?: string | null
          id: string
          profile_picture_asset_id?: string | null
          registered_at?: string
          updated_at?: string
        }
        Update: {
          account_status?: string
          display_name?: string | null
          id?: string
          profile_picture_asset_id?: string | null
          registered_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_profile_picture_asset_id_fkey"
            columns: ["profile_picture_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          assigned_to: string | null
          comment_id: string | null
          content_item_id: string | null
          created_at: string
          details: string | null
          id: string
          reason: string
          reporter_id: string
          resolved_at: string | null
          review_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          comment_id?: string | null
          content_item_id?: string | null
          created_at?: string
          details?: string | null
          id?: string
          reason: string
          reporter_id: string
          resolved_at?: string | null
          review_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          comment_id?: string | null
          content_item_id?: string | null
          created_at?: string
          details?: string | null
          id?: string
          reason?: string
          reporter_id?: string
          resolved_at?: string | null
          review_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          body: string
          content_id: string
          created_at: string
          deleted_at: string | null
          id: string
          status: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          content_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          status?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          content_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          status?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          permission_id: number
          role_id: number
        }
        Insert: {
          permission_id: number
          role_id: number
        }
        Update: {
          permission_id?: number
          role_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          description: string | null
          id: number
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: number
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: number
          name?: string
        }
        Relationships: []
      }
      seasons: {
        Row: {
          created_at: string
          id: string
          legacy_id: string | null
          season_number: number
          series_id: string
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          legacy_id?: string | null
          season_number: number
          series_id: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          legacy_id?: string | null
          season_number?: number
          series_id?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seasons_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series"
            referencedColumns: ["content_id"]
          },
        ]
      }
      series: {
        Row: {
          content_id: string
          views_label: string | null
        }
        Insert: {
          content_id: string
          views_label?: string | null
        }
        Update: {
          content_id?: string
          views_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "series_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: true
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
        ]
      }
      series_genres: {
        Row: {
          created_at: string
          genre_id: string
          series_id: string
        }
        Insert: {
          created_at?: string
          genre_id: string
          series_id: string
        }
        Update: {
          created_at?: string
          genre_id?: string
          series_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "series_genres_genre_id_fkey"
            columns: ["genre_id"]
            isOneToOne: false
            referencedRelation: "genres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "series_genres_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series"
            referencedColumns: ["content_id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          preferred_language: string | null
          theme: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          preferred_language?: string | null
          theme?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          preferred_language?: string | null
          theme?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_ratings: {
        Row: {
          content_id: string
          created_at: string
          id: string
          rating: number
          updated_at: string
          user_id: string
        }
        Insert: {
          content_id: string
          created_at?: string
          id?: string
          rating: number
          updated_at?: string
          user_id: string
        }
        Update: {
          content_id?: string
          created_at?: string
          id?: string
          rating?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_ratings_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_ratings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          granted_at: string
          granted_by: string | null
          role_id: number
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          role_id: number
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          role_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      watch_history: {
        Row: {
          duration_seconds: number | null
          episode_id: string | null
          id: string
          is_completed: boolean
          last_watched_at: string
          movie_part_id: string | null
          position_seconds: number
          user_id: string
        }
        Insert: {
          duration_seconds?: number | null
          episode_id?: string | null
          id?: string
          is_completed?: boolean
          last_watched_at?: string
          movie_part_id?: string | null
          position_seconds?: number
          user_id: string
        }
        Update: {
          duration_seconds?: number | null
          episode_id?: string | null
          id?: string
          is_completed?: boolean
          last_watched_at?: string
          movie_part_id?: string | null
          position_seconds?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watch_history_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watch_history_movie_part_id_fkey"
            columns: ["movie_part_id"]
            isOneToOne: false
            referencedRelation: "movie_parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watch_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      watchlist_items: {
        Row: {
          added_at: string
          content_id: string
          watchlist_id: string
        }
        Insert: {
          added_at?: string
          content_id: string
          watchlist_id: string
        }
        Update: {
          added_at?: string
          content_id?: string
          watchlist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlist_items_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watchlist_items_watchlist_id_fkey"
            columns: ["watchlist_id"]
            isOneToOne: false
            referencedRelation: "watchlists"
            referencedColumns: ["id"]
          },
        ]
      }
      watchlists: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlists_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_direct_conversation: {
        Args: { target_user_id: string }
        Returns: string
      }
      get_support_contact_id: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_content_discussion: {
        Args: { target_content_id: string }
        Returns: {
          entry_kind: string
          id: string
          user_id: string
          author_name: string
          parent_comment_id: string | null
          title: string | null
          body: string
          status: string
          created_at: string
          updated_at: string
          deleted_at: string | null
        }[]
      }
      get_unread_message_count: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      get_reported_message_for_moderation: {
        Args: { target_message_id: string }
        Returns: Json
      }
      has_permission: { Args: { permission_name: string }; Returns: boolean }
      is_active_user: { Args: never; Returns: boolean }
      is_blocked_between: {
        Args: { user_a: string; user_b: string }
        Returns: boolean
      }
      is_conversation_participant: {
        Args: { target_conversation_id: string }
        Returns: boolean
      }
      moderate_content: {
        Args: {
          action_reason?: string
          next_status: string
          target_id: string
          target_kind: string
        }
        Returns: undefined
      }
      search_message_recipients: {
        Args: { search_term: string }
        Returns: { display_name: string; user_id: string }[]
      }
      set_account_status: {
        Args: { next_status: string; target_user: string }
        Returns: undefined
      }
      set_role_permission: {
        Args: {
          permission_name: string
          role_name: string
          should_have_permission: boolean
        }
        Returns: undefined
      }
      set_user_role: {
        Args: {
          role_name: string
          should_have_role: boolean
          target_user: string
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
