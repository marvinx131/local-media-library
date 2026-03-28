<template>
  <div class="startup-page">
    <div class="startup-container">
      <div class="startup-header">
        <el-icon :size="64" color="#409eff"><VideoCamera /></el-icon>
        <h1>Local Media Library</h1>
        <p class="subtitle">选择一个配置以继续</p>
      </div>

      <!-- 配置列表 -->
      <div class="config-list" v-if="!showCreateForm && !showPasswordForm">
        <div
          v-for="config in configs"
          :key="config.id"
          class="config-card"
          @click="selectConfig(config)"
        >
          <div class="config-info">
            <el-icon :size="24" color="#409eff"><FolderOpened /></el-icon>
            <div>
              <div class="config-name">{{ config.name }}</div>
              <div class="config-path">{{ config.dataDir }}</div>
            </div>
          </div>
          <div class="config-actions" @click.stop>
            <el-button text size="small" @click="editConfig(config)">
              <el-icon><Edit /></el-icon>
            </el-button>
            <el-button text size="small" type="danger" @click="deleteConfig(config)">
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
        </div>

        <el-button
          class="add-config-btn"
          type="primary"
          plain
          @click="showCreateForm = true"
        >
          <el-icon><Plus /></el-icon>
          <span>新建配置</span>
        </el-button>
      </div>

      <!-- 新建/编辑配置表单 -->
      <el-card v-if="showCreateForm" class="form-card">
        <template #header>{{ editingConfig ? '编辑配置' : '新建配置' }}</template>
        <el-form :model="createForm" label-width="80px">
          <el-form-item label="名称" required>
            <el-input v-model="createForm.name" placeholder="例如：我的影视库" />
          </el-form-item>
          <el-form-item label="数据目录">
            <el-input v-model="createForm.dataDir" placeholder="留空则自动创建" />
            <el-text type="info" size="small">每个配置拥有独立的数据库、收藏夹、播放历史等</el-text>
          </el-form-item>
          <el-form-item label="密码">
            <el-input
              v-model="createForm.password"
              type="password"
              placeholder="留空则无需密码"
              show-password
            />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="saveConfig" :loading="saving">
              {{ editingConfig ? '保存' : '创建' }}
            </el-button>
            <el-button @click="cancelCreate">取消</el-button>
          </el-form-item>
        </el-form>
      </el-card>

      <!-- 密码验证 -->
      <el-card v-if="showPasswordForm" class="form-card">
        <template #header>输入密码 — {{ selectedConfig?.name }}</template>
        <el-form @submit.prevent="confirmPassword">
          <el-form-item>
            <el-input
              v-model="passwordInput"
              type="password"
              placeholder="请输入密码"
              show-password
              autofocus
              @keyup.enter="confirmPassword"
            />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="confirmPassword" :loading="verifying">进入</el-button>
            <el-button @click="cancelPassword">返回</el-button>
          </el-form-item>
          <el-alert v-if="passwordError" :title="passwordError" type="error" show-icon :closable="false" />
        </el-form>
      </el-card>

      <!-- 编辑密码 -->
      <el-card v-if="showEditPassword" class="form-card">
        <template #header>修改密码 — {{ editingConfig?.name }}</template>
        <el-form @submit.prevent="saveNewPassword">
          <el-form-item label="新密码">
            <el-input v-model="newPassword" type="password" placeholder="留空则清除密码" show-password />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="saveNewPassword">保存</el-button>
            <el-button @click="showEditPassword = false">取消</el-button>
          </el-form-item>
        </el-form>
      </el-card>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { VideoCamera, FolderOpened, Edit, Delete, Plus } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';

const configs = ref([]);
const showCreateForm = ref(false);
const showPasswordForm = ref(false);
const showEditPassword = ref(false);
const editingConfig = ref(null);
const selectedConfig = ref(null);
const passwordInput = ref('');
const passwordError = ref('');
const newPassword = ref('');
const saving = ref(false);
const verifying = ref(false);

const createForm = ref({ name: '', dataDir: '', password: '' });

async function loadConfigs() {
  if (window.electronAPI?.configProfiles) {
    configs.value = await window.electronAPI.configProfiles.getAll() || [];
  }
}

