/**
 * electron-builder afterPack hook
 * 仅在便携版(portable)构建时，向输出目录写入 portable.txt
 * 应用启动时检测到该文件即启用便携模式
 */
const path = require('path');
const fs = require('fs-extra');

module.exports = async function afterPack(context) {
  // context.electronPlatformName: 'win32' | 'darwin' | 'linux'
  // context.packager.config: electron-builder 配置
  // 目标信息在 context.targets 中

  const targets = context.targets || [];
  const isPortable = targets.some(t => t.name === 'portable');

  if (!isPortable) return;

  // 输出目录（包含打包后的 exe）
  const outDir = context.appOutDir;
  const marker = path.join(outDir, 'portable.txt');
  await fs.writeFile(marker, 'This file enables portable mode. Data will be stored in a "data" folder next to the exe.\nDelete this file to switch back to AppData storage.\n');
  console.log('[afterPack] portable.txt created:', marker);
};
