<script setup lang="ts">
import { useIntervalFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import api from '@/api'
import ConfirmModal from '@/components/ConfirmModal.vue'
import LandGrid from '@/components/LandGrid.vue'
import { useAccountStore } from '@/stores/account'
import { useFriendStore } from '@/stores/friend'
import { useStatusStore } from '@/stores/status'
import { useToastStore } from '@/stores/toast'

const accountStore = useAccountStore()
const friendStore = useFriendStore()
const statusStore = useStatusStore()
const toast = useToastStore()
const { currentAccountId, currentAccount } = storeToRefs(accountStore)
const { friends, loading, friendLands, friendLandsLoading, blacklist, interactRecords, interactLoading, interactError } = storeToRefs(friendStore)
const { status, loading: statusLoading, realtimeConnected } = storeToRefs(statusStore)

const showConfirm = ref(false)
const confirmMessage = ref('')
const confirmLoading = ref(false)
const pendingAction = ref<(() => Promise<void>) | null>(null)
const avatarErrorKeys = ref<Set<string>>(new Set())
const searchKeyword = ref('')
const interactFilter = ref('all')
const stakeoutFriendList = ref<number[]>([])
const interactFilters = [
  { key: 'all', label: '全部' },
  { key: 'steal', label: '偷菜' },
  { key: 'help', label: '帮忙' },
  { key: 'bad', label: '捣乱' },
]

const batchLoading = ref(false)
const activeSidebarTab = ref('friends')
const visibleGids = ref<Set<number>>(new Set())

function toggleGidVisibility(gid: number) {
  if (visibleGids.value.has(gid)) {
    visibleGids.value.delete(gid)
  }
  else {
    visibleGids.value.add(gid)
  }
}

function maskGid(gid: number | string) {
  const gidStr = String(gid || '')
  if (gidStr.length <= 4) {
    return '*'.repeat(gidStr.length)
  }
  return gidStr.slice(0, 2) + '*'.repeat(gidStr.length - 4) + gidStr.slice(-2)
}

function getDisplayGid(gid: number) {
  if (visibleGids.value.has(gid)) {
    return String(gid)
  }
  return maskGid(gid)
}

function confirmAction(msg: string, action: () => Promise<void>) {
  confirmMessage.value = msg
  pendingAction.value = action
  showConfirm.value = true
}

async function onConfirm() {
  if (pendingAction.value) {
    try {
      confirmLoading.value = true
      await pendingAction.value()
      pendingAction.value = null
      showConfirm.value = false
    }
    finally {
      confirmLoading.value = false
    }
  }
  else {
    showConfirm.value = false
  }
}

const expandedFriends = ref<Set<string>>(new Set())
const filteredFriends = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  if (!keyword)
    return friends.value

  return friends.value.filter((friend: any) => {
    const name = String(friend?.name || '').toLowerCase()
    const gid = String(friend?.gid || '')
    const uin = String(friend?.uin || '')
    return name.includes(keyword) || gid.includes(keyword) || uin.includes(keyword)
  })
})

async function loadFriends() {
  if (currentAccountId.value) {
    const acc = currentAccount.value
    if (!acc)
      return

    if (!realtimeConnected.value) {
      await statusStore.fetchStatus(currentAccountId.value)
    }

    if (acc.running && status.value?.connection?.connected) {
      avatarErrorKeys.value.clear()
      friendStore.fetchFriends(currentAccountId.value)
      friendStore.fetchBlacklist(currentAccountId.value)
      friendStore.fetchInteractRecords(currentAccountId.value)
      // 加载蹲守列表
      loadStakeoutFriends()
    }
  }
}

useIntervalFn(() => {
  for (const gid in friendLands.value) {
    if (friendLands.value[gid]) {
      friendLands.value[gid] = friendLands.value[gid].map((l: any) =>
        l.matureInSec > 0 ? { ...l, matureInSec: l.matureInSec - 1 } : l,
      )
    }
  }
}, 1000)

onMounted(() => {
  loadFriends()
})

