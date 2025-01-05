/** Base interface for entities with identifiers */
export interface IdentifiableEntity {
  identifier: string;
}

export interface PandocCodeBlock extends IdentifiableEntity {
  blockCount: number; // Sequential ID across all blocks in the document
  idCount: number; // Sequential ID for blocks with the same identifier
  language: string;
  content: string;
  references: string[];
  keyValuePairs: [string, string][];
  extraClasses: string[];
}

export interface PandocASTNode {
  t: string; // type
  c: any; // content
}

export interface PandocAST {
  blocks: PandocASTNode[];
  meta: Record<string, any>;
  pandoc_version: string[];
}
