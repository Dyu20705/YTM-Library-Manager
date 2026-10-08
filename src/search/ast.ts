export type AstNode =
  | OrNode
  | AndNode
  | NotNode
  | FieldNode
  | TermNode;

export interface OrNode {
  type: 'OR';
  left: AstNode;
  right: AstNode;
}

export interface AndNode {
  type: 'AND';
  left: AstNode;
  right: AstNode;
}

export interface NotNode {
  type: 'NOT';
  expr: AstNode;
}

export type FieldIdentifier = 'artist' | 'album' | 'playlist' | 'year' | 'duration' | 'liked' | 'title';
export type ComparisonOperator = '>=' | '<=' | '>' | '<' | '!=' | '=';

export interface FieldNode {
  type: 'FIELD';
  field: FieldIdentifier;
  operator: ComparisonOperator;
  value: string;
}

export interface TermNode {
  type: 'TERM';
  term: string;
  isQuoted: boolean;
}
