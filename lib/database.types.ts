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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      bookings: {
        Row: {
          accepted_at: string | null
          amount_cents: number
          booked_by: string | null
          container_id: string | null
          created_at: string | null
          id: string
          payment_status: string | null
          platform_fee_cents: number
          provider_id: string | null
          quote_id: string | null
          stripe_payment_intent_id: string | null
          tender_status: string | null
          tender_token: string | null
        }
        Insert: {
          accepted_at?: string | null
          amount_cents: number
          booked_by?: string | null
          container_id?: string | null
          created_at?: string | null
          id?: string
          payment_status?: string | null
          platform_fee_cents: number
          provider_id?: string | null
          quote_id?: string | null
          stripe_payment_intent_id?: string | null
          tender_status?: string | null
          tender_token?: string | null
        }
        Update: {
          accepted_at?: string | null
          amount_cents?: number
          booked_by?: string | null
          container_id?: string | null
          created_at?: string | null
          id?: string
          payment_status?: string | null
          platform_fee_cents?: number
          provider_id?: string | null
          quote_id?: string | null
          stripe_payment_intent_id?: string | null
          tender_status?: string | null
          tender_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_container_id_fkey"
            columns: ["container_id"]
            isOneToOne: false
            referencedRelation: "containers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      calls: {
        Row: {
          ended_at: string | null
          id: string
          provider_id: string | null
          quote_request_id: string | null
          recording_url: string | null
          speaking: string | null
          started_at: string | null
          status: string | null
          summary: string | null
          vapi_call_id: string | null
        }
        Insert: {
          ended_at?: string | null
          id?: string
          provider_id?: string | null
          quote_request_id?: string | null
          recording_url?: string | null
          speaking?: string | null
          started_at?: string | null
          status?: string | null
          summary?: string | null
          vapi_call_id?: string | null
        }
        Update: {
          ended_at?: string | null
          id?: string
          provider_id?: string | null
          quote_request_id?: string | null
          recording_url?: string | null
          speaking?: string | null
          started_at?: string | null
          status?: string | null
          summary?: string | null
          vapi_call_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calls_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_quote_request_id_fkey"
            columns: ["quote_request_id"]
            isOneToOne: false
            referencedRelation: "quote_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      containers: {
        Row: {
          container_number: string
          created_at: string | null
          deliver_by: string | null
          destination_address: string | null
          destination_name: string | null
          eta: string | null
          id: string
          importer_id: string | null
          last_free_day: string | null
          port: string | null
          size: string | null
          status: string | null
          terminal: string | null
          vessel: string | null
        }
        Insert: {
          container_number: string
          created_at?: string | null
          deliver_by?: string | null
          destination_address?: string | null
          destination_name?: string | null
          eta?: string | null
          id?: string
          importer_id?: string | null
          last_free_day?: string | null
          port?: string | null
          size?: string | null
          status?: string | null
          terminal?: string | null
          vessel?: string | null
        }
        Update: {
          container_number?: string
          created_at?: string | null
          deliver_by?: string | null
          destination_address?: string | null
          destination_name?: string | null
          eta?: string | null
          id?: string
          importer_id?: string | null
          last_free_day?: string | null
          port?: string | null
          size?: string | null
          status?: string | null
          terminal?: string | null
          vessel?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "containers_importer_id_fkey"
            columns: ["importer_id"]
            isOneToOne: false
            referencedRelation: "importers"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          container_id: string | null
          created_at: string | null
          id: number
          payload: Json | null
          type: string
        }
        Insert: {
          container_id?: string | null
          created_at?: string | null
          id?: number
          payload?: Json | null
          type: string
        }
        Update: {
          container_id?: string | null
          created_at?: string | null
          id?: number
          payload?: Json | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_container_id_fkey"
            columns: ["container_id"]
            isOneToOne: false
            referencedRelation: "containers"
            referencedColumns: ["id"]
          },
        ]
      }
      importers: {
        Row: {
          auto_book_enabled: boolean
          auto_book_limit_cents: number
          auto_quote_days_before_eta: number
          auto_quote_enabled: boolean
          created_at: string | null
          default_payment_method_id: string | null
          id: string
          mcp_api_key: string | null
          name: string
          owner_id: string | null
          stripe_customer_id: string | null
        }
        Insert: {
          auto_book_enabled?: boolean
          auto_book_limit_cents?: number
          auto_quote_days_before_eta?: number
          auto_quote_enabled?: boolean
          created_at?: string | null
          default_payment_method_id?: string | null
          id?: string
          mcp_api_key?: string | null
          name: string
          owner_id?: string | null
          stripe_customer_id?: string | null
        }
        Update: {
          auto_book_enabled?: boolean
          auto_book_limit_cents?: number
          auto_quote_days_before_eta?: number
          auto_quote_enabled?: boolean
          created_at?: string | null
          default_payment_method_id?: string | null
          id?: string
          mcp_api_key?: string | null
          name?: string
          owner_id?: string | null
          stripe_customer_id?: string | null
        }
        Relationships: []
      }
      providers: {
        Row: {
          contact_name: string | null
          created_at: string | null
          email: string
          id: string
          importer_id: string | null
          name: string
          phone: string
          ports: string[] | null
          service_states: string[] | null
          stripe_account_id: string | null
          stripe_onboarded: boolean | null
        }
        Insert: {
          contact_name?: string | null
          created_at?: string | null
          email: string
          id?: string
          importer_id?: string | null
          name: string
          phone: string
          ports?: string[] | null
          service_states?: string[] | null
          stripe_account_id?: string | null
          stripe_onboarded?: boolean | null
        }
        Update: {
          contact_name?: string | null
          created_at?: string | null
          email?: string
          id?: string
          importer_id?: string | null
          name?: string
          phone?: string
          ports?: string[] | null
          service_states?: string[] | null
          stripe_account_id?: string | null
          stripe_onboarded?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "providers_importer_id_fkey"
            columns: ["importer_id"]
            isOneToOne: false
            referencedRelation: "importers"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_requests: {
        Row: {
          completed_at: string | null
          container_id: string | null
          created_at: string | null
          id: string
          status: string | null
          triggered_by: string | null
        }
        Insert: {
          completed_at?: string | null
          container_id?: string | null
          created_at?: string | null
          id?: string
          status?: string | null
          triggered_by?: string | null
        }
        Update: {
          completed_at?: string | null
          container_id?: string | null
          created_at?: string | null
          id?: string
          status?: string | null
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_requests_container_id_fkey"
            columns: ["container_id"]
            isOneToOne: false
            referencedRelation: "containers"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          accessorials: Json | null
          all_in_cents: number | null
          call_id: string | null
          can_meet_deadline: boolean | null
          chassis_per_day_cents: number | null
          container_id: string | null
          earliest_pickup: string | null
          est_chassis_days: number | null
          field_sources: Json | null
          fuel_surcharge_cents: number | null
          id: string
          linehaul_cents: number | null
          notes: string | null
          projected_demurrage_cents: number | null
          provider_id: string | null
          risk_adjusted_cents: number | null
          updated_at: string | null
        }
        Insert: {
          accessorials?: Json | null
          all_in_cents?: number | null
          call_id?: string | null
          can_meet_deadline?: boolean | null
          chassis_per_day_cents?: number | null
          container_id?: string | null
          earliest_pickup?: string | null
          est_chassis_days?: number | null
          field_sources?: Json | null
          fuel_surcharge_cents?: number | null
          id?: string
          linehaul_cents?: number | null
          notes?: string | null
          projected_demurrage_cents?: number | null
          provider_id?: string | null
          risk_adjusted_cents?: number | null
          updated_at?: string | null
        }
        Update: {
          accessorials?: Json | null
          all_in_cents?: number | null
          call_id?: string | null
          can_meet_deadline?: boolean | null
          chassis_per_day_cents?: number | null
          container_id?: string | null
          earliest_pickup?: string | null
          est_chassis_days?: number | null
          field_sources?: Json | null
          fuel_surcharge_cents?: number | null
          id?: string
          linehaul_cents?: number | null
          notes?: string | null
          projected_demurrage_cents?: number | null
          provider_id?: string | null
          risk_adjusted_cents?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: true
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_container_id_fkey"
            columns: ["container_id"]
            isOneToOne: false
            referencedRelation: "containers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendations: {
        Row: {
          container_id: string | null
          created_at: string | null
          id: string
          quote_request_id: string | null
          ranked_quote_ids: string[] | null
          reasoning: string | null
          winner_quote_id: string | null
        }
        Insert: {
          container_id?: string | null
          created_at?: string | null
          id?: string
          quote_request_id?: string | null
          ranked_quote_ids?: string[] | null
          reasoning?: string | null
          winner_quote_id?: string | null
        }
        Update: {
          container_id?: string | null
          created_at?: string | null
          id?: string
          quote_request_id?: string | null
          ranked_quote_ids?: string[] | null
          reasoning?: string | null
          winner_quote_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recommendations_container_id_fkey"
            columns: ["container_id"]
            isOneToOne: false
            referencedRelation: "containers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendations_quote_request_id_fkey"
            columns: ["quote_request_id"]
            isOneToOne: false
            referencedRelation: "quote_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendations_winner_quote_id_fkey"
            columns: ["winner_quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      transcript_lines: {
        Row: {
          call_id: string | null
          created_at: string | null
          id: number
          role: string | null
          text: string
        }
        Insert: {
          call_id?: string | null
          created_at?: string | null
          id?: number
          role?: string | null
          text: string
        }
        Update: {
          call_id?: string | null
          created_at?: string | null
          id?: number
          role?: string | null
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "transcript_lines_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      portcall_autoquote_tick: { Args: never; Returns: undefined }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
