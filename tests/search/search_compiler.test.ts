import { describe, it, expect } from 'vitest';
import { SearchQueryCompiler } from '../../src/search/compiler.js';

describe('SearchQueryCompiler', () => {
  it('compiles empty query to select all', () => {
    const plan = SearchQueryCompiler.compile('');
    expect(plan.sql).toContain('SELECT tracks.* FROM tracks');
    expect(plan.params).toEqual([100]);
  });

  it('compiles free-text terms into FTS5 MATCH', () => {
    const plan = SearchQueryCompiler.compile('YOASOBI');
    expect(plan.sql).toContain('tracks_fts MATCH ?');
    expect(plan.params).toEqual(['YOASOBI*', 100]);
  });

  it('compiles artist: field into relational track_artists and artists join', () => {
    const plan = SearchQueryCompiler.compile('artist:Ado');
    expect(plan.sql).toContain('track_artists');
    expect(plan.sql).toContain('artists');
    expect(plan.sql).toContain('a.normalized_name = ?');
    expect(plan.params).toEqual(['ado', 100]);
  });

  it('compiles liked:true and liked:false correctly per P1-F', () => {
    const planTrue = SearchQueryCompiler.compile('liked:true');
    expect(planTrue.sql).toContain("tracks.rating = 'LIKE'");

    const planFalse = SearchQueryCompiler.compile('liked:false');
    expect(planFalse.sql).toContain("tracks.rating != 'LIKE'");
  });

  it('compiles complex killer workflow query: artist:Ado year:>2022 NOT playlist:Workout', () => {
    const plan = SearchQueryCompiler.compile('artist:Ado year:>2022 NOT playlist:Workout');
    expect(plan.sql).toContain('a.normalized_name = ?');
    expect(plan.sql).toContain('tracks.year > ?');
    expect(plan.sql).toContain('NOT');
    expect(plan.sql).toContain('p.title = ?');
    expect(plan.params).toEqual(['ado', 2022, 'Workout', 100]);
  });

  it('handles nested parentheses and OR expressions', () => {
    const plan = SearchQueryCompiler.compile('(artist:Ado OR artist:YOASOBI) AND year:>=2020');
    expect(plan.sql).toContain('OR');
    expect(plan.sql).toContain('AND');
    expect(plan.params).toEqual(['ado', 'yoasobi', 2020, 100]);
  });
});
