<template>
  <div class="setup-page">
    <div class="setup-container">
      <div class="setup-header">
        <el-icon :size="64" color="#409eff"><VideoCamera /></el-icon>
        <h1>Local Media Library</h1>
        <p class="subtitle">首次启动，请选择数据存储目录</p>
      </div>

      <el-card class="setup-card">
        <el-form :model="form" label-width="80px" @submit.prevent="onSubmit">
          <el-form-item label="数据目录" required>
            <el-input v-model="form.dataDir" placeholder="选择或输入数据目录路径">
              <template #append>
                <el-button @click="chooseDir">选择</el-button>
              </template>
            </el-input>
            <el-text type="info" size="small" style="margin-top: 4px;">
              数据库、收藏夹、播放历史等将存于此目录
            </el-text>
          </el-form-item>
          <el-form-item label="密码">
            <el-input v-model="form.password" type="password" placeholder="留空则无需密码" show-password />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" native-type="submit" :loading="saving" size="large" style="width: 100%;">
              开始使用
            </el-button>
          </el-form-item>
        </el-form>
      </el-card>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { VideoCamera } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';

const form = ref({ dataDir: '', password: '' });
const saving = ref(false);

async function chooseDir() {
  // 通过设置页的已有 IPC 选择目录，或用 dialog
  // 这里简单用 prompt 输入
  const result = await window.electronAPI?.settings?.choosePlayerPath?.();
  // 不适用，改用后端对话框 — 这里先让用户手动输入
}

async function onSubmit() {
  if (!form.value.dataDir.trim()) {
    ElMessage.warning('请选择或输入数据目录');
    return;
  }
  saving.value = true;
  try {
    const result = await window.electronAPI.setup.save(form.value.dataDir.trim(), form.value.password || null);
    if (result.success) {
      ElMessage.success('配置完成，正在启动...');
      // 通知主进程启动主应用
      setTimeout(() => {
        window.location.hash = '/';
        window.location.reload();
      }, 500);
    } else {
      ElMessage.error(result.message || '保存失败');
    }
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.setup-page {
  width: 100%;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  color: #e0e0e0;
}
.setup-container { width: 480px; max-width: 90vw; }
.setup-header { text-align: center; margin-bottom: 32px; }
.setup-header h1 { margin: 12px 0 4px; font-size: 28px; font-weight: 700; color: #fff; }
.subtitle { color: #aaa; font-size: 14px; margin: 0; }
.setup-card {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
}
:deep(.el-form-item__label) { color: #ccc; }
</style>
