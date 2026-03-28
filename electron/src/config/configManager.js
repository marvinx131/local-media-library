/**
 * 配置管理器：管理多个库配置（名称、数据目录、密码）
 * 配置列表存于 app.getPath('userData') 根目录的 config-profiles.json
 * 选中的配置写入 config-active.json，供下次启动时读取
 */
const { app } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const crypto = require('crypto');

const CONFIG_PROFILES = 'config-profiles.json';
const CONFIG_ACTIVE = 'config-active.json';

/** 获取配置文件所在目录（始终使用默认 userData，不受便携模式影响） */
function getConfigDir() {
  // 在便携模式下 app.getPath('userData') 已被修改，需要使用原始默认路径
  // 但为了简化，直接使用当前 userData 的父级或 appData
  // 最稳妥方案：用一个固定路径
  const { app } = require('electron');
  // 使用 app.getPath('home') 下的固定目录，确保跨配置共享
  const dir = path.join(app.getPath('appData'), 'LocalMediaLibrary-configs');
  fs.ensureDirSync(dir);
  return dir;
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
  if (!stored) return !pwd; // 无密码
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
  /** 获取所有配置 */
  getConfigs() {
    return loadProfiles().configs;
  },

  /** 添加配置 */
  addConfig(name, dataDir, password) {
    const data = loadProfiles();
    if (data.configs.some(c => c.name === name)) {
      return { success: false, message: '配置名称已存在' };
    }
    const config = {
      id: crypto.randomUUID(),
      name,
      dataDir: dataDir || path.join(getConfigDir(), 'profiles', name),
      passwordHash: password ? hashPassword(password) : null,
      createdAt: Date.now()
    };
    fs.ensureDirSync(config.dataDir);
    data.configs.push(config);
    saveProfiles(data);
    return { success: true, config: { ...config, passwordHash: undefined, hasPassword: !!config.passwordHash } };
  },

  /** 删除配置 */
  removeConfig(id) {
    const data = loadProfiles();
    const idx = data.configs.findIndex(c => c.id === id);
    if (idx === -1) return false;
    data.configs.splice(idx, 1);
    saveProfiles(data);
    return true;
  },

  /** 重命名配置 */
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

  /** 修改密码 */
  setPassword(id, newPassword) {
    const data = loadProfiles();
    const config = data.configs.find(c => c.id === id);
    if (!config) return false;
    config.passwordHash = newPassword ? hashPassword(newPassword) : null;
    saveProfiles(data);
    return true;
  },

  /** 验证密码 */
  verifyConfigPassword(id, password) {
    const data = loadProfiles();
    const config = data.configs.find(c => c.id === id);
    if (!config) return false;
    return verifyPassword(password, config.passwordHash);
  },

  /** 激活配置（写入 active 文件，供下次启动读取） */
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

  /** 获取当前激活的配置 ID */
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

  /** 获取激活配置的数据目录 */
  getActiveDataDir() {
    const id = this.getActiveConfigId();
    if (!id) return null;
    const data = loadProfiles();
    const config = data.configs.find(c => c.id === id);
    return config ? config.dataDir : null;
  },

  /** 清除激活状态，下次启动显示选择页 */
  clearActive() {
    try {
      const activePath = getActivePath();
      if (fs.existsSync(activePath)) fs.unlinkSync(activePath);
    } catch (_) {}
  },

  /** 检查是否有任何配置 */
  hasConfigs() {
    return loadProfiles().configs.length > 0;
  },

  /** 密码哈希工具 */
  hashPassword,
  verifyPassword,

  /** 配置文件目录 */
  getConfigDir
};
