/**
 * 任务中心存储管理
 * 统一管理预约、报名、订单等任务数据，使用 localStorage 持久化
 *
 * 设计要点：
 * - 读取时对每条记录做结构校验，损坏的记录会被丢弃或自愈，不影响其余数据展示
 * - 课程报名按 courseId 幂等：重复报名/重复支付不会产生重复任务或错误进度
 * - 课程进度以「已完成课时索引列表」为准，状态与百分比始终由课时数据推导
 */

import { getCourseById } from './coursesData'

const STORAGE_KEY = 'billiard_user_tasks'
const CORRUPT_BACKUP_KEY = 'billiard_user_tasks_corrupt_backup'
const logger = {
  info: (...args) => console.log('[taskStore]', ...args),
  warn: (...args) => console.warn('[taskStore]', ...args),
  error: (...args) => console.error('[taskStore]', ...args)
}

const taskTypeConfig = {
  booking: {
    name: '球桌预约',
    icon: '🎱',
    actions: {
      pending_payment: [
        { key: 'pay', label: '继续付款', type: 'primary', route: '/tables' },
        { key: 'cancel', label: '取消', type: 'danger' }
      ],
      upcoming: [
        { key: 'view', label: '查看详情', type: 'primary' },
        { key: 'rebook', label: '再次预约', type: 'default', route: '/tables' }
      ],
      ongoing: [
        { key: 'view', label: '查看详情', type: 'primary' }
      ],
      completed: [
        { key: 'view', label: '查看结果', type: 'default' },
        { key: 'rebook', label: '再次预约', type: 'primary', route: '/tables' }
      ]
    }
  },
  course: {
    name: '课程报名',
    icon: '📚',
    actions: {
      pending_payment: [
        { key: 'pay', label: '继续付款', type: 'primary', route: '/courses', pay: true },
        { key: 'cancel', label: '取消报名', type: 'danger' }
      ],
      upcoming: [
        { key: 'study', label: '开始学习', type: 'primary', route: '/courses', study: true }
      ],
      ongoing: [
        { key: 'study', label: '继续学习', type: 'primary', route: '/courses', study: true }
      ],
      completed: [
        { key: 'study', label: '查看课程', type: 'default', route: '/courses', study: true },
        { key: 'review', label: '评价', type: 'primary' }
      ]
    }
  },
  competition: {
    name: '赛事报名',
    icon: '🏆',
    actions: {
      pending_payment: [
        { key: 'pay', label: '继续付款', type: 'primary', route: '/competitions' },
        { key: 'cancel', label: '取消', type: 'danger' }
      ],
      upcoming: [
        { key: 'view', label: '查看赛程', type: 'primary', route: '/competitions' }
      ],
      ongoing: [
        { key: 'view', label: '观看直播', type: 'primary', route: '/competitions' }
      ],
      completed: [
        { key: 'view', label: '查看结果', type: 'default', route: '/competitions' }
      ]
    }
  },
  order: {
    name: '商城订单',
    icon: '🛒',
    actions: {
      pending_payment: [
        { key: 'pay', label: '继续付款', type: 'primary', route: '/shop' },
        { key: 'cancel', label: '取消', type: 'danger' }
      ],
      pending_shipment: [
        { key: 'view', label: '查看订单', type: 'primary', route: '/shop' },
        { key: 'remind', label: '提醒发货', type: 'default' }
      ],
      shipped: [
        { key: 'view', label: '查看物流', type: 'primary', route: '/shop' },
        { key: 'confirm', label: '确认收货', type: 'primary' }
      ],
      completed: [
        { key: 'view', label: '查看结果', type: 'default', route: '/shop' },
        { key: 'review', label: '评价', type: 'primary' },
        { key: 'rebuy', label: '再次购买', type: 'default', route: '/shop' }
      ]
    }
  }
}

const statusConfig = {
  pending_payment: { text: '待付款', type: 'warning' },
  upcoming: { text: '待开始', type: 'info' },
  ongoing: { text: '进行中', type: 'primary' },
  pending_shipment: { text: '待发货', type: 'warning' },
  shipped: { text: '已发货', type: 'info' },
  completed: { text: '已完成', type: 'success' },
  cancelled: { text: '已取消', type: 'success' }
}

const ACTIVE_COURSE_STATUSES = ['pending_payment', 'upcoming', 'ongoing', 'completed']

