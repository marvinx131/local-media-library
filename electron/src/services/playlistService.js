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

module.exports = {
  getCodes,
  addCode,
  addCodes,
  removeCode,
  clear,
  getCount
};
