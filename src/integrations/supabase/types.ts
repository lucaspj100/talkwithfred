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
      ai_model_pricing: {
        Row: {
          cached_input_audio_per_million_usd: number
          cached_input_text_per_million_usd: number
          created_at: string
          effective_from: string
          effective_until: string | null
          id: string
          input_audio_per_million_usd: number
          input_text_per_million_usd: number
          model: string
          output_audio_per_million_usd: number
          output_text_per_million_usd: number
          provider: string
          source_url: string | null
          updated_at: string
        }
        Insert: {
          cached_input_audio_per_million_usd?: number
          cached_input_text_per_million_usd?: number
          created_at?: string
          effective_from?: string
          effective_until?: string | null
          id?: string
          input_audio_per_million_usd?: number
          input_text_per_million_usd?: number
          model: string
          output_audio_per_million_usd?: number
          output_text_per_million_usd?: number
          provider?: string
          source_url?: string | null
          updated_at?: string
        }
        Update: {
          cached_input_audio_per_million_usd?: number
          cached_input_text_per_million_usd?: number
          created_at?: string
          effective_from?: string
          effective_until?: string | null
          id?: string
          input_audio_per_million_usd?: number
          input_text_per_million_usd?: number
          model?: string
          output_audio_per_million_usd?: number
          output_text_per_million_usd?: number
          provider?: string
          source_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ai_usage_events: {
        Row: {
          cached_input_audio_tokens: number
          cached_input_text_tokens: number
          conversation_id: string | null
          created_at: string
          estimated_cost_brl: number | null
          estimated_cost_usd: number
          event_type: string
          exchange_rate_brl: number | null
          id: string
          input_audio_tokens: number
          input_text_tokens: number
          model: string
          occurred_at: string
          output_audio_tokens: number
          output_text_tokens: number
          provider: string
          provider_event_id: string | null
          provider_response_id: string | null
          raw_usage: Json | null
          total_input_tokens: number
          total_output_tokens: number
          usage_session_id: string | null
          user_id: string
        }
        Insert: {
          cached_input_audio_tokens?: number
          cached_input_text_tokens?: number
          conversation_id?: string | null
          created_at?: string
          estimated_cost_brl?: number | null
          estimated_cost_usd?: number
          event_type: string
          exchange_rate_brl?: number | null
          id?: string
          input_audio_tokens?: number
          input_text_tokens?: number
          model: string
          occurred_at?: string
          output_audio_tokens?: number
          output_text_tokens?: number
          provider?: string
          provider_event_id?: string | null
          provider_response_id?: string | null
          raw_usage?: Json | null
          total_input_tokens?: number
          total_output_tokens?: number
          usage_session_id?: string | null
          user_id: string
        }
        Update: {
          cached_input_audio_tokens?: number
          cached_input_text_tokens?: number
          conversation_id?: string | null
          created_at?: string
          estimated_cost_brl?: number | null
          estimated_cost_usd?: number
          event_type?: string
          exchange_rate_brl?: number | null
          id?: string
          input_audio_tokens?: number
          input_text_tokens?: number
          model?: string
          occurred_at?: string
          output_audio_tokens?: number
          output_text_tokens?: number
          provider?: string
          provider_event_id?: string | null
          provider_response_id?: string | null
          raw_usage?: Json | null
          total_input_tokens?: number
          total_output_tokens?: number
          usage_session_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_events_usage_session_id_fkey"
            columns: ["usage_session_id"]
            isOneToOne: false
            referencedRelation: "usage_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          brand_name: string
          fred_avatar_url: string | null
          id: string
          singleton: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          brand_name?: string
          fred_avatar_url?: string | null
          id?: string
          singleton?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          brand_name?: string
          fred_avatar_url?: string | null
          id?: string
          singleton?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      conversation_review_items: {
        Row: {
          acceptable_answers: Json
          attempts_first: number
          attempts_second: number
          category: string | null
          completed: boolean
          completed_at: string | null
          context_text: string | null
          conversation_id: string
          correct_answer: string | null
          corrected_text: string | null
          created_at: string
          display_order: number
          exercise_generated_at: string | null
          exercise_instructions: string | null
          exercise_options: Json | null
          exercise_prompt: string | null
          exercise_type: string | null
          explanation_pt: string | null
          id: string
          importance: string
          natural_text: string | null
          original_text: string | null
          review_id: string
          score: number | null
          second_acceptable_answers: Json
          second_correct_answer: string | null
          second_exercise_options: Json | null
          second_exercise_prompt: string | null
          second_exercise_type: string | null
          stage: string
          translation_pt: string | null
          type: string
          user_answer: string | null
          user_answer_first: string | null
          user_answer_second: string | null
          user_id: string
          vocabulary: Json
        }
        Insert: {
          acceptable_answers?: Json
          attempts_first?: number
          attempts_second?: number
          category?: string | null
          completed?: boolean
          completed_at?: string | null
          context_text?: string | null
          conversation_id: string
          correct_answer?: string | null
          corrected_text?: string | null
          created_at?: string
          display_order?: number
          exercise_generated_at?: string | null
          exercise_instructions?: string | null
          exercise_options?: Json | null
          exercise_prompt?: string | null
          exercise_type?: string | null
          explanation_pt?: string | null
          id?: string
          importance?: string
          natural_text?: string | null
          original_text?: string | null
          review_id: string
          score?: number | null
          second_acceptable_answers?: Json
          second_correct_answer?: string | null
          second_exercise_options?: Json | null
          second_exercise_prompt?: string | null
          second_exercise_type?: string | null
          stage?: string
          translation_pt?: string | null
          type: string
          user_answer?: string | null
          user_answer_first?: string | null
          user_answer_second?: string | null
          user_id: string
          vocabulary?: Json
        }
        Update: {
          acceptable_answers?: Json
          attempts_first?: number
          attempts_second?: number
          category?: string | null
          completed?: boolean
          completed_at?: string | null
          context_text?: string | null
          conversation_id?: string
          correct_answer?: string | null
          corrected_text?: string | null
          created_at?: string
          display_order?: number
          exercise_generated_at?: string | null
          exercise_instructions?: string | null
          exercise_options?: Json | null
          exercise_prompt?: string | null
          exercise_type?: string | null
          explanation_pt?: string | null
          id?: string
          importance?: string
          natural_text?: string | null
          original_text?: string | null
          review_id?: string
          score?: number | null
          second_acceptable_answers?: Json
          second_correct_answer?: string | null
          second_exercise_options?: Json | null
          second_exercise_prompt?: string | null
          second_exercise_type?: string | null
          stage?: string
          translation_pt?: string | null
          type?: string
          user_answer?: string | null
          user_answer_first?: string | null
          user_answer_second?: string | null
          user_id?: string
          vocabulary?: Json
        }
        Relationships: [
          {
            foreignKeyName: "conversation_review_items_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_review_items_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "conversation_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_reviews: {
        Row: {
          analysis_error: string | null
          analysis_status: string
          completed_at: string | null
          completed_items: number
          conversation_id: string
          created_at: string
          estimated_minutes: number
          id: string
          level_detected: string | null
          source: string
          started_at: string | null
          status: string
          summary: string | null
          title: string | null
          total_items: number
          updated_at: string
          user_id: string
        }
        Insert: {
          analysis_error?: string | null
          analysis_status?: string
          completed_at?: string | null
          completed_items?: number
          conversation_id: string
          created_at?: string
          estimated_minutes?: number
          id?: string
          level_detected?: string | null
          source?: string
          started_at?: string | null
          status?: string
          summary?: string | null
          title?: string | null
          total_items?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          analysis_error?: string | null
          analysis_status?: string
          completed_at?: string | null
          completed_items?: number
          conversation_id?: string
          created_at?: string
          estimated_minutes?: number
          id?: string
          level_detected?: string | null
          source?: string
          started_at?: string | null
          status?: string
          summary?: string | null
          title?: string | null
          total_items?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_reviews_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          custom_topic: string | null
          id: string
          mode: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          custom_topic?: string | null
          id?: string
          mode?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          custom_topic?: string | null
          id?: string
          mode?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      finance_settings: {
        Row: {
          alert_cost_per_user_brl: number
          alert_cost_percent_of_revenue: number
          id: number
          mercado_pago_fee_percent: number
          monthly_fixed_cost_brl: number
          tax_percent: number
          updated_at: string
          updated_by: string | null
          usd_brl_rate: number
        }
        Insert: {
          alert_cost_per_user_brl?: number
          alert_cost_percent_of_revenue?: number
          id?: number
          mercado_pago_fee_percent?: number
          monthly_fixed_cost_brl?: number
          tax_percent?: number
          updated_at?: string
          updated_by?: string | null
          usd_brl_rate?: number
        }
        Update: {
          alert_cost_per_user_brl?: number
          alert_cost_percent_of_revenue?: number
          id?: number
          mercado_pago_fee_percent?: number
          monthly_fixed_cost_brl?: number
          tax_percent?: number
          updated_at?: string
          updated_by?: string | null
          usd_brl_rate?: number
        }
        Relationships: []
      }
      leads: {
        Row: {
          already_lost_opportunity: string | null
          area: string | null
          areas: string[]
          converted_to_whatsapp: boolean
          created_at: string
          email: string
          goal: string | null
          id: string
          level: string | null
          main_block: string | null
          name: string
          other_area: string | null
          simulation_summary: string | null
          source: string
          status: string
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          already_lost_opportunity?: string | null
          area?: string | null
          areas?: string[]
          converted_to_whatsapp?: boolean
          created_at?: string
          email: string
          goal?: string | null
          id?: string
          level?: string | null
          main_block?: string | null
          name: string
          other_area?: string | null
          simulation_summary?: string | null
          source?: string
          status?: string
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          already_lost_opportunity?: string | null
          area?: string | null
          areas?: string[]
          converted_to_whatsapp?: boolean
          created_at?: string
          email?: string
          goal?: string | null
          id?: string
          level?: string | null
          main_block?: string | null
          name?: string
          other_area?: string | null
          simulation_summary?: string | null
          source?: string
          status?: string
          updated_at?: string
          whatsapp?: string | null
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
      subscription_audit_logs: {
        Row: {
          action: string
          actor_type: string
          actor_user_id: string | null
          created_at: string
          id: string
          ip_address: string | null
          new_data: Json | null
          previous_data: Json | null
          provider_reference: string | null
          reason: string | null
          subscription_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          actor_type: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          previous_data?: Json | null
          provider_reference?: string | null
          reason?: string | null
          subscription_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          actor_type?: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          previous_data?: Json | null
          provider_reference?: string | null
          reason?: string | null
          subscription_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_audit_logs_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_events: {
        Row: {
          created_at: string
          event_type: string | null
          id: string
          payload: Json | null
          processed: boolean
          provider_event_id: string | null
          provider_status: string | null
          provider_subscription_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_type?: string | null
          id?: string
          payload?: Json | null
          processed?: boolean
          provider_event_id?: string | null
          provider_status?: string | null
          provider_subscription_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string | null
          id?: string
          payload?: Json | null
          processed?: boolean
          provider_event_id?: string | null
          provider_status?: string | null
          provider_subscription_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          canceled_at: string | null
          cancellation_reason: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          last_payment_at: string | null
          last_payment_status: string | null
          last_renewed_payment_id: string | null
          last_synced_at: string | null
          last_user_sync_at: string | null
          minutes_available: number
          minutes_used: number
          monthly_minutes: number
          next_payment_date: string | null
          payer_email: string | null
          plan_name: string
          provider: string
          provider_plan_id: string | null
          provider_status: string | null
          provider_subscription_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          canceled_at?: string | null
          cancellation_reason?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          last_payment_at?: string | null
          last_payment_status?: string | null
          last_renewed_payment_id?: string | null
          last_synced_at?: string | null
          last_user_sync_at?: string | null
          minutes_available?: number
          minutes_used?: number
          monthly_minutes?: number
          next_payment_date?: string | null
          payer_email?: string | null
          plan_name?: string
          provider?: string
          provider_plan_id?: string | null
          provider_status?: string | null
          provider_subscription_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          canceled_at?: string | null
          cancellation_reason?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          last_payment_at?: string | null
          last_payment_status?: string | null
          last_renewed_payment_id?: string | null
          last_synced_at?: string | null
          last_user_sync_at?: string | null
          minutes_available?: number
          minutes_used?: number
          monthly_minutes?: number
          next_payment_date?: string | null
          payer_email?: string | null
          plan_name?: string
          provider?: string
          provider_plan_id?: string | null
          provider_status?: string | null
          provider_subscription_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
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
      usage_sessions: {
        Row: {
          ai_cached_tokens: number
          ai_estimated_cost_brl: number
          ai_estimated_cost_usd: number
          ai_events_count: number
          ai_input_audio_tokens: number
          ai_input_text_tokens: number
          ai_model: string | null
          ai_output_audio_tokens: number
          ai_output_text_tokens: number
          close_reason: string | null
          conversation_id: string | null
          created_at: string
          ended_at: string | null
          id: string
          last_heartbeat_at: string | null
          minutes_used: number
          mode: string
          seconds_used: number
          session_token_hash: string | null
          started_at: string
          status: string
          subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_cached_tokens?: number
          ai_estimated_cost_brl?: number
          ai_estimated_cost_usd?: number
          ai_events_count?: number
          ai_input_audio_tokens?: number
          ai_input_text_tokens?: number
          ai_model?: string | null
          ai_output_audio_tokens?: number
          ai_output_text_tokens?: number
          close_reason?: string | null
          conversation_id?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          last_heartbeat_at?: string | null
          minutes_used?: number
          mode?: string
          seconds_used?: number
          session_token_hash?: string | null
          started_at?: string
          status?: string
          subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_cached_tokens?: number
          ai_estimated_cost_brl?: number
          ai_estimated_cost_usd?: number
          ai_events_count?: number
          ai_input_audio_tokens?: number
          ai_input_text_tokens?: number
          ai_model?: string | null
          ai_output_audio_tokens?: number
          ai_output_text_tokens?: number
          close_reason?: string | null
          conversation_id?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          last_heartbeat_at?: string | null
          minutes_used?: number
          mode?: string
          seconds_used?: number
          session_token_hash?: string | null
          started_at?: string
          status?: string
          subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_sessions_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          biggest_difficulty: string | null
          correction_preference: string | null
          created_at: string
          custom_professional_area: string | null
          english_goals: Json
          english_level: string | null
          explanation_language: string | null
          id: string
          main_goal: string | null
          onboarding_completed: boolean
          onboarding_completed_at: string | null
          onboarding_updated_at: string | null
          practice_goal: string | null
          preferred_situations: Json
          primary_english_goal: string | null
          primary_professional_area: string | null
          professional_areas: Json
          speaking_speed_preference: string | null
          specific_training_situation: string | null
          technical_terms: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          biggest_difficulty?: string | null
          correction_preference?: string | null
          created_at?: string
          custom_professional_area?: string | null
          english_goals?: Json
          english_level?: string | null
          explanation_language?: string | null
          id?: string
          main_goal?: string | null
          onboarding_completed?: boolean
          onboarding_completed_at?: string | null
          onboarding_updated_at?: string | null
          practice_goal?: string | null
          preferred_situations?: Json
          primary_english_goal?: string | null
          primary_professional_area?: string | null
          professional_areas?: Json
          speaking_speed_preference?: string | null
          specific_training_situation?: string | null
          technical_terms?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          biggest_difficulty?: string | null
          correction_preference?: string | null
          created_at?: string
          custom_professional_area?: string | null
          english_goals?: Json
          english_level?: string | null
          explanation_language?: string | null
          id?: string
          main_goal?: string | null
          onboarding_completed?: boolean
          onboarding_completed_at?: string | null
          onboarding_updated_at?: string | null
          practice_goal?: string | null
          preferred_situations?: Json
          primary_english_goal?: string | null
          primary_professional_area?: string | null
          professional_areas?: Json
          speaking_speed_preference?: string | null
          specific_training_situation?: string | null
          technical_terms?: Json
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
      admin_user_engagement_summary: {
        Args: never
        Returns: {
          conversations_count: number
          convs_7d: number
          created_at: string
          email: string
          engagement_status: string
          english_level: string
          last_activity_at: string
          last_login: string
          learning_items_count: number
          longest_streak: number
          main_goal: string
          mastered_items_count: number
          messages_count: number
          name: string
          onboarding_completed: boolean
          practice_7d: number
          practice_sessions_count: number
          streak_days: number
          user_id: string
          voice_minutes_total: number
          xp: number
        }[]
      }
      get_admin_dashboard_metrics: {
        Args: { end_date: string; start_date: string }
        Returns: Json
      }
      get_admin_retention_metrics: { Args: never; Returns: Json }
      get_admin_user_activity: {
        Args: { max_items?: number; target_user: string }
        Returns: Json
      }
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
