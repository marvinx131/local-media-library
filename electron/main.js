const { app, BrowserWindow, dialog, ipcMain, Menu } = require('electron');
const { session } = require('electron');
const path = require('path');

// 便携模式支持:优先读取 exe 同目录下的 portable.json 配置
// portable.json 示例: { "dataDir": "D:\\MyMediaData" }
// 或者直接放一个 portable.txt 空文件 → 数据存到 exe 同目录的 data 子目录
let isPortableMode = false;
{
  const fs = require('fs-extra');
  const exeDir = path.dirname(app.getPath('exe'));

  // 方式1:portable.json 指定绝对路径
  const jsonPath = path.join(exeDir, 'portable.json');
  if (fs.existsSync(jsonPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
      if (cfg.dataDir && typeof cfg.dataDir === 'string') {
        fs.ensureDirSync(cfg.dataDir);
        app.setPath('userData', cfg.dataDir);
        isPortableMode = true;
        console.log('[便携模式] portable.json → userData:', cfg.dataDir);
      }
    } catch (e) {
      console.error('[便携模式] portable.json 解析失败:', e.message);
    }
  }
  // 方式2:portable.txt 标记 → 数据存到 exe 同目录的 data 子目录
  else if (fs.existsSync(path.join(exeDir, 'portable.txt'))) {
    const dataDir = path.join(exeDir, 'data');
    fs.ensureDirSync(dataDir);
    app.setPath('userData', dataDir);
    isPortableMode = true;
    console.log('[便携模式] portable.txt → userData:', dataDir);
  }
}

// 多配置支持:检查是否有激活的配置
const configManager = require('./src/config/configManager');
{
  const activeDataDir = configManager.getActiveDataDir();
  if (activeDataDir) {
    require('fs-extra').ensureDirSync(activeDataDir);
    app.setPath('userData', activeDataDir);
    console.log('[多配置] 激活配置 → userData:', activeDataDir);
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

// 是否需要显示启动页（无激活配置时显示）
const showStartupPage = !configManager.getActiveConfigId();

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
app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);

  // 注册演员头像自定义协议,避免渲染进程直接加载 file:// 被安全策略拦截
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

  // ── 注册配置管理 IPC(始终可用)──
  registerConfigIpc();

  // ── 启动页模式:无激活配置时显示配置选择页 ──
  if (showStartupPage) {
    console.log('[启动页] 无激活配置,显示配置选择页');
    createWindow();
    // 等待窗口就绪
    await new Promise(resolve => {
      if (mainWindow && !mainWindow.webContents.isLoading()) return resolve();
      mainWindow?.webContents.once('did-finish-load', () => resolve());
      setTimeout(resolve, 2000);
    });
    // 开发模式下等前端服务器
    if (process.env.NODE_ENV === 'development') {
      await waitForDevServer();
    }
    // 导航到启动页(hash 路由用 #/startup)
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (process.env.NODE_ENV === 'development') {
        mainWindow.loadURL('http://localhost:5173/#/startup');
      } else {
        mainWindow.loadFile(path.join(__dirname, '../frontend/dist/index.html'), { hash: 'startup' });
      }
      mainWindow.show();
      mainWindow.focus();
    }
    return; // 不初始化数据库,等用户选择配置后重启
  }

  // ── 正常模式:初始化数据库和业务逻辑 ──
  let dataPath = null;
  try {
    console.log('应用准备就绪,开始初始化...');
    createWindow();
    console.log('检查data路径...');
    dataPath = await checkAndSetDataPath();
    if (!dataPath) { console.log('未选择data路径'); return; }
    console.log('Data路径:', dataPath);

    console.log('注册IPC处理器...');
    try {
      registerIpcHandlers(mainWindow, dataPath, store);
      console.log('IPC处理器注册成功');
    } catch (error) {
      console.error('IPC处理器注册失败:', error);
      throw error;
    }

    console.log('开始初始化数据库(后台进行)...');
    initDatabase().then(async () => {
      console.log('数据库初始化完成');
      await new Promise(resolve => setTimeout(resolve, 100));
      try {
        const { getSequelize } = require('./src/config/database');
        const sequelize = getSequelize();
        if (sequelize) {
          const [results] = await sequelize.query(`SELECT name FROM sqlite_master WHERE type='table' AND name = 'movies'`);
          if (results.length > 0 && mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('database:ready');
          }
        }
      } catch (e) {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('database:ready');
      }
      setTimeout(() => {
        const { getDataPaths } = require('./src/config/paths');
        const dataPaths = getDataPaths();
        const autoScanOnStartup = store.get('autoScanOnStartup', true);
        if (dataPaths && dataPaths.length > 0 && autoScanOnStartup) {
          scanState.setScanRunning('incremental');
          runStartupSync(dataPaths, mainWindow)
            .then(({ added, removed }) => { if (added > 0 || removed > 0) console.log('启动同步完成:新增', added, '条,删除', removed, '条'); })
            .catch((err) => console.error('启动同步失败:', err))
            .finally(() => {
              scanState.clearScanRunning();
              if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('file:changed', { type: 'startup_sync_done' });
            });
        }
      }, 2000);
    }).catch((error) => {
      console.error('数据库初始化失败:', error);
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('database:error', error.message);
    });

    // 强制显示窗口
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
      mainWindow.setSkipTaskbar(false);
      [200, 500, 1000, 2000].forEach((delay) => {
        setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
            mainWindow.show(); mainWindow.focus(); mainWindow.moveTop();
          }
        }, delay);
      });
    }

    await new Promise(resolve => {
      if (mainWindow) {
        if (!mainWindow.webContents.isLoading()) return resolve();
        mainWindow.webContents.once('did-finish-load', () => resolve());
        setTimeout(resolve, 1000);
      } else { setTimeout(resolve, 100); }
    });

    if (process.env.NODE_ENV === 'development') await waitForDevServer();
  } catch (error) {
    console.error('应用启动失败:', error);
    if (mainWindow) dialog.showErrorBox('启动错误', error.message);
  }
});

