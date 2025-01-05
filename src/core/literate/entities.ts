import * as vscode from 'vscode';
import { PandocCodeBlock } from '../pandoc/types';

/** Location information for a code block within a document */
export interface DocumentRange {
  uri: vscode.Uri;
  id_pos: vscode.Range;
}
export interface CodeBlockRange extends DocumentRange {
  range: vscode.Range;
}

/** Represents a code block within a document with additional metadata */
export interface DocumentBlock extends PandocCodeBlock {
  location: CodeBlockRange;
  expandedContent?: string;
  dependencies: Set<string>;
  dependents: Set<string>;
  // referenceRanges: vscode.Range[];
}

export interface NoWebReference {
  identifier: string;
  location: DocumentRange;
}
export interface NoWebReferenceByIdentifier {
  [identifier: string]: NoWebReference;
}

/** Maps block identifiers to their document blocks */
export interface DocumentBlocksByIdentifier {
  [identifier: string]: DocumentBlock[];
}

/** Maps URIs to their block collections */
export interface DocumentBlocks {
  [uri: string]: DocumentBlocksByIdentifier;
}

/** Represents a circular reference in the code blocks */
export interface CircularReference {
  path: string[];
  start: string;
}
