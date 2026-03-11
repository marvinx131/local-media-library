const { app } = require('electron');
const fs = require('fs-extra');
const path = require('path');
const OpenCC = require('opencc-js');

// 简繁体转换：数据库演员名与 Filetree 键可能一简一繁，两边都转后匹配
const s2tConverter = OpenCC.Converter({ from: 'cn', to: 'tw' });
const t2sConverter = OpenCC.Converter({ from: 'tw', to: 'cn' });

function toTraditional(str) {
  if (!str || typeof str !== 'string') return str || '';
  return s2tConverter(str);
}

function toSimplified(str) {
  if (!str || typeof str !== 'string') return str || '';
  return t2sConverter(str);
}

const MAP_FILENAME = process.env.NODE_ENV === 'development' ? 'actor-avatar-map-dev.json' : 'actor-avatar-map.json';
let cachedMap = null;

function getMapPath() {
  return path.join(app.getPath('userData'), MAP_FILENAME);
}

const DEFAULT_MAP = {
  meta: { sourceRoot: '', contentDir: 'Content', updatedAt: null, version: 1 },
  byActor: {}
};

function readMap() {
  if (cachedMap) return cachedMap;
  const mapPath = getMapPath();
  if (!fs.existsSync(mapPath)) {
    cachedMap = JSON.parse(JSON.stringify(DEFAULT_MAP));
    return cachedMap;
  }
  try {
    const raw = fs.readFileSync(mapPath, 'utf-8');
    const data = JSON.parse(raw);
    if (!data.meta) data.meta = DEFAULT_MAP.meta;
    if (typeof data.byActor !== 'object') data.byActor = {};
    cachedMap = data;
    return cachedMap;
  } catch (e) {
    console.error('actorAvatarService readMap error:', e);
    cachedMap = JSON.parse(JSON.stringify(DEFAULT_MAP));
    return cachedMap;
  }
}

function writeMap(data) {
  const mapPath = getMapPath();
  fs.ensureDirSync(path.dirname(mapPath));
  fs.writeFileSync(mapPath, JSON.stringify(data, null, 2), 'utf-8');
  cachedMap = data;
}

function invalidateCache() {
  cachedMap = null;
}

/** 用演员名查找 map 中的规范 key（支持简繁体：原样、转繁、转简） */
function getCanonicalKey(actorName) {
  if (!actorName || typeof actorName !== 'string') return null;
  const name = actorName.trim();
  if (!name) return null;
  const map = readMap();
  const byActor = map.byActor || {};
  if (byActor[name]) return name;
  const trad = toTraditional(name);
  if (byActor[trad]) return trad;
  const simp = toSimplified(name);
  if (byActor[simp]) return simp;
  return null;
}

/**
 * 返回演员头像摘要：用于列表/详情展示
 * @param {string} actorName - 演员名（来自 DB）
 * @param {string} actorDataPath - 演员数据根路径
 * @returns {{ hasAvatar: boolean, hasMultiple: boolean, relPath: string|null, url: string|null }}
 */
function getActorAvatarSummary(actorName, actorDataPath) {
  const key = getCanonicalKey(actorName);
  if (!key || !actorDataPath) {
    return { hasAvatar: false, hasMultiple: false, relPath: null, url: null };
  }
  const map = readMap();
  const entry = map.byActor[key];
  if (!entry || !Array.isArray(entry.candidates) || entry.candidates.length === 0) {
    return { hasAvatar: false, hasMultiple: false, relPath: null, url: null };
  }
  const selectedId = entry.selectedId || entry.candidates[0].id;
  const chosen = entry.candidates.find(c => c.id === selectedId) || entry.candidates[0];
  const relPath = chosen.id;
  const absPath = path.join(actorDataPath, relPath);
  let url = null;
  try {
    if (fs.existsSync(absPath)) {
      const buf = fs.readFileSync(absPath);
      const ext = path.extname(absPath).toLowerCase();
      const mime =
        ext === '.png'
          ? 'image/png'
          : ext === '.webp'
          ? 'image/webp'
          : ext === '.gif'
          ? 'image/gif'
          : 'image/jpeg';
      url = `data:${mime};base64,${buf.toString('base64')}`;
    }
  } catch (e) {
    console.error('getActorAvatarSummary 读取头像失败:', e);
    url = null;
  }
  return {
    hasAvatar: true,
    hasMultiple: entry.candidates.length > 1,
    relPath,
    url
  };
}

/**
 * 返回某演员的所有候选头像及当前选中 id（用于弹窗选择）
 */
