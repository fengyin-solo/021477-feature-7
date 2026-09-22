/**
 * 任务中心存储管理
 * 统一管理预约、报名、订单等任务数据，使用 localStorage 持久化
 */

const STORAGE_KEY = 'billiard_user_tasks'
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
        { key: 'pay', label: '继续付款', type: 'primary', route: '/courses' },
        { key: 'cancel', label: '取消', type: 'danger' }
      ],
      upcoming: [
        { key: 'view', label: '查看详情', type: 'primary', route: '/courses' }
      ],
      ongoing: [
        { key: 'view', label: '继续学习', type: 'primary', route: '/courses' }
      ],
      completed: [
        { key: 'view', label: '查看结果', type: 'default' },
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

function loadTasks() {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored == null) return getDefaultTasks()

  let parsed
  try {
    parsed = JSON.parse(stored)
  } catch (e) {
    // 存储损坏：不使用默认数据覆盖（避免重复任务），安全降级为空列表
    logger.error('任务数据解析失败，已忽略损坏数据', e)
    return []
  }

  if (!Array.isArray(parsed)) {
    logger.warn('任务数据结构异常，已重置为空列表')
    return []
  }

  // 逐条过滤修复：非法条目直接丢弃；同 id 去重，保证不会出现重复任务
  const seenIds = new Set()
  const result = []
  for (const item of parsed) {
    const task = sanitizeTask(item)
    if (!task || seenIds.has(task.id)) continue
    seenIds.add(task.id)
    result.push(task)
  }
  return result
}

