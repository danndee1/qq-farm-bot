<script setup lang="ts">
import type { UserCard } from '@/stores/user'
import { onMounted, ref } from 'vue'
import api from '@/api'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSwitch from '@/components/ui/BaseSwitch.vue'
import { useToastStore } from '@/stores/toast'
import { useUserStore } from '@/stores/user'

interface UserWithPassword {
  username: string
  password: string
  role: string
  card: UserCard | null
}

const userStore = useUserStore()
const toast = useToastStore()

const users = ref<UserWithPassword[]>([])
const loading = ref(false)
const showEditModal = ref(false)
const selectedUser = ref<UserWithPassword | null>(null)
const editExpiresAt = ref<number | null>(null)
const editQuota = ref<number>(3)
const editExpiresAtInput = ref<string>('')

const oauthConfig = ref({
  enabled: false,
  apiUrl: '',
  appId: '',
  appKey: '',
})
const oauthSaving = ref(false)
const oauthExpanded = ref(false)

const oauthUserDefault = ref({
  days: 30,
  quota: 0,
})
const cardRegisterDefault = ref({
  quota: 3,
})

function formatDateTimeLocal(timestamp: number | null): string {
  if (!timestamp)
    return ''
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

function parseDateTimeLocal(str: string): number | null {
  if (!str || !str.trim())
    return null
  const trimmed = str.trim()
  const date = new Date(trimmed)
  if (Number.isNaN(date.getTime()))
    return null
  return date.getTime()
}

function handleExpiresAtBlur() {
  const parsed = parseDateTimeLocal(editExpiresAtInput.value)
  if (parsed !== null) {
    editExpiresAt.value = parsed
  }
}

function handleExpiresAtInput(event: Event) {
  const target = event.target as HTMLInputElement
  editExpiresAtInput.value = target.value
}

async function fetchUsers() {
  loading.value = true
  try {
    const result = await userStore.getAllUsersWithPassword()
    if (result.ok) {
      users.value = result.data
    }
    else {
      toast.error(result.error || '获取用户列表失败')
    }
  }
  catch (e: any) {
    toast.error(e.message || '获取用户列表失败')
  }
  finally {
    loading.value = false
  }
}

async function toggleUserStatus(user: UserWithPassword) {
  try {
    const updates: Partial<UserCard> = { enabled: !user.card?.enabled }
    const result = await userStore.updateUser(user.username, updates)
    if (result.ok) {
      toast.success(user.card?.enabled ? '用户已封禁' : '用户已解封')
      await fetchUsers()
    }
    else {
      toast.error(result.error || '操作失败')
    }
  }
  catch (e: any) {
    toast.error(e.message || '操作失败')
  }
}

async function deleteUser(user: UserWithPassword) {
  if (!confirm(`确定要删除用户 ${user.username} 吗？此操作不可恢复！`))
    return

  try {
    const result = await userStore.deleteUser(user.username)
    if (result.ok) {
      toast.success('用户删除成功')
      await fetchUsers()
    }
    else {
      toast.error(result.error || '删除用户失败')
    }
  }
  catch (e: any) {
    toast.error(e.message || '删除用户失败')
  }
}

function openEditModal(user: UserWithPassword) {
  selectedUser.value = user
  editExpiresAt.value = user.card?.expiresAt || null
  editExpiresAtInput.value = formatDateTimeLocal(user.card?.expiresAt || null)
  editQuota.value = user.card?.quota || 3
  showEditModal.value = true
}

async function handleEdit() {
  if (!selectedUser.value)
    return

  try {
    const result = await userStore.updateUser(selectedUser.value.username, {
      expiresAt: editExpiresAt.value,
      quota: editQuota.value,
    })
    if (result.ok) {
      toast.success('修改成功')
      showEditModal.value = false
      await fetchUsers()
    }
    else {
      toast.error(result.error || '修改失败')
    }
  }
  catch (e: any) {
    toast.error(e.message || '修改失败')
  }
}

async function copyPassword(password: string) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(password)
      toast.success('密码已复制到剪贴板')
    }
    else {
      const textArea = document.createElement('textarea')
      textArea.value = password
      textArea.style.position = 'fixed'
      textArea.style.opacity = '0'
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      toast.success('密码已复制到剪贴板')
      document.body.removeChild(textArea)
    }
  }
  catch (e) {
    toast.error('复制失败，请手动复制')
    console.error('复制失败:', e)
  }
}