watch(currentAccountId, () => {
  expandedFriends.value.clear()
  loadFriends()
})

function toggleFriend(friendId: string) {
  if (expandedFriends.value.has(friendId)) {
    expandedFriends.value.delete(friendId)
  }
  else {
    expandedFriends.value.clear()
    expandedFriends.value.add(friendId)
    if (currentAccountId.value && currentAccount.value?.running && status.value?.connection?.connected) {
      friendStore.fetchFriendLands(currentAccountId.value, friendId)
    }
  }
}

async function handleOp(friendId: string, type: string, e: Event) {
  e.stopPropagation()
  if (!currentAccountId.value)
    return

  confirmAction('确定执行此操作吗?', async () => {
    await friendStore.operate(currentAccountId.value!, friendId, type)
  })
}

async function handleToggleBlacklist(friend: any, e: Event) {
  e.stopPropagation()
  if (!currentAccountId.value)
    return
  await friendStore.toggleBlacklist(currentAccountId.value, Number(friend.gid))
}

function isStakeoutFriend(gid: number) {
  return stakeoutFriendList.value.includes(gid)
}

async function handleToggleStakeout(friend: any, e: Event) {
  e.stopPropagation()
  if (!currentAccountId.value)
    return

  const gid = Number(friend.gid)
  const isCurrentlyStakeout = isStakeoutFriend(gid)

  try {
    if (isCurrentlyStakeout) {
      // 取消蹲守
      const { data } = await api.post('/api/stakeout/friends/remove', {
        friendGid: gid,
      }, {
        headers: { 'x-account-id': currentAccountId.value },
      })
      if (data?.ok) {
        stakeoutFriendList.value = stakeoutFriendList.value.filter(id => id !== gid)
        toast.success(`已将 ${friend.name} 移出蹲守列表`)
      }
    }
    else {
      // 添加蹲守
      const { data } = await api.post('/api/stakeout/friends/add', {
        friendGid: gid,
      }, {
        headers: { 'x-account-id': currentAccountId.value },
      })
      if (data?.ok) {
        stakeoutFriendList.value.push(gid)
        toast.success(`已将 ${friend.name} 加入蹲守列表`)
      }
    }
  }
  catch (e: any) {
    toast.error(e?.response?.data?.error || '操作失败')
  }
}

async function loadStakeoutFriends() {
  if (!currentAccountId.value)
    return
  try {
    const { data } = await api.get('/api/stakeout/friends', {
      headers: { 'x-account-id': currentAccountId.value },
    })
    if (data?.ok && data?.data) {
      stakeoutFriendList.value = data.data.friendList || []
    }
  }
  catch (e) {
    console.error('加载蹲守列表失败:', e)
  }
}

function getFriendStatusText(friend: any) {
  const p = friend.plant || {}
  const info = []
  if (p.stealNum)
    info.push(`偷${p.stealNum}`)
  if (p.dryNum)
    info.push(`水${p.dryNum}`)
  if (p.weedNum)
    info.push(`草${p.weedNum}`)
  if (p.insectNum)
    info.push(`虫${p.insectNum}`)
  return info.length ? info.join(' ') : '无操作'
}

function getFriendAvatar(friend: any) {
  const direct = String(friend?.avatarUrl || friend?.avatar_url || '').trim()
  if (direct)
    return direct
  const uin = String(friend?.uin || '').trim()
  if (uin)
    return `https://q1.qlogo.cn/g?b=qq&nk=${uin}&s=100`
  return ''
}

function getFriendAvatarKey(friend: any) {
  const key = String(friend?.gid || friend?.uin || '').trim()
  return key || String(friend?.name || '').trim()
}

function canShowFriendAvatar(friend: any) {
  const key = getFriendAvatarKey(friend)
  if (!key)
    return false
  return !!getFriendAvatar(friend) && !avatarErrorKeys.value.has(key)
}

function handleFriendAvatarError(friend: any) {
  const key = getFriendAvatarKey(friend)
  if (!key)
    return
  avatarErrorKeys.value.add(key)
}

