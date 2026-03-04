const { app } = require('electron');
const path = require('path');
const fs = require('fs-extra');

/**
 * 获取应用数据根目录（用户数据、数据库、收藏夹等均存放于此，便于迁移）
 * - 打包后：exe 同级目录下的 UserData 文件夹
 * - 开发环境：Electron 默认 userData
 */
function getAppDataRoot() {
  if (app.isPackaged) {
    return path.join(path.dirname(process.execPath), 'UserData');
  }
  return app.getPath('userData');
}

/**
 * 确保应用数据根目录及其子目录存在
 */
function ensureAppDataRoot() {
  const root = getAppDataRoot();
  fs.ensureDirSync(root);
  fs.ensureDirSync(path.join(root, 'database'));
  return root;
}

/**
 * 打包环境下，若旧版数据在 userData 而新目录尚无数据，则复制过去（一次性迁移）
 * 不删除旧目录，仅复制；扫描/收藏夹逻辑不在此处清空
 */
function runMigrationFromUserData() {
  if (!app.isPackaged) return;
  const userDataPath = app.getPath('userData');
  const root = getAppDataRoot();
  if (userDataPath === root) return;

  const storeName = process.env.NODE_ENV === 'development' ? 'javlibrary-dev' : 'javlibrary';
  const dbFileName = process.env.NODE_ENV === 'development' ? 'javlibrary-dev.db' : 'javlibrary.db';
  const dbSrc = path.join(userDataPath, dbFileName);
  const dbDest = path.join(root, 'database', dbFileName);
  const configSrc = path.join(userDataPath, `${storeName}.json`);
  const configDest = path.join(root, `${storeName}.json`);

  let migrated = false;
  if (fs.existsSync(dbSrc) && !fs.existsSync(dbDest)) {
    fs.ensureDirSync(path.join(root, 'database'));
    fs.copyFileSync(dbSrc, dbDest);
    console.log('已迁移数据库到应用目录:', dbDest);
    migrated = true;
  }
  if (fs.existsSync(configSrc) && !fs.existsSync(configDest)) {
    fs.copyFileSync(configSrc, configDest);
    console.log('已迁移配置到应用目录:', configDest);
    migrated = true;
  }
  if (migrated) {
    console.log('用户数据已迁移到应用目录，便于备份与迁移。');
  }
}

module.exports = {
  getAppDataRoot,
  ensureAppDataRoot,
  runMigrationFromUserData
};
