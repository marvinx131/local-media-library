/**
 * 起飞记录服务
 * 每次起飞记录：code, title, timestamp, note
 * count = 该 code 的记录数
 */
const { app } = require('electron');
const fs = require('fs-extra');
const path = require('path');

const FILENAME = process.env.NODE_ENV === 'development' ? 'takeoffRecords-dev.json' : 'takeoffRecords.json';

function getPath() {
  return path.join(app.getPath('userData'), FILENAME);
}

function read() {
  const p = getPath();
  if (!fs.existsSync(p)) return { records: [] };
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
    if (!Array.isArray(data.records)) data.records = [];
    return data;
  } catch { return { records: [] }; }
}

function write(data) {
  fs.ensureDirSync(path.dirname(getPath()));
  fs.writeFileSync(getPath(), JSON.stringify(data, null, 2), 'utf-8');
}

/** 添加一次起飞记录 */
function addTakeoff(code, title) {
  if (!code) return null;
  const data = read();
  const record = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    code,
    title: title || code,
    timestamp: new Date().toISOString(),
    note: ''
  };
  data.records.unshift(record);
  write(data);
  return record;
}

/** 获取某个 code 的起飞次数 */
function getCount(code) {
  if (!code) return 0;
  return read().records.filter(r => r.code === code).length;
}

/** 批量获取多个 code 的起飞次数（用于列表页角标） */
function getCounts(codes) {
  if (!codes || codes.length === 0) return {};
  const data = read();
  const counts = {};
  for (const r of data.records) {
    if (codes.includes(r.code)) {
      counts[r.code] = (counts[r.code] || 0) + 1;
    }
  }
  return counts;
}

/** 获取所有记录，按时间倒序 */
function getAll() {
  return read().records;
}

/** 更新备注 */
function updateNote(id, note) {
  const data = read();
  const record = data.records.find(r => r.id === id);
  if (!record) return false;
  record.note = note || '';
  write(data);
  return true;
}

/** 删除单条记录 */
function remove(id) {
  const data = read();
  const before = data.records.length;
  data.records = data.records.filter(r => r.id !== id);
  write(data);
  return data.records.length < before;
}

/** 删除某个 code 的所有记录 */
function removeAllForCode(code) {
  const data = read();
  data.records = data.records.filter(r => r.code !== code);
  write(data);
}

/** 清空所有记录 */
function clearAll() {
  write({ records: [] });
}

module.exports = {
  addTakeoff,
  getCount,
  getCounts,
  getAll,
  updateNote,
  remove,
  removeAllForCode,
  clearAll
};
