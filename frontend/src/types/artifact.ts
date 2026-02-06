/**
 * Artifact types for bug/feature tracking.
 *
 * Mirrors backend schemas/artifact.py for easy cross-reference.
 */

export interface Artifact {
  id: number;
  title: string;
  description: string | null;
  artifact_type: string;  // "bug" | "feature"
  status: string;         // "open" | "in_progress" | "closed"
  created_by: number;
  created_at: string;
  updated_at: string;
}
