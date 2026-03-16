<script setup lang="ts">
import { ref } from 'vue'
import BagPanel from '@/components/BagPanel.vue'
import FarmPanel from '@/components/FarmPanel.vue'
import TaskPanel from '@/components/TaskPanel.vue'

const currentTab = ref<'farm' | 'bag' | 'task'>('farm')
</script>

<template>
  <div class="space-y-4">
    <div class="flex gap-2 border-b border-gray-200 dark:border-gray-700">
      <button
        class="border-b-2 px-4 py-2 text-sm font-medium transition-colors"
        :class="currentTab === 'farm'
          ? 'border-blue-500 text-blue-600 dark:border-blue-400 dark:text-blue-400'
          : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'"
        @click="currentTab = 'farm'"
      >
        <div class="flex items-center space-x-2">
          <div class="i-carbon-sprout text-lg" />
          <span>我的农场</span>
        </div>
      </button>
      <button
        class="border-b-2 px-4 py-2 text-sm font-medium transition-colors"
        :class="currentTab === 'bag'
          ? 'border-blue-500 text-blue-600 dark:border-blue-400 dark:text-blue-400'
          : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'"
        @click="currentTab = 'bag'"
      >
        <div class="flex items-center space-x-2">
          <div class="i-carbon-box text-lg" />
          <span>我的背包</span>
        </div>
      </button>
      <button
        class="border-b-2 px-4 py-2 text-sm font-medium transition-colors"
        :class="currentTab === 'task'
          ? 'border-blue-500 text-blue-600 dark:border-blue-400 dark:text-blue-400'
          : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'"
        @click="currentTab = 'task'"
      >
        <div class="flex items-center space-x-2">
          <div class="i-carbon-task text-lg" />
          <span>我的任务</span>
        </div>
      </button>
    </div>

    <div>
      <Transition
        mode="out-in"
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="transform opacity-0 scale-95"
        enter-to-class="transform opacity-100 scale-100"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="transform opacity-100 scale-100"
        leave-to-class="transform opacity-0 scale-95"
      >
        <component :is="currentTab === 'farm' ? FarmPanel : (currentTab === 'bag' ? BagPanel : TaskPanel)" />
      </Transition>
    </div>
  </div>
</template>