/** 等待开发服务器就绪 */
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

/** 注册配置管理 IPC */
function registerConfigIpc() {
  ipcMain.handle('configProfiles:getAll', () => {
    return configManager.getConfigs().map(c => ({ id: c.id, name: c.name, dataDir: c.dataDir, hasPassword: !!c.passwordHash, createdAt: c.createdAt }));
  });

  ipcMain.handle('configProfiles:add', (event, name, dataDir, password) => {
    return configManager.addConfig(name, dataDir, password);
  });

  ipcMain.handle('configProfiles:remove', (event, id) => {
    return { success: configManager.removeConfig(id) };
  });

  ipcMain.handle('configProfiles:rename', (event, id, newName) => {
    return configManager.renameConfig(id, newName);
  });

  ipcMain.handle('configProfiles:setPassword', (event, id, newPassword) => {
    return { success: configManager.setPassword(id, newPassword) };
  });

  ipcMain.handle('configProfiles:activate', (event, id, password) => {
    return configManager.activateConfig(id, password);
  });

  ipcMain.handle('configProfiles:switch', async () => {
    configManager.clearActive();
    app.relaunch();
    setTimeout(() => app.quit(), 300);
  });

  // 重启进入已激活的配置（不清理 active）
  ipcMain.handle('configProfiles:relaunch', async () => {
    app.relaunch();
    setTimeout(() => app.quit(), 300);
  });

  ipcMain.handle('configProfiles:getActive', () => {
    const id = configManager.getActiveConfigId();
    if (!id) return null;
    const configs = configManager.getConfigs();
    const config = configs.find(c => c.id === id);
    return config ? { id: config.id, name: config.name, dataDir: config.dataDir } : null;
  });

  console.log('配置管理IPC已注册');
}

// 所有窗口关闭时
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