function getDefaultTasks() {
  const now = Date.now()
  return [
    {
      id: 'T' + now.toString() + '001',
      type: 'booking',
      title: '3号球桌 - 美式九球',
      subtitle: '2026-02-15 14:00 - 16:00',
      amount: 120,
      status: 'pending_payment',
      createdAt: formatDate(new Date(now - 86400000)),
      extra: { tableId: 3, date: '2026-02-15', time: '14:00 - 16:00' }
    },
    {
      id: 'T' + now.toString() + '002',
      type: 'course',
      title: '台球入门基础课',
      subtitle: '学习中 3/8 课时',
      amount: 599,
      status: 'ongoing',
      createdAt: formatDate(new Date(now - 259200000)),
      extra: {
        courseId: 1,
        orderNo: 'CR' + (now - 259200000).toString().slice(-8),
        coach: '张明',
        lessonCount: 8,
        completedLessons: [0, 1, 2]
      }
    },
    {
      id: 'T' + now.toString() + '003',
      type: 'competition',
      title: '周末九球挑战赛',
      subtitle: '比赛进行中',
      amount: 100,
      status: 'ongoing',
      createdAt: formatDate(new Date(now - 432000000)),
      extra: { competitionId: 2 }
    },
    {
      id: 'T' + now.toString() + '004',
      type: 'order',
      title: 'LP专业斯诺克球杆',
      subtitle: '待发货',
      amount: 2999,
      status: 'pending_shipment',
      createdAt: formatDate(new Date(now - 172800000)),
      extra: { orderNo: 'SP' + now.toString().slice(-8), productId: 1 }
    }
  ]
}

