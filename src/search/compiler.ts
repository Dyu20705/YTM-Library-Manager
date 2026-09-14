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
    const parser = new Parser(tokens);
    const ast = parser.parse();

    const compiler = new SearchQueryCompiler();
    return compiler.compileAst(ast, limit);
  }

  public compileAst(ast: AstNode | null, limit = 100): ParameterizedQueryPlan {
    this.params = [];

    if (!ast) {
      return {
        sql: `SELECT tracks.* FROM tracks ORDER BY tracks.title ASC LIMIT ?;`,
        params: [limit]
      };
    }

    const whereClause = this.compileNode(ast);
    this.params.push(limit);

    return {
      sql: `SELECT tracks.* FROM tracks WHERE ${whereClause} ORDER BY tracks.title ASC LIMIT ?;`,
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
    const termValue = node.isQuoted ? `"${node.term}"` : `${node.term.replace(/[*"']/g, '')}*`;
    this.params.push(termValue);
    return `tracks.id IN (SELECT rowid FROM tracks_fts WHERE tracks_fts MATCH ?)`;
  }

  private compileField(node: FieldNode): string {
    switch (node.field) {
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
      case 'year': {
        const year = parseInt(node.value, 10);
        this.params.push(isNaN(year) ? 0 : year);
        const op = this.validateOperator(node.operator);
        return `tracks.year ${op} ?`;
      }
      case 'duration': {
        const sec = parseInt(node.value, 10);
        this.params.push(isNaN(sec) ? 0 : sec);
        const op = this.validateOperator(node.operator);
        return `tracks.duration_seconds ${op} ?`;
      }
      case 'liked': {
        // Asymmetric liked semantics (P1-F)
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
