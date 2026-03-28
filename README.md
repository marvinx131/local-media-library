# Local Media Library

Fork 自 [Achaiccccc/local-javlibrary](https://github.com/Achaiccccc/local-javlibrary)，在此基础上新增以下功能。

基于 Electron + Vue 3 构建的本地影视库管理桌面应用。

## 新增功能

### v1.0.2
- 🗑️ 配置选择页支持删除配置（当前使用中的不可删）
- 🖼️ 列表页图片懒加载优化（只加载可见区域图片，降低 IO）

### v1.0.1
- ✈️ **起飞记录**: 影片详情页点击 + 记录起飞次数，自动记录时间；封面右上角显示起飞次数角标；新增起飞记录菜单页（标题/时间/备注）；列表支持按起飞次数排序

### v1.0.0
- 🔐 **密码锁定**: 设置页可开启密码保护，每次启动需输入密码
- 📂 **多配置隔离**: 支持创建多个影音库配置，每个配置独立数据库/收藏/历史/密码；配置存储于 `%APPDATA%/LocalMediaLibrary/profiles/`
- 📝 **关于页面更新**: 开发者信息、GitHub 链接更新

### 便携模式
- `portable.txt` 或 `portable.json` 放在 exe 同目录启用便携模式
- 配置统一存 AppData（便携版和安装版共享配置）

## 原版功能

见 [Achaiccccc/local-javlibrary](https://github.com/Achaiccccc/local-javlibrary)

## 构建

```bash
npm install
cd frontend && npm install && npm run build && cd ..
npm run build:electron
```
