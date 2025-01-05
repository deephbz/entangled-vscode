import * as vscode from 'vscode';
import { PandocCodeBlock } from '../pandoc/types';

/** Location information for a code block within a document */
export interface CodeBlockLocation {
  uri: vscode.Uri;
  id_pos: vscode.Range;
  range: vscode.Range;
}

/** Represents a code block within a document with additional metadata */
export interface DocumentBlock extends PandocCodeBlock {
  location: CodeBlockLocation;
  expandedContent?: string;
  dependencies: Set<string>;
  dependents: Set<string>;
  // referenceRanges: vscode.Range[];
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