function getFriendNameByGid(gid: number) {
  const friend = friends.value.find((f: any) => Number(f.gid) === gid)
  return friend?.name || `GID:${gid}`
}

async function handleRemoveFromBlacklist(gid: number) {
  if (!currentAccountId.value)
    return
  await friendStore.toggleBlacklist(currentAccountId.value, gid)
}

async function handleBatchOp(opType: 'help' | 'steal' | 'bad') {
  if (!currentAccountId.value || batchLoading.value)
    return

  const opNames: Record<string, string> = {
    help: '一键帮助',
    steal: '一键偷取',
    bad: '一键捣乱',
  }

  const action = async () => {
    batchLoading.value = true
    try {
      const res = await friendStore.batchOperate(currentAccountId.value!, opType)
      if (res.ok) {
        toast.success(`${opNames[opType]}完成`)
        await friendStore.fetchFriends(currentAccountId.value!)
      }
      else {
        toast.error(res.error || `${opNames[opType]}失败`)
      }
    }
    catch (e: any) {
      toast.error(e?.message || `${opNames[opType]}失败`)
    }
    finally {
      batchLoading.value = false
    }
  }

  confirmAction(`确定执行${opNames[opType]}吗？`, action)
}

const filteredInteractRecords = computed(() => {
  if (interactFilter.value === 'all')
    return interactRecords.value

  const actionTypeMap: Record<string, number> = {
    steal: 1,
    help: 2,
    bad: 3,
  }
  const targetActionType = actionTypeMap[interactFilter.value] || 0
  return interactRecords.value.filter((record: any) => Number(record?.actionType) === targetActionType)
})

const visibleInteractRecords = computed(() => filteredInteractRecords.value.slice(0, 30))

async function refreshInteractRecords() {
  if (!currentAccountId.value)
    return
  await friendStore.fetchInteractRecords(currentAccountId.value)
}

function getInteractAvatar(record: any) {
  return String(record?.avatarUrl || '').trim()
}

function getInteractAvatarKey(record: any) {
  const key = String(record?.visitorGid || record?.key || record?.nick || '').trim()
  return key ? `interact:${key}` : ''
}

function canShowInteractAvatar(record: any) {
  const key = getInteractAvatarKey(record)
  if (!key)
    return false
  return !!getInteractAvatar(record) && !avatarErrorKeys.value.has(key)
}

function handleInteractAvatarError(record: any) {
  const key = getInteractAvatarKey(record)
  if (!key)
    return
  avatarErrorKeys.value.add(key)
}

function getInteractBadgeClass(actionType: number) {
  if (Number(actionType) === 1)
    return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
  if (Number(actionType) === 2)
    return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
  if (Number(actionType) === 3)
    return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
  return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
}

function formatInteractTime(timestamp: number) {
  const ts = Number(timestamp) || 0
  if (!ts)
    return '--'

  const date = new Date(ts)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minute = 60 * 1000
  const hour = 60 * minute

  if (diff >= 0 && diff < minute)
    return '刚刚'
  if (diff >= minute && diff < hour)
    return `${Math.floor(diff / minute)} 分钟前`

  const sameDay = now.getFullYear() === date.getFullYear()
    && now.getMonth() === date.getMonth()
    && now.getDate() === date.getDate()

  if (sameDay) {
    return `今天 ${date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })}`
  }

  if (now.getFullYear() === date.getFullYear()) {
    return `${date.getMonth() + 1}-${date.getDate()} ${date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })}`
  }

  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}
</script>

