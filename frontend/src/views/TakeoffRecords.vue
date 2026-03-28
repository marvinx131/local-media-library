<template>
  <div class="takeoff-records">
    <el-container>
      <el-header class="page-header">
        <div class="header-content">
          <h1 class="header-title">起飞记录</h1>
          <div style="display: flex; gap: 8px; align-items: center;">
            <el-button v-if="records.length > 0" type="danger" size="small" @click="clearAll">清空记录</el-button>
            <ThemeSwitch />
          </div>
        </div>
      </el-header>
      <el-main class="page-theme-bg">
        <el-empty v-if="records.length === 0" description="暂无起飞记录" />
        <div v-else class="records-list">
          <div v-for="record in records" :key="record.id" class="record-item">
            <div class="record-main">
              <el-link type="primary" @click="goToMovie(record.code)" class="record-title">
                {{ record.title }}
              </el-link>
              <div class="record-time">{{ formatTime(record.timestamp) }}</div>
            </div>
            <div class="record-note">
              <el-input
                v-model="record.note"
                placeholder="备注..."
                size="small"
                style="width: 200px;"
                @blur="saveNote(record)"
                @keyup.enter="saveNote(record)"
              />
            </div>
            <el-button type="danger" text size="small" @click="removeRecord(record.id)">
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
        </div>
      </el-main>
    </el-container>
  </div>
</template>

<script setup>
import { ref, onMounted, onActivated } from 'vue';
import { useRouter } from 'vue-router';
import { Delete } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import ThemeSwitch from '../components/ThemeSwitch.vue';

const router = useRouter();
const records = ref([]);

async function loadRecords() {
  const res = await window.electronAPI.takeoff.getAll();
  if (res?.success) records.value = res.data || [];
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function saveNote(record) {
  await window.electronAPI.takeoff.updateNote(record.id, record.note);
}

async function removeRecord(id) {
  await window.electronAPI.takeoff.remove(id);
  records.value = records.value.filter(r => r.id !== id);
}

async function clearAll() {
  try {
    await ElMessageBox.confirm('确定清空所有起飞记录？', '确认', { type: 'warning' });
    await window.electronAPI.takeoff.clearAll();
    records.value = [];
    ElMessage.success('已清空');
  } catch (_) {}
}

function goToMovie(code) {
  router.push({ name: 'SearchResults', query: { keyword: code } });
}

onMounted(loadRecords);
onActivated(loadRecords);
</script>

<style scoped>
.takeoff-records { width: 100%; height: 100%; }
.page-header { background-color: var(--header-bg); color: var(--title-color); display: flex; align-items: center; padding: 0 20px; }
.header-content { display: flex; align-items: center; justify-content: space-between; width: 100%; }
.header-title { margin: 0; }
.records-list { max-width: 800px; margin: 0 auto; }
.record-item {
  display: flex; align-items: center; gap: 12px; padding: 12px 16px;
  background: var(--card-bg, #fff); border-radius: 8px; margin-bottom: 8px;
  border: 1px solid var(--border-color, #ebeef5);
}
.record-main { flex: 1; min-width: 0; }
.record-title { font-size: 15px; font-weight: 500; }
.record-time { color: #909399; font-size: 12px; margin-top: 4px; }
</style>
