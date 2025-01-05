import * as vscode from 'vscode';
import { IdentifiableEntity, PandocCodeBlock } from '../pandoc/types';

/** Base interface for document location information */
export interface DocumentRange {
  uri: vscode.Uri;
  id_pos: vscode.Range;
}

/** Extended range information for code blocks */
export interface CodeBlockLocation extends DocumentRange {
  range: vscode.Range;
}

/** Code block with metadata and dependency information */
export interface DocumentBlock extends PandocCodeBlock {
  location: CodeBlockLocation;
  expandedContent?: string;
  dependencies: Set<string>;
  dependents: Set<string>;
}

/** Reference without web content */
export interface NoWebReference extends IdentifiableEntity {
  location: DocumentRange;
  isInCodeBlock: boolean;
}
/** Single document level collections */
export interface DocumentEntities {
  blocks: Record<string, DocumentBlock[]>;
  references: Record<string, NoWebReference[]>;
}

/** Workspace level collection mapping URIs to document entities */
export type WorkspaceEntities = Record<string, DocumentEntities>;

/** Represents a circular reference in the code blocks */
export interface CircularReference {
  path: string[];
  start: string;
}