<template>
  <div class="h-full flex flex-col p-4">
    <div class="mb-4 flex space-x-2">
      <button
        class="rounded-lg px-4 py-2 font-medium transition-colors"
        :class="activeSidebarTab === 'friends'
          ? 'bg-blue-500 text-white shadow-md'
          : 'bg-white text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'"
        @click="activeSidebarTab = 'friends'"
      >
        <div class="flex items-center space-x-2">
          <span class="h-6 w-6 flex items-center justify-center">👥</span>
          <span>好友列表</span>
        </div>
      </button>
      <button
        class="rounded-lg px-4 py-2 font-medium transition-colors"
        :class="activeSidebarTab === 'blacklist'
          ? 'bg-blue-500 text-white shadow-md'
          : 'bg-white text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'"
        @click="activeSidebarTab = 'blacklist'"
      >
        <div class="flex items-center space-x-2">
          <span class="h-6 w-6 flex items-center justify-center">🚫</span>
          <span>黑名单</span>
          <span v-if="blacklist.length" class="ml-1 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700 dark:bg-red-900/50 dark:text-red-300">
            {{ blacklist.length }}
          </span>
        </div>
      </button>
      <button
        class="rounded-lg px-4 py-2 font-medium transition-colors"
        :class="activeSidebarTab === 'visitors'
          ? 'bg-blue-500 text-white shadow-md'
          : 'bg-white text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'"
        @click="activeSidebarTab = 'visitors'"
      >
        <div class="flex items-center space-x-2">
          <span class="h-6 w-6 flex items-center justify-center">👁️</span>
          <span>最近访客</span>
          <span v-if="interactRecords.length" class="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
            {{ interactRecords.length }}
          </span>
        </div>
      </button>
    </div>

    <div class="flex-1 overflow-y-auto">
      <!-- 好友列表 -->
      <div v-if="activeSidebarTab === 'friends'">
        <div class="mb-6 flex items-center justify-between">
          <h3 class="text-xl text-gray-900 font-bold dark:text-white">
            好友列表
          </h3>
          <div class="flex items-center gap-3">
            <div class="relative">
              <div class="absolute left-3 top-1/2 text-gray-400 -translate-y-1/2 dark:text-gray-500">
                🔍
              </div>
              <input
                v-model="searchKeyword"
                type="text"
                placeholder="搜索好友..."
                class="w-full border border-gray-300 rounded-lg bg-white py-2 pl-10 pr-4 text-sm sm:w-64 dark:border-gray-600 focus:border-blue-500 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
            </div>
            <div v-if="friends.length" class="text-sm text-gray-500 dark:text-gray-400">
              共 {{ filteredFriends.length }}/{{ friends.length }} 名好友
            </div>
          </div>
        </div>

        <div v-if="status?.connection?.connected && currentAccountId" class="mb-6">
          <div class="flex flex-wrap gap-2 rounded-lg bg-white p-3 shadow dark:bg-gray-800">
            <span class="flex items-center text-sm text-gray-500 dark:text-gray-400">批量操作：</span>
            <button
              class="rounded bg-green-100 px-3 py-1.5 text-sm text-green-700 transition dark:bg-green-900/30 hover:bg-green-200 dark:text-green-400 disabled:opacity-50 dark:hover:bg-green-900/50"
              :disabled="batchLoading"
              @click="handleBatchOp('help')"
            >
              <div v-if="batchLoading" class="i-svg-spinners-90-ring-with-bg mr-1 inline-block align-text-bottom" />
              一键帮助
            </button>
            <button
              class="rounded bg-blue-100 px-3 py-1.5 text-sm text-blue-700 transition dark:bg-blue-900/30 hover:bg-blue-200 dark:text-blue-400 disabled:opacity-50 dark:hover:bg-blue-900/50"
              :disabled="batchLoading"
              @click="handleBatchOp('steal')"
            >
              <div v-if="batchLoading" class="i-svg-spinners-90-ring-with-bg mr-1 inline-block align-text-bottom" />
              一键偷取
            </button>
            <button
              class="rounded bg-red-100 px-3 py-1.5 text-sm text-red-700 transition dark:bg-red-900/30 hover:bg-red-200 dark:text-red-400 disabled:opacity-50 dark:hover:bg-red-900/50"
              :disabled="batchLoading"
              @click="handleBatchOp('bad')"
            >
              <div v-if="batchLoading" class="i-svg-spinners-90-ring-with-bg mr-1 inline-block align-text-bottom" />
              一键捣乱
            </button>
          </div>
        </div>

        <div v-if="loading || statusLoading" class="flex justify-center py-12">
          <div class="text-4xl text-blue-500">
            ⏳
          </div>
        </div>

        <div v-else-if="!currentAccountId" class="rounded-lg bg-white p-8 text-center text-gray-500 shadow dark:bg-gray-800">
          请选择账号后查看好友
        </div>

        <div v-else-if="!status?.connection?.connected" class="flex flex-col items-center justify-center gap-4 rounded-lg bg-white p-12 text-center text-gray-500 shadow dark:bg-gray-800">
          <div class="text-4xl text-gray-400">
            🔌
          </div>
          <div>
            <div class="text-lg text-gray-700 font-medium dark:text-gray-300">
              账号未登录
            </div>
            <div class="mt-1 text-sm text-gray-400">
              请先运行账号或检查网络连接
            </div>
          </div>
        </div>

        <div v-else-if="friends.length === 0" class="rounded-lg bg-white p-8 text-center text-gray-500 shadow dark:bg-gray-800">
          暂无好友或数据加载失败
        </div>

        <div v-else class="space-y-4">
          <div
            v-for="friend in filteredFriends"
            :key="friend.gid"
            class="overflow-hidden rounded-lg bg-white shadow dark:bg-gray-800"
          >
            <div
              class="flex flex-col cursor-pointer justify-between gap-4 p-4 transition sm:flex-row sm:items-center hover:bg-gray-50 dark:hover:bg-gray-700/50"
              :class="blacklist.includes(Number(friend.gid)) ? 'opacity-50' : ''"
              @click="toggleFriend(friend.gid)"
            >
              <div class="flex items-center gap-3">
                <div class="h-10 w-10 flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-200 ring-1 ring-gray-100 dark:bg-gray-600 dark:ring-gray-700">
                  <img
                    v-if="canShowFriendAvatar(friend)"
                    :src="getFriendAvatar(friend)"
                    class="h-full w-full object-cover"
                    loading="lazy"
                    @error="handleFriendAvatarError(friend)"
                  >
                  <div v-else class="text-gray-400">
                    👤
                  </div>
                </div>
                <div>
                  <div class="flex items-center gap-2 font-bold">
                    {{ friend.name }} ({{ friend.gid }})
                    <span v-if="blacklist.includes(Number(friend.gid))" class="rounded bg-gray-200 px-1.5 py-0.5 text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-400">已屏蔽</span>
                  </div>
                  <div class="text-sm" :class="getFriendStatusText(friend) !== '无操作' ? 'text-green-500 font-medium' : 'text-gray-400'">
                    {{ getFriendStatusText(friend) }}
                  </div>
                </div>
              </div>

              <div class="flex flex-wrap gap-2">
                <button
                  class="rounded bg-blue-100 px-3 py-2 text-sm text-blue-700 transition dark:bg-blue-900/30 hover:bg-blue-200 dark:text-blue-400 dark:hover:bg-blue-900/50"
                  @click="handleOp(friend.gid, 'steal', $event)"
                >
                  偷取
                </button>
                <button
                  class="rounded bg-cyan-100 px-3 py-2 text-sm text-cyan-700 transition dark:bg-cyan-900/30 hover:bg-cyan-200 dark:text-cyan-400 dark:hover:bg-cyan-900/50"
                  @click="handleOp(friend.gid, 'water', $event)"
                >
                  浇水
                </button>
                <button
                  class="rounded bg-green-100 px-3 py-2 text-sm text-green-700 transition dark:bg-green-900/30 hover:bg-green-200 dark:text-green-400 dark:hover:bg-green-900/50"
                  @click="handleOp(friend.gid, 'weed', $event)"
                >
                  除草
                </button>
                <button
                  class="rounded bg-orange-100 px-3 py-2 text-sm text-orange-700 transition dark:bg-orange-900/30 hover:bg-orange-200 dark:text-orange-400 dark:hover:bg-orange-900/50"
                  @click="handleOp(friend.gid, 'bug', $event)"
                >
                  除虫
                </button>
                <button
                  class="rounded bg-red-100 px-3 py-2 text-sm text-red-700 transition dark:bg-red-900/30 hover:bg-red-200 dark:text-red-400 dark:hover:bg-red-900/50"
                  @click="handleOp(friend.gid, 'bad', $event)"
                >
                  捣乱
                </button>
                <button
                  class="rounded bg-purple-100 px-3 py-2 text-sm text-purple-700 transition dark:bg-purple-900/30 hover:bg-purple-200 dark:text-purple-400 dark:hover:bg-purple-900/50"
                  @click="handleToggleStakeout(friend, $event)"
                >
                  {{ isStakeoutFriend(Number(friend.gid)) ? '取消蹲守' : '蹲守' }}
                </button>
                <button
                  class="rounded px-3 py-2 text-sm transition"
                  :class="blacklist.includes(Number(friend.gid))
                    ? 'bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-700/50 dark:text-gray-400 dark:hover:bg-gray-700'"
                  @click="handleToggleBlacklist(friend, $event)"
                >
                  {{ blacklist.includes(Number(friend.gid)) ? '移出黑名单' : '加入黑名单' }}
                </button>
              </div>
            </div>

            <div v-if="expandedFriends.has(friend.gid)" class="border-t bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/50">
              <div v-if="friendLandsLoading[friend.gid]" class="flex justify-center py-4">
                <div class="i-svg-spinners-90-ring-with-bg text-2xl text-blue-500" />
              </div>
              <div v-else-if="!friendLands[friend.gid] || friendLands[friend.gid]?.length === 0" class="py-4 text-center text-gray-500">
                无土地数据
              </div>
              <div v-else class="p-2">
                <LandGrid :lands="friendLands[friend.gid] || []" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 黑名单管理 -->
      <div v-if="activeSidebarTab === 'blacklist'">
        <div class="mb-6">
          <h3 class="text-xl text-gray-900 font-bold dark:text-white">
            好友黑名单
          </h3>
          <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
            加入黑名单的好友在自动偷菜和帮助时会被跳过。
          </p>
        </div>

        <div class="rounded-lg bg-white p-6 shadow dark:bg-gray-800">
          <div v-if="blacklist.length === 0" class="py-8 text-center text-gray-500 dark:text-gray-400">
            暂无黑名单好友
          </div>
          <div v-else class="space-y-4">
            <div
              v-for="gid in blacklist"
              :key="gid"
              class="flex flex-col cursor-pointer justify-between gap-4 border border-gray-100 rounded-lg p-4 transition sm:flex-row sm:items-center dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50"
            >
              <div class="flex items-center gap-3">
                <div class="h-10 w-10 flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-200 ring-1 ring-gray-100 dark:bg-gray-600 dark:ring-gray-700">
                  <img
                    v-if="canShowFriendAvatar(friends.find(f => Number(f.gid) === gid))"
                    :src="getFriendAvatar(friends.find(f => Number(f.gid) === gid))"
                    class="h-full w-full object-cover"
                    loading="lazy"
                    @error="handleFriendAvatarError(friends.find(f => Number(f.gid) === gid))"
                  >
                  <div v-else class="text-gray-400">
                    👤
                  </div>
                </div>
                <div>
                  <div class="flex items-center gap-2 font-bold">
                    {{ getFriendNameByGid(gid) }}
                    <span class="rounded bg-gray-200 px-1.5 py-0.5 text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-400">已屏蔽</span>
                  </div>
                  <div class="text-sm text-gray-400">
                    GID: {{ gid }}
                  </div>
                </div>
              </div>

              <button
                class="rounded bg-red-100 px-3 py-2 text-sm text-red-700 transition dark:bg-red-900/30 hover:bg-red-200 dark:text-red-400 dark:hover:bg-red-900/50"
                @click="handleRemoveFromBlacklist(gid)"
              >
                移出黑名单
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 最近访客 -->
      <div v-if="activeSidebarTab === 'visitors'">
        <div class="mb-6">
          <h3 class="text-xl text-gray-900 font-bold dark:text-white">
            最近访客
          </h3>
        </div>

        <div class="rounded-lg bg-white p-6 shadow dark:bg-gray-800">
          <div class="mb-4 flex flex-wrap items-center gap-2">
            <button
              v-for="item in interactFilters"
              :key="item.key"
              class="rounded-full px-3 py-1 text-xs transition"
              :class="interactFilter === item.key
                ? 'bg-amber-500 text-white'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'"
              @click="interactFilter = item.key"
            >
              {{ item.label }}
            </button>
            <button
              class="rounded bg-gray-100 px-3 py-1.5 text-xs text-gray-600 transition disabled:cursor-not-allowed dark:bg-gray-700 hover:bg-gray-200 dark:text-gray-300 disabled:opacity-60 dark:hover:bg-gray-600"
              :disabled="interactLoading"
              @click="refreshInteractRecords"
            >
              {{ interactLoading ? '刷新中...' : '刷新' }}
            </button>
          </div>

          <div v-if="interactLoading" class="flex justify-center py-6">
            <div class="i-svg-spinners-90-ring-with-bg text-2xl text-amber-500" />
          </div>
          <div v-else-if="!!interactError" class="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-300">
            {{ interactError }}
          </div>
          <div v-else-if="visibleInteractRecords.length === 0" class="py-8 text-center text-gray-500 dark:text-gray-400">
            暂无访客记录
          </div>
          <div v-else class="space-y-3">
            <div
              v-for="record in visibleInteractRecords"
              :key="record.key"
              class="flex items-start gap-3 rounded-lg bg-gray-50 p-3 dark:bg-gray-900/40"
            >
              <div class="h-10 w-10 flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-200 ring-1 ring-gray-100 dark:bg-gray-700 dark:ring-gray-600">
                <img
                  v-if="canShowInteractAvatar(record)"
                  :src="getInteractAvatar(record)"
                  class="h-full w-full object-cover"
                  loading="lazy"
                  @error="handleInteractAvatarError(record)"
                >
                <div v-else class="text-gray-400">
                  👤
                </div>
              </div>
              <div class="min-w-0 flex-1">
                <div class="mb-1 flex flex-wrap items-center gap-2">
                  <span class="max-w-full truncate text-sm text-gray-800 font-medium dark:text-gray-100">
                    {{ record.nick || `GID:${record.visitorGid}` }}
                  </span>
                  <span
                    class="rounded-full px-2 py-0.5 text-xs font-medium"
                    :class="getInteractBadgeClass(record.actionType)"
                  >
                    {{ record.actionLabel }}
                  </span>
                  <span v-if="record.level" class="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-300">
                    Lv.{{ record.level }}
                  </span>
                  <span v-if="record.visitorGid" class="text-xs text-gray-400">
                    GID {{ getDisplayGid(record.visitorGid) }}
                    <button
                      class="ml-1 cursor-pointer opacity-60 hover:opacity-100"
                      @click.stop="toggleGidVisibility(record.visitorGid)"
                    >
                      <span v-if="visibleGids.has(record.visitorGid)">👁️</span>
                      <span v-else>🙈</span>
                    </button>
                  </span>
                </div>
                <div class="text-sm text-gray-600 dark:text-gray-300">
                  {{ record.actionDetail || record.actionLabel }}
                </div>
              </div>
              <div class="shrink-0 text-right text-xs text-gray-400">
                {{ formatInteractTime(record.serverTimeMs) }}
              </div>
            </div>

            <div v-if="filteredInteractRecords.length > visibleInteractRecords.length" class="text-center text-xs text-gray-400">
              仅展示最近 {{ visibleInteractRecords.length }} 条
            </div>
          </div>
        </div>
      </div>
    </div>

    <ConfirmModal
      :show="showConfirm"
      :loading="confirmLoading"
      title="确认操作"
      :message="confirmMessage"
      @confirm="onConfirm"
      @cancel="!confirmLoading && (showConfirm = false)"
    />
  </div>
</template>
