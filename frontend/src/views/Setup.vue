<template>
  <div class="setup-page">
    <div class="setup-container">
      <div class="setup-header">
        <el-icon :size="64" color="#409eff"><VideoCamera /></el-icon>
        <h1>Local Media Library</h1>
        <p class="subtitle">首次启动设置</p>
      </div>

      <el-card class="setup-card">
        <el-form :model="form" label-width="100px" @submit.prevent="onSubmit">
          <el-form-item label="配置目录" required>
            <el-input v-model="form.configDir" placeholder="存放数据库、设置的目录" readonly>
              <template #append>
                <el-button @click="pickDir('configDir')">选择</el-button>
              </template>
            </el-input>
            <el-text type="info" size="small">应用配置、数据库、收藏夹等存于此处</el-text>
          </el-form-item>
          <el-form-item label="影片目录" required>
            <el-input v-model="form.mediaDir" placeholder="影片文件所在的根目录" readonly>
              <template #append>
                <el-button @click="pickDir('mediaDir')">选择</el-button>
              </template>
            </el-input>
            <el-text type="info" size="small">包含影片文件夹的根目录（可在设置中追加更多路径）</el-text>
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
        <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" style="margin-top: 12px;" />
      </el-card>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { VideoCamera } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';

const form = ref({ configDir: '', mediaDir: '', password: '' });
const saving = ref(false);
const error = ref('');

async function pickDir(field) {
  try {
    const result = await window.electronAPI.config.setDataPath();
    if (result?.success && result.path) {
      form.value[field] = result.path;
    }
  } catch (e) {
    // 如果 config:setDataPath 不可用，弹出提示
    error.value = '目录选择器不可用，请手动输入路径';
  }
}

async function onSubmit() {
  error.value = '';
  if (!form.value.configDir.trim()) { error.value = '请选择配置目录'; return; }
  if (!form.value.mediaDir.trim()) { error.value = '请选择影片目录'; return; }
  saving.value = true;
  try {
    const result = await window.electronAPI.setup.save(
      form.value.configDir.trim(),
      form.value.mediaDir.trim(),
      form.value.password || null
    );
    if (result.success) {
      ElMessage.success('配置完成');
      // 跳转到首页并刷新，主进程会加载主应用
      setTimeout(() => {
        window.location.hash = '/';
        window.location.reload();
      }, 300);
    } else {
      error.value = result.message || '保存失败';
    }
  } catch (e) {
    error.value = e.message || '保存失败';
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.setup-page {
  width: 100%; height: 100vh;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  color: #e0e0e0;
}
.setup-container { width: 520px; max-width: 90vw; }
.setup-header { text-align: center; margin-bottom: 32px; }
.setup-header h1 { margin: 12px 0 4px; font-size: 28px; font-weight: 700; color: #fff; }
.subtitle { color: #aaa; font-size: 14px; margin: 0; }
.setup-card {
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 10px;
}
:deep(.el-form-item__label) { color: #ccc; }
:deep(.el-input.is-readonly .el-input__wrapper) { background-color: rgba(255,255,255,0.04); }
</style>