function formatDate(date) {
  const d = new Date(date)
  const pad = n => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function generateTaskId(existingIds) {
  let id
  do {
    id = 'T' + Date.now().toString() + Math.floor(Math.random() * 1000).toString().padStart(3, '0')
  } while (existingIds && existingIds.has(id))
  return id
}

/**
 * 校验并修复单个课程任务的学习记录
 * @returns {{task: Object|null, fixed: boolean}} task 为 null 表示记录无法修复，应丢弃
 */
function sanitizeCourseTask(task) {
  let fixed = false
  if (!task.extra || typeof task.extra !== 'object' || Array.isArray(task.extra)) {
    task.extra = {}
    fixed = true
  }
  const extra = task.extra

  if (extra.courseId == null || Number.isNaN(Number(extra.courseId))) {
    // 课程任务没有 courseId 将无法与课程对应，直接丢弃
    return { task: null, fixed: true }
  }
  extra.courseId = Number(extra.courseId)

  // 兼容旧版本记录：从课程目录迁移课时数、教练等字段
  const catalogCourse = getCourseById(extra.courseId)
  if (catalogCourse) {
    if (typeof extra.lessonCount !== 'number' || !Number.isFinite(extra.lessonCount) || extra.lessonCount < 0) {
      extra.lessonCount = catalogCourse.lessonCount
      fixed = true
    }
    if (!extra.coach) {
      extra.coach = catalogCourse.coach
      fixed = true
    }
  }

  if (typeof extra.lessonCount !== 'number' || !Number.isFinite(extra.lessonCount) || extra.lessonCount < 0) {
    extra.lessonCount = 0
    fixed = true
  } else if (!Number.isInteger(extra.lessonCount)) {
    extra.lessonCount = Math.floor(extra.lessonCount)
    fixed = true
  }

  let lessons = extra.completedLessons
  if (!Array.isArray(lessons)) {
    lessons = []
    fixed = true
  }
  // 去重、过滤非法/越界索引
  const validIndex = idx =>
    Number.isInteger(idx) && idx >= 0 && (extra.lessonCount === 0 || idx < extra.lessonCount)
  const cleaned = [...new Set(lessons.filter(validIndex))].sort((a, b) => a - b)
  if (cleaned.length !== lessons.length || cleaned.some((v, i) => v !== lessons[i])) {
    fixed = true
  }
  extra.completedLessons = cleaned

  // 待付款任务尚未支付，不允许携带学习进度
  if (task.status === 'pending_payment' && cleaned.length > 0) {
    extra.completedLessons = []
    fixed = true
  }

  // 状态与课时进度对齐（仅在已支付之后推导，避免错误进度）
  if (task.status !== 'pending_payment' && task.status !== 'cancelled') {
    const done = extra.completedLessons.length
    let reconciledStatus = task.status
    if (extra.lessonCount > 0 && done >= extra.lessonCount) {
      reconciledStatus = 'completed'
    } else if (done > 0) {
      reconciledStatus = 'ongoing'
    } else if (task.status === 'completed' || task.status === 'ongoing') {
      // 状态声称进行中/已完成，却没有任何有效课时记录，回退为待开始
      reconciledStatus = 'upcoming'
    }
    if (reconciledStatus !== task.status) {
      task.status = reconciledStatus
      fixed = true
    }
  }

  return { task, fixed }
}

/**
 * 校验任意任务记录
 */
function sanitizeTask(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  if (typeof raw.id !== 'string' || !raw.id) return null
  if (!taskTypeConfig[raw.type]) return null
  if (!statusConfig[raw.status]) return null
  if (typeof raw.title !== 'string') return null

  const task = { ...raw }
  if (typeof task.amount !== 'number' || !Number.isFinite(task.amount) || task.amount < 0) {
    task.amount = 0
  }
  if (typeof task.createdAt !== 'string' || !task.createdAt) {
    task.createdAt = formatDate(new Date())
  }
  if (typeof task.subtitle !== 'string') {
    task.subtitle = ''
  }

  if (task.type === 'course') {
    const result = sanitizeCourseTask(task)
    return result.task
  }
  return task
}

/**
 * 从 localStorage 读取任务
 * - 首次访问（无记录）：写入演示任务
 * - 空记录（[]）：返回空数组，不生成任何任务
 * - JSON 损坏：备份原始内容后返回空数组，避免错误数据扩散
 * - 单条记录损坏：丢弃/自愈该条，其余记录正常使用
 */
function loadTasks() {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === null) {
    const defaults = getDefaultTasks()
    saveTasks(defaults)
    return defaults
  }

  let parsed
  try {
    parsed = JSON.parse(stored)
  } catch (e) {
    logger.error('任务记录解析失败，已忽略损坏数据', e)
    try {
      localStorage.setItem(CORRUPT_BACKUP_KEY, stored)
      // 置为空记录而不是删除 key：删除后会被误判为「首次访问」而重新播种演示任务，
      // 造成损坏恢复后凭空出现默认数据
      saveTasks([])
    } catch (backupError) {
      logger.error('备份损坏记录失败', backupError)
    }
    return []
  }

  if (!Array.isArray(parsed)) {
    logger.error('任务记录格式非法（应为数组），已重置为空')
    saveTasks([])
    return []
  }

  const validTasks = []
  let hasFix = false
  for (const raw of parsed) {
    const sanitized = sanitizeTask(raw)
    if (sanitized) {
      validTasks.push(sanitized)
    } else {
      logger.warn('已丢弃一条无效任务记录', raw)
      hasFix = true
    }
  }

  // 去重：同 id 只保留第一条
  const seenIds = new Set()
  const deduped = []
  for (const t of validTasks) {
    if (seenIds.has(t.id)) {
      logger.warn('已丢弃一条重复任务记录', t.id)
      hasFix = true
      continue
    }
    seenIds.add(t.id)
    deduped.push(t)
  }

  if (hasFix) {
    // 自愈后回写，下次读取即干净数据
    saveTasks(deduped)
  }
  return deduped
}

function saveTasks(tasks) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks))
    return true
  } catch (e) {
    logger.error('保存任务失败', e)
    return false
  }
}

function courseProgress(extra) {
  const total = extra?.lessonCount || 0
  const done = Array.isArray(extra?.completedLessons) ? extra.completedLessons.length : 0
  const progress = total > 0 ? Math.round((done / total) * 100) : 0
  return { total, done, progress }
}

function enrichTask(task) {
  const typeInfo = taskTypeConfig[task.type]
  const statusInfo = statusConfig[task.status]
  const actions = typeInfo?.actions?.[task.status] || []

  const enriched = {
    ...task,
    typeName: typeInfo?.name || task.type,
    typeIcon: typeInfo?.icon || '📋',
    statusText: statusInfo?.text || task.status,
    statusType: statusInfo?.type || 'info',
    actions
  }

  if (task.type === 'course') {
    const { total, done, progress } = courseProgress(task.extra)
    enriched.lessonCount = total
    enriched.completedLessons = Array.isArray(task.extra?.completedLessons)
      ? [...task.extra.completedLessons]
      : []
    enriched.progress = progress
    enriched.doneLessons = done
    enriched.orderNo = task.extra?.orderNo || ''
    enriched.courseId = Number(task.extra?.courseId)
  }

  return enriched
}

