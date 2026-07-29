export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      ask_query: {
        Row: {
          abstained: string[]
          answer: string | null
          asked_by: string | null
          cited_source_ids: string[]
          created_at: string
          grounded: boolean
          id: string
          latency_ms: number | null
          model: string | null
          question: string
          retrieved_chunk_ids: string[]
          workspace_id: string
        }
        Insert: {
          abstained?: string[]
          answer?: string | null
          asked_by?: string | null
          cited_source_ids?: string[]
          created_at?: string
          grounded?: boolean
          id?: string
          latency_ms?: number | null
          model?: string | null
          question: string
          retrieved_chunk_ids?: string[]
          workspace_id: string
        }
        Update: {
          abstained?: string[]
          answer?: string | null
          asked_by?: string | null
          cited_source_ids?: string[]
          created_at?: string
          grounded?: boolean
          id?: string
          latency_ms?: number | null
          model?: string | null
          question?: string
          retrieved_chunk_ids?: string[]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ask_query_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          approved_by: string | null
          confidence: number | null
          created_at: string
          entity_id: string
          entity_kind: string
          field: string | null
          id: string
          model: string | null
          new_value: Json | null
          prev_value: Json | null
          reason: string | null
          source_ids: string[]
          workspace_id: string
        }
        Insert: {
          action: string
          approved_by?: string | null
          confidence?: number | null
          created_at?: string
          entity_id: string
          entity_kind: string
          field?: string | null
          id?: string
          model?: string | null
          new_value?: Json | null
          prev_value?: Json | null
          reason?: string | null
          source_ids?: string[]
          workspace_id: string
        }
        Update: {
          action?: string
          approved_by?: string | null
          confidence?: number | null
          created_at?: string
          entity_id?: string
          entity_kind?: string
          field?: string | null
          id?: string
          model?: string | null
          new_value?: Json | null
          prev_value?: Json | null
          reason?: string | null
          source_ids?: string[]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      chunk: {
        Row: {
          chunk_index: number
          content: string
          created_at: string
          embedded_at: string | null
          embedding: string | null
          fts: unknown
          id: string
          source_id: string
          token_end: number | null
          token_start: number | null
          workspace_id: string
        }
        Insert: {
          chunk_index: number
          content: string
          created_at?: string
          embedded_at?: string | null
          embedding?: string | null
          fts?: unknown
          id?: string
          source_id: string
          token_end?: number | null
          token_start?: number | null
          workspace_id: string
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string
          embedded_at?: string | null
          embedding?: string | null
          fts?: unknown
          id?: string
          source_id?: string
          token_end?: number | null
          token_start?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chunk_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "source"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chunk_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      commitment: {
        Row: {
          commitment_type: Database["public"]["Enums"]["commitment_type"]
          confidence: number
          created_at: string
          deadline: string | null
          fact_type: Database["public"]["Enums"]["fact_type"]
          id: string
          meeting_id: string | null
          owed_by_person_id: string | null
          owed_by_principal: boolean
          owed_to_person_id: string | null
          owed_to_principal: boolean
          project_id: string | null
          source_ids: string[]
          status: Database["public"]["Enums"]["commitment_status"]
          task_id: string | null
          updated_at: string
          what: string
          workspace_id: string
        }
        Insert: {
          commitment_type?: Database["public"]["Enums"]["commitment_type"]
          confidence?: number
          created_at?: string
          deadline?: string | null
          fact_type?: Database["public"]["Enums"]["fact_type"]
          id?: string
          meeting_id?: string | null
          owed_by_person_id?: string | null
          owed_by_principal?: boolean
          owed_to_person_id?: string | null
          owed_to_principal?: boolean
          project_id?: string | null
          source_ids?: string[]
          status?: Database["public"]["Enums"]["commitment_status"]
          task_id?: string | null
          updated_at?: string
          what: string
          workspace_id: string
        }
        Update: {
          commitment_type?: Database["public"]["Enums"]["commitment_type"]
          confidence?: number
          created_at?: string
          deadline?: string | null
          fact_type?: Database["public"]["Enums"]["fact_type"]
          id?: string
          meeting_id?: string | null
          owed_by_person_id?: string | null
          owed_by_principal?: boolean
          owed_to_person_id?: string | null
          owed_to_principal?: boolean
          project_id?: string | null
          source_ids?: string[]
          status?: Database["public"]["Enums"]["commitment_status"]
          task_id?: string | null
          updated_at?: string
          what?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commitment_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meeting"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commitment_owed_by_person_id_fkey"
            columns: ["owed_by_person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commitment_owed_to_person_id_fkey"
            columns: ["owed_to_person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commitment_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commitment_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "task"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commitment_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      company: {
        Row: {
          aliases: string[]
          created_at: string
          domains: string[]
          id: string
          industry: string | null
          name: string
          opportunity_level: Database["public"]["Enums"]["opportunity_level"]
          risk_level: Database["public"]["Enums"]["risk_level"]
          summary: string | null
          summary_confidence: number
          summary_fact_type: Database["public"]["Enums"]["fact_type"]
          summary_source_ids: string[]
          summary_updated_at: string | null
          type: Database["public"]["Enums"]["company_type"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          aliases?: string[]
          created_at?: string
          domains?: string[]
          id?: string
          industry?: string | null
          name: string
          opportunity_level?: Database["public"]["Enums"]["opportunity_level"]
          risk_level?: Database["public"]["Enums"]["risk_level"]
          summary?: string | null
          summary_confidence?: number
          summary_fact_type?: Database["public"]["Enums"]["fact_type"]
          summary_source_ids?: string[]
          summary_updated_at?: string | null
          type?: Database["public"]["Enums"]["company_type"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          aliases?: string[]
          created_at?: string
          domains?: string[]
          id?: string
          industry?: string | null
          name?: string
          opportunity_level?: Database["public"]["Enums"]["opportunity_level"]
          risk_level?: Database["public"]["Enums"]["risk_level"]
          summary?: string | null
          summary_confidence?: number
          summary_fact_type?: Database["public"]["Enums"]["fact_type"]
          summary_source_ids?: string[]
          summary_updated_at?: string | null
          type?: Database["public"]["Enums"]["company_type"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_brief: {
        Row: {
          brief_date: string
          generated_at: string
          greeting: string | null
          headline: string | null
          id: string
          model: string | null
          stats: Json
          workspace_id: string
        }
        Insert: {
          brief_date: string
          generated_at?: string
          greeting?: string | null
          headline?: string | null
          id?: string
          model?: string | null
          stats?: Json
          workspace_id: string
        }
        Update: {
          brief_date?: string
          generated_at?: string
          greeting?: string | null
          headline?: string | null
          id?: string
          model?: string | null
          stats?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_brief_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_brief_item: {
        Row: {
          badge_label: string | null
          badge_tone: string | null
          body: string
          brief_id: string
          category: string
          commitment_id: string | null
          company_id: string | null
          confidence: number
          created_at: string
          fact_type: Database["public"]["Enums"]["fact_type"]
          id: string
          meeting_id: string | null
          person_id: string | null
          position: number
          project_id: string | null
          source_ids: string[]
          workspace_id: string
        }
        Insert: {
          badge_label?: string | null
          badge_tone?: string | null
          body: string
          brief_id: string
          category: string
          commitment_id?: string | null
          company_id?: string | null
          confidence?: number
          created_at?: string
          fact_type?: Database["public"]["Enums"]["fact_type"]
          id?: string
          meeting_id?: string | null
          person_id?: string | null
          position: number
          project_id?: string | null
          source_ids?: string[]
          workspace_id: string
        }
        Update: {
          badge_label?: string | null
          badge_tone?: string | null
          body?: string
          brief_id?: string
          category?: string
          commitment_id?: string | null
          company_id?: string | null
          confidence?: number
          created_at?: string
          fact_type?: Database["public"]["Enums"]["fact_type"]
          id?: string
          meeting_id?: string | null
          person_id?: string | null
          position?: number
          project_id?: string | null
          source_ids?: string[]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_brief_item_brief_id_fkey"
            columns: ["brief_id"]
            isOneToOne: false
            referencedRelation: "daily_brief"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_brief_item_commitment_id_fkey"
            columns: ["commitment_id"]
            isOneToOne: false
            referencedRelation: "commitment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_brief_item_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_brief_item_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meeting"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_brief_item_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_brief_item_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_brief_item_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      decision: {
        Row: {
          alternatives: string[]
          confidence: number
          created_at: string
          decided_on: string | null
          decision_maker_person_id: string | null
          fact_type: Database["public"]["Enums"]["fact_type"]
          id: string
          meeting_id: string | null
          outcome: string | null
          project_id: string | null
          rationale: string | null
          reversible: boolean | null
          review_date: string | null
          source_ids: string[]
          statement: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          alternatives?: string[]
          confidence?: number
          created_at?: string
          decided_on?: string | null
          decision_maker_person_id?: string | null
          fact_type?: Database["public"]["Enums"]["fact_type"]
          id?: string
          meeting_id?: string | null
          outcome?: string | null
          project_id?: string | null
          rationale?: string | null
          reversible?: boolean | null
          review_date?: string | null
          source_ids?: string[]
          statement: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          alternatives?: string[]
          confidence?: number
          created_at?: string
          decided_on?: string | null
          decision_maker_person_id?: string | null
          fact_type?: Database["public"]["Enums"]["fact_type"]
          id?: string
          meeting_id?: string | null
          outcome?: string | null
          project_id?: string | null
          rationale?: string | null
          reversible?: boolean | null
          review_date?: string | null
          source_ids?: string[]
          statement?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "decision_decision_maker_person_id_fkey"
            columns: ["decision_maker_person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meeting"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      decision_person: {
        Row: {
          confidence: number
          created_at: string
          decision_id: string
          fact_type: Database["public"]["Enums"]["fact_type"]
          person_id: string
          role: string | null
          workspace_id: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          decision_id: string
          fact_type?: Database["public"]["Enums"]["fact_type"]
          person_id: string
          role?: string | null
          workspace_id: string
        }
        Update: {
          confidence?: number
          created_at?: string
          decision_id?: string
          fact_type?: Database["public"]["Enums"]["fact_type"]
          person_id?: string
          role?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "decision_person_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "decision"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_person_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_person_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting: {
        Row: {
          company_id: string | null
          created_at: string
          follow_up_draft: string | null
          follow_up_status: Database["public"]["Enums"]["follow_up_status"]
          id: string
          occurred_at: string
          project_id: string | null
          sentiment: Database["public"]["Enums"]["sentiment"]
          summary: string | null
          summary_confidence: number
          summary_fact_type: Database["public"]["Enums"]["fact_type"]
          summary_source_ids: string[]
          summary_updated_at: string | null
          title: string
          transcript_source_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          follow_up_draft?: string | null
          follow_up_status?: Database["public"]["Enums"]["follow_up_status"]
          id?: string
          occurred_at: string
          project_id?: string | null
          sentiment?: Database["public"]["Enums"]["sentiment"]
          summary?: string | null
          summary_confidence?: number
          summary_fact_type?: Database["public"]["Enums"]["fact_type"]
          summary_source_ids?: string[]
          summary_updated_at?: string | null
          title: string
          transcript_source_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          follow_up_draft?: string | null
          follow_up_status?: Database["public"]["Enums"]["follow_up_status"]
          id?: string
          occurred_at?: string
          project_id?: string | null
          sentiment?: Database["public"]["Enums"]["sentiment"]
          summary?: string | null
          summary_confidence?: number
          summary_fact_type?: Database["public"]["Enums"]["fact_type"]
          summary_source_ids?: string[]
          summary_updated_at?: string | null
          title?: string
          transcript_source_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_transcript_source_id_fkey"
            columns: ["transcript_source_id"]
            isOneToOne: false
            referencedRelation: "source"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_person: {
        Row: {
          confidence: number
          created_at: string
          fact_type: Database["public"]["Enums"]["fact_type"]
          meeting_id: string
          person_id: string
          spoke: boolean
          workspace_id: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          fact_type?: Database["public"]["Enums"]["fact_type"]
          meeting_id: string
          person_id: string
          spoke?: boolean
          workspace_id: string
        }
        Update: {
          confidence?: number
          created_at?: string
          fact_type?: Database["public"]["Enums"]["fact_type"]
          meeting_id?: string
          person_id?: string
          spoke?: boolean
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_person_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meeting"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_person_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_person_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      person: {
        Row: {
          aliases: string[]
          company_id: string | null
          created_at: string
          current_context: string | null
          current_context_confidence: number
          current_context_fact_type: Database["public"]["Enums"]["fact_type"]
          current_context_source_ids: string[]
          current_context_updated_at: string | null
          emails: string[]
          id: string
          last_interaction: string | null
          name: string
          next_action: string | null
          relationship_strength: Database["public"]["Enums"]["relationship_strength"]
          relationship_type: Database["public"]["Enums"]["relationship_type"]
          role: string | null
          timezone: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          aliases?: string[]
          company_id?: string | null
          created_at?: string
          current_context?: string | null
          current_context_confidence?: number
          current_context_fact_type?: Database["public"]["Enums"]["fact_type"]
          current_context_source_ids?: string[]
          current_context_updated_at?: string | null
          emails?: string[]
          id?: string
          last_interaction?: string | null
          name: string
          next_action?: string | null
          relationship_strength?: Database["public"]["Enums"]["relationship_strength"]
          relationship_type?: Database["public"]["Enums"]["relationship_type"]
          role?: string | null
          timezone?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          aliases?: string[]
          company_id?: string | null
          created_at?: string
          current_context?: string | null
          current_context_confidence?: number
          current_context_fact_type?: Database["public"]["Enums"]["fact_type"]
          current_context_source_ids?: string[]
          current_context_updated_at?: string | null
          emails?: string[]
          id?: string
          last_interaction?: string | null
          name?: string
          next_action?: string | null
          relationship_strength?: Database["public"]["Enums"]["relationship_strength"]
          relationship_type?: Database["public"]["Enums"]["relationship_type"]
          role?: string | null
          timezone?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      person_company: {
        Row: {
          company_id: string
          confidence: number
          created_at: string
          ended_on: string | null
          fact_type: Database["public"]["Enums"]["fact_type"]
          is_current: boolean
          person_id: string
          role: string | null
          source_ids: string[]
          started_on: string | null
          workspace_id: string
        }
        Insert: {
          company_id: string
          confidence?: number
          created_at?: string
          ended_on?: string | null
          fact_type?: Database["public"]["Enums"]["fact_type"]
          is_current?: boolean
          person_id: string
          role?: string | null
          source_ids?: string[]
          started_on?: string | null
          workspace_id: string
        }
        Update: {
          company_id?: string
          confidence?: number
          created_at?: string
          ended_on?: string | null
          fact_type?: Database["public"]["Enums"]["fact_type"]
          is_current?: boolean
          person_id?: string
          role?: string | null
          source_ids?: string[]
          started_on?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_company_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_company_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_company_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      project: {
        Row: {
          aliases: string[]
          blockers: string[]
          company_id: string | null
          created_at: string
          deadline: string | null
          id: string
          name: string
          next_action: string | null
          outcome: string | null
          owner_person_id: string | null
          status: Database["public"]["Enums"]["project_status"]
          summary: string | null
          summary_confidence: number
          summary_fact_type: Database["public"]["Enums"]["fact_type"]
          summary_source_ids: string[]
          summary_updated_at: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          aliases?: string[]
          blockers?: string[]
          company_id?: string | null
          created_at?: string
          deadline?: string | null
          id?: string
          name: string
          next_action?: string | null
          outcome?: string | null
          owner_person_id?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          summary?: string | null
          summary_confidence?: number
          summary_fact_type?: Database["public"]["Enums"]["fact_type"]
          summary_source_ids?: string[]
          summary_updated_at?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          aliases?: string[]
          blockers?: string[]
          company_id?: string | null
          created_at?: string
          deadline?: string | null
          id?: string
          name?: string
          next_action?: string | null
          outcome?: string | null
          owner_person_id?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          summary?: string | null
          summary_confidence?: number
          summary_fact_type?: Database["public"]["Enums"]["fact_type"]
          summary_source_ids?: string[]
          summary_updated_at?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_owner_person_id_fkey"
            columns: ["owner_person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      project_company: {
        Row: {
          company_id: string
          confidence: number
          created_at: string
          fact_type: Database["public"]["Enums"]["fact_type"]
          project_id: string
          role: string | null
          source_ids: string[]
          workspace_id: string
        }
        Insert: {
          company_id: string
          confidence?: number
          created_at?: string
          fact_type?: Database["public"]["Enums"]["fact_type"]
          project_id: string
          role?: string | null
          source_ids?: string[]
          workspace_id: string
        }
        Update: {
          company_id?: string
          confidence?: number
          created_at?: string
          fact_type?: Database["public"]["Enums"]["fact_type"]
          project_id?: string
          role?: string | null
          source_ids?: string[]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_company_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_company_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_company_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      project_person: {
        Row: {
          confidence: number
          created_at: string
          fact_type: Database["public"]["Enums"]["fact_type"]
          person_id: string
          project_id: string
          role: string | null
          source_ids: string[]
          workspace_id: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          fact_type?: Database["public"]["Enums"]["fact_type"]
          person_id: string
          project_id: string
          role?: string | null
          source_ids?: string[]
          workspace_id: string
        }
        Update: {
          confidence?: number
          created_at?: string
          fact_type?: Database["public"]["Enums"]["fact_type"]
          person_id?: string
          project_id?: string
          role?: string | null
          source_ids?: string[]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_person_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_person_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_person_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      resolution_hint: {
        Row: {
          context_hint: string | null
          created_at: string
          created_from_review_item_id: string | null
          entity_id: string | null
          entity_kind: string
          id: string
          mention: string
          workspace_id: string
        }
        Insert: {
          context_hint?: string | null
          created_at?: string
          created_from_review_item_id?: string | null
          entity_id?: string | null
          entity_kind: string
          id?: string
          mention: string
          workspace_id: string
        }
        Update: {
          context_hint?: string | null
          created_at?: string
          created_from_review_item_id?: string | null
          entity_id?: string | null
          entity_kind?: string
          id?: string
          mention?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resolution_hint_created_from_review_item_id_fkey"
            columns: ["created_from_review_item_id"]
            isOneToOne: false
            referencedRelation: "review_item"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resolution_hint_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      review_item: {
        Row: {
          candidates: Json
          chunk_id: string | null
          confidence: number
          correction: Json | null
          created_at: string
          entity_id: string | null
          entity_kind: string
          excerpt: string | null
          fact_type: Database["public"]["Enums"]["fact_type"]
          id: string
          proposed: Json
          reason: Database["public"]["Enums"]["review_reason"]
          resolved_at: string | null
          resolved_by: string | null
          source_id: string | null
          source_ids: string[]
          status: Database["public"]["Enums"]["review_status"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          candidates?: Json
          chunk_id?: string | null
          confidence?: number
          correction?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_kind: string
          excerpt?: string | null
          fact_type?: Database["public"]["Enums"]["fact_type"]
          id?: string
          proposed: Json
          reason: Database["public"]["Enums"]["review_reason"]
          resolved_at?: string | null
          resolved_by?: string | null
          source_id?: string | null
          source_ids?: string[]
          status?: Database["public"]["Enums"]["review_status"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          candidates?: Json
          chunk_id?: string | null
          confidence?: number
          correction?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_kind?: string
          excerpt?: string | null
          fact_type?: Database["public"]["Enums"]["fact_type"]
          id?: string
          proposed?: Json
          reason?: Database["public"]["Enums"]["review_reason"]
          resolved_at?: string | null
          resolved_by?: string | null
          source_id?: string | null
          source_ids?: string[]
          status?: Database["public"]["Enums"]["review_status"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_item_chunk_id_fkey"
            columns: ["chunk_id"]
            isOneToOne: false
            referencedRelation: "chunk"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_item_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "source"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_item_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      source: {
        Row: {
          author: string | null
          body: string | null
          created_at: string
          error: string | null
          id: string
          ingested_at: string | null
          kind: Database["public"]["Enums"]["source_kind"]
          metadata: Json
          occurred_at: string | null
          original_ref: string | null
          participants: string[]
          status: Database["public"]["Enums"]["source_status"]
          storage_path: string | null
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          author?: string | null
          body?: string | null
          created_at?: string
          error?: string | null
          id?: string
          ingested_at?: string | null
          kind: Database["public"]["Enums"]["source_kind"]
          metadata?: Json
          occurred_at?: string | null
          original_ref?: string | null
          participants?: string[]
          status?: Database["public"]["Enums"]["source_status"]
          storage_path?: string | null
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          author?: string | null
          body?: string | null
          created_at?: string
          error?: string | null
          id?: string
          ingested_at?: string | null
          kind?: Database["public"]["Enums"]["source_kind"]
          metadata?: Json
          occurred_at?: string | null
          original_ref?: string | null
          participants?: string[]
          status?: Database["public"]["Enums"]["source_status"]
          storage_path?: string | null
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      source_mention: {
        Row: {
          chunk_id: string | null
          company_id: string | null
          confidence: number
          created_at: string
          excerpt: string | null
          fact_type: Database["public"]["Enums"]["fact_type"]
          id: string
          meeting_id: string | null
          person_id: string | null
          project_id: string | null
          source_id: string
          workspace_id: string
        }
        Insert: {
          chunk_id?: string | null
          company_id?: string | null
          confidence?: number
          created_at?: string
          excerpt?: string | null
          fact_type?: Database["public"]["Enums"]["fact_type"]
          id?: string
          meeting_id?: string | null
          person_id?: string | null
          project_id?: string | null
          source_id: string
          workspace_id: string
        }
        Update: {
          chunk_id?: string | null
          company_id?: string | null
          confidence?: number
          created_at?: string
          excerpt?: string | null
          fact_type?: Database["public"]["Enums"]["fact_type"]
          id?: string
          meeting_id?: string | null
          person_id?: string | null
          project_id?: string | null
          source_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_mention_chunk_id_fkey"
            columns: ["chunk_id"]
            isOneToOne: false
            referencedRelation: "chunk"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_mention_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_mention_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meeting"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_mention_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_mention_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_mention_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "source"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_mention_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      task: {
        Row: {
          commitment_type: Database["public"]["Enums"]["commitment_type"]
          confidence: number
          created_at: string
          description: string
          due_date: string | null
          fact_type: Database["public"]["Enums"]["fact_type"]
          id: string
          owned_by_principal: boolean
          owner_person_id: string | null
          priority: Database["public"]["Enums"]["priority"]
          project_id: string | null
          source_ids: string[]
          status: Database["public"]["Enums"]["task_status"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          commitment_type?: Database["public"]["Enums"]["commitment_type"]
          confidence?: number
          created_at?: string
          description: string
          due_date?: string | null
          fact_type?: Database["public"]["Enums"]["fact_type"]
          id?: string
          owned_by_principal?: boolean
          owner_person_id?: string | null
          priority?: Database["public"]["Enums"]["priority"]
          project_id?: string | null
          source_ids?: string[]
          status?: Database["public"]["Enums"]["task_status"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          commitment_type?: Database["public"]["Enums"]["commitment_type"]
          confidence?: number
          created_at?: string
          description?: string
          due_date?: string | null
          fact_type?: Database["public"]["Enums"]["fact_type"]
          id?: string
          owned_by_principal?: boolean
          owner_person_id?: string | null
          priority?: Database["public"]["Enums"]["priority"]
          project_id?: string | null
          source_ids?: string[]
          status?: Database["public"]["Enums"]["task_status"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_owner_person_id_fkey"
            columns: ["owner_person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_user_id: string
          principal_company: string | null
          principal_name: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_user_id: string
          principal_company?: string | null
          principal_name: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_user_id?: string
          principal_company?: string | null
          principal_name?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      match_chunks: {
        Args: {
          p_full_text_weight?: number
          p_match_count?: number
          p_query_embedding?: string
          p_query_text?: string
          p_rrf_k?: number
          p_semantic_weight?: number
          p_since?: string
          p_source_kinds?: Database["public"]["Enums"]["source_kind"][]
          p_workspace_id: string
        }
        Returns: {
          chunk_id: string
          content: string
          full_text_rank: number
          occurred_at: string
          score: number
          semantic_rank: number
          source_id: string
          source_kind: Database["public"]["Enums"]["source_kind"]
          source_title: string
          token_end: number
          token_start: number
        }[]
      }
    }
    Enums: {
      commitment_status:
        | "open"
        | "due"
        | "overdue"
        | "met"
        | "broken"
        | "released"
      commitment_type:
        | "explicit"
        | "implied"
        | "suggested"
        | "delegated"
        | "waiting"
      company_type:
        | "client"
        | "prospect"
        | "investor"
        | "partner"
        | "vendor"
        | "competitor"
        | "unknown"
      fact_type:
        | "direct_source_fact"
        | "user_stated"
        | "extracted"
        | "inference"
        | "recommendation"
      follow_up_status: "none_needed" | "pending" | "drafted" | "sent"
      opportunity_level: "none" | "low" | "medium" | "high"
      priority: "low" | "normal" | "high" | "urgent"
      project_status:
        | "not_started"
        | "on_track"
        | "at_risk"
        | "slipping"
        | "blocked"
        | "done"
        | "abandoned"
      relationship_strength:
        | "strong"
        | "steady"
        | "cooling"
        | "cold"
        | "unknown"
      relationship_type:
        | "client"
        | "prospect"
        | "investor"
        | "advisor"
        | "teammate"
        | "partner"
        | "vendor"
        | "unknown"
      review_reason:
        | "low_confidence"
        | "ambiguous_entity"
        | "conflicting_sources"
        | "unparsed_date"
        | "inference_needs_confirm"
      review_status: "pending" | "approved" | "rejected" | "corrected"
      risk_level: "none" | "low" | "medium" | "high"
      sentiment: "positive" | "neutral" | "tense" | "negative" | "unknown"
      source_kind: "email" | "meeting" | "doc" | "note" | "upload" | "crm"
      source_status:
        | "captured"
        | "extracting"
        | "chunking"
        | "analyzing"
        | "resolving"
        | "ingested"
        | "failed"
      task_status: "open" | "in_progress" | "waiting" | "done" | "dropped"
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
      commitment_status: [
        "open",
        "due",
        "overdue",
        "met",
        "broken",
        "released",
      ],
      commitment_type: [
        "explicit",
        "implied",
        "suggested",
        "delegated",
        "waiting",
      ],
      company_type: [
        "client",
        "prospect",
        "investor",
        "partner",
        "vendor",
        "competitor",
        "unknown",
      ],
      fact_type: [
        "direct_source_fact",
        "user_stated",
        "extracted",
        "inference",
        "recommendation",
      ],
      follow_up_status: ["none_needed", "pending", "drafted", "sent"],
      opportunity_level: ["none", "low", "medium", "high"],
      priority: ["low", "normal", "high", "urgent"],
      project_status: [
        "not_started",
        "on_track",
        "at_risk",
        "slipping",
        "blocked",
        "done",
        "abandoned",
      ],
      relationship_strength: ["strong", "steady", "cooling", "cold", "unknown"],
      relationship_type: [
        "client",
        "prospect",
        "investor",
        "advisor",
        "teammate",
        "partner",
        "vendor",
        "unknown",
      ],
      review_reason: [
        "low_confidence",
        "ambiguous_entity",
        "conflicting_sources",
        "unparsed_date",
        "inference_needs_confirm",
      ],
      review_status: ["pending", "approved", "rejected", "corrected"],
      risk_level: ["none", "low", "medium", "high"],
      sentiment: ["positive", "neutral", "tense", "negative", "unknown"],
      source_kind: ["email", "meeting", "doc", "note", "upload", "crm"],
      source_status: [
        "captured",
        "extracting",
        "chunking",
        "analyzing",
        "resolving",
        "ingested",
        "failed",
      ],
      task_status: ["open", "in_progress", "waiting", "done", "dropped"],
    },
  },
} as const

