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
      account_balance_history: {
        Row: {
          account_id: string
          as_of_date: string
          balance: number
          change_amount: number | null
          created_at: string
          id: string
          reason: string | null
          type: string | null
          user_id: string
        }
        Insert: {
          account_id: string
          as_of_date?: string
          balance: number
          change_amount?: number | null
          created_at?: string
          id?: string
          reason?: string | null
          type?: string | null
          user_id: string
        }
        Update: {
          account_id?: string
          as_of_date?: string
          balance?: number
          change_amount?: number | null
          created_at?: string
          id?: string
          reason?: string | null
          type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_balance_history_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      account_documents: {
        Row: {
          account_id: string
          file_size: number | null
          filename: string
          id: string
          label: string | null
          mime_type: string | null
          storage_path: string
          uploaded_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          file_size?: number | null
          filename: string
          id?: string
          label?: string | null
          mime_type?: string | null
          storage_path: string
          uploaded_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          file_size?: number | null
          filename?: string
          id?: string
          label?: string | null
          mime_type?: string | null
          storage_path?: string
          uploaded_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_documents_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      account_sweeps: {
        Row: {
          account_id: string
          amount: number
          created_at: string
          id: string
          left_behind: number | null
          moved_out_at: string
          note: string | null
          reason: string
          returned_at: string | null
          user_id: string
        }
        Insert: {
          account_id: string
          amount: number
          created_at?: string
          id?: string
          left_behind?: number | null
          moved_out_at?: string
          note?: string | null
          reason: string
          returned_at?: string | null
          user_id: string
        }
        Update: {
          account_id?: string
          amount?: number
          created_at?: string
          id?: string
          left_behind?: number | null
          moved_out_at?: string
          note?: string | null
          reason?: string
          returned_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_sweeps_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          access_notes: string | null
          account_number: string | null
          account_type: string | null
          activity_log: Json
          balance: number | null
          bank_id: string
          cd_auto_renew: boolean | null
          cd_maturity_date: string | null
          cd_term_months: number | null
          created_at: string
          date_opened: string | null
          deleted_at: string | null
          dormancy_months_override: number | null
          exclude_min_balance: boolean
          holder: string | null
          id: string
          interest_last_accrued_on: string | null
          interest_rate: number | null
          last_activity_date: string | null
          last_check_number: number | null
          last_reminded_at: string | null
          monthly_fee: number | null
          monthly_fee_day: number | null
          monthly_fee_last_charged_on: string | null
          notes: string | null
          online_url: string | null
          password: string | null
          routing_number: string | null
          updated_at: string
          user_id: string
          username: string | null
        }
        Insert: {
          access_notes?: string | null
          account_number?: string | null
          account_type?: string | null
          activity_log?: Json
          balance?: number | null
          bank_id: string
          cd_auto_renew?: boolean | null
          cd_maturity_date?: string | null
          cd_term_months?: number | null
          created_at?: string
          date_opened?: string | null
          deleted_at?: string | null
          dormancy_months_override?: number | null
          exclude_min_balance?: boolean
          holder?: string | null
          id?: string
          interest_last_accrued_on?: string | null
          interest_rate?: number | null
          last_activity_date?: string | null
          last_check_number?: number | null
          last_reminded_at?: string | null
          monthly_fee?: number | null
          monthly_fee_day?: number | null
          monthly_fee_last_charged_on?: string | null
          notes?: string | null
          online_url?: string | null
          password?: string | null
          routing_number?: string | null
          updated_at?: string
          user_id: string
          username?: string | null
        }
        Update: {
          access_notes?: string | null
          account_number?: string | null
          account_type?: string | null
          activity_log?: Json
          balance?: number | null
          bank_id?: string
          cd_auto_renew?: boolean | null
          cd_maturity_date?: string | null
          cd_term_months?: number | null
          created_at?: string
          date_opened?: string | null
          deleted_at?: string | null
          dormancy_months_override?: number | null
          exclude_min_balance?: boolean
          holder?: string | null
          id?: string
          interest_last_accrued_on?: string | null
          interest_rate?: number | null
          last_activity_date?: string | null
          last_check_number?: number | null
          last_reminded_at?: string | null
          monthly_fee?: number | null
          monthly_fee_day?: number | null
          monthly_fee_last_charged_on?: string | null
          notes?: string | null
          online_url?: string | null
          password?: string | null
          routing_number?: string | null
          updated_at?: string
          user_id?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_bank_id_fkey"
            columns: ["bank_id"]
            isOneToOne: false
            referencedRelation: "banks"
            referencedColumns: ["id"]
          },
        ]
      }
      address_campaign_items: {
        Row: {
          bank_id: string
          campaign_id: string
          created_at: string
          done_at: string | null
          holder: string | null
          id: string
          user_id: string
        }
        Insert: {
          bank_id: string
          campaign_id: string
          created_at?: string
          done_at?: string | null
          holder?: string | null
          id?: string
          user_id: string
        }
        Update: {
          bank_id?: string
          campaign_id?: string
          created_at?: string
          done_at?: string | null
          holder?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "address_campaign_items_bank_id_fkey"
            columns: ["bank_id"]
            isOneToOne: false
            referencedRelation: "banks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "address_campaign_items_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "address_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      address_campaigns: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          new_address: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          new_address: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          new_address?: string
          user_id?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string | null
          cert: number | null
          created_at: string
          id: string
          summary: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string | null
          cert?: number | null
          created_at?: string
          id?: string
          summary: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string | null
          cert?: number | null
          created_at?: string
          id?: string
          summary?: string
        }
        Relationships: []
      }
      bank_branches: {
        Row: {
          address: string | null
          cert: number
          city: string | null
          id: string
          latitude: number | null
          longitude: number | null
          main_office: boolean
          name: string | null
          state: string | null
          uninum: number | null
          updated_at: string
          zip: string | null
        }
        Insert: {
          address?: string | null
          cert: number
          city?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          main_office?: boolean
          name?: string | null
          state?: string | null
          uninum?: number | null
          updated_at?: string
          zip?: string | null
        }
        Update: {
          address?: string | null
          cert?: number
          city?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          main_office?: boolean
          name?: string | null
          state?: string | null
          uninum?: number | null
          updated_at?: string
          zip?: string | null
        }
        Relationships: []
      }
      bank_comment_reads: {
        Row: {
          cert: number
          last_read_at: string
          user_id: string
        }
        Insert: {
          cert: number
          last_read_at?: string
          user_id: string
        }
        Update: {
          cert?: number
          last_read_at?: string
          user_id?: string
        }
        Relationships: []
      }
      bank_comments: {
        Row: {
          author_id: string | null
          author_name: string | null
          body: string
          cert: number
          created_at: string
          id: string
        }
        Insert: {
          author_id?: string | null
          author_name?: string | null
          body: string
          cert: number
          created_at?: string
          id?: string
        }
        Update: {
          author_id?: string | null
          author_name?: string | null
          body?: string
          cert?: number
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      bank_relationships: {
        Row: {
          cert_a: number
          cert_b: number
          created_at: string
          created_by: string | null
        }
        Insert: {
          cert_a: number
          cert_b: number
          created_at?: string
          created_by?: string | null
        }
        Update: {
          cert_a?: number
          cert_b?: number
          created_at?: string
          created_by?: string | null
        }
        Relationships: []
      }
      banks: {
        Row: {
          assets: number | null
          branch_location: string | null
          cert: number | null
          city: string | null
          conversion_stage: string
          created_at: string
          deleted_at: string | null
          eligibility: string | null
          eligibility_date: string | null
          holding_company: string | null
          holding_company_id: string | null
          id: string
          min_to_open: number | null
          name: string
          notes: string | null
          open_methods: string[] | null
          phone: string | null
          priority: string | null
          queue_position: number | null
          regulator: string | null
          routing_number: string | null
          shared_fields_updated_at: string | null
          shared_updated_by: string | null
          shared_updated_by_name: string | null
          shared_updated_summary: string | null
          state: string | null
          status: string
          target_balance: number | null
          updated_at: string
          user_id: string
          website: string | null
        }
        Insert: {
          assets?: number | null
          branch_location?: string | null
          cert?: number | null
          city?: string | null
          conversion_stage?: string
          created_at?: string
          deleted_at?: string | null
          eligibility?: string | null
          eligibility_date?: string | null
          holding_company?: string | null
          holding_company_id?: string | null
          id?: string
          min_to_open?: number | null
          name: string
          notes?: string | null
          open_methods?: string[] | null
          phone?: string | null
          priority?: string | null
          queue_position?: number | null
          regulator?: string | null
          routing_number?: string | null
          shared_fields_updated_at?: string | null
          shared_updated_by?: string | null
          shared_updated_by_name?: string | null
          shared_updated_summary?: string | null
          state?: string | null
          status?: string
          target_balance?: number | null
          updated_at?: string
          user_id: string
          website?: string | null
        }
        Update: {
          assets?: number | null
          branch_location?: string | null
          cert?: number | null
          city?: string | null
          conversion_stage?: string
          created_at?: string
          deleted_at?: string | null
          eligibility?: string | null
          eligibility_date?: string | null
          holding_company?: string | null
          holding_company_id?: string | null
          id?: string
          min_to_open?: number | null
          name?: string
          notes?: string | null
          open_methods?: string[] | null
          phone?: string | null
          priority?: string | null
          queue_position?: number | null
          regulator?: string | null
          routing_number?: string | null
          shared_fields_updated_at?: string | null
          shared_updated_by?: string | null
          shared_updated_by_name?: string | null
          shared_updated_summary?: string | null
          state?: string | null
          status?: string
          target_balance?: number | null
          updated_at?: string
          user_id?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "banks_holding_company_id_fkey"
            columns: ["holding_company_id"]
            isOneToOne: false
            referencedRelation: "holding_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      borrowed_funds: {
        Row: {
          amount: number
          borrowed_at: string
          created_at: string
          id: string
          note: string | null
          reason: string
          returned_at: string | null
          source_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          borrowed_at?: string
          created_at?: string
          id?: string
          note?: string | null
          reason: string
          returned_at?: string | null
          source_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          borrowed_at?: string
          created_at?: string
          id?: string
          note?: string | null
          reason?: string
          returned_at?: string | null
          source_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      personal_activity_log: {
        Row: {
          account_label: string | null
          action: string
          bank_name: string | null
          cert: number | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          summary: string
          user_id: string
        }
        Insert: {
          account_label?: string | null
          action: string
          bank_name?: string | null
          cert?: number | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          summary: string
          user_id: string
        }
        Update: {
          account_label?: string | null
          action?: string
          bank_name?: string | null
          cert?: number | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          summary?: string
          user_id?: string
        }
        Relationships: []
      }
      payment_sources: {
        Row: {
          account_number: string | null
          bank_name: string | null
          created_at: string
          id: string
          label: string
          last_check_number: number | null
          payer_name: string | null
          routing_number: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_number?: string | null
          bank_name?: string | null
          created_at?: string
          id?: string
          label: string
          last_check_number?: number | null
          payer_name?: string | null
          routing_number?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_number?: string | null
          bank_name?: string | null
          created_at?: string
          id?: string
          label?: string
          last_check_number?: number | null
          payer_name?: string | null
          routing_number?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      holding_companies: {
        Row: {
          assets: number | null
          assets_as_of: string | null
          created_at: string
          id: string
          name: string
          nic_rssd_id: number | null
          updated_at: string
        }
        Insert: {
          assets?: number | null
          assets_as_of?: string | null
          created_at?: string
          id?: string
          name: string
          nic_rssd_id?: number | null
          updated_at?: string
        }
        Update: {
          assets?: number | null
          assets_as_of?: string | null
          created_at?: string
          id?: string
          name?: string
          nic_rssd_id?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      printed_checks: {
        Row: {
          account_id: string
          amount: number | null
          check_date: string | null
          check_number: number | null
          created_at: string
          id: string
          memo: string | null
          payee: string | null
          user_id: string
        }
        Insert: {
          account_id: string
          amount?: number | null
          check_date?: string | null
          check_number?: number | null
          created_at?: string
          id?: string
          memo?: string | null
          payee?: string | null
          user_id: string
        }
        Update: {
          account_id?: string
          amount?: number | null
          check_date?: string | null
          check_number?: number | null
          created_at?: string
          id?: string
          memo?: string | null
          payee?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "printed_checks_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      mailed_deposits: {
        Row: {
          account_id: string
          activity_type: string | null
          amount: number
          auto_post: boolean
          created_at: string
          id: string
          mailed_on: string
          post_after: string
          posted_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          account_id: string
          activity_type?: string | null
          amount: number
          auto_post?: boolean
          created_at?: string
          id?: string
          mailed_on: string
          post_after: string
          posted_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          account_id?: string
          activity_type?: string | null
          amount?: number
          auto_post?: boolean
          created_at?: string
          id?: string
          mailed_on?: string
          post_after?: string
          posted_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mailed_deposits_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          access_requested_at: string | null
          access_status: string
          activity_reminder_months: number[]
          alert_cd_maturity: boolean
          alert_low_balance: boolean
          alert_no_activity: boolean
          banks_seeded: boolean
          created_at: string
          default_deposit_post_days: number | null
          default_dormancy_months: number
          display_name: string | null
          holders: string[]
          id: string
          is_fdic_admin: boolean
          last_feedback_at: string | null
          last_seen_at: string | null
          min_balance: number
          notify_email: boolean
          notify_new_comments: boolean
          notify_product_updates: boolean
          onboarded: boolean
          vault_check: string | null
          vault_encryption_enabled: boolean
          vault_salt: string | null
          walkthrough_tour_seen: string | null
        }
        Insert: {
          access_requested_at?: string | null
          access_status?: string
          activity_reminder_months?: number[]
          alert_cd_maturity?: boolean
          alert_low_balance?: boolean
          alert_no_activity?: boolean
          banks_seeded?: boolean
          created_at?: string
          default_deposit_post_days?: number | null
          default_dormancy_months?: number
          display_name?: string | null
          holders?: string[]
          id: string
          is_fdic_admin?: boolean
          last_feedback_at?: string | null
          last_seen_at?: string | null
          min_balance?: number
          notify_email?: boolean
          notify_new_comments?: boolean
          notify_product_updates?: boolean
          onboarded?: boolean
          vault_check?: string | null
          vault_encryption_enabled?: boolean
          vault_salt?: string | null
          walkthrough_tour_seen?: string | null
        }
        Update: {
          access_requested_at?: string | null
          access_status?: string
          activity_reminder_months?: number[]
          alert_cd_maturity?: boolean
          alert_low_balance?: boolean
          alert_no_activity?: boolean
          banks_seeded?: boolean
          created_at?: string
          default_deposit_post_days?: number | null
          default_dormancy_months?: number
          display_name?: string | null
          holders?: string[]
          id?: string
          is_fdic_admin?: boolean
          last_feedback_at?: string | null
          last_seen_at?: string | null
          min_balance?: number
          notify_email?: boolean
          notify_new_comments?: boolean
          notify_product_updates?: boolean
          onboarded?: boolean
          vault_check?: string | null
          vault_encryption_enabled?: boolean
          vault_salt?: string | null
          walkthrough_tour_seen?: string | null
        }
        Relationships: []
      }
      reminders: {
        Row: {
          bank_id: string
          created_at: string
          done_at: string | null
          due_date: string
          emailed_at: string | null
          id: string
          note: string
          user_id: string
        }
        Insert: {
          bank_id: string
          created_at?: string
          done_at?: string | null
          due_date: string
          emailed_at?: string | null
          id?: string
          note: string
          user_id: string
        }
        Update: {
          bank_id?: string
          created_at?: string
          done_at?: string | null
          due_date?: string
          emailed_at?: string | null
          id?: string
          note?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminders_bank_id_fkey"
            columns: ["bank_id"]
            isOneToOne: false
            referencedRelation: "banks"
            referencedColumns: ["id"]
          },
        ]
      }
      road_trips: {
        Row: {
          bank_certs: number[]
          created_at: string
          id: string
          is_public: boolean
          plan: Json
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bank_certs?: number[]
          created_at?: string
          id?: string
          is_public?: boolean
          plan: Json
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bank_certs?: number[]
          created_at?: string
          id?: string
          is_public?: boolean
          plan?: Json
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      append_activity_log: {
        Args: {
          p_account_id: string
          p_date: string
          p_note: string
          p_type: string
        }
        Returns: Json
      }
      charge_monthly_fee: {
        Args: { p_account_id: string; p_amount: number; p_charged_on: string }
        Returns: number
      }
      charge_monthly_fee_with_history: {
        Args: { p_account_id: string; p_amount: number; p_charged_on: string }
        Returns: number
      }
      claim_check_number: {
        Args: { p_account_id: string; p_proposed_number: number }
        Returns: number
      }
      credit_monthly_interest: {
        Args: { p_account_id: string; p_amount: number; p_credited_on: string }
        Returns: number
      }
      credit_monthly_interest_with_history: {
        Args: { p_account_id: string; p_amount: number; p_credited_on: string }
        Returns: number
      }
      delete_account_transaction: {
        Args: {
          p_adjust_balance: boolean
          p_transaction_id: string
        }
        Returns: number
      }
      edit_last_account_transaction: {
        Args: {
          p_new_amount: number
          p_new_as_of_date: string
          p_new_reason: string | null
          p_transaction_id: string
        }
        Returns: number
      }
      is_approved: { Args: never; Returns: boolean }
      record_account_transaction: {
        Args: {
          p_account_id: string
          p_amount: number
          p_as_of_date: string
          p_reason: string
          p_type: string
        }
        Returns: number
      }
      refresh_bank_branches: {
        Args: { p_certs: number[]; p_rows: Json }
        Returns: number
      }
      return_sweep: { Args: { p_sweep_id: string }; Returns: undefined }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      swap_queue_positions: {
        Args: {
          p_bank_a: string
          p_bank_b: string
          p_pos_a: number
          p_pos_b: number
        }
        Returns: undefined
      }
      sweep_accounts: {
        Args: { p_items: Json; p_reason: string }
        Returns: {
          account_id: string
          amount: number
          left_behind: number
        }[]
      }
      post_mailed_deposit: {
        Args: {
          p_deposit_id: string
          p_posted_on: string
        }
        Returns: number
      }
      update_account_balance: {
        Args: {
          p_account_id: string
          p_as_of_date: string
          p_new_balance: number
          p_reason?: string
        }
        Returns: number
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
    Enums: {},
  },
} as const
