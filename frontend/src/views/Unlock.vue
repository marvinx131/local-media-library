<template>
  <div class="unlock-page">
    <div class="unlock-container">
      <div class="unlock-header">
        <el-icon :size="64" color="#409eff"><Lock /></el-icon>
        <h1>Local Media Library</h1>
        <p class="subtitle">请输入密码以继续</p>
      </div>
      <el-card class="unlock-card">
        <el-form @submit.prevent="onUnlock">
          <el-form-item>
            <el-input v-model="password" type="password" placeholder="请输入密码" show-password autofocus size="large" @keyup.enter="onUnlock" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" size="large" style="width: 100%;" @click="onUnlock" :loading="verifying">解锁</el-button>
          </el-form-item>
          <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" />
        </el-form>
      </el-card>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { Lock } from '@element-plus/icons-vue';

const password = ref('');
const error = ref('');
const verifying = ref(false);

async function onUnlock() {
  error.value = '';
  verifying.value = true;
  try {
    const result = await window.electronAPI.setup.verifyPassword(password.value);
    if (result.success) {
      // 主进程会自动启动主应用并加载首页
      // 前端只需等待 database:ready 事件然后导航
      window.location.hash = '/';
    } else {
      error.value = '密码错误';
    }
  } finally {
    verifying.value = false;
  }
}
</script>

<style scoped>
.unlock-page { width: 100%; height: 100vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%); color: #e0e0e0; }
.unlock-container { width: 400px; max-width: 90vw; }
.unlock-header { text-align: center; margin-bottom: 32px; }
.unlock-header h1 { margin: 12px 0 4px; font-size: 28px; font-weight: 700; color: #fff; }
.subtitle { color: #aaa; font-size: 14px; margin: 0; }
.unlock-card { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; }
</style>
