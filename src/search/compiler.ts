import { AstNode, FieldNode, TermNode } from './ast.js';
import { normalizeText } from '../storage/repositories/track_repository.js';
import { Lexer } from './lexer.js';
import { Parser } from './parser.js';

export interface ParameterizedQueryPlan {
  sql: string;
  params: unknown[];
}

export class SearchQueryCompiler {
  private params: unknown[] = [];

  /**
   * Parse a raw search query string and compile it into a parameterized SQL plan.
   */
  public static compile(queryString: string, limit = 100): ParameterizedQueryPlan {
    const lexer = new Lexer(queryString);
    const tokens = lexer.tokenize();
    let orderBy = 'tracks.title ASC, tracks.id ASC';
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i]?.value.toLowerCase() === 'sort' && tokens[i + 1]?.type === 'COLON') {
        const columns: Record<string, string> = { title: 'tracks.title', duration: 'tracks.duration_seconds', dateAdded: 'tracks.first_seen_at' };
        const column = columns[tokens[i + 2]?.value ?? ''];
        const direction = tokens[i + 4]?.value.toUpperCase();
        if (!column || tokens[i + 3]?.type !== 'COLON' || !['ASC', 'DESC'].includes(direction ?? '')) throw new Error('Invalid sort directive');
        orderBy = `${column} ${direction}, tracks.id ASC`;
        tokens.splice(i, 5); i--;
      }
    }
    const parser = new Parser(tokens);
    const ast = parser.parse();

    const compiler = new SearchQueryCompiler();
    return compiler.compileAst(ast, limit, orderBy);
  }

  public compileAst(ast: AstNode | null, limit = 100, orderBy = 'tracks.title ASC, tracks.id ASC'): ParameterizedQueryPlan {
    this.params = [];

    if (!ast) {
      return {
        sql: `SELECT tracks.* FROM tracks ORDER BY ${orderBy} LIMIT ?;`,
        params: [limit]
      };
    }

    const whereClause = this.compileNode(ast);
    this.params.push(limit);

    return {
      sql: `SELECT tracks.* FROM tracks WHERE ${whereClause} ORDER BY ${orderBy} LIMIT ?;`,
      params: this.params
    };
  }

  private compileNode(node: AstNode): string {
    switch (node.type) {
      case 'OR': {
        const left = this.compileNode(node.left);
        const right = this.compileNode(node.right);
        return `(${left} OR ${right})`;
      }
      case 'AND': {
        const left = this.compileNode(node.left);
        const right = this.compileNode(node.right);
        return `(${left} AND ${right})`;
      }
      case 'NOT': {
        const inner = this.compileNode(node.expr);
        return `(NOT ${inner})`;
      }
      case 'TERM': {
        return this.compileTerm(node);
      }
      case 'FIELD': {
        return this.compileField(node);
      }
    }
  }

  private compileTerm(node: TermNode): string {
    const termValue = `"${node.term.replace(/"/g, '""')}"${node.isQuoted ? '' : '*'}`;
    this.params.push(termValue);
    return `tracks.id IN (SELECT rowid FROM tracks_fts WHERE tracks_fts MATCH ?)`;
  }

  private compileField(node: FieldNode): string {
    switch (node.field) {
      case 'title': {
        this.params.push(`%${node.value}%`);
        return `tracks.title LIKE ?`;
      }
      case 'artist': {
        const norm = normalizeText(node.value);
        this.params.push(norm);
        return `tracks.id IN (
          SELECT ta.track_id FROM track_artists ta
          JOIN artists a ON a.id = ta.artist_id
          WHERE a.normalized_name = ?
        )`;
      }
      case 'album': {
        this.params.push(`%${node.value}%`);
        return `tracks.album_name LIKE ?`;
      }
      case 'playlist': {
        this.params.push(node.value);
        return `tracks.id IN (
          SELECT pi.track_id FROM playlist_items pi
          JOIN playlists p ON p.id = pi.playlist_id
          WHERE p.title = ?
        )`;
      }
      case 'year':
      case 'duration': {
        const column = node.field === 'year' ? 'tracks.year' : 'tracks.duration_seconds';
        const range = /^(\d+)\.\.(\d+)$/.exec(node.value);
        if (range) {
          const low = Number(range[1]), high = Number(range[2]);
          if (low > high || node.operator !== '=') throw new Error('Invalid numeric range');
          this.params.push(low, high);
          return `${column} BETWEEN ? AND ?`;
        }
        if (!/^\d+$/.test(node.value)) throw new Error('Invalid numeric filter');
        this.params.push(Number(node.value));
        return `${column} ${this.validateOperator(node.operator)} ?`;
      }
      case 'liked': {
        // Asymmetric liked semantics (P1-F)
        if (!['true', 'false', '1', '0'].includes(node.value.toLowerCase())) throw new Error('Invalid liked filter');
        const isLiked = node.value.toLowerCase() === 'true' || node.value === '1';
        if (isLiked) {
          return `tracks.rating = 'LIKE'`;
        } else {
          return `tracks.rating != 'LIKE'`;
        }
      }
    }
  }

  private validateOperator(op: string): string {
    if (['>=', '<=', '>', '<', '!=', '='].includes(op)) {
      return op;
    }
    return '=';
  }
}