function formatDate(timestamp: number | null) {
  if (!timestamp)
    return '永久有效'
  return new Date(timestamp).toLocaleString('zh-CN')
}

function getQuotaLabel(quota: number | undefined) {
  if (quota === undefined || quota === null)
    return '3个'
  if (quota === -1)
    return '不限量'
  return `${quota}个`
}

function isExpired(card: UserCard | null) {
  if (!card?.expiresAt)
    return false
  return Date.now() > card.expiresAt
}

onMounted(() => {
  fetchUsers()
  loadOAuthConfig()
  loadOAuthUserDefault()
  loadCardRegisterDefault()
})

async function loadOAuthConfig() {
  try {
    const res = await api.get('/api/admin/oauth')
    if (res.data.ok) {
      oauthConfig.value = res.data.data
    }
  }
  catch {
    // ignore
  }
}

async function loadOAuthUserDefault() {
  try {
    const res = await api.get('/api/admin/oauth-user-default')
    if (res.data.ok) {
      oauthUserDefault.value = res.data.data
    }
  }
  catch {
    // ignore
  }
}

async function loadCardRegisterDefault() {
  try {
    const res = await api.get('/api/admin/card-register-default')
    if (res.data.ok) {
      cardRegisterDefault.value = res.data.data
    }
  }
  catch {
    // ignore
  }
}

async function handleSaveOAuth() {
  oauthSaving.value = true
  try {
    const res = await api.post('/api/admin/oauth', oauthConfig.value)
    if (res.data.ok) {
      toast.success('OAuth配置已保存')
    }
    else {
      toast.error(res.data.error || '保存失败')
    }
  }
  catch (e: any) {
    toast.error(e.message || '保存失败')
  }
  finally {
    oauthSaving.value = false
  }
}

async function handleSaveOAuthUserDefault() {
  try {
    const res = await api.post('/api/admin/oauth-user-default', oauthUserDefault.value)
    if (res.data.ok) {
      toast.success('QQ登录用户默认配置已保存')
    }
    else {
      toast.error(res.data.error || '保存失败')
    }
  }
  catch (e: any) {
    toast.error(e.message || '保存失败')
  }
}

