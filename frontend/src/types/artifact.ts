/**
 * Artifact types for bug/feature tracking.
 *
 * Mirrors backend schemas/artifact.py for easy cross-reference.
 */

export interface ArtifactCategory {
  id: number;
  name: string;
  created_at: string;
}

export interface Artifact {
  id: number;
  title: string;
  description: string | null;
  artifact_type: string;  // "bug" | "feature" | "task"
  status: string;         // "new" | "open" | "in_progress" | "icebox" | "closed"
  priority: string | null; // "urgent" | "high" | "medium" | "low"
  area: string | null;     // functional area (login_auth, streams, etc.)
  category: string | null;
  created_by: number;
  created_at: string;
  updated_at: string;
}
