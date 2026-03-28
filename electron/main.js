const { app, BrowserWindow, dialog, ipcMain, Menu } = require('electron');
const { session } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const crypto = require('crypto');

// ── 首次启动配置 ──
// 配置文件 first-launch.json 存储: configDir(应用数据) + mediaDir(影片数据目录) + password
const FIRST_LAUNCH_FILE = 'first-launch.json';

function getFirstLaunchConfigPath() {
  const exeDir = path.dirname(app.getPath('exe'));
  if (fs.existsSync(path.join(exeDir, 'portable.txt')) || fs.existsSync(path.join(exeDir, 'portable.json'))) {
    return path.join(exeDir, FIRST_LAUNCH_FILE);
  }
  const dir = path.join(app.getPath('appData'), 'LocalMediaLibrary');
  fs.ensureDirSync(dir);
  return path.join(dir, FIRST_LAUNCH_FILE);
}

function loadFirstLaunchConfig() {
  const p = getFirstLaunchConfigPath();
  if (fs.existsSync(p)) {
    try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch (_) {}
  }
  return null;
}

function saveFirstLaunchConfig(cfg) {
  fs.writeFileSync(getFirstLaunchConfigPath(), JSON.stringify(cfg, null, 2), 'utf-8');
}

function hashPwd(pwd) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pwd, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPwd(pwd, stored) {
  if (!stored) return !pwd;
  if (!pwd) return false;
  const [salt, hash] = stored.split(':');
  return hash === crypto.scryptSync(pwd, salt, 64).toString('hex');
}

// 加载配置
const firstLaunchConfig = loadFirstLaunchConfig();
const needsSetup = !firstLaunchConfig;
const needsPassword = firstLaunchConfig && firstLaunchConfig.passwordHash;

// 如果有配置：configDir → userData（数据库、store），mediaDir → 默认影片路径
if (firstLaunchConfig) {
  if (firstLaunchConfig.configDir) {
    fs.ensureDirSync(firstLaunchConfig.configDir);
    app.setPath('userData', firstLaunchConfig.configDir);
    console.log('[配置] configDir → userData:', firstLaunchConfig.configDir);
  }
}

// 添加错误处理
process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的Promise拒绝:', reason);
});
const Store = require('electron-store');
const { getStoreName } = require('./src/config/storeName');
const { initDatabase } = require('./src/config/database');
const { runStartupSync } = require('./src/services/sync');
const { registerIpcHandlers, updateMainWindow } = require('./src/ipc/handlers');
const scanState = require('./src/state/scanState');

// 配置存储:用户数据存于 AppData,开发/正式/测试环境通过 name 区分
const store = new Store({ name: getStoreName() });

let mainWindow = null;

