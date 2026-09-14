import { Token } from './lexer.js';
import {
  AstNode,
  OrNode,
  AndNode,
  NotNode,
  FieldNode,
  TermNode,
  FieldIdentifier,
  ComparisonOperator
} from './ast.js';

export class Parser {
  private current = 0;

  constructor(private readonly tokens: Token[]) {}

  public parse(): AstNode | null {
    if (this.isAtEnd()) {
      return null;
    }
    const expr = this.orExpr();
    return expr;
  }

  // OrExpr ::= AndExpr ( ("OR" | "|") AndExpr )*
  private orExpr(): AstNode {
    let expr = this.andExpr();

    while (this.match('OR')) {
      const right = this.andExpr();
      expr = { type: 'OR', left: expr, right } as OrNode;
    }

    return expr;
  }

  // AndExpr ::= UnaryExpr ( ( "AND" | "&" )? UnaryExpr )*
  private andExpr(): AstNode {
    let expr = this.unaryExpr();

    while (!this.isAtEnd() && this.canStartUnary(this.peek())) {
      if (this.match('AND')) {
        // Explicit AND consumed
      }
      const right = this.unaryExpr();
      expr = { type: 'AND', left: expr, right } as AndNode;
    }

    return expr;
  }

  // UnaryExpr ::= ( "NOT" | "!" | "-" ) UnaryExpr | PrimaryExpr
  private unaryExpr(): AstNode {
    if (this.match('NOT')) {
      const sub = this.unaryExpr();
      return { type: 'NOT', expr: sub } as NotNode;
    }
    return this.primaryExpr();
  }

  // PrimaryExpr ::= FieldExpr | GroupExpr | TermExpr
  private primaryExpr(): AstNode {
    // GroupExpr: "(" OrExpr ")"
    if (this.match('LPAREN')) {
      const expr = this.orExpr();
      this.consume('RPAREN', "Expected ')' after grouping expression");
      return expr;
    }

    // FieldExpr: Identifier ":" ( Operator )? Value
    if (this.check('IDENTIFIER') && this.checkNext('COLON')) {
      const identToken = this.advance();
      this.advance(); // consume COLON

      let operator: ComparisonOperator = '=';
      if (this.check('OPERATOR')) {
        operator = this.advance().value as ComparisonOperator;
      }

      let value = '';
      if (this.check('QUOTED_STRING') || this.check('WORD') || this.check('IDENTIFIER')) {
        value = this.advance().value;
      } else {
        throw new Error(`Expected value after field '${identToken.value}:' at position ${identToken.pos}`);
      }

      return {
        type: 'FIELD',
        field: identToken.value as FieldIdentifier,
        operator,
        value
      } as FieldNode;
    }

    // TermExpr: QuotedString | Word | Identifier (treated as bare term if no colon)
    if (this.match('QUOTED_STRING')) {
      return {
        type: 'TERM',
        term: this.previous().value,
        isQuoted: true
      } as TermNode;
    }

    if (this.match('WORD') || this.match('IDENTIFIER')) {
      return {
        type: 'TERM',
        term: this.previous().value,
        isQuoted: false
      } as TermNode;
    }

    throw new Error(`Unexpected token '${this.peek().value}' at position ${this.peek().pos}`);
  }

  private canStartUnary(token: Token): boolean {
    if (token.type === 'OR' || token.type === 'RPAREN' || token.type === 'EOF') {
      return false;
    }
    return true;
  }

  private match(...types: string[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private check(type: string): boolean {
    if (this.isAtEnd()) return false;
    return this.peek().type === type;
  }

  private checkNext(type: string): boolean {
    if (this.current + 1 >= this.tokens.length) return false;
    return this.tokens[this.current + 1]!.type === type;
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.previous();
  }

  private isAtEnd(): boolean {
    return this.peek().type === 'EOF';
  }

  private peek(): Token {
    return this.tokens[this.current] ?? { type: 'EOF', value: '', pos: -1 };
  }

  private previous(): Token {
    return this.tokens[this.current - 1]!;
  }

  private consume(type: string, message: string): Token {
    if (this.check(type)) return this.advance();
    throw new Error(`${message} at position ${this.peek().pos}`);
  }
}