async function handleSaveCardRegisterDefault() {
  try {
    const res = await api.post('/api/admin/card-register-default', cardRegisterDefault.value)
    if (res.data.ok) {
      toast.success('卡密注册默认配置已保存')
    }
    else {
      toast.error(res.data.error || '保存失败')
    }
  }
  catch (e: any) {
    toast.error(e.message || '保存失败')
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl text-gray-900 font-bold dark:text-white">
        用户管理
      </h1>
      <BaseButton variant="primary" @click="fetchUsers">
        刷新
      </BaseButton>
    </div>

    <!-- QQ聚合登录配置 -->
    <div class="rounded-lg bg-white shadow dark:bg-gray-800">
      <div
        class="cursor-pointer border-b border-gray-200 bg-gray-50 px-6 py-4 dark:border-gray-700 dark:bg-gray-800/50"
        @click="oauthExpanded = !oauthExpanded"
      >
        <h3 class="flex items-center justify-between text-lg text-gray-900 font-bold dark:text-gray-100">
          <div class="flex items-center gap-2">
            <div class="i-fas-plug" />
            QQ聚合登录配置
          </div>
          <div
            class="i-fas-chevron-down transition-transform duration-200"
            :class="oauthExpanded ? 'rotate-180' : ''"
          />
        </h3>
      </div>
      <div v-show="oauthExpanded" class="p-6">
        <div class="grid grid-cols-1 gap-4 lg:grid-cols-4 md:grid-cols-2">
          <div class="flex items-center">
            <BaseSwitch
              v-model="oauthConfig.enabled"
              label="启用QQ登录"
            />
          </div>
          <BaseInput
            v-model="oauthConfig.apiUrl"
            label="接口地址"
            type="text"
            placeholder="如 https://api.clogin.cc/"
          />
          <BaseInput
            v-model="oauthConfig.appId"
            label="App ID"
            type="text"
            placeholder="应用ID"
          />
          <BaseInput
            v-model="oauthConfig.appKey"
            label="App Key"
            type="password"
            placeholder="应用密钥"
          />
        </div>
        <div class="mt-3 flex items-center justify-between">
          <p class="text-xs text-gray-500 dark:text-gray-400">
            接口地址需要以 / 结尾，请前往 <a href="https://www.clogin.cc/" target="_blank" class="text-blue-500 hover:underline">clogin.cc</a> 获取配置
          </p>
          <BaseButton
            variant="primary"
            size="sm"
            :loading="oauthSaving"
            @click="handleSaveOAuth"
          >
            保存配置
          </BaseButton>
        </div>

        <!-- QQ登录用户默认配置 -->
        <div class="mt-6 border-t border-gray-200 pt-6 dark:border-gray-700">
          <h4 class="mb-4 text-base text-gray-800 font-semibold dark:text-gray-200">
            QQ登录用户默认配置
          </h4>
          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
            <BaseInput
              v-model.number="oauthUserDefault.days"
              label="默认天数"
              type="number"
              placeholder="30"
            />
            <BaseInput
              v-model.number="oauthUserDefault.quota"
              label="默认配额"
              type="number"
              placeholder="0"
            />
          </div>
          <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
            天数设为0表示永久有效，配额设为0表示不限制账号数量
          </p>
          <div class="mt-3 flex justify-end">
            <BaseButton
              variant="primary"
              size="sm"
              @click="handleSaveOAuthUserDefault"
            >
              保存QQ登录默认配置
            </BaseButton>
          </div>
        </div>

        <!-- 卡密注册默认配置 -->
        <div class="mt-6 border-t border-gray-200 pt-6 dark:border-gray-700">
          <h4 class="mb-4 text-base text-gray-800 font-semibold dark:text-gray-200">
            时间卡密注册默认配置
          </h4>
          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
            <BaseInput
              v-model.number="cardRegisterDefault.quota"
              label="默认配额"
              type="number"
              placeholder="3"
            />
          </div>
          <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
            使用时间卡密注册时，新用户的默认账号配额数量
          </p>
          <div class="mt-3 flex justify-end">
            <BaseButton
              variant="primary"
              size="sm"
              @click="handleSaveCardRegisterDefault"
            >
              保存卡密注册默认配置
            </BaseButton>
          </div>
        </div>
      </div>
    </div>

    <!-- 用户列表 -->
    <div class="overflow-hidden rounded-lg bg-white shadow dark:bg-gray-800">
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead class="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th class="px-6 py-3 text-left text-xs text-gray-500 font-medium tracking-wider uppercase dark:text-gray-300">
                用户名
              </th>
              <th class="px-6 py-3 text-left text-xs text-gray-500 font-medium tracking-wider uppercase dark:text-gray-300">
                密码
              </th>
              <th class="px-6 py-3 text-left text-xs text-gray-500 font-medium tracking-wider uppercase dark:text-gray-300">
                角色
              </th>
              <th class="px-6 py-3 text-left text-xs text-gray-500 font-medium tracking-wider uppercase dark:text-gray-300">
                过期时间
              </th>
              <th class="px-6 py-3 text-left text-xs text-gray-500 font-medium tracking-wider uppercase dark:text-gray-300">
                配额
              </th>
              <th class="px-6 py-3 text-left text-xs text-gray-500 font-medium tracking-wider uppercase dark:text-gray-300">
                状态
              </th>
              <th class="px-6 py-3 text-right text-xs text-gray-500 font-medium tracking-wider uppercase dark:text-gray-300">
                操作
              </th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200 dark:bg-gray-800 dark:divide-gray-700">
            <tr v-for="user in users" :key="user.username">
              <td class="whitespace-nowrap px-6 py-4 text-sm text-gray-900 font-medium dark:text-white">
                {{ user.username }}
              </td>
              <td class="whitespace-nowrap px-6 py-4 text-sm text-gray-900 dark:text-white">
                <div class="flex items-center space-x-2">
                  <span class="font-mono">{{ user.password }}</span>
                  <button
                    class="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-500"
                    @click="copyPassword(user.password)"
                  >
                    复制
                  </button>
                </div>
              </td>
              <td class="whitespace-nowrap px-6 py-4 text-sm text-gray-900 dark:text-white">
                <span
                  class="inline-flex rounded-full px-2 text-xs font-semibold leading-5"
                  :class="user.role === 'admin' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'"
                >
                  {{ user.role === 'admin' ? '管理员' : '用户' }}
                </span>
              </td>
              <td class="whitespace-nowrap px-6 py-4 text-sm" :class="isExpired(user.card) ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'">
                {{ formatDate(user.card?.expiresAt || null) }}
              </td>
              <td class="whitespace-nowrap px-6 py-4 text-sm text-gray-900 dark:text-white">
                <span
                  class="inline-flex rounded-full px-2 text-xs font-semibold leading-5"
                  :class="user.card?.quota === -1 ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'"
                >
                  {{ getQuotaLabel(user.card?.quota) }}
                </span>
              </td>
              <td class="whitespace-nowrap px-6 py-4">
                <span
                  v-if="user.card"
                  class="inline-flex rounded-full px-2 text-xs font-semibold leading-5"
                  :class="user.card.enabled === false ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' : (isExpired(user.card) ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200')"
                >
                  {{ user.card.enabled === false ? '封禁' : (isExpired(user.card) ? '已过期' : '正常') }}
                </span>
                <span v-else class="text-gray-500 dark:text-gray-400">-</span>
              </td>
              <td class="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                <button
                  v-if="user.role !== 'admin'"
                  class="mr-3 text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300"
                  @click="openEditModal(user)"
                >
                  编辑
                </button>
                <button
                  v-if="user.role !== 'admin' && user.card"
                  class="mr-3 text-yellow-600 dark:text-yellow-400 hover:text-yellow-900 dark:hover:text-yellow-300"
                  @click="toggleUserStatus(user)"
                >
                  {{ user.card.enabled === false ? '解封' : '封禁' }}
                </button>
                <button
                  v-if="user.role !== 'admin'"
                  class="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300"
                  @click="deleteUser(user)"
                >
                  删除
                </button>
              </td>
            </tr>
            <tr v-if="users.length === 0">
              <td colspan="7" class="px-6 py-4 text-center text-gray-500 dark:text-gray-400">
                暂无用户
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 编辑弹窗 -->
    <div
      v-if="showEditModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
      @click.self="showEditModal = false"
    >
      <div class="max-w-md w-full rounded-lg bg-white p-6 dark:bg-gray-800">
        <h2 class="mb-4 text-xl text-gray-900 font-bold dark:text-white">
          编辑用户
        </h2>
        <p class="mb-4 text-sm text-gray-600 dark:text-gray-400">
          用户：{{ selectedUser?.username }}
        </p>
        <div class="space-y-4">
          <div>
            <label class="mb-1 block text-sm text-gray-700 font-medium dark:text-gray-300">
              过期时间
            </label>
            <input
              :value="editExpiresAtInput"
              type="datetime-local"
              class="w-full border border-gray-300 rounded-lg bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              @input="handleExpiresAtInput"
              @blur="handleExpiresAtBlur"
            >
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              清空表示永久有效
            </p>
          </div>
          <div>
            <label class="mb-1 block text-sm text-gray-700 font-medium dark:text-gray-300">
              配额
            </label>
            <BaseInput
              v-model.number="editQuota"
              type="number"
              placeholder="配额"
            />
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              输入-1表示不限量，其他数字表示可添加的账号数量
            </p>
          </div>
        </div>
        <div class="mt-6 flex justify-end space-x-3">
          <BaseButton variant="secondary" @click="showEditModal = false">
            取消
          </BaseButton>
          <BaseButton variant="primary" @click="handleEdit">
            修改
          </BaseButton>
        </div>
      </div>
    </div>
  </div>
</template>