// 创建主窗口
function createWindow() {
  console.log('正在创建窗口...');
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    x: 100, // 设置窗口位置
    y: 100,
    show: true, // 立即显示窗口
    frame: true, // 显示窗口框架
    autoHideMenuBar: true, // 隐藏菜单栏
    skipTaskbar: false, // 在任务栏显示
    minimizable: true,
    maximizable: true,
    closable: true,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    // icon: path.join(__dirname, '../assets/icon.png') // 如果有图标的话
  });

  // 强制设置窗口属性
  mainWindow.setSkipTaskbar(false);
  mainWindow.setAlwaysOnTop(false);

  // 确保窗口在屏幕可见区域
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  const winBounds = mainWindow.getBounds();

  // 如果窗口在屏幕外,移动到屏幕内
  if (winBounds.x < 0 || winBounds.y < 0 ||
      winBounds.x + winBounds.width > width ||
      winBounds.y + winBounds.height > height) {
    console.log('窗口在屏幕外,移动到屏幕内');
    mainWindow.setPosition(100, 100);
  }

  console.log('窗口位置:', mainWindow.getPosition());
  console.log('窗口大小:', mainWindow.getSize());
  console.log('窗口可见:', mainWindow.isVisible());

  // 窗口显示事件
  mainWindow.once('ready-to-show', () => {
    console.log('窗口准备就绪,准备显示');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
      console.log('窗口已显示并聚焦');
    }
  });

  // 如果窗口已经准备好,立即显示
  if (mainWindow.webContents.isLoading()) {
    console.log('窗口正在加载,等待ready-to-show事件');
  } else {
    console.log('窗口已加载完成,立即显示');
    mainWindow.show();
    mainWindow.focus();
  }

  // 设置 Content Security Policy(修复安全警告)
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': ["default-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:* data: blob:; img-src 'self' data: http://localhost:* file: actor-avatar:;"]
      }
    });
  });

  // 开发环境加载Vite开发服务器,生产环境加载打包后的文件
  if (process.env.NODE_ENV === 'development') {
    console.log('开发模式:加载 http://localhost:5173');
    mainWindow.loadURL('http://localhost:5173').catch(err => {
      console.error('加载URL失败:', err);
      // 如果加载失败,显示错误页面(使用UTF-8编码)
      const errorPage = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>前端服务器未启动</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; text-align: center; }
            h1 { color: #f56c6c; }
            p { color: #666; margin: 20px 0; }
            code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; }
          </style>
        </head>
        <body>
          <h1>前端服务器未启动</h1>
          <p>请先运行以下命令启动前端服务器:</p>
          <p><code>cd frontend && npm run dev</code></p>
          <p>然后刷新此页面</p>
        </body>
        </html>
      `;
      mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(errorPage));
    });
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../frontend/dist/index.html'));
  }

  mainWindow.on('closed', () => {
    console.log('窗口已关闭');
    mainWindow = null;
  });

  // 错误处理
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('页面加载失败:', errorCode, errorDescription);
    // 如果是开发模式且连接失败,尝试重新加载
    if (process.env.NODE_ENV === 'development' && errorCode === -106) {
      console.log('连接失败,5秒后重试...');
      setTimeout(() => {
        if (mainWindow) {
          mainWindow.loadURL('http://localhost:5173');
        }
      }, 5000);
    }
  });

  // 监听页面导航
  mainWindow.webContents.on('did-navigate', (event, url) => {
    if (url && url.startsWith('http://localhost:5173')) {
      console.log('成功加载前端页面:', url);
    }
  });
}

// 检查并设置 data 路径
async function checkAndSetDataPath() {
  const fs = require('fs');
  let dataPath = store.get('dataPath');

  // 检查已保存的路径是否有效
  if (dataPath && fs.existsSync(dataPath)) {
    console.log('使用已配置的data路径:', dataPath);
    return dataPath;
  }

  // 优先使用已设置的 userData 路径(便携模式下 app.setPath('userData') 已生效)
  const userDataDir = app.getPath('userData');
  const defaultDataPath = path.join(__dirname, '..', 'data');
  const candidatePath = fs.existsSync(userDataDir) ? userDataDir : defaultDataPath;
  if (fs.existsSync(candidatePath)) {
    console.log('使用默认data路径:', candidatePath);
    store.set('dataPath', candidatePath);
    store.set('dataPaths', [candidatePath]);
    return candidatePath;
  }

  // 如果没有默认路径,需要用户选择
  console.log('需要用户选择data路径,创建临时窗口...');
  let tempWindow = null;

  try {
    // 创建一个临时窗口用于显示对话框(需要显示才能弹出对话框)
    tempWindow = new BrowserWindow({
      show: true, // 需要显示窗口才能弹出对话框
      width: 400,
      height: 300,
      center: true,
      frame: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    // 等待窗口准备好
    await new Promise(resolve => {
      if (tempWindow) {
        tempWindow.once('ready-to-show', () => {
          console.log('临时窗口已准备好');
          resolve();
        });
        setTimeout(resolve, 1000); // 超时保护
      } else {
        resolve();
      }
    });

    // 显示对话框
    console.log('显示文件夹选择对话框...');
    const result = await dialog.showOpenDialog(tempWindow, {
      properties: ['openDirectory'],
      title: '请选择data文件夹'
    });

    console.log('对话框结果:', result.canceled ? '已取消' : `已选择: ${result.filePaths[0]}`);

    if (!result.canceled && result.filePaths.length > 0) {
      dataPath = result.filePaths[0];
      store.set('dataPath', dataPath);
      store.set('dataPaths', [dataPath]);
      return dataPath;
    } else {
      // 用户取消了选择,退出应用
      console.log('用户取消了路径选择,应用将退出');
      app.quit();
      return null;
    }
  } catch (error) {
    console.error('选择data路径时出错:', error);
    // 如果出错,尝试使用默认路径
    if (fs.existsSync(candidatePath)) {
      console.log('使用默认data路径作为后备:', candidatePath);
      store.set('dataPath', candidatePath);
      store.set('dataPaths', [candidatePath]);
      return candidatePath;
    }
    throw error;
  } finally {
    // 关闭临时窗口
    if (tempWindow && !tempWindow.isDestroyed()) {
      tempWindow.close();
      console.log('临时窗口已关闭');
    }
  }
}

// 应用准备就绪
// 应用准备就绪
app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);

  // 注册演员头像自定义协议
  const { protocol } = require('electron');
  protocol.registerFileProtocol('actor-avatar', (request, callback) => {
    try {
      const actorDataPath = store.get('actorDataPath', null);
      if (!actorDataPath) { callback({ error: -2 }); return; }
      const prefix = 'actor-avatar://localhost/';
      if (!request.url.startsWith(prefix)) { callback({ error: -2 }); return; }
      const encoded = request.url.slice(prefix.length);
      const relPath = decodeURIComponent(encoded);
      if (!relPath || relPath.includes('..')) { callback({ error: -2 }); return; }
      const absPath = path.join(actorDataPath, relPath);
      const normalized = path.normalize(absPath);
      const rootNormalized = path.normalize(path.resolve(actorDataPath));
      if (!normalized.startsWith(rootNormalized)) { callback({ error: -2 }); return; }
      callback({ path: normalized });
    } catch (e) { callback({ error: -2 }); }
  });

  registerSetupIpc();

  // 提前注册业务 IPC（设置页需要 config:* 系列接口来管理影片路径）
  // 数据库可能未初始化，但 handler 内部会做检查
  try { registerIpcHandlers(mainWindow, null, store); } catch (e) { console.warn('提前注册IPC失败:', e.message); }

  createWindow();

  await new Promise(resolve => {
    if (mainWindow && !mainWindow.webContents.isLoading()) return resolve();
    mainWindow?.webContents.once('did-finish-load', () => resolve());
    setTimeout(resolve, 2000);
  });
  if (process.env.NODE_ENV === 'development') await waitForDevServer();

  if (needsSetup) {
    console.log('[首次启动] 显示设置向导');
    if (process.env.NODE_ENV === 'development') {
      mainWindow.loadURL('http://localhost:5173/#/setup');
    } else {
      mainWindow.loadFile(path.join(__dirname, '../frontend/dist/index.html'), { hash: 'setup' });
    }
    mainWindow.show(); mainWindow.focus();
    return;
  }

  if (needsPassword) {
    console.log('[密码锁定] 显示解锁页');
    if (process.env.NODE_ENV === 'development') {
      mainWindow.loadURL('http://localhost:5173/#/unlock');
    } else {
      mainWindow.loadFile(path.join(__dirname, '../frontend/dist/index.html'), { hash: 'unlock' });
    }
    mainWindow.show(); mainWindow.focus();
    return;
  }

  // 有配置时，把 mediaDir 写入 store 作为默认影片路径
  if (firstLaunchConfig?.mediaDir) {
    const existing = store.get('dataPaths', []);
    if (!existing || existing.length === 0) {
      store.set('dataPaths', [firstLaunchConfig.mediaDir]);
      store.set('dataPath', firstLaunchConfig.mediaDir);
      console.log('[配置] mediaDir → 默认影片路径:', firstLaunchConfig.mediaDir);
    }
  }

  await startMainApp();
});

/** 启动主应用 */
async function startMainApp() {
  let dataPath = null;
  try {
    console.log('开始初始化主应用...');
    dataPath = await checkAndSetDataPath();
    if (!dataPath) { console.log('未选择data路径'); return; }

    // registerIpcHandlers 可能已经调用过，跳过重复注册
    console.log('数据库初始化...');
    initDatabase().then(async () => {
      console.log('数据库初始化完成');
      await new Promise(resolve => setTimeout(resolve, 100));
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('database:ready');
      setTimeout(() => {
        const { getDataPaths } = require('./src/config/paths');
        const dataPaths = getDataPaths();
        if (dataPaths && dataPaths.length > 0 && store.get('autoScanOnStartup', true)) {
          scanState.setScanRunning('incremental');
          runStartupSync(dataPaths, mainWindow)
            .then(({ added, removed }) => { if (added > 0 || removed > 0) console.log('启动同步完成:', added, '新增', removed, '删除'); })
            .catch(err => console.error('启动同步失败:', err))
            .finally(() => {
              scanState.clearScanRunning();
              if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('file:changed', { type: 'startup_sync_done' });
            });
        }
      }, 2000);
    }).catch(error => {
      console.error('数据库初始化失败:', error);
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('database:error', error.message);
    });

    if (mainWindow && !mainWindow.isDestroyed()) {
      if (process.env.NODE_ENV === 'development') {
        mainWindow.loadURL('http://localhost:5173/');
      } else {
        mainWindow.loadFile(path.join(__dirname, '../frontend/dist/index.html'));
      }
      mainWindow.show(); mainWindow.focus();
    }
  } catch (error) {
    console.error('应用启动失败:', error);
    if (mainWindow) dialog.showErrorBox('启动错误', error.message);
  }
}

/** 注册首次启动/解锁 IPC */
function registerSetupIpc() {
  ipcMain.handle('setup:getStatus', () => {
    return { needsSetup, needsPassword: !!needsPassword, configDir: firstLaunchConfig?.configDir || null, mediaDir: firstLaunchConfig?.mediaDir || null };
  });

  ipcMain.handle('setup:save', async (event, configDir, mediaDir, password) => {
    try {
      fs.ensureDirSync(configDir);
      if (mediaDir) fs.ensureDirSync(mediaDir);
      const cfg = { configDir, mediaDir: mediaDir || null };
      if (password) cfg.passwordHash = hashPwd(password);
      saveFirstLaunchConfig(cfg);
      // 设置 userData 到配置目录
      app.setPath('userData', configDir);
      // 写入默认影片路径
      if (mediaDir) {
        store.set('dataPaths', [mediaDir]);
        store.set('dataPath', mediaDir);
      }
      console.log('[设置完成] configDir:', configDir, 'mediaDir:', mediaDir);
      return { success: true };
    } catch (e) {
      return { success: false, message: e.message };
    }
  });

  ipcMain.handle('setup:verifyPassword', (event, password) => {
    if (!firstLaunchConfig?.passwordHash) return { success: true };
    const ok = verifyPwd(password, firstLaunchConfig.passwordHash);
    if (ok) {
      // 密码正确，写入 mediaDir 并启动主应用
      if (firstLaunchConfig.mediaDir) {
        const existing = store.get('dataPaths', []);
        if (!existing || existing.length === 0) {
          store.set('dataPaths', [firstLaunchConfig.mediaDir]);
          store.set('dataPath', firstLaunchConfig.mediaDir);
        }
      }
      // 异步启动主应用
      startMainApp();
    }
    return { success: ok };
  });

  ipcMain.handle('setup:setPassword', (event, newPassword) => {
    const cfg = loadFirstLaunchConfig() || {};
    cfg.passwordHash = newPassword ? hashPwd(newPassword) : null;
    saveFirstLaunchConfig(cfg);
    return { success: true };
  });

  ipcMain.handle('setup:getConfig', () => {
    return { configDir: firstLaunchConfig?.configDir || null, mediaDir: firstLaunchConfig?.mediaDir || null, hasPassword: !!firstLaunchConfig?.passwordHash };
  });

  ipcMain.handle('setup:reset', () => {
    try {
      const p = getFirstLaunchConfigPath();
      if (fs.existsSync(p)) fs.unlinkSync(p);
      return { success: true };
    } catch (e) {
      return { success: false, message: e.message };
    }
  });
}

async function waitForDevServer() {
  const http = require('http');
  for (let i = 0; i < 10; i++) {
    try {
      const ready = await new Promise((resolve) => {
        const req = http.get('http://localhost:5173', (res) => { resolve(res.statusCode === 200); });
        req.on('error', () => { setTimeout(() => resolve(false), 500); });
        req.setTimeout(500, () => { req.destroy(); resolve(false); });
      });
      if (ready) { console.log('前端服务器已就绪'); return true; }
    } catch (_) {}
    await new Promise(r => setTimeout(r, 500));
  }
  console.warn('前端服务器可能未启动');
  return false;
}

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