function getActorAvatarCandidates(actorName, actorDataPath) {
  const key = getCanonicalKey(actorName);
  if (!key || !actorDataPath) {
    return { candidates: [], selectedId: null };
  }
  const map = readMap();
  const entry = map.byActor[key];
  if (!entry || !Array.isArray(entry.candidates) || entry.candidates.length === 0) {
    return { candidates: [], selectedId: null };
  }
  const selectedId = entry.selectedId || entry.candidates[0].id;
  const candidates = entry.candidates.map(c => {
    const absPath = path.join(actorDataPath, c.id);
    let url = null;
    try {
      if (fs.existsSync(absPath)) {
        const buf = fs.readFileSync(absPath);
        const ext = path.extname(absPath).toLowerCase();
        const mime =
          ext === '.png'
            ? 'image/png'
            : ext === '.webp'
            ? 'image/webp'
            : ext === '.gif'
            ? 'image/gif'
            : 'image/jpeg';
        url = `data:${mime};base64,${buf.toString('base64')}`;
      }
    } catch (e) {
      console.error('getActorAvatarCandidates 读取头像失败:', e);
      url = null;
    }
    return { id: c.id, group: c.group, srcFile: c.srcFile, targetFile: c.targetFile, url };
  });
  return { candidates, selectedId };
}

/**
 * 设置某演员的选中头像 id
 */
function setActorAvatarSelection(actorName, selectedId) {
  const key = getCanonicalKey(actorName);
  if (!key) return false;
  const map = readMap();
  const entry = map.byActor[key];
  if (!entry || !entry.candidates.some(c => c.id === selectedId)) return false;
  entry.selectedId = selectedId;
  writeMap(map);
  return true;
}

/**
 * 从演员数据根路径扫描 Filetree.json，更新 actor-avatar-map
 * 匹配规则：Filetree 键（去掉扩展名）与演员名做匹配，支持简繁体（原样、s2t、t2s 任一匹配即视为同一演员并合并候选）
 * @param {string} rootPath - 演员数据根路径（如 F:\javlib\gfriends）
 * @returns {{ success: boolean, message?: string, actorCount?: number, imageCount?: number }}
 */
async function scanFromActorDataPath(rootPath) {
  const filetreePath = path.join(rootPath, 'Filetree.json');
  const contentDir = path.join(rootPath, 'Content');
  if (!(await fs.pathExists(filetreePath))) {
    throw new Error('该路径下未找到 Filetree.json');
  }
  if (!(await fs.pathExists(contentDir))) {
    throw new Error('该路径下未找到 Content 目录');
  }

  let filetree;
  try {
    filetree = await fs.readJson(filetreePath);
  } catch (e) {
    throw new Error('读取 Filetree.json 失败: ' + (e.message || String(e)));
  }

  const Content = filetree.Content || filetree.content;
  if (!Content || typeof Content !== 'object') {
    throw new Error('Filetree.json 中未找到 Content 节点');
  }

  const existingMap = readMap();
  const byActor = JSON.parse(JSON.stringify(existingMap.byActor || {}));

  let imageCount = 0;
  const seenIdsByKey = new Map();

  for (const [groupName, mapping] of Object.entries(Content)) {
    if (!mapping || typeof mapping !== 'object') continue;
    for (const [displayFileName, value] of Object.entries(mapping)) {
      const actorDisplayName = displayFileName.replace(/\.(jpg|jpeg|png|webp)$/i, '').trim();
      if (!actorDisplayName) continue;
      const targetFile = (value && typeof value === 'string') ? value.split('?')[0].trim() : '';
      if (!targetFile) continue;
      const relPath = ['Content', groupName, targetFile].join('/');
      imageCount++;
      const candidate = { id: relPath, group: groupName, srcFile: displayFileName, targetFile };

      const keysToTry = [actorDisplayName, toTraditional(actorDisplayName), toSimplified(actorDisplayName)];
      let mergedKey = null;
      for (const k of keysToTry) {
        if (byActor[k]) {
          mergedKey = k;
          break;
        }
      }

      if (mergedKey) {
        if (!seenIdsByKey.has(mergedKey)) seenIdsByKey.set(mergedKey, new Set());
        const seen = seenIdsByKey.get(mergedKey);
        if (seen.has(relPath)) continue;
        seen.add(relPath);
        byActor[mergedKey].candidates.push(candidate);
      } else {
        byActor[actorDisplayName] = {
          candidates: [candidate],
          selectedId: null
        };
        seenIdsByKey.set(actorDisplayName, new Set([relPath]));
      }
    }
  }

  for (const entry of Object.values(byActor)) {
    if (!entry.selectedId && entry.candidates && entry.candidates[0]) {
      entry.selectedId = entry.candidates[0].id;
    }
    if (entry.selectedId && entry.candidates) {
      const stillValid = entry.candidates.some(c => c.id === entry.selectedId);
      if (!stillValid) entry.selectedId = entry.candidates[0].id;
    }
  }

  const map = {
    meta: {
      sourceRoot: rootPath,
      contentDir: 'Content',
      updatedAt: new Date().toISOString(),
      version: 1
    },
    byActor
  };
  writeMap(map);
  const actorCount = Object.keys(byActor).length;
  return { success: true, actorCount, imageCount };
}

module.exports = {
  getMapPath,
  readMap,
  invalidateCache,
  getActorAvatarSummary,
  getActorAvatarCandidates,
  setActorAvatarSelection,
  scanFromActorDataPath
};
