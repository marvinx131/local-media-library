/**
 * 配置管理器：管理多个库配置（名称、数据目录、密码）
 * 
 * 存储位置优先级：
 *   便携模式（portable.txt 存在）→ 程序同目录
 *   安装模式 → AppData/LocalMediaLibrary-configs
 * 
 * 数据目录默认格式：data/{配置名}/
 */
const { app } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const crypto = require('crypto');

const CONFIG_PROFILES = 'config-profiles.json';
const CONFIG_ACTIVE = 'config-active.json';

let _cachedConfigDir = null;

/**
 * 获取配置文件所在目录
 * 便携模式：exe 同目录
 * 安装模式：AppData
 */
function getConfigDir() {
  if (_cachedConfigDir) return _cachedConfigDir;

  const exeDir = path.dirname(app.getPath('exe'));
  const portableMarker = path.join(exeDir, 'portable.txt');

  if (fs.existsSync(portableMarker)) {
    // 便携模式：配置存在 exe 同目录
    _cachedConfigDir = exeDir;
  } else {
    // 安装模式：配置存在 AppData
    _cachedConfigDir = path.join(app.getPath('appData'), 'LocalMediaLibrary-configs');
    fs.ensureDirSync(_cachedConfigDir);
  }
  return _cachedConfigDir;
}

/**
 * 获取默认数据目录（便携模式下为 exe 同目录的 data/{name}）
 */
function getDefaultDataDir(name) {
  const exeDir = path.dirname(app.getPath('exe'));
  return path.join(exeDir, 'data', name);
}

function getProfilesPath() {
  return path.join(getConfigDir(), CONFIG_PROFILES);
}

function getActivePath() {
  return path.join(getConfigDir(), CONFIG_ACTIVE);
}

function hashPassword(pwd) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pwd, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(pwd, stored) {
  if (!stored) return !pwd;
  if (!pwd) return false;
  const [salt, hash] = stored.split(':');
  const testHash = crypto.scryptSync(pwd, salt, 64).toString('hex');
  return hash === testHash;
}

function loadProfiles() {
  try {
    if (fs.existsSync(getProfilesPath())) {
      const data = JSON.parse(fs.readFileSync(getProfilesPath(), 'utf-8'));
      if (Array.isArray(data.configs)) return data;
    }
  } catch (_) {}
  return { configs: [] };
}

function saveProfiles(data) {
  fs.writeFileSync(getProfilesPath(), JSON.stringify(data, null, 2), 'utf-8');
}

module.exports = {
  getConfigs() {
    return loadProfiles().configs;
  },

  addConfig(name, dataDir, password) {
    const data = loadProfiles();
    if (data.configs.some(c => c.name === name)) {
      return { success: false, message: '配置名称已存在' };
    }
    // 默认数据目录：data/{配置名}/
    const resolvedDataDir = dataDir || getDefaultDataDir(name);
    const config = {
      id: crypto.randomUUID(),
      name,
      dataDir: resolvedDataDir,
      passwordHash: password ? hashPassword(password) : null,
      createdAt: Date.now()
    };
    fs.ensureDirSync(config.dataDir);
    data.configs.push(config);
    saveProfiles(data);
    return { success: true, config: { ...config, passwordHash: undefined, hasPassword: !!config.passwordHash } };
  },

  removeConfig(id) {
    const data = loadProfiles();
    const idx = data.configs.findIndex(c => c.id === id);
    if (idx === -1) return false;
    data.configs.splice(idx, 1);
    saveProfiles(data);
    return true;
  },

  renameConfig(id, newName) {
    const data = loadProfiles();
    const config = data.configs.find(c => c.id === id);
    if (!config) return { success: false, message: '配置不存在' };
    if (data.configs.some(c => c.id !== id && c.name === newName)) {
      return { success: false, message: '名称已被使用' };
    }
    config.name = newName;
    saveProfiles(data);
    return { success: true };
  },

  setPassword(id, newPassword) {
    const data = loadProfiles();
    const config = data.configs.find(c => c.id === id);
    if (!config) return false;
    config.passwordHash = newPassword ? hashPassword(newPassword) : null;
    saveProfiles(data);
    return true;
  },

  verifyConfigPassword(id, password) {
    const data = loadProfiles();
    const config = data.configs.find(c => c.id === id);
    if (!config) return false;
    return verifyPassword(password, config.passwordHash);
  },

  activateConfig(id, password) {
    const data = loadProfiles();
    const config = data.configs.find(c => c.id === id);
    if (!config) return { success: false, message: '配置不存在' };
    if (!verifyPassword(password, config.passwordHash)) {
      return { success: false, message: '密码错误' };
    }
    fs.writeFileSync(getActivePath(), JSON.stringify({ activeId: id }), 'utf-8');
    return { success: true, config: { id: config.id, name: config.name, dataDir: config.dataDir, hasPassword: !!config.passwordHash } };
  },

  getActiveConfigId() {
    try {
      const activePath = getActivePath();
      if (fs.existsSync(activePath)) {
        const data = JSON.parse(fs.readFileSync(activePath, 'utf-8'));
        return data.activeId || null;
      }
    } catch (_) {}
    return null;
  },

  getActiveDataDir() {
    const id = this.getActiveConfigId();
    if (!id) return null;
    const data = loadProfiles();
    const config = data.configs.find(c => c.id === id);
    return config ? config.dataDir : null;
  },

  clearActive() {
    try {
      const activePath = getActivePath();
      if (fs.existsSync(activePath)) fs.unlinkSync(activePath);
    } catch (_) {}
  },

  hasConfigs() {
    return loadProfiles().configs.length > 0;
  },

  hashPassword,
  verifyPassword,
  getConfigDir
};