/** 校验并规范化单条任务，非法记录返回 null（不影响其他任务与业务页面） */
function sanitizeTask(raw) {
  if (!raw || typeof raw !== 'object') return null
  if (typeof raw.id !== 'string' || !raw.id) return null
  if (!taskTypeConfig[raw.type]) return null
  if (!statusConfig[raw.status]) return null

  return {
    ...raw,
    title: typeof raw.title === 'string' ? raw.title : '',
    subtitle: typeof raw.subtitle === 'string' ? raw.subtitle : '',
    amount: Number.isFinite(Number(raw.amount)) ? Number(raw.amount) : 0,
    createdAt: typeof raw.createdAt === 'string' && raw.createdAt ? raw.createdAt : formatDate(new Date()),
    extra: raw.extra && typeof raw.extra === 'object' ? raw.extra : {}
  }
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

function getDefaultTasks() {
  return [
    {
      id: 'T' + Date.now().toString() + '001',
      type: 'booking',
      title: '3号球桌 - 美式九球',
      subtitle: '2026-02-15 14:00 - 16:00',
      amount: 120,
      status: 'pending_payment',
      createdAt: formatDate(new Date(Date.now() - 86400000)),
      extra: { tableId: 3, date: '2026-02-15', time: '14:00 - 16:00' }
    },
    {
      id: 'T' + Date.now().toString() + '002',
      type: 'course',
      title: '台球入门基础课',
      subtitle: '学习中 · 已完成 2/8 课时',
      amount: 599,
      status: 'ongoing',
      createdAt: formatDate(new Date(Date.now() - 259200000)),
      extra: { courseId: 1, orderNo: 'CR20260001', coach: '张明', lessons: '8课时', totalLessons: 8, completedLessons: 2, progress: 25 }
    },
    {
      id: 'T' + Date.now().toString() + '003',
      type: 'competition',
      title: '周末九球挑战赛',
      subtitle: '比赛进行中',
      amount: 100,
      status: 'ongoing',
      createdAt: formatDate(new Date(Date.now() - 432000000)),
      extra: { competitionId: 2 }
    },
    {
      id: 'T' + Date.now().toString() + '004',
      type: 'order',
      title: 'LP专业斯诺克球杆',
      subtitle: '待发货',
      amount: 2999,
      status: 'pending_shipment',
      createdAt: formatDate(new Date(Date.now() - 172800000)),
      extra: { orderNo: 'SP' + Date.now().toString().slice(-8), productId: 1 }
    }
  ]
}

function formatDate(date) {
  const d = new Date(date)
  const pad = n => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function generateTaskId() {
  return 'T' + Date.now().toString() + Math.floor(Math.random() * 1000).toString().padStart(3, '0')
}

function enrichTask(task) {
  const typeInfo = taskTypeConfig[task.type]
  const statusInfo = statusConfig[task.status]
  const actions = typeInfo?.actions?.[task.status] || []

  return {
    ...task,
    typeName: typeInfo?.name || task.type,
    typeIcon: typeInfo?.icon || '📋',
    statusText: statusInfo?.text || task.status,
    statusType: statusInfo?.type || 'info',
    actions: actions
  }
}

/** 课程任务副标题：与学习进度保持一致 */
function courseTaskSubtitle(completed, total) {
  if (!total || completed <= 0) return '报名成功，等待开课'
  if (completed >= total) return `已完成全部 ${total} 课时`
  return `学习中 · 已完成 ${completed}/${total} 课时`
}

/** 根据报名记录生成/更新课程任务字段（不创建新 id） */
function buildCourseTaskFields(enrollment) {
  const total = Number(enrollment.totalLessons) || 0
  const completed = Math.min(Math.max(0, Number(enrollment.completedLessons) || 0), total)
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0
  const status = !total || completed <= 0 ? 'upcoming' : completed >= total ? 'completed' : 'ongoing'

  return {
    type: 'course',
    title: enrollment.courseName,
    subtitle: courseTaskSubtitle(completed, total),
    amount: Number(enrollment.price) || 0,
    status,
    extra: {
      courseId: Number(enrollment.courseId),
      orderNo: enrollment.orderNo,
      coach: enrollment.coach,
      lessons: enrollment.lessons,
      totalLessons: total,
      completedLessons: completed,
      progress
    }
  }
}

/**
 * 在任务列表中幂等写入一条课程任务（按 courseId 匹配，其次 orderNo）
 * @returns {Array} 更新后的新列表，及匹配到的任务（通过返回值）
 */
function upsertCourseTaskInList(tasks, enrollment) {
  const fields = buildCourseTaskFields(enrollment)
  const courseId = fields.extra.courseId
  const index = tasks.findIndex(t =>
    t.type === 'course' &&
    (Number(t.extra?.courseId) === courseId ||
      (fields.extra.orderNo && t.extra?.orderNo === fields.extra.orderNo))
  )

  let task
  let list
  if (index === -1) {
    task = {
      id: generateTaskId(),
      createdAt: enrollment.createTime || formatDate(new Date()),
      ...fields
    }
    list = [task, ...tasks]
  } else {
    task = {
      ...tasks[index],
      ...fields,
      extra: { ...tasks[index].extra, ...fields.extra },
      createdAt: tasks[index].createdAt || enrollment.createTime || formatDate(new Date())
    }
    list = [...tasks]
    list[index] = task
  }
  return { list, task }
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
      id: generateTaskId(),
      createdAt: formatDate(new Date()),
      ...taskData
    }
    tasks.unshift(newTask)
    saveTasks(tasks)
    logger.info('任务已添加', newTask)
    return enrichTask(newTask)
  },

  /** 幂等写入课程任务（按 courseId 匹配，存在则更新） */
  upsertCourseTask(enrollment) {
    const safe = {
      courseId: enrollment.courseId,
      orderNo: enrollment.orderNo,
      courseName: enrollment.courseName,
      price: enrollment.price,
      coach: enrollment.coach,
      lessons: enrollment.lessons,
      totalLessons: enrollment.totalLessons,
      completedLessons: enrollment.completedLessons ?? 0,
      createTime: enrollment.createTime
    }
    const { list, task } = upsertCourseTaskInList(loadTasks(), safe)
    saveTasks(list)
    logger.info('课程任务已同步', { courseId: safe.courseId, orderNo: safe.orderNo })
    return task ? enrichTask(task) : null
  },

  update(taskId, updates) {
    const tasks = loadTasks()
    const index = tasks.findIndex(t => t.id === taskId)
    if (index === -1) {
      logger.warn('任务不存在', taskId)
      return null
    }
    tasks[index] = { ...tasks[index], ...updates }
    saveTasks(tasks)
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
    saveTasks(filtered)
    logger.info('任务已删除', taskId)
    return true
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

  addCourseTask(course, enrollInfo) {
    return this.upsertCourseTask({
      courseId: course.id,
      orderNo: enrollInfo?.orderNo,
      courseName: course.name,
      price: course.price,
      coach: course.coach,
      lessons: course.lessons,
      totalLessons: Number.parseInt(String(course.lessons || '').match(/\d+/)?.[0] || '0', 10),
      completedLessons: 0
    })
  },

  /**
   * 将课程报名记录与任务中心同步（幂等）
   *
   * 规则：
   * - 每条报名记录对应恰好一个课程任务，按 courseId 匹配（兼容旧数据无 orderNo 的情况）
   * - 已完成课时 / 进度 / 金额 / 副标题以报名记录为准
   * - 历史遗留的重复课程任务会被清理，支付失败/取消绝不会残留任务
   *
   * @param {Array} enrollments courseStore 中的全部报名记录
   * @returns {Array} 同步后的全部任务
   */
  syncCourseEnrollments(enrollments) {
    const list = Array.isArray(enrollments) ? enrollments : []
    const tasks = loadTasks()
    const courseIdSet = new Set(list.map(e => Number(e.courseId)))

    // 删除：没有对应报名记录的课程任务（含历史重复/脏任务）
    // 注意：报名成功后课程任务均带 orderNo；无 orderNo 的旧任务在有匹配报名时会被接管
    let remaining = tasks.filter(t => {
      if (t.type !== 'course') return true
      const cid = Number(t.extra?.courseId)
      if (!courseIdSet.has(cid)) {
        // 没有报名记录：若任务带 orderNo（由报名流程产生）则删除，未知来源任务保留
        return !t.extra?.orderNo
      }
      return true
    })

    // 按 courseId 合并：同课程只保留一个任务
    const keptCourseIds = new Set()
    remaining = remaining.filter(t => {
      if (t.type !== 'course') return true
      const cid = Number(t.extra?.courseId)
      if (keptCourseIds.has(cid)) return false
      keptCourseIds.add(cid)
      return true
    })

    // 逐条 upsert 报名记录对应的任务
    for (const enrollment of list) {
      remaining = upsertCourseTaskInList(remaining, enrollment).list
    }

    saveTasks(remaining)
    return remaining
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

export default taskStore