export const taskStore = {
  getAll() {
    const tasks = loadTasks()
    return tasks.map(enrichTask).sort((a, b) =>
      new Date(b.createdAt) - new Date(a.createdAt)
    )
  },

  getByStatus(status) {
    const tasks = this.getAll()
    if (status === 'pending') {
      return tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled')
    }
    if (status === 'completed') {
      return tasks.filter(t => t.status === 'completed')
    }
    return tasks
  },

  getById(taskId) {
    const tasks = loadTasks()
    const task = tasks.find(t => t.id === taskId)
    return task ? enrichTask(task) : null
  },

  add(taskData) {
    const tasks = loadTasks()
    const newTask = {
      id: generateTaskId(new Set(tasks.map(t => t.id))),
      createdAt: formatDate(new Date()),
      ...taskData
    }
    tasks.unshift(newTask)
    const saved = saveTasks(tasks)
    if (!saved) return null
    logger.info('任务已添加', newTask)
    return enrichTask(newTask)
  },

  update(taskId, updates) {
    const tasks = loadTasks()
    const index = tasks.findIndex(t => t.id === taskId)
    if (index === -1) {
      logger.warn('任务不存在', taskId)
      return null
    }
    tasks[index] = { ...tasks[index], ...updates }
    if (!saveTasks(tasks)) return null
    logger.info('任务已更新', taskId, updates)
    return enrichTask(tasks[index])
  },

  updateStatus(taskId, newStatus) {
    const statusInfo = statusConfig[newStatus]
    if (!statusInfo) {
      logger.error('无效的状态', newStatus)
      return null
    }
    return this.update(taskId, { status: newStatus })
  },

  remove(taskId) {
    const tasks = loadTasks()
    const filtered = tasks.filter(t => t.id !== taskId)
    if (filtered.length === tasks.length) {
      logger.warn('任务不存在，无法删除', taskId)
      return false
    }
    const saved = saveTasks(filtered)
    if (!saved) return false
    logger.info('任务已删除', taskId)
    return true
  },

  // ==================== 课程报名相关 ====================

  /**
   * 查找某门课程的有效报名任务（待付款/待开始/进行中/已完成）
   * 取消的任务会被物理删除，因此同一课程至多存在一条记录
   */
  findCourseTask(courseId) {
    const id = Number(courseId)
    if (Number.isNaN(id)) return null
    const tasks = loadTasks()
    const task = tasks.find(
      t => t.type === 'course' && Number(t.extra?.courseId) === id
    )
    return task ? enrichTask(task) : null
  },

  /**
   * 当前用户对该课程已占用的名额数
   */
  countCourseSeats(courseId) {
    const id = Number(courseId)
    if (Number.isNaN(id)) return 0
    return loadTasks().filter(
      t => t.type === 'course' && Number(t.extra?.courseId) === id
    ).length
  },

  /**
   * 创建课程报名任务（待付款）。幂等：已存在记录时直接返回原记录，不会重复创建
   * @returns {{task: Object|null, created: boolean}}
   */
  addCoursePendingTask(course) {
    const existing = this.findCourseTask(course.id)
    if (existing) {
      logger.info('课程已存在报名记录，复用原任务', { courseId: course.id, taskId: existing.id })
      return { task: existing, created: false, duplicated: true }
    }
    const orderNo = 'CR' + Date.now().toString().slice(-8)
    const task = this.add({
      type: 'course',
      title: course.name,
      subtitle: '待付款，名额预留中',
      amount: course.price,
      status: 'pending_payment',
      extra: {
        courseId: course.id,
        orderNo,
        coach: course.coach,
        lessonCount: course.lessonCount,
        completedLessons: []
      }
    })
    if (!task) return { task: null, created: false }
    return { task, created: true }
  },

  /**
   * 支付成功：待付款 → 待开始。幂等：对非待付款任务不做任何修改
   */
  markCoursePaid(taskId) {
    const task = this.getById(taskId)
    if (!task || task.type !== 'course') return null
    if (task.status !== 'pending_payment') {
      logger.info('课程任务无需重复支付', { taskId, status: task.status })
      return task
    }
    return this.update(taskId, { status: 'upcoming', subtitle: '支付成功，等待开课' })
  },

  /**
   * 取消报名：仅允许删除待付款任务（已支付课程不走取消流程，避免错误释放名额）
   */
  cancelCourseTask(taskId) {
    const task = this.getById(taskId)
    if (!task || task.type !== 'course') return false
    if (task.status !== 'pending_payment') {
      logger.warn('仅待付款课程可以取消', { taskId, status: task.status })
      return false
    }
    return this.remove(taskId)
  },

  /**
   * 切换某节课的完成状态，返回更新后的任务；状态/进度由课时数据自动推导
   */
  toggleCourseLesson(taskId, lessonIndex) {
    const tasks = loadTasks()
    const index = tasks.findIndex(t => t.id === taskId)
    if (index === -1) return null
    const task = tasks[index]
    if (task.type !== 'course') return null

    const total = task.extra?.lessonCount || 0
    const idx = Number(lessonIndex)
    if (!Number.isInteger(idx) || idx < 0 || (total > 0 && idx >= total)) {
      logger.warn('课时索引越界', { taskId, idx, total })
      return null
    }
    if (task.status === 'pending_payment') {
      logger.warn('课程未支付，不能记录学习进度', taskId)
      return null
    }

    const completed = Array.isArray(task.extra.completedLessons)
      ? [...task.extra.completedLessons]
      : []
    const pos = completed.indexOf(idx)
    if (pos === -1) {
      completed.push(idx)
    } else {
      completed.splice(pos, 1)
    }
    completed.sort((a, b) => a - b)

    const done = completed.length
    let status = task.status
    if (total > 0 && done >= total) {
      status = 'completed'
    } else if (done > 0) {
      status = 'ongoing'
    } else {
      status = 'upcoming'
    }
    const subtitle =
      status === 'completed'
        ? `已完成全部 ${total} 课时`
        : done > 0
          ? `学习中 ${done}/${total} 课时`
          : '报名成功，等待开课'

    tasks[index] = {
      ...task,
      status,
      subtitle,
      extra: { ...task.extra, completedLessons: completed }
    }
    if (!saveTasks(tasks)) return null
    return enrichTask(tasks[index])
  },

  addBookingTask(table, bookingInfo) {
    return this.add({
      type: 'booking',
      title: `${table.name} - ${table.type}`,
      subtitle: `${bookingInfo.date} ${bookingInfo.time}`,
      amount: table.price * bookingInfo.duration,
      status: 'pending_payment',
      extra: {
        tableId: table.id,
        date: bookingInfo.date,
        time: bookingInfo.time,
        duration: bookingInfo.duration,
        orderNo: bookingInfo.orderNo
      }
    })
  },

  addCompetitionTask(competition, regInfo) {
    return this.add({
      type: 'competition',
      title: competition.name,
      subtitle: competition.status === 'upcoming' ? '等待比赛开始' : '比赛进行中',
      amount: competition.fee,
      status: competition.status === 'upcoming' ? 'upcoming' : 'ongoing',
      extra: {
        competitionId: competition.id,
        regNo: regInfo.regNo,
        playerNo: regInfo.playerNo,
        date: competition.date
      }
    })
  },

  addOrderTask(order) {
    return this.add({
      type: 'order',
      title: order.items.map(i => i.name).join('、'),
      subtitle: '已下单，待发货',
      amount: order.amount,
      status: 'pending_shipment',
      extra: {
        orderNo: order.orderNo,
        items: order.items,
        createTime: order.createTime
      }
    })
  },

  markAsPaid(taskId) {
    const task = this.getById(taskId)
    if (!task) return null
    if (task.status !== 'pending_payment') {
      // 幂等：已支付/已完成的任务重复调用时原样返回，不产生副作用
      logger.info('任务无需重复支付', { taskId, status: task.status })
      return task
    }

    let newStatus = 'upcoming'
    let newSubtitle = '支付成功'

    if (task.type === 'order') {
      newStatus = 'pending_shipment'
      newSubtitle = '支付成功，待发货'
    } else if (task.type === 'course') {
      newSubtitle = '支付成功，等待开课'
    } else if (task.type === 'booking') {
      newSubtitle = '支付成功，等待使用'
    }

    return this.update(taskId, { status: newStatus, subtitle: newSubtitle })
  },

  getPendingCount() {
    return this.getByStatus('pending').length
  },

  getCompletedCount() {
    return this.getByStatus('completed').length
  },

  clearAll() {
    saveTasks([])
    logger.info('所有任务已清除')
  }
}

export { ACTIVE_COURSE_STATUSES, CORRUPT_BACKUP_KEY, STORAGE_KEY }
export default taskStore
