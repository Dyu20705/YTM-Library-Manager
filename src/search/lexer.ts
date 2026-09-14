export type TokenType =
  | 'OR'
  | 'AND'
  | 'NOT'
  | 'LPAREN'
  | 'RPAREN'
  | 'COLON'
  | 'OPERATOR'
  | 'IDENTIFIER'
  | 'QUOTED_STRING'
  | 'WORD'
  | 'EOF';

export interface Token {
  type: TokenType;
  value: string;
  pos: number;
}

const IDENTIFIERS = new Set(['artist', 'album', 'playlist', 'year', 'duration', 'liked']);

export class Lexer {
  private pos = 0;
  private readonly input: string;

  constructor(input: string) {
    this.input = input.trim();
  }

  public tokenize(): Token[] {
    const tokens: Token[] = [];
    while (this.pos < this.input.length) {
      const char = this.input[this.pos];

      if (/\s/.test(char!)) {
        this.pos++;
        continue;
      }

      if (char === '(') {
        tokens.push({ type: 'LPAREN', value: '(', pos: this.pos++ });
        continue;
      }

      if (char === ')') {
        tokens.push({ type: 'RPAREN', value: ')', pos: this.pos++ });
        continue;
      }

      if (char === ':') {
        tokens.push({ type: 'COLON', value: ':', pos: this.pos++ });
        continue;
      }

      // Quoted string
      if (char === '"') {
        tokens.push(this.readQuotedString());
        continue;
      }

      // 2-character operators
      const twoChars = this.input.substring(this.pos, this.pos + 2);
      if (['>=', '<=', '!='].includes(twoChars)) {
        tokens.push({ type: 'OPERATOR', value: twoChars, pos: this.pos });
        this.pos += 2;
        continue;
      }

      // 1-character operators
      if (['>', '<', '='].includes(char!)) {
        tokens.push({ type: 'OPERATOR', value: char!, pos: this.pos });
        this.pos++;
        continue;
      }

      // Single char NOT / OR / AND
      if (char === '!') {
        tokens.push({ type: 'NOT', value: '!', pos: this.pos++ });
        continue;
      }
      if (char === '|') {
        tokens.push({ type: 'OR', value: '|', pos: this.pos++ });
        continue;
      }
      if (char === '&') {
        tokens.push({ type: 'AND', value: '&', pos: this.pos++ });
        continue;
      }

      // Minus sign as NOT prefix if followed immediately by word/ident/paren
      if (char === '-') {
        tokens.push({ type: 'NOT', value: '-', pos: this.pos++ });
        continue;
      }

      // Words / keywords
      tokens.push(this.readWord());
    }

    tokens.push({ type: 'EOF', value: '', pos: this.pos });
    return tokens;
  }

  private readQuotedString(): Token {
    const startPos = this.pos;
    this.pos++; // Skip open quote
    let value = '';
    while (this.pos < this.input.length && this.input[this.pos] !== '"') {
      if (this.input[this.pos] === '\\' && this.pos + 1 < this.input.length) {
        this.pos++;
        value += this.input[this.pos];
      } else {
        value += this.input[this.pos];
      }
      this.pos++;
    }
    if (this.pos < this.input.length && this.input[this.pos] === '"') {
      this.pos++; // Skip close quote
    }
    return { type: 'QUOTED_STRING', value, pos: startPos };
  }

  private readWord(): Token {
    const startPos = this.pos;
    let word = '';
    while (
      this.pos < this.input.length &&
      !/[\s()":!<>=|&]/.test(this.input[this.pos]!)
    ) {
      word += this.input[this.pos];
      this.pos++;
    }

    const upper = word.toUpperCase();
    if (upper === 'OR') {
      return { type: 'OR', value: 'OR', pos: startPos };
    }
    if (upper === 'AND') {
      return { type: 'AND', value: 'AND', pos: startPos };
    }
    if (upper === 'NOT') {
      return { type: 'NOT', value: 'NOT', pos: startPos };
    }

    const lower = word.toLowerCase();
    if (IDENTIFIERS.has(lower)) {
      return { type: 'IDENTIFIER', value: lower, pos: startPos };
    }

    return { type: 'WORD', value: word, pos: startPos };
  }
}
