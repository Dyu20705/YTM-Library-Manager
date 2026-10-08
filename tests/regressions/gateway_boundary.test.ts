import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { SubprocessYtmGateway } from '../../src/gateway/ytm_gateway.js';

const directories: string[] = [];
afterEach(() => directories.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })));
function bridge(script: string) {
  const dir = mkdtempSync(path.join(tmpdir(), 'ytm-bridge-')); directories.push(dir);
  const file = path.join(dir, 'fixture.py'); writeFileSync(file, script);
  return new SubprocessYtmGateway({ bridgeScriptPath: file });
}
const track = (videoId: string, remoteItemId: string) => ({ videoId, setVideoId: remoteItemId, title: videoId, artists: [], duration_seconds: 1 });

describe('Production subprocess credential boundary', () => {
  it('sends tokens through stdin without putting a request in process argv', async () => {
    const gateway = bridge('import sys,json\nreq=json.load(sys.stdin)\nprint(json.dumps({"status":"success","data":{"argv":sys.argv[1:],"received":req["args"]["feedbackTokens"]==["sentinel-secret"]}}))');
    const result = await (gateway as any).callBridge('test', { feedbackTokens: ['sentinel-secret'] });
    expect(result).toEqual({ argv: [], received: true });
  });
  it.each(['print("sentinel-secret invalid JSON")', 'print(\'{"status":"error","code":"INVALID_REQUEST","message":"Cookie: sentinel-secret"}\')'])('never echoes unsafe bridge output', async script => {
    const gateway = bridge(script);
    try { await (gateway as any).callBridge('test'); expect.fail('Expected rejection'); }
    catch (error) { expect(String(error)).not.toContain('sentinel-secret'); }
  });
  it('normalizes process startup failures instead of throwing an unhandled spawn error', async () => {
    const gateway = new SubprocessYtmGateway({ pythonPath: '/nonexistent-python' });
    await expect((gateway as any).callBridge('ping')).rejects.toMatchObject({ code: 'REMOTE_UNAVAILABLE' });
  });
  it('terminates a stuck bridge with a bounded timeout', async () => {
    const gateway = bridge('import time\ntime.sleep(10)');
    const short = new SubprocessYtmGateway({ bridgeScriptPath: (gateway as any).bridgeScriptPath, timeoutMs: 50 });
    await expect((short as any).callBridge('ping')).rejects.toMatchObject({ code: 'NETWORK_UNAVAILABLE' });
  });
});

describe('Read-back verified mutation outcomes', () => {
  it('does not equate a successful response with every ADD being applied', async () => {
    const gateway = new SubprocessYtmGateway();
    const calls = vi.spyOn(gateway as any, 'callBridge');
    calls.mockResolvedValueOnce({ tracks: [] }).mockResolvedValueOnce({ status: 'success' })
      .mockResolvedValueOnce({ tracks: [track('A', 'new-A')] });
    const result = await gateway.addItems('PL', [{ videoId: 'A' }, { videoId: 'B' }]);
    expect(result).toMatchObject({ state: 'PARTIAL_SUCCESS', appliedCount: 1, unknownCount: 1, failedCount: 0,
      appliedItems: [{ videoId: 'A', remoteItemId: 'new-A' }], unknownItems: [{ videoId: 'B' }] });
  });
  it('reconciles a timeout after remote REMOVE applied', async () => {
    const gateway = new SubprocessYtmGateway();
    vi.spyOn(gateway as any, 'callBridge').mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce({ tracks: [] });
    expect(await gateway.removeItems('PL', [{ videoId: 'A', remoteItemId: 'rA' }])).toMatchObject({ state: 'COMPLETED', appliedCount: 1 });
  });
  it('never proves absence from an incomplete remote probe', async () => {
    const gateway = new SubprocessYtmGateway();
    vi.spyOn(gateway as any, 'callBridge').mockResolvedValueOnce({ status: 'success' }).mockResolvedValueOnce({ tracks: [], expectedItemCount: 500 });
    expect(await gateway.removeItems('PL', [{ videoId: 'A', remoteItemId: 'rA' }])).toMatchObject({ state: 'UNKNOWN', unknownCount: 1 });
  });
  it('verifies MOVE adjacency and reports the video identity rather than occurrence identity', async () => {
    const gateway = new SubprocessYtmGateway();
    vi.spyOn(gateway as any, 'callBridge').mockResolvedValueOnce({ tracks: [track('A', 'rA'), track('B', 'rB')] })
      .mockResolvedValueOnce({ status: 'success' }).mockResolvedValueOnce({ tracks: [track('B', 'rB'), track('A', 'rA')] });
    expect(await gateway.moveItem('PL', 'rA', { type: 'END' })).toMatchObject({ state: 'COMPLETED', appliedItems: [{ videoId: 'A', remoteItemId: 'rA' }] });
  });
  it('leaves unverified ratings UNKNOWN', async () => {
    const gateway = new SubprocessYtmGateway();
    vi.spyOn(gateway as any, 'callBridge').mockResolvedValue({ status: 'success' });
    expect(await gateway.rateSong('A', 'LIKE')).toMatchObject({ state: 'UNKNOWN', appliedCount: 0 });
  });
  it('requests complete playlist and library lists and adds the separate Liked Music resource', async () => {
    const gateway = new SubprocessYtmGateway();
    const call = vi.spyOn(gateway as any, 'callBridge').mockResolvedValue([]);
    expect(await gateway.getPlaylists()).toContainEqual({ id: 'LM', title: 'Liked Music', trackCount: 0, isEditable: false });
    await gateway.getLibrarySongs();
    expect(call).toHaveBeenCalledWith('get_library_playlists', { limit: null });
    expect(call).toHaveBeenCalledWith('get_library_songs', { limit: null });
  });
});
