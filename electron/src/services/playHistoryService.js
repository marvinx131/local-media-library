const { app } = require('electron');
const fs = require('fs-extra');
const path = require('path');

const FILENAME = process.env.NODE_ENV === 'development' ? 'playHistory-dev.json' : 'playHistory.json';

function getHistoryPath() {
  return path.join(app.getPath('userData'), FILENAME);
}

function ensureFile() {
  const filePath = getHistoryPath();
  if (!fs.existsSync(filePath)) {
    fs.ensureDirSync(path.dirname(filePath));
    fs.writeFileSync(filePath, JSON.stringify({ records: [] }, null, 2), 'utf-8');
  }
}

function read() {
  ensureFile();
  try {
    const data = JSON.parse(fs.readFileSync(getHistoryPath(), 'utf-8'));
    if (!Array.isArray(data.records)) data.records = [];
    return data;
  } catch {
    return { records: [] };
  }
}

function write(data) {
  fs.ensureDirSync(path.dirname(getHistoryPath()));
  fs.writeFileSync(getHistoryPath(), JSON.stringify(data, null, 2), 'utf-8');
}

/** 记录播放，播放次数+1 */
function recordPlay(code, title) {
  if (!code) return;
  const data = read();
  const existing = data.records.find(r => r.code === code);
  if (existing) {
    existing.count = (existing.count || 0) + 1;
    existing.lastPlayedAt = new Date().toISOString();
    if (title) existing.title = title;
    // 移到最前面
    const idx = data.records.indexOf(existing);
    data.records.splice(idx, 1);
    data.records.unshift(existing);
  } else {
    data.records.unshift({
      code,
      title: title || code,
      count: 1,
      lastPlayedAt: new Date().toISOString()
    });
  }
  write(data);
}

/** 获取所有播放记录，按最近播放时间倒序 */
function getAll() {
  return read().records;
}

/** 删除单条记录 */
function remove(code) {
  const data = read();
  data.records = data.records.filter(r => r.code !== code);
  write(data);
}

/** 清除多久以前的记录（days天前） */
function clearOlderThan(days) {
  if (!days || days <= 0) return;
  const data = read();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffISO = cutoff.toISOString();
  data.records = data.records.filter(r => r.lastPlayedAt >= cutoffISO);
  write(data);
}

/** 清空所有记录 */
function clearAll() {
  write({ records: [] });
}

module.exports = {
  recordPlay,
  getAll,
  remove,
  clearOlderThan,
  clearAll
};
