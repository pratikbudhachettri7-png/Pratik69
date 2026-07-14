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
      bill_lines: {
        Row: {
          bill_id: string
          code: string | null
          created_at: string
          expiry_date: string | null
          id: string
          line_amount: number
          lot_number: string | null
          name: string
          per_unit: number
          quantity: number
          ref_id: string | null
          ref_type: Database["public"]["Enums"]["line_ref_type"] | null
          sno: number
          uom: string | null
          vat_rate: number
        }
        Insert: {
          bill_id: string
          code?: string | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          line_amount?: number
          lot_number?: string | null
          name: string
          per_unit?: number
          quantity?: number
          ref_id?: string | null
          ref_type?: Database["public"]["Enums"]["line_ref_type"] | null
          sno?: number
          uom?: string | null
          vat_rate?: number
        }
        Update: {
          bill_id?: string
          code?: string | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          line_amount?: number
          lot_number?: string | null
          name?: string
          per_unit?: number
          quantity?: number
          ref_id?: string | null
          ref_type?: Database["public"]["Enums"]["line_ref_type"] | null
          sno?: number
          uom?: string | null
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "bill_lines_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
        ]
      }
      bills: {
        Row: {
          approved_at: string | null
          attachment_url: string | null
          bill_number: string | null
          bill_type: Database["public"]["Enums"]["bill_type"]
          company_id: string | null
          created_at: string
          discount: number
          exempted_amount: number
          extracted_json: Json | null
          final_amount: number
          id: string
          internal_bill_number: string | null
          invoice_date: string | null
          notes: string | null
          other_charges: number
          po_number: string | null
          status: Database["public"]["Enums"]["bill_status"]
          tax_type: string | null
          taxable_amount: number
          transportation: number
          updated_at: string
          vat_amount: number
          vendor_id: string | null
        }
        Insert: {
          approved_at?: string | null
          attachment_url?: string | null
          bill_number?: string | null
          bill_type: Database["public"]["Enums"]["bill_type"]
          company_id?: string | null
          created_at?: string
          discount?: number
          exempted_amount?: number
          extracted_json?: Json | null
          final_amount?: number
          id?: string
          internal_bill_number?: string | null
          invoice_date?: string | null
          notes?: string | null
          other_charges?: number
          po_number?: string | null
          status?: Database["public"]["Enums"]["bill_status"]
          tax_type?: string | null
          taxable_amount?: number
          transportation?: number
          updated_at?: string
          vat_amount?: number
          vendor_id?: string | null
        }
        Update: {
          approved_at?: string | null
          attachment_url?: string | null
          bill_number?: string | null
          bill_type?: Database["public"]["Enums"]["bill_type"]
          company_id?: string | null
          created_at?: string
          discount?: number
          exempted_amount?: number
          extracted_json?: Json | null
          final_amount?: number
          id?: string
          internal_bill_number?: string | null
          invoice_date?: string | null
          notes?: string | null
          other_charges?: number
          po_number?: string | null
          status?: Database["public"]["Enums"]["bill_status"]
          tax_type?: string | null
          taxable_amount?: number
          transportation?: number
          updated_at?: string
          vat_amount?: number
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bills_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          email: string | null
          id: string
          is_default: boolean
          name: string
          pan: string | null
          phone: string | null
          pincode: string | null
          state: string | null
          updated_at: string
          vat_number: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_default?: boolean
          name: string
          pan?: string | null
          phone?: string | null
          pincode?: string | null
          state?: string | null
          updated_at?: string
          vat_number?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_default?: boolean
          name?: string
          pan?: string | null
          phone?: string | null
          pincode?: string | null
          state?: string | null
          updated_at?: string
          vat_number?: string | null
        }
        Relationships: []
      }
      customers: {
        Row: {
          billing_address: string | null
          city: string | null
          contact_person: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          pincode: string | null
          state: string | null
          updated_at: string
          vat_number: string | null
        }
        Insert: {
          billing_address?: string | null
          city?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          pincode?: string | null
          state?: string | null
          updated_at?: string
          vat_number?: string | null
        }
        Update: {
          billing_address?: string | null
          city?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          pincode?: string | null
          state?: string | null
          updated_at?: string
          vat_number?: string | null
        }
        Relationships: []
      }
      fixed_assets: {
        Row: {
          asset_code: string
          asset_name: string
          category: string | null
          created_at: string
          default_rate: number
          depreciation_method: string | null
          depreciation_rate: number | null
          description: string | null
          hsn_code: string | null
          id: string
          pan: string | null
          purchase_cost: number
          purchase_date: string | null
          qty: number
          status: string
          total_cost: number
          uom: string
          updated_at: string
          vat_rate: number
        }
        Insert: {
          asset_code: string
          asset_name: string
          category?: string | null
          created_at?: string
          default_rate?: number
          depreciation_method?: string | null
          depreciation_rate?: number | null
          description?: string | null
          hsn_code?: string | null
          id?: string
          pan?: string | null
          purchase_cost?: number
          purchase_date?: string | null
          qty?: number
          status?: string
          total_cost?: number
          uom?: string
          updated_at?: string
          vat_rate?: number
        }
        Update: {
          asset_code?: string
          asset_name?: string
          category?: string | null
          created_at?: string
          default_rate?: number
          depreciation_method?: string | null
          depreciation_rate?: number | null
          description?: string | null
          hsn_code?: string | null
          id?: string
          pan?: string | null
          purchase_cost?: number
          purchase_date?: string | null
          qty?: number
          status?: string
          total_cost?: number
          uom?: string
          updated_at?: string
          vat_rate?: number
        }
        Relationships: []
      }
      items: {
        Row: {
          alt_uom: string | null
          alt_uom_conversion: number | null
          created_at: string
          default_rate: number
          description: string | null
          hsn_code: string | null
          id: string
          is_service: boolean
          item_code: string
          item_name: string
          qty: number
          reorder_level: number
          selling_price: number
          uom: string
          updated_at: string
          vat_rate: number
          warehouse: string | null
          status: string
        }
        Insert: {
          alt_uom?: string | null
          alt_uom_conversion?: number | null
          created_at?: string
          default_rate?: number
          description?: string | null
          hsn_code?: string | null
          id?: string
          is_service?: boolean
          item_code: string
          item_name: string
          qty?: number
          reorder_level?: number
          selling_price?: number
          uom?: string
          updated_at?: string
          vat_rate?: number
          warehouse?: string | null
          status?: string
        }
        Update: {
          alt_uom?: string | null
          alt_uom_conversion?: number | null
          created_at?: string
          default_rate?: number
          description?: string | null
          hsn_code?: string | null
          id?: string
          is_service?: boolean
          item_code?: string
          item_name?: string
          qty?: number
          reorder_level?: number
          selling_price?: number
          uom?: string
          updated_at?: string
          vat_rate?: number
          warehouse?: string | null
          status?: string
        }
        Relationships: []
      }
      ledgers: {
        Row: {
          id: string
          vendor_id: string
          bill_id: string | null
          date: string
          description: string
          debit: number
          credit: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          vendor_id: string
          bill_id?: string | null
          date?: string
          description: string
          debit?: number
          credit?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          vendor_id?: string
          bill_id?: string | null
          date?: string
          description?: string
          debit?: number
          credit?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledgers_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledgers_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          }
        ]
      }
      vendors: {
        Row: {
          address: string | null
          city: string | null
          contact_person: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          pan: string | null
          payment_terms: string | null
          phone: string | null
          pincode: string | null
          state: string | null
          updated_at: string
          vat_number: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          pan?: string | null
          payment_terms?: string | null
          phone?: string | null
          pincode?: string | null
          state?: string | null
          updated_at?: string
          vat_number?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          pan?: string | null
          payment_terms?: string | null
          phone?: string | null
          pincode?: string | null
          state?: string | null
          updated_at?: string
          vat_number?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      bill_status: "draft" | "approved"
      bill_type: "items" | "services" | "fixed_assets"
      line_ref_type: "item" | "service" | "asset"
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
      bill_status: ["draft", "approved"],
      bill_type: ["items", "services", "fixed_assets"],
      line_ref_type: ["item", "service", "asset"],
    },
  },
} as const
