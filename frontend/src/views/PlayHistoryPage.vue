<template>
  <div class="history-page">
    <el-container>
      <el-header class="page-header">
        <div class="header-content">
          <h1 class="header-title">播放历史 ({{ records.length }})</h1>
          <div class="header-actions">
            <el-dropdown @command="handleClearCommand">
              <el-button type="danger" size="small">清除记录</el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item :command="7">清除7天前</el-dropdown-item>
                  <el-dropdown-item :command="30">清除30天前</el-dropdown-item>
                  <el-dropdown-item :command="90">清除90天前</el-dropdown-item>
                  <el-dropdown-item :command="0" divided>清除全部</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <ThemeSwitch />
          </div>
        </div>
      </el-header>
      <el-main class="page-theme-bg">
        <el-card v-if="loading">加载中...</el-card>
        <el-card v-else-if="records.length === 0">
          <el-empty description="暂无播放记录" />
        </el-card>
        <div v-else class="history-list">
          <div
            v-for="record in records"
            :key="record.code"
            class="history-item"
            @click="goToDetail(record)"
          >
            <div class="history-poster-wrap">
              <el-image
                v-if="posterUrls[record.code]"
                :src="posterUrls[record.code]"
                fit="cover"
                class="history-poster"
              >
                <template #error>
                  <div class="poster-placeholder">暂无封面</div>
                </template>
              </el-image>
              <div v-else class="poster-placeholder">暂无封面</div>
            </div>
            <div class="history-info">
              <div class="history-title">{{ record.title || record.code }}</div>
              <div class="history-code">{{ record.code }}</div>
              <div class="history-meta">
                <span>播放 {{ record.count }} 次</span>
                <span style="margin-left: 12px;">{{ formatTime(record.lastPlayedAt) }}</span>
              </div>
            </div>
            <div class="history-actions" @click.stop>
              <el-button
                type="danger"
                size="small"
                icon="Delete"
                circle
                @click.stop="removeRecord(record.code)"
                title="删除记录"
              />
            </div>
          </div>
        </div>
      </el-main>
    </el-container>
  </div>
</template>

<script setup>
defineOptions({ name: 'PlayHistoryPage' });
import { ref, onMounted, onActivated } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import ThemeSwitch from '../components/ThemeSwitch.vue';

const router = useRouter();
const loading = ref(false);
const records = ref([]);
const posterUrls = ref({});

async function loadRecords() {
  loading.value = true;
  try {
    const res = await window.electronAPI.playHistory.getAll();
    if (res?.success) {
      records.value = res.data || [];
      loadPosters();
    }
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
}

async function loadPosters() {
  for (const r of records.value) {
    if (posterUrls.value[r.code]) continue;
    try {
      // 需要通过 code 查找影片获取海报
      const searchRes = await window.electronAPI.search.simple(r.code, { page: 1, pageSize: 1 });
      if (searchRes?.success && searchRes.data?.[0]?.poster_path) {
        const movie = searchRes.data[0];
        const url = await window.electronAPI.movies.getImage(movie.poster_path, movie.data_path_index ?? 0);
        if (url) posterUrls.value = { ...posterUrls.value, [r.code]: url };
      }
    } catch {}
  }
}

function formatTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  const now = new Date();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 30) return `${days}天前`;
  return date.toLocaleDateString('zh-CN');
}

async function goToDetail(record) {
  try {
    const res = await window.electronAPI.search.simple(record.code, { page: 1, pageSize: 1 });
    if (res?.success && res.data?.[0]?.id) {
      router.push(`/movie/${res.data[0].id}`);
    }
  } catch {}
}

async function removeRecord(code) {
  try {
    await window.electronAPI.playHistory.remove(code);
    records.value = records.value.filter(r => r.code !== code);
    ElMessage.success('已删除');
  } catch (e) {
    ElMessage.error('删除失败');
  }
}

async function handleClearCommand(days) {
  const text = days === 0 ? '确定清除所有播放记录吗？' : `确定清除${days}天前的播放记录吗？`;
  try {
    await ElMessageBox.confirm(text, '清除记录', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    });
    if (days === 0) {
      await window.electronAPI.playHistory.clearAll();
    } else {
      await window.electronAPI.playHistory.clearOlderThan(days);
    }
    await loadRecords();
    ElMessage.success('已清除');
  } catch {}
}

onMounted(() => loadRecords());
onActivated(() => loadRecords());
</script>

<style scoped>
.history-page { height: 100%; }
.page-header {
  display: flex; align-items: center;
  background: var(--nav-bg);
  border-bottom: 1px solid var(--header-border);
}
.header-content {
  display: flex; align-items: center; justify-content: space-between; width: 100%;
}
.header-title { font-size: 18px; font-weight: 600; margin: 0; }
.header-actions { display: flex; align-items: center; gap: 8px; }
.history-list { display: flex; flex-direction: column; gap: 8px; }
.history-item {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--el-fill-color-lighter);
  cursor: pointer;
  transition: background 0.15s;
}
.history-item:hover { background: var(--el-fill-color); }
.history-poster-wrap {
  width: 50px; height: 70px; flex-shrink: 0;
  border-radius: 4px; overflow: hidden; background: var(--el-fill-color);
}
.history-poster { width: 100%; height: 100%; }
.poster-placeholder {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; color: var(--el-text-color-placeholder);
}
.history-info { flex: 1; min-width: 0; }
.history-title {
  font-size: 14px; font-weight: 500;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.history-code { font-size: 12px; color: var(--el-text-color-secondary); margin-top: 2px; }
.history-meta { font-size: 12px; color: var(--el-text-color-secondary); margin-top: 4px; }
.history-actions { flex-shrink: 0; }
</style>