function selectConfig(config) {
  if (config.hasPassword) {
    selectedConfig.value = config;
    passwordInput.value = '';
    passwordError.value = '';
    showPasswordForm.value = true;
  } else {
    activateAndEnter(config.id, '');
  }
}

async function activateAndEnter(id, password) {
  verifying.value = true;
  try {
    const result = await window.electronAPI.configProfiles.activate(id, password);
    if (result.success) {
      ElMessage.success('正在进入...');
      // 激活后重启进入配置（不清理 active）
      setTimeout(() => {
        window.electronAPI.configProfiles.relaunch();
      }, 300);
    } else {
      passwordError.value = result.message || '操作失败';
    }
  } finally {
    verifying.value = false;
  }
}

async function confirmPassword() {
  if (!selectedConfig.value) return;
  passwordError.value = '';
  await activateAndEnter(selectedConfig.value.id, passwordInput.value);
}

function cancelPassword() {
  showPasswordForm.value = false;
  selectedConfig.value = null;
}

async function saveConfig() {
  if (!createForm.value.name.trim()) {
    ElMessage.warning('请输入配置名称');
    return;
  }
  saving.value = true;
  try {
    if (editingConfig.value) {
      const res = await window.electronAPI.configProfiles.rename(editingConfig.value.id, createForm.value.name.trim());
      if (!res.success) { ElMessage.error(res.message); return; }
      if (createForm.value.password !== undefined) {
        await window.electronAPI.configProfiles.setPassword(editingConfig.value.id, createForm.value.password || null);
      }
      ElMessage.success('已更新');
    } else {
      const res = await window.electronAPI.configProfiles.add(
        createForm.value.name.trim(),
        createForm.value.dataDir?.trim() || null,
        createForm.value.password || null
      );
      if (!res.success) { ElMessage.error(res.message); return; }
      ElMessage.success('配置已创建');
    }
    showCreateForm.value = false;
    editingConfig.value = null;
    createForm.value = { name: '', dataDir: '', password: '' };
    await loadConfigs();
  } finally {
    saving.value = false;
  }
}

function editConfig(config) {
  editingConfig.value = config;
  createForm.value = { name: config.name, dataDir: config.dataDir, password: '' };
  showCreateForm.value = true;
}

async function deleteConfig(config) {
  try {
    await ElMessageBox.confirm(`确定删除配置「${config.name}」？（不会删除数据文件）`, '删除确认', { type: 'warning' });
    await window.electronAPI.configProfiles.remove(config.id);
    ElMessage.success('已删除');
    await loadConfigs();
  } catch (_) {}
}

function cancelCreate() {
  showCreateForm.value = false;
  editingConfig.value = null;
  createForm.value = { name: '', dataDir: '', password: '' };
}

function saveNewPassword() {
  if (!editingConfig.value) return;
  window.electronAPI.configProfiles.setPassword(editingConfig.value.id, newPassword.value || null).then(() => {
    ElMessage.success('密码已更新');
    showEditPassword.value = false;
    newPassword.value = '';
    loadConfigs();
  });
}

onMounted(loadConfigs);
</script>

<style scoped>
.startup-page {
  width: 100%;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  color: #e0e0e0;
}
.startup-container {
  width: 480px;
  max-width: 90vw;
}
.startup-header {
  text-align: center;
  margin-bottom: 32px;
}
.startup-header h1 {
  margin: 12px 0 4px;
  font-size: 28px;
  font-weight: 700;
  color: #fff;
}
.subtitle {
  color: #aaa;
  font-size: 14px;
  margin: 0;
}
.config-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.config-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
}
.config-card:hover {
  background: rgba(64, 158, 255, 0.12);
  border-color: rgba(64, 158, 255, 0.4);
}
.config-info {
  display: flex;
  align-items: center;
  gap: 12px;
}
.config-name {
  font-size: 16px;
  font-weight: 600;
  color: #fff;
}
.config-path {
  font-size: 12px;
  color: #888;
  margin-top: 2px;
  word-break: break-all;
}
.config-actions {
  display: flex;
  gap: 2px;
}
.add-config-btn {
  width: 100%;
  margin-top: 4px;
}
.form-card {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
}
:deep(.el-card__header) {
  color: #fff;
  font-weight: 600;
  border-bottom-color: rgba(255, 255, 255, 0.1);
}
:deep(.el-form-item__label) {
  color: #ccc;
}
</style>
