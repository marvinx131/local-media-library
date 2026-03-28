<template>
  <div class="profile-page">
    <div class="profile-container">
      <div class="profile-header">
        <el-icon :size="64" color="#409eff"><VideoCamera /></el-icon>
        <h1>Local Media Library</h1>
        <p class="subtitle">选择影音库配置</p>
      </div>

      <div class="profile-list">
        <div
          v-for="config in configs"
          :key="config.id"
          class="profile-card"
          @click="selectProfile(config)"
        >
          <el-icon :size="24" color="#409eff"><FolderOpened /></el-icon>
          <div class="profile-info">
            <div class="profile-name">{{ config.name }}</div>
          </div>
          <el-icon v-if="config.id === currentId" color="#67c23a"><Check /></el-icon>
          <el-button
            v-if="config.id !== currentId && configs.length > 1"
            type="danger"
            text
            size="small"
            @click.stop="deleteProfile(config)"
          >
            <el-icon><Delete /></el-icon>
          </el-button>
        </div>
      </div>

      <el-button class="add-btn" type="primary" plain @click="showCreate = true">
        <el-icon><Plus /></el-icon> 新建配置
      </el-button>

      <!-- 新建 -->
      <el-card v-if="showCreate" class="form-card" style="margin-top: 16px;">
        <template #header>新建配置</template>
        <el-form @submit.prevent="createProfile">
          <el-form-item>
            <el-input v-model="newName" placeholder="配置名称" autofocus />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="createProfile" :loading="creating">创建</el-button>
            <el-button @click="showCreate = false">取消</el-button>
          </el-form-item>
        </el-form>
      </el-card>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { VideoCamera, FolderOpened, Check, Plus, Delete } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';

const configs = ref([]);
const currentId = ref('');
const showCreate = ref(false);
const newName = ref('');
const creating = ref(false);

async function load() {
  const data = await window.electronAPI.profiles.getAll();
  configs.value = data.configs || [];
  currentId.value = data.selectedId || '';
}

async function selectProfile(config) {
  if (config.id === currentId.value) return;
  await window.electronAPI.profiles.switch(config.id);
}

async function createProfile() {
  if (!newName.value.trim()) return;
  creating.value = true;
  try {
    const result = await window.electronAPI.profiles.create(newName.value.trim());
    if (result.success) {
      ElMessage.success('配置已创建');
      showCreate.value = false;
      newName.value = '';
      await load();
    } else {
      ElMessage.error(result.message);
    }
  } finally {
    creating.value = false;
  }
}

async function deleteProfile(config) {
  try {
    await ElMessageBox.confirm(`确定删除配置「${config.name}」？配置内的数据将被清除。`, '删除确认', { type: 'warning' });
    const result = await window.electronAPI.profiles.delete(config.id);
    if (result.success) {
      ElMessage.success('已删除');
      await load();
    } else {
      ElMessage.error(result.message);
    }
  } catch (_) {}
}

onMounted(load);
</script>

<style scoped>
.profile-page { width: 100%; height: 100vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%); color: #e0e0e0; }
.profile-container { width: 440px; max-width: 90vw; }
.profile-header { text-align: center; margin-bottom: 32px; }
.profile-header h1 { margin: 12px 0 4px; font-size: 28px; font-weight: 700; color: #fff; }
.subtitle { color: #aaa; font-size: 14px; margin: 0; }
.profile-list { display: flex; flex-direction: column; gap: 10px; }
.profile-card { display: flex; align-items: center; gap: 12px; padding: 14px 18px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; cursor: pointer; transition: all 0.2s; }
.profile-card:hover { background: rgba(64,158,255,0.12); border-color: rgba(64,158,255,0.4); }
.profile-name { font-size: 16px; font-weight: 600; color: #fff; }
.add-btn { width: 100%; margin-top: 4px; }
.form-card { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; }
:deep(.el-card__header) { color: #fff; font-weight: 600; border-bottom-color: rgba(255,255,255,0.1); }
</style>
