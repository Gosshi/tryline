export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      chat_free_questions: {
        Row: {
          created_at: string;
          match_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          match_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          match_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chat_free_questions_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "matches";
            referencedColumns: ["id"];
          },
        ];
      };
      chat_messages: {
        Row: {
          content: string;
          cost_usd: number | null;
          created_at: string;
          id: string;
          input_tokens: number | null;
          output_tokens: number | null;
          role: string;
          session_id: string;
        };
        Insert: {
          content: string;
          cost_usd?: number | null;
          created_at?: string;
          id?: string;
          input_tokens?: number | null;
          output_tokens?: number | null;
          role: string;
          session_id: string;
        };
        Update: {
          content?: string;
          cost_usd?: number | null;
          created_at?: string;
          id?: string;
          input_tokens?: number | null;
          output_tokens?: number | null;
          role?: string;
          session_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chat_messages_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "chat_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      chat_sessions: {
        Row: {
          created_at: string;
          id: string;
          match_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          match_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          match_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chat_sessions_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "matches";
            referencedColumns: ["id"];
          },
        ];
      };
      email_subscribers: {
        Row: {
          confirmation_token: string | null;
          confirmed_at: string | null;
          created_at: string;
          email: string;
          id: string;
          source: string;
          status: string;
          unsubscribed_at: string | null;
        };
        Insert: {
          confirmation_token?: string | null;
          confirmed_at?: string | null;
          created_at?: string;
          email: string;
          id?: string;
          source: string;
          status?: string;
          unsubscribed_at?: string | null;
        };
        Update: {
          confirmation_token?: string | null;
          confirmed_at?: string | null;
          created_at?: string;
          email?: string;
          id?: string;
          source?: string;
          status?: string;
          unsubscribed_at?: string | null;
        };
        Relationships: [];
      };
      competition_standings: {
        Row: {
          bonus_points_losing: number;
          bonus_points_try: number;
          competition_id: string;
          drawn: number;
          id: string;
          lost: number;
          played: number;
          points_against: number;
          points_for: number;
          position: number;
          team_id: string;
          total_points: number;
          tries_for: number;
          updated_at: string;
          won: number;
        };
        Insert: {
          bonus_points_losing?: number;
          bonus_points_try?: number;
          competition_id: string;
          drawn?: number;
          id?: string;
          lost?: number;
          played?: number;
          points_against?: number;
          points_for?: number;
          position: number;
          team_id: string;
          total_points?: number;
          tries_for?: number;
          updated_at?: string;
          won?: number;
        };
        Update: {
          bonus_points_losing?: number;
          bonus_points_try?: number;
          competition_id?: string;
          drawn?: number;
          id?: string;
          lost?: number;
          played?: number;
          points_against?: number;
          points_for?: number;
          position?: number;
          team_id?: string;
          total_points?: number;
          tries_for?: number;
          updated_at?: string;
          won?: number;
        };
        Relationships: [
          {
            foreignKeyName: "competition_standings_competition_id_fkey";
            columns: ["competition_id"];
            isOneToOne: false;
            referencedRelation: "competitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "competition_standings_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      competition_teams: {
        Row: {
          competition_id: string;
          team_id: string;
        };
        Insert: {
          competition_id: string;
          team_id: string;
        };
        Update: {
          competition_id?: string;
          team_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "competition_teams_competition_id_fkey";
            columns: ["competition_id"];
            isOneToOne: false;
            referencedRelation: "competitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "competition_teams_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      competition_pools: {
        Row: {
          competition_id: string;
          created_at: string;
          id: string;
          pool_name: string;
          team_id: string;
        };
        Insert: {
          competition_id: string;
          created_at?: string;
          id?: string;
          pool_name: string;
          team_id: string;
        };
        Update: {
          competition_id?: string;
          created_at?: string;
          id?: string;
          pool_name?: string;
          team_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "competition_pools_competition_id_fkey";
            columns: ["competition_id"];
            isOneToOne: false;
            referencedRelation: "competitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "competition_pools_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      competition_guides: {
        Row: {
          family: string;
          guide_ja: string;
          source_url: string | null;
          updated_at: string;
          verified_at: string | null;
        };
        Insert: {
          family: string;
          guide_ja: string;
          source_url?: string | null;
          updated_at?: string;
          verified_at?: string | null;
        };
        Update: {
          family?: string;
          guide_ja?: string;
          source_url?: string | null;
          updated_at?: string;
          verified_at?: string | null;
        };
        Relationships: [];
      };
      competitions: {
        Row: {
          champion: string | null;
          country: string | null;
          created_at: string;
          end_date: string | null;
          family: string;
          id: string;
          name: string;
          name_ja: string | null;
          season: string;
          slug: string;
          start_date: string | null;
          updated_at: string;
        };
        Insert: {
          champion?: string | null;
          country?: string | null;
          created_at?: string;
          end_date?: string | null;
          family: string;
          id?: string;
          name: string;
          name_ja?: string | null;
          season: string;
          slug: string;
          start_date?: string | null;
          updated_at?: string;
        };
        Update: {
          champion?: string | null;
          country?: string | null;
          created_at?: string;
          end_date?: string | null;
          family?: string;
          id?: string;
          name?: string;
          name_ja?: string | null;
          season?: string;
          slug?: string;
          start_date?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      match_chats: {
        Row: {
          created_at: string;
          id: string;
          match_id: string;
          messages: Json;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          match_id: string;
          messages?: Json;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          match_id?: string;
          messages?: Json;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "match_chats_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "matches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "match_chats_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      match_broadcasts: {
        Row: {
          created_at: string;
          display_order: number;
          id: string;
          kind: string;
          match_id: string;
          service_name: string;
          source_url: string | null;
          url: string;
          verified_at: string;
        };
        Insert: {
          created_at?: string;
          display_order?: number;
          id?: string;
          kind: string;
          match_id: string;
          service_name: string;
          source_url?: string | null;
          url: string;
          verified_at?: string;
        };
        Update: {
          created_at?: string;
          display_order?: number;
          id?: string;
          kind?: string;
          match_id?: string;
          service_name?: string;
          source_url?: string | null;
          url?: string;
          verified_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "match_broadcasts_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "matches";
            referencedColumns: ["id"];
          },
        ];
      };
      news_links: {
        Row: {
          created_at: string;
          id: string;
          matched_match_id: string | null;
          notified_at: string | null;
          published_at: string | null;
          source_domain: string;
          source_url: string;
          title: string;
          title_ja: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          matched_match_id?: string | null;
          notified_at?: string | null;
          published_at?: string | null;
          source_domain: string;
          source_url: string;
          title: string;
          title_ja?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          matched_match_id?: string | null;
          notified_at?: string | null;
          published_at?: string | null;
          source_domain?: string;
          source_url?: string;
          title?: string;
          title_ja?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "news_links_matched_match_id_fkey";
            columns: ["matched_match_id"];
            isOneToOne: false;
            referencedRelation: "matches";
            referencedColumns: ["id"];
          },
        ];
      };
      match_content: {
        Row: {
          content_md: string;
          content_type: string;
          discord_notified_at: string | null;
          generated_at: string;
          id: string;
          language: string;
          match_id: string;
          model_version: string;
          prompt_version: string;
          qa_scores: Json;
          status: string;
          x_posted_at: string | null;
          x_tweet_id: string | null;
        };
        Insert: {
          content_md: string;
          content_type: string;
          discord_notified_at?: string | null;
          generated_at?: string;
          id?: string;
          language?: string;
          match_id: string;
          model_version: string;
          prompt_version: string;
          qa_scores: Json;
          status?: string;
          x_posted_at?: string | null;
          x_tweet_id?: string | null;
        };
        Update: {
          content_md?: string;
          content_type?: string;
          discord_notified_at?: string | null;
          generated_at?: string;
          id?: string;
          language?: string;
          match_id?: string;
          model_version?: string;
          prompt_version?: string;
          qa_scores?: Json;
          status?: string;
          x_posted_at?: string | null;
          x_tweet_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "match_content_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "matches";
            referencedColumns: ["id"];
          },
        ];
      };
      youtube_videos: {
        Row: {
          can_embed: boolean;
          channel_id: string;
          context: Json | null;
          title: string | null;
          verified_at: string;
          video_id: string;
        };
        Insert: {
          can_embed?: boolean;
          channel_id: string;
          context?: Json | null;
          title?: string | null;
          verified_at: string;
          video_id: string;
        };
        Update: {
          can_embed?: boolean;
          channel_id?: string;
          context?: Json | null;
          title?: string | null;
          verified_at?: string;
          video_id?: string;
        };
        Relationships: [];
      };
      match_sourced_facts: {
        Row: {
          confidence: string;
          content_type: string;
          fact: string;
          fact_ja: string | null;
          fetched_at: string;
          id: string;
          match_id: string;
          metadata: Json;
          model_version: string;
          source_domain: string;
          source_url: string;
        };
        Insert: {
          confidence: string;
          content_type: string;
          fact: string;
          fact_ja?: string | null;
          fetched_at?: string;
          id?: string;
          match_id: string;
          metadata?: Json;
          model_version: string;
          source_domain: string;
          source_url: string;
        };
        Update: {
          confidence?: string;
          content_type?: string;
          fact?: string;
          fact_ja?: string | null;
          fetched_at?: string;
          id?: string;
          match_id?: string;
          metadata?: Json;
          model_version?: string;
          source_domain?: string;
          source_url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "match_sourced_facts_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "matches";
            referencedColumns: ["id"];
          },
        ];
      };
      match_team_stats: {
        Row: {
          carries: number | null;
          created_at: string;
          errors: number | null;
          id: string;
          lineouts_total: number | null;
          lineouts_won: number | null;
          match_id: string;
          penalties_conceded: number | null;
          possession_pct: number | null;
          red_cards: number | null;
          scrums_total: number | null;
          scrums_won: number | null;
          source: string;
          source_url: string;
          tackles_made: number | null;
          tackles_missed: number | null;
          team_id: string;
          territory_pct: number | null;
          yellow_cards: number | null;
        };
        Insert: {
          carries?: number | null;
          created_at?: string;
          errors?: number | null;
          id?: string;
          lineouts_total?: number | null;
          lineouts_won?: number | null;
          match_id: string;
          penalties_conceded?: number | null;
          possession_pct?: number | null;
          red_cards?: number | null;
          scrums_total?: number | null;
          scrums_won?: number | null;
          source?: string;
          source_url: string;
          tackles_made?: number | null;
          tackles_missed?: number | null;
          team_id: string;
          territory_pct?: number | null;
          yellow_cards?: number | null;
        };
        Update: {
          carries?: number | null;
          created_at?: string;
          errors?: number | null;
          id?: string;
          lineouts_total?: number | null;
          lineouts_won?: number | null;
          match_id?: string;
          penalties_conceded?: number | null;
          possession_pct?: number | null;
          red_cards?: number | null;
          scrums_total?: number | null;
          scrums_won?: number | null;
          source?: string;
          source_url?: string;
          tackles_made?: number | null;
          tackles_missed?: number | null;
          team_id?: string;
          territory_pct?: number | null;
          yellow_cards?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "match_team_stats_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "matches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "match_team_stats_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      match_events: {
        Row: {
          created_at: string;
          id: string;
          match_id: string;
          metadata: Json;
          minute: number | null;
          player_id: string | null;
          team_id: string;
          type: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          match_id: string;
          metadata?: Json;
          minute?: number | null;
          player_id?: string | null;
          team_id: string;
          type: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          match_id?: string;
          metadata?: Json;
          minute?: number | null;
          player_id?: string | null;
          team_id?: string;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "match_events_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "matches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "match_events_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: false;
            referencedRelation: "players";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "match_events_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      match_lineups: {
        Row: {
          announced_at: string | null;
          created_at: string;
          id: string;
          is_starter: boolean;
          jersey_number: number;
          match_id: string;
          player_id: string;
          source_url: string;
          team_id: string;
          updated_at: string;
        };
        Insert: {
          announced_at?: string | null;
          created_at?: string;
          id?: string;
          is_starter?: boolean;
          jersey_number: number;
          match_id: string;
          player_id: string;
          source_url: string;
          team_id: string;
          updated_at?: string;
        };
        Update: {
          announced_at?: string | null;
          created_at?: string;
          id?: string;
          is_starter?: boolean;
          jersey_number?: number;
          match_id?: string;
          player_id?: string;
          source_url?: string;
          team_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "match_lineups_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "matches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "match_lineups_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: false;
            referencedRelation: "players";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "match_lineups_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      match_raw_data: {
        Row: {
          expires_at: string;
          fetched_at: string;
          id: string;
          match_id: string;
          payload: Json;
          source: string;
          source_url: string;
        };
        Insert: {
          expires_at?: string;
          fetched_at?: string;
          id?: string;
          match_id: string;
          payload: Json;
          source: string;
          source_url: string;
        };
        Update: {
          expires_at?: string;
          fetched_at?: string;
          id?: string;
          match_id?: string;
          payload?: Json;
          source?: string;
          source_url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "match_raw_data_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "matches";
            referencedColumns: ["id"];
          },
        ];
      };
      matches: {
        Row: {
          away_score: number | null;
          away_team_id: string;
          broadcast_jp_url: string | null;
          competition_id: string;
          created_at: string;
          external_ids: Json;
          home_score: number | null;
          home_team_id: string;
          id: string;
          kickoff_at: string;
          status: string;
          updated_at: string;
          venue: string | null;
        };
        Insert: {
          away_score?: number | null;
          away_team_id: string;
          broadcast_jp_url?: string | null;
          competition_id: string;
          created_at?: string;
          external_ids?: Json;
          home_score?: number | null;
          home_team_id: string;
          id?: string;
          kickoff_at: string;
          status?: string;
          updated_at?: string;
          venue?: string | null;
        };
        Update: {
          away_score?: number | null;
          away_team_id?: string;
          broadcast_jp_url?: string | null;
          competition_id?: string;
          created_at?: string;
          external_ids?: Json;
          home_score?: number | null;
          home_team_id?: string;
          id?: string;
          kickoff_at?: string;
          status?: string;
          updated_at?: string;
          venue?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "matches_away_team_id_fkey";
            columns: ["away_team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "matches_competition_id_fkey";
            columns: ["competition_id"];
            isOneToOne: false;
            referencedRelation: "competitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "matches_home_team_id_fkey";
            columns: ["home_team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      sample_matches: {
        Row: {
          match_id: string;
          rank: number;
          selected_at: string;
          selection_reason: string | null;
        };
        Insert: {
          match_id: string;
          rank: number;
          selected_at?: string;
          selection_reason?: string | null;
        };
        Update: {
          match_id?: string;
          rank?: number;
          selected_at?: string;
          selection_reason?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "sample_matches_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: true;
            referencedRelation: "matches";
            referencedColumns: ["id"];
          },
        ];
      };
      pipeline_runs: {
        Row: {
          content_type: string;
          cost_usd: number | null;
          created_at: string;
          duration_ms: number | null;
          error_message: string | null;
          id: string;
          input_hash: string | null;
          match_id: string | null;
          output: Json | null;
          stage: number;
          status: string | null;
        };
        Insert: {
          content_type: string;
          cost_usd?: number | null;
          created_at?: string;
          duration_ms?: number | null;
          error_message?: string | null;
          id?: string;
          input_hash?: string | null;
          match_id?: string | null;
          output?: Json | null;
          stage: number;
          status?: string | null;
        };
        Update: {
          content_type?: string;
          cost_usd?: number | null;
          created_at?: string;
          duration_ms?: number | null;
          error_message?: string | null;
          id?: string;
          input_hash?: string | null;
          match_id?: string | null;
          output?: Json | null;
          stage?: number;
          status?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "pipeline_runs_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "matches";
            referencedColumns: ["id"];
          },
        ];
      };
      players: {
        Row: {
          caps: number | null;
          canonical_player_id: string | null;
          created_at: string;
          date_of_birth: string | null;
          external_ids: Json;
          id: string;
          name: string;
          name_ja: string | null;
          position: string | null;
          slug: string;
          team_id: string;
          updated_at: string;
        };
        Insert: {
          caps?: number | null;
          canonical_player_id?: string | null;
          created_at?: string;
          date_of_birth?: string | null;
          external_ids?: Json;
          id?: string;
          name: string;
          name_ja?: string | null;
          position?: string | null;
          slug?: string;
          team_id: string;
          updated_at?: string;
        };
        Update: {
          caps?: number | null;
          canonical_player_id?: string | null;
          created_at?: string;
          date_of_birth?: string | null;
          external_ids?: Json;
          id?: string;
          name?: string;
          name_ja?: string | null;
          position?: string | null;
          slug?: string;
          team_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "players_canonical_player_id_fkey";
            columns: ["canonical_player_id"];
            isOneToOne: false;
            referencedRelation: "players";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "players_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      expo_push_tokens: {
        Row: {
          created_at: string;
          id: string;
          last_used_at: string | null;
          notify_content: boolean;
          notify_prematch: boolean;
          spoiler_guard: boolean;
          team_slugs: string[];
          token: string;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          last_used_at?: string | null;
          notify_content?: boolean;
          notify_prematch?: boolean;
          spoiler_guard?: boolean;
          team_slugs?: string[];
          token: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          last_used_at?: string | null;
          notify_content?: boolean;
          notify_prematch?: boolean;
          spoiler_guard?: boolean;
          team_slugs?: string[];
          token?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "expo_push_tokens_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      push_notification_log: {
        Row: {
          id: string;
          kind: string;
          match_id: string;
          sent_at: string;
          sent_count: number;
        };
        Insert: {
          id?: string;
          kind: string;
          match_id: string;
          sent_at?: string;
          sent_count?: number;
        };
        Update: {
          id?: string;
          kind?: string;
          match_id?: string;
          sent_at?: string;
          sent_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "push_notification_log_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "matches";
            referencedColumns: ["id"];
          },
        ];
      };
      push_subscriptions: {
        Row: {
          auth_key: string;
          created_at: string;
          endpoint: string;
          id: string;
          last_used_at: string | null;
          p256dh: string;
          spoiler_guard: boolean;
          team_slugs: string[];
          user_id: string | null;
        };
        Insert: {
          auth_key: string;
          created_at?: string;
          endpoint: string;
          id?: string;
          last_used_at?: string | null;
          p256dh: string;
          spoiler_guard?: boolean;
          team_slugs?: string[];
          user_id?: string | null;
        };
        Update: {
          auth_key?: string;
          created_at?: string;
          endpoint?: string;
          id?: string;
          last_used_at?: string | null;
          p256dh?: string;
          spoiler_guard?: boolean;
          team_slugs?: string[];
          user_id?: string | null;
        };
        Relationships: [];
      };
      teams: {
        Row: {
          country: string;
          created_at: string;
          english_name: string | null;
          external_ids: Json;
          flag_code: string | null;
          id: string;
          kind: string;
          logo_url: string | null;
          name: string;
          name_ja: string | null;
          short_code: string | null;
          slug: string;
          updated_at: string;
          world_ranking: number | null;
          world_ranking_updated_at: string | null;
        };
        Insert: {
          country: string;
          created_at?: string;
          english_name?: string | null;
          external_ids?: Json;
          flag_code?: string | null;
          id?: string;
          kind?: string;
          logo_url?: string | null;
          name: string;
          name_ja?: string | null;
          short_code?: string | null;
          slug: string;
          updated_at?: string;
          world_ranking?: number | null;
          world_ranking_updated_at?: string | null;
        };
        Update: {
          country?: string;
          created_at?: string;
          english_name?: string | null;
          external_ids?: Json;
          flag_code?: string | null;
          id?: string;
          kind?: string;
          logo_url?: string | null;
          name?: string;
          name_ja?: string | null;
          short_code?: string | null;
          slug?: string;
          updated_at?: string;
          world_ranking?: number | null;
          world_ranking_updated_at?: string | null;
        };
        Relationships: [];
      };
      users: {
        Row: {
          created_at: string;
          display_name: string | null;
          email: string;
          id: string;
          interests: Json;
          plan: string;
          stripe_customer_id: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          display_name?: string | null;
          email: string;
          id: string;
          interests?: Json;
          plan?: string;
          stripe_customer_id?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          display_name?: string | null;
          email?: string;
          id?: string;
          interests?: Json;
          plan?: string;
          stripe_customer_id?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_profiles: {
        Row: {
          chat_daily_count: number;
          chat_daily_reset_date: string;
          created_at: string;
          current_period_end: string | null;
          display_name: string | null;
          favorite_team_slugs: string[];
          id: string;
          premium_source: string | null;
          premium_until: string | null;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          subscription_status: string;
          updated_at: string;
        };
        Insert: {
          chat_daily_count?: number;
          chat_daily_reset_date?: string;
          created_at?: string;
          current_period_end?: string | null;
          display_name?: string | null;
          favorite_team_slugs?: string[];
          id: string;
          premium_source?: string | null;
          premium_until?: string | null;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          subscription_status?: string;
          updated_at?: string;
        };
        Update: {
          chat_daily_count?: number;
          chat_daily_reset_date?: string;
          created_at?: string;
          current_period_end?: string | null;
          display_name?: string | null;
          favorite_team_slugs?: string[];
          id?: string;
          premium_source?: string | null;
          premium_until?: string | null;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          subscription_status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
