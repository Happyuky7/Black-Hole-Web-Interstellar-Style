#!/usr/bin/env node
// Downloads the soundtrack locally with yt-dlp the first time you run the app,
// so the copyrighted audio never has to live in the repository.
//
//   - Skips if public/audio/interstellar-main-theme.mp3 already exists.
//   - Never fails the calling command: no yt-dlp/ffmpeg → prints a hint, exits 0.
//   - Opt out with SKIP_MUSIC=1. Use a custom binary with YTDLP=/path/to/yt-dlp.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'audio');
const target = join(outDir, 'interstellar-main-theme.mp3');
const URL = process.env.MUSIC_URL || 'https://www.youtube.com/watch?v=dLxja_YEUVw';

const log = msg => console.log(`[music] ${msg}`);

if (process.env.SKIP_MUSIC === '1') { log('SKIP_MUSIC=1, skipping.'); process.exit(0); }
if (existsSync(target)) process.exit(0);

const works = (cmd, args = ['--version']) => {
  try { return spawnSync(cmd, args, { stdio: 'ignore', shell: false }).status === 0; }
  catch { return false; }
};

// yt-dlp: explicit env var, a binary dropped in the project root, or PATH.
const candidates = [
  process.env.YTDLP,
  join(root, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'),
  'yt-dlp',
].filter(Boolean);
const ytdlp = candidates.find(c => works(c));

if (!ytdlp) {
  log('yt-dlp not found, the app will run without music.');
  log('Install it (https://github.com/yt-dlp/yt-dlp#installation) or drop the binary in the project root,');
  log('or put your own file at public/audio/interstellar-main-theme.mp3.');
  process.exit(0);
}
const ffmpegNextToRoot = join(root, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
if (!works('ffmpeg', ['-version']) && !existsSync(ffmpegNextToRoot)) {
  log('ffmpeg not found (yt-dlp needs it to convert to mp3), skipping.');
  log('Install it from https://ffmpeg.org/download.html and run again.');
  process.exit(0);
}

mkdirSync(outDir, { recursive: true });
log(`downloading the soundtrack with ${ytdlp} (first run only)…`);
const res = spawnSync(ytdlp, [
  '-x', '--audio-format', 'mp3', '--audio-quality', '0',
  '--embed-thumbnail', '--embed-metadata', '--no-playlist',
  ...(existsSync(ffmpegNextToRoot) ? ['--ffmpeg-location', root] : []),
  '-o', join(outDir, 'interstellar-main-theme.%(ext)s'),
  URL,
], { stdio: 'inherit' });

if (res.status === 0 && existsSync(target)) log('done → public/audio/interstellar-main-theme.mp3');
else log('download failed, the app will run without music (try updating yt-dlp: yt-dlp -U).');
process.exit(0);
