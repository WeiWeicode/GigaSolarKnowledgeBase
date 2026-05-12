<template>
  <div class="kb-layout">
    <!-- Header -->
    <TheHeader />

    <div class="kb-body">
      <!-- Nav sidebar -->
      <TheSidebar />

      <!-- Directory Tree sidebar -->
      <aside class="kb-tree-sidebar">
        <DirectoryTree />
      </aside>

      <!-- Main content -->
      <main class="kb-main">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>
  </div>
</template>

<script setup>
import TheHeader from './TheHeader.vue'
import TheSidebar from './TheSidebar.vue'
import DirectoryTree from '@/components/directory/DirectoryTree.vue'
import { useDirectoryStore } from '@/store/directory.js'
import { useAuthStore } from '@/store/auth.js'
import { onMounted } from 'vue'

const auth = useAuthStore()
const dirStore = useDirectoryStore()

onMounted(async () => {
  if (auth.user) {
    await dirStore.fetchTree(auth.user.組織OID, auth.user.部門代碼)
  }
})
</script>

<style scoped>
.kb-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.kb-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.kb-tree-sidebar {
  width: var(--sidebar-tree-width);
  background: var(--sidebar-tree-bg);
  border-right: 1px solid var(--color-border);
  overflow-y: auto;
  flex-shrink: 0;
}

.kb-main {
  flex: 1;
  overflow-y: auto;
  padding: var(--main-content-padding);
  background: var(--color-bg);
}
</style>
