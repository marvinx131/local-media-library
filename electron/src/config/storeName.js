/**
 * 获取 electron-store 的配置文件名，用于区分开发/正式/测试环境，避免数据混用。
 */
const { app } = require('electron');

function getStoreName() {
  if (process.env.NODE_ENV === 'development') return 'local-media-library-dev';
  if (app.getName() === 'LocalMediaLibrary_beta') return 'local-media-library-test';
  return 'local-media-library';
}

module.exports = { getStoreName };
