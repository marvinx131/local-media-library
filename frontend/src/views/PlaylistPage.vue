<template>
  <div class="playlist-page">
    <el-container>
      <el-header class="page-header">
        <div class="header-content">
          <h1 class="header-title">播放清单 ({{ movies.length }})</h1>
          <div class="header-actions">
            <el-button v-if="movies.length > 0" type="danger" size="small" @click="confirmClear">清空</el-button>
            <ThemeSwitch />
          </div>
        </div>
      </el-header>
      <el-main class="page-theme-bg">
        <el-card v-if="loading">加载中...</el-card>
        <el-card v-else-if="movies.length === 0">
          <el-empty description="播放清单为空，去添加一些影片吧" />
        </el-card>
        <div v-else>
          <div class="playlist-toolbar">
            <el-button type="success" @click="playAll" icon="VideoPlay">播放全部</el-button>
          </div>
          <div class="playlist-list">
            <div
              v-for="(movie, index) in movies"
              :key="movie.id"
              class="playlist-item"
              @click="goToDetail(movie.id)"
            >
              <span class="playlist-index">{{ index + 1 }}</span>
              <div class="playlist-poster-wrap">
                <el-image
                  v-if="posterUrls[movie.id]"
                  :src="posterUrls[movie.id]"
                  fit="cover"
                  class="playlist-poster"
                >
                  <template #error>
                    <div class="poster-placeholder">暂无封面</div>
                  </template>
                </el-image>
                <div v-else class="poster-placeholder">暂无封面</div>
              </div>
              <div class="playlist-info">
                <div class="playlist-title">{{ movie.title || movie.code }}</div>
                <div class="playlist-code">{{ movie.code }}</div>
              </div>
              <div class="playlist-actions" @click.stop>
                <el-button
                  v-if="movie.playable"
                  type="success"
                  size="small"
                  icon="VideoPlay"
                  @click.stop="playVideo(movie)"
                >
                  播放
                </el-button>
                <el-button
                  type="danger"
                  size="small"
                  icon="Delete"
                  @click.stop="remove(movie.code)"
                >
                  移除
                </el-button>
              </div>
            </div>
          </div>
        </div>
      </el-main>
    </el-container>
  </div>
</template>

<script setup>
defineOptions({ name: 'PlaylistPage' });
import { ref, onMounted, onActivated } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import ThemeSwitch from '../components/ThemeSwitch.vue';

const router = useRouter();
const loading = ref(false);
const movies = ref([]);
const posterUrls = ref({});

async function loadMovies() {
  loading.value = true;
  try {
    const res = await window.electronAPI.playlist.getMovies();
    if (res?.success) {
      movies.value = res.data || [];
      loadPosters();
    }
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
}

async function loadPosters() {
  for (const m of movies.value) {
    if (!m.poster_path || posterUrls.value[m.id]) continue;
    try {
      const url = await window.electronAPI.movies.getImage(m.poster_path, m.data_path_index ?? 0);
      if (url) posterUrls.value = { ...posterUrls.value, [m.id]: url };
    } catch {}
  }
}

function goToDetail(id) {
  router.push(`/movie/${id}`);
}

async function playVideo(movie) {
  try {
    const result = await window.electronAPI.movie.playVideo(movie.id);
    if (!result.success) ElMessage.error(result.message || '播放失败');
  } catch (e) {
    ElMessage.error('播放失败: ' + e.message);
  }
}

async function playAll() {
  try {
    const result = await window.electronAPI.playlist.createM3uPlaylist();
    if (!result?.success) {
      ElMessage.error(result?.message || '创建播放列表失败');
      return;
    }
    ElMessage.info('正在打开播放器...');
    const playResult = await window.electronAPI.movie.playFile(result.path);
    if (!playResult?.success) {
      ElMessage.error(playResult?.message || '播放失败');
    }
  } catch (e) {
    ElMessage.error('播放失败: ' + e.message);
  }
}

async function remove(code) {
  try {
    await window.electronAPI.playlist.removeCode(code);
    movies.value = movies.value.filter(m => m.code !== code);
    ElMessage.success('已移除');
  } catch (e) {
    ElMessage.error('移除失败');
  }
}

function confirmClear() {
  ElMessageBox.confirm('确定清空播放清单吗？', '清空播放清单', {
    confirmButtonText: '清空',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(async () => {
    await window.electronAPI.playlist.clear();
    movies.value = [];
    posterUrls.value = {};
    ElMessage.success('已清空');
  }).catch(() => {});
}

onMounted(() => loadMovies());
onActivated(() => loadMovies());
</script>

<style scoped>
.playlist-page { height: 100%; }
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
.playlist-toolbar { margin-bottom: 16px; }
.playlist-list { display: flex; flex-direction: column; gap: 8px; }
.playlist-item {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--el-fill-color-lighter);
  cursor: pointer;
  transition: background 0.15s;
}
.playlist-item:hover { background: var(--el-fill-color); }
.playlist-index {
  width: 28px; text-align: center; font-size: 14px;
  color: var(--el-text-color-secondary); flex-shrink: 0;
}
.playlist-poster-wrap {
  width: 50px; height: 70px; flex-shrink: 0;
  border-radius: 4px; overflow: hidden; background: var(--el-fill-color);
}
.playlist-poster { width: 100%; height: 100%; }
.poster-placeholder {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; color: var(--el-text-color-placeholder);
}
.playlist-info { flex: 1; min-width: 0; }
.playlist-title {
  font-size: 14px; font-weight: 500;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.playlist-code { font-size: 12px; color: var(--el-text-color-secondary); margin-top: 2px; }
.playlist-actions { flex-shrink: 0; display: flex; gap: 6px; }
</style>
