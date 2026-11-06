// ============================================================
// Wall Duel — record a preview video of the capture page.
//
//   1. npm run dev                       (Vite on http://localhost:5173)
//   2. node branding/capture/record.mjs landscape
//      node branding/capture/record.mjs portrait
//
// Needs Google Chrome and ffmpeg on PATH. Output: branding/videos/*.mp4
// (1920x1080 landscape, 1080x1620 portrait, 30 fps, H.264, no audio).
// ============================================================

import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const layout = process.argv[2] === 'portrait' ? 'portrait' : 'landscape';
const [W, H] = layout === 'portrait' ? [1080, 1620] : [1920, 1080];
// Lay the page out at the game's usual size and render it 1.5x sharper (1280x720 -> 1920x1080).
const SCALE = 1.5;
const END_HOLD_S = 1.6;
const CHROME = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL_ = `http://localhost:5173/branding/capture/?layout=${layout}`;
const PORT = 9555;
const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'videos');
const frameDir = join(tmpdir(), `wallduel_frames_${layout}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));

rmSync(frameDir, { recursive: true, force: true });
mkdirSync(frameDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

const profile = join(tmpdir(), `wallduel_rec_profile_${layout}`);
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  `--window-size=${W},${H}`, '--hide-scrollbars', '--force-device-scale-factor=1', '--mute-audio', 'about:blank',
], { stdio: 'ignore' });

try {
  // Find the page target.
  let wsUrl;
  for (let i = 0; i < 50 && !wsUrl; i++) {
    await sleep(200);
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      wsUrl = targets.find(t => t.type === 'page')?.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
  }
  if (!wsUrl) throw new Error('Chrome did not start');

  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  const frames = [];
  ws.onmessage = ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
    if (msg.method === 'Page.screencastFrame') {
      const { data, metadata, sessionId } = msg.params;
      frames.push({ t: metadata.timestamp, data });
      send('Page.screencastFrameAck', { sessionId });
    }
  };
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;

  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: Math.round(W / SCALE), height: Math.round(H / SCALE), deviceScaleFactor: SCALE, mobile: false });
  await send('Page.navigate', { url: URL_ });
  for (let i = 0; i < 100 && !(await evaluate('!!window.__ready')); i++) await sleep(200);
  console.log('match picked:', await evaluate('JSON.stringify(window.__info)'));
  await sleep(1200); // fonts, images and the first board render

  await send('Page.startScreencast', { format: 'jpeg', quality: 95, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  await sleep(300);
  await evaluate('window.__start()');
  for (let i = 0; i < 200 && !(await evaluate('!!window.__done')); i++) await sleep(150);
  await sleep(300);
  await send('Page.stopScreencast');
  ws.close();
  console.log('frames captured:', frames.length);

  // Write frames and an ffmpeg concat list with each frame's real duration.
  const start = frames[0].t;
  let list = '';
  frames.forEach((f, i) => {
    const name = `f${String(i).padStart(5, '0')}.jpg`;
    writeFileSync(join(frameDir, name), Buffer.from(f.data, 'base64'));
    // Chrome only sends frames on change, so the final still frame is held for the end of the video.
    const next = frames[i + 1]?.t ?? f.t + END_HOLD_S;
    list += `file '${name}'\nduration ${(next - f.t).toFixed(4)}\n`;
  });
  list += `file 'f${String(frames.length - 1).padStart(5, '0')}.jpg'\n`;
  writeFileSync(join(frameDir, 'list.txt'), list);
  console.log('video seconds:', (frames[frames.length - 1].t - start + END_HOLD_S).toFixed(2));

  const out = join(outDir, `wall-duel-preview-${layout}-${W}x${H}.mp4`);
  const ff = spawnSync('ffmpeg', [
    '-y', '-f', 'concat', '-safe', '0', '-i', 'list.txt',
    '-vf', `fps=30,scale=${W}:${H}:flags=lanczos:in_range=pc:out_range=tv,format=yuv420p`, '-color_range', 'tv',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-an', '-movflags', '+faststart', out,
  ], { cwd: frameDir, stdio: 'inherit' });
  if (ff.status !== 0) throw new Error('ffmpeg failed');
  console.log('saved', out);
} finally {
  chrome.kill();
}
