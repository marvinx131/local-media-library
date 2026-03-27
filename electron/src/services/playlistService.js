const { app } = require('electron');
const fs = require('fs-extra');
const path = require('path');

const FILENAME = process.env.NODE_ENV === 'development' ? 'playlist-dev.json' : 'playlist.json';

function getPlaylistPath() {
  return path.join(app.getPath('userData'), FILENAME);
}

function ensureFile() {
  const filePath = getPlaylistPath();
  if (!fs.existsSync(filePath)) {
    const data = { items: [] };
    fs.ensureDirSync(path.dirname(filePath));
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }
}

function read() {
  ensureFile();
  try {
    const data = JSON.parse(fs.readFileSync(getPlaylistPath(), 'utf-8'));
    if (!Array.isArray(data.items)) data.items = [];
    // 去重
    const seen = new Set();
    data.items = data.items.filter(it => {
      if (!it || typeof it.code !== 'string') return false;
      if (seen.has(it.code)) return false;
      seen.add(it.code);
      return true;
    });
    return data;
  } catch {
    const data = { items: [] };
    fs.writeFileSync(getPlaylistPath(), JSON.stringify(data, null, 2), 'utf-8');
    return data;
  }
}

function write(data) {
  fs.ensureDirSync(path.dirname(getPlaylistPath()));
  fs.writeFileSync(getPlaylistPath(), JSON.stringify(data, null, 2), 'utf-8');
}

/** 返回播放清单所有 code，按添加顺序 */
function getCodes() {
  const data = read();
  return data.items.map(it => it.code);
}

/** 添加单个 code，已存在则移到末尾 */
function addCode(code) {
  if (!code || typeof code !== 'string') return;
  const data = read();
  const trimmed = code.trim();
  const idx = data.items.findIndex(it => it.code === trimmed);
  if (idx !== -1) {
    data.items.splice(idx, 1);
  }
  data.items.push({ code: trimmed, addedAt: new Date().toISOString() });
  write(data);
}

/** 批量添加 codes */
function addCodes(codes) {
  if (!Array.isArray(codes)) return;
  const data = read();
  const existing = new Set(data.items.map(it => it.code));
  const now = new Date().toISOString();
  for (const c of codes) {
    if (typeof c !== 'string' || !c.trim()) continue;
    const trimmed = c.trim();
    if (existing.has(trimmed)) {
      // 移到末尾
      const idx = data.items.findIndex(it => it.code === trimmed);
      if (idx !== -1) {
        data.items.splice(idx, 1);
      }
    }
    data.items.push({ code: trimmed, addedAt: now });
    existing.add(trimmed);
  }
  write(data);
}

/** 移除单个 code */
function removeCode(code) {
  if (!code) return;
  const data = read();
  data.items = data.items.filter(it => it.code !== code);
  write(data);
}

/** 清空 */
function clear() {
  write({ items: [] });
}

/** 获取数量 */
function getCount() {
  return read().items.length;
}

/** 生成 m3u 播放列表文件，返回文件路径 */
async function createM3uPlaylist() {
  const { app } = require('electron');
  const { getSequelize } = require('../config/database');
  const { getDataPaths } = require('../config/paths');

  const codes = getCodes();
  if (codes.length === 0) return { success: false, message: '播放清单为空' };

  const sequelize = getSequelize();
  if (!sequelize || !sequelize.models?.Movie) {
    return { success: false, message: '数据库未初始化' };
  }

  const Movie = sequelize.models.Movie;
  const { Op } = require('sequelize');
  const movies = await Movie.findAll({
    where: { code: { [Op.in]: codes }, playable: true },
    attributes: ['code', 'video_path', 'data_path_index']
  });

  if (movies.length === 0) return { success: false, message: '没有可播放的影片' };

  const dataPaths = getDataPaths();
  if (!dataPaths || dataPaths.length === 0) return { success: false, message: '数据路径未设置' };

  const lines = ['#EXTM3U'];
  for (const code of codes) {
    const movie = movies.find(m => m.code === code);
    if (!movie || !movie.video_path) continue;
    const dp = dataPaths[movie.data_path_index || 0] || dataPaths[0];
    const fullPath = path.join(dp, movie.video_path);
    if (fs.existsSync(fullPath)) {
      lines.push(`#EXTINF:-1,${code}`);
      lines.push(fullPath);
    }
  }

  if (lines.length <= 1) return { success: false, message: '没有找到可播放的视频文件' };

  const m3uPath = path.join(app.getPath('temp'), `playlist-${Date.now()}.m3u`);
  fs.writeFileSync(m3uPath, lines.join('\n'), 'utf-8');
  return { success: true, path: m3uPath };
}

module.exports = {
  getCodes,
  addCode,
  addCodes,
  removeCode,
  clear,
  getCount,
  createM3uPlaylist
};
