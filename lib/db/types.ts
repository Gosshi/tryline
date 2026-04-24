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
      competitions: {
        Row: {
          country: string | null;
          created_at: string;
          end_date: string | null;
          id: string;
          name: string;
          season: string;
          slug: string;
          start_date: string | null;
          updated_at: string;
        };
        Insert: {
          country?: string | null;
          created_at?: string;
          end_date?: string | null;
          id?: string;
          name: string;
          season: string;
          slug: string;
          start_date?: string | null;
          updated_at?: string;
        };
        Update: {
          country?: string | null;
          created_at?: string;
          end_date?: string | null;
          id?: string;
          name?: string;
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
      match_content: {
        Row: {
          content_md_ja: string;
          content_type: string;
          generated_at: string;
          id: string;
          match_id: string;
          model_version: string;
          prompt_version: string;
          qa_scores: Json;
          status: string;
        };
        Insert: {
          content_md_ja: string;
          content_type: string;
          generated_at?: string;
          id?: string;
          match_id: string;
          model_version: string;
          prompt_version: string;
          qa_scores: Json;
          status?: string;
        };
        Update: {
          content_md_ja?: string;
          content_type?: string;
          generated_at?: string;
          id?: string;
          match_id?: string;
          model_version?: string;
          prompt_version?: string;
          qa_scores?: Json;
          status?: string;
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
      match_events: {
        Row: {
          created_at: string;
          id: string;
          match_id: string;
          metadata: Json;
          minute: number;
          player_id: string | null;
          team_id: string;
          type: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          match_id: string;
          metadata?: Json;
          minute: number;
          player_id?: string | null;
          team_id: string;
          type: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          match_id?: string;
          metadata?: Json;
          minute?: number;
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
          created_at: string;
          date_of_birth: string | null;
          external_ids: Json;
          id: string;
          name: string;
          position: string | null;
          team_id: string;
          updated_at: string;
        };
        Insert: {
          caps?: number | null;
          created_at?: string;
          date_of_birth?: string | null;
          external_ids?: Json;
          id?: string;
          name: string;
          position?: string | null;
          team_id: string;
          updated_at?: string;
        };
        Update: {
          caps?: number | null;
          created_at?: string;
          date_of_birth?: string | null;
          external_ids?: Json;
          id?: string;
          name?: string;
          position?: string | null;
          team_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "players_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      teams: {
        Row: {
          country: string;
          created_at: string;
          external_ids: Json;
          id: string;
          logo_url: string | null;
          name: string;
          short_code: string | null;
          slug: string;
          updated_at: string;
        };
        Insert: {
          country: string;
          created_at?: string;
          external_ids?: Json;
          id?: string;
          logo_url?: string | null;
          name: string;
          short_code?: string | null;
          slug: string;
          updated_at?: string;
        };
        Update: {
          country?: string;
          created_at?: string;
          external_ids?: Json;
          id?: string;
          logo_url?: string | null;
          name?: string;
          short_code?: string | null;
          slug?: string;
          updated_at?: string;
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
