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
      conversations: {
        Row: {
          created_at: string
          id: string
          mode: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mode?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mode?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      learning_items: {
        Row: {
          conversation_id: string | null
          correction: string | null
          created_at: string
          explanation_pt: string | null
          id: string
          kind: Database["public"]["Enums"]["learning_item_kind"]
          mastered_at: string | null
          original: string
          source_message_id: string | null
          times_practiced: number
          updated_at: string
          user_id: string
        }
        Insert: {
          conversation_id?: string | null
          correction?: string | null
          created_at?: string
          explanation_pt?: string | null
          id?: string
          kind: Database["public"]["Enums"]["learning_item_kind"]
          mastered_at?: string | null
          original: string
          source_message_id?: string | null
          times_practiced?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string | null
          correction?: string | null
          created_at?: string
          explanation_pt?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["learning_item_kind"]
          mastered_at?: string | null
          original?: string
          source_message_id?: string | null
          times_practiced?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_items_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_items_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          correction: string | null
          created_at: string
          explanation: string | null
          id: string
          improved_sentence: string | null
          input_type: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          correction?: string | null
          created_at?: string
          explanation?: string | null
          id?: string
          improved_sentence?: string | null
          input_type?: string
          role: string
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          correction?: string | null
          created_at?: string
          explanation?: string | null
          id?: string
          improved_sentence?: string | null
          input_type?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      practice_sessions: {
        Row: {
          activity: string
          created_at: string
          id: string
          items_correct: number
          items_total: number
          user_id: string
          xp_earned: number
        }
        Insert: {
          activity: string
          created_at?: string
          id?: string
          items_correct?: number
          items_total?: number
          user_id: string
          xp_earned?: number
        }
        Update: {
          activity?: string
          created_at?: string
          id?: string
          items_correct?: number
          items_total?: number
          user_id?: string
          xp_earned?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          last_login: string | null
          name: string
        }
        Insert: {
          created_at?: string
          email?: string
          id: string
          last_login?: string | null
          name?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          last_login?: string | null
          name?: string
        }
        Relationships: []
      }
      usage_logs: {
        Row: {
          action_type: string
          created_at: string
          id: string
          messages_sent: number | null
          user_id: string
          voice_minutes_used: number | null
        }
        Insert: {
          action_type: string
          created_at?: string
          id?: string
          messages_sent?: number | null
          user_id: string
          voice_minutes_used?: number | null
        }
        Update: {
          action_type?: string
          created_at?: string
          id?: string
          messages_sent?: number | null
          user_id?: string
          voice_minutes_used?: number | null
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          biggest_difficulty: string
          correction_preference: string
          created_at: string
          english_level: string
          explanation_language: string
          id: string
          main_goal: string
          speaking_speed_preference: string
          specific_training_situation: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          biggest_difficulty: string
          correction_preference: string
          created_at?: string
          english_level: string
          explanation_language: string
          id?: string
          main_goal: string
          speaking_speed_preference: string
          specific_training_situation?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          biggest_difficulty?: string
          correction_preference?: string
          created_at?: string
          english_level?: string
          explanation_language?: string
          id?: string
          main_goal?: string
          speaking_speed_preference?: string
          specific_training_situation?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_stats: {
        Row: {
          created_at: string
          last_practice_date: string | null
          longest_streak: number
          streak_days: number
          updated_at: string
          user_id: string
          xp: number
        }
        Insert: {
          created_at?: string
          last_practice_date?: string | null
          longest_streak?: number
          streak_days?: number
          updated_at?: string
          user_id: string
          xp?: number
        }
        Update: {
          created_at?: string
          last_practice_date?: string | null
          longest_streak?: number
          streak_days?: number
          updated_at?: string
          user_id?: string
          xp?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
      learning_item_kind: "error" | "vocabulary" | "phrase"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["admin", "user"],
      learning_item_kind: ["error", "vocabulary", "phrase"],
    },
  },
} as const
