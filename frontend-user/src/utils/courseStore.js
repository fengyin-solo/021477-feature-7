/**
 * 课程报名与学习进度存储管理
 *
 * 作为课程报名数据的唯一可信来源（single source of truth）：
 * - 课程名额校验（满员不可报名）
 * - 幂等报名（同一课程重复报名不会产生重复订单/任务）
 * - 模拟支付（失败 / 取消 / 中断重试均不会产生错误数据）
 * - 学习进度（已完成课时）持久化，离开页面再回来可继续查看
 * - 记录损坏时自动过滤修复，不影响课程详情与价格展示
 *
 * 任务中心中的课程任务由本模块与 taskStore 同步，保证三处一致：
 * 课程列表 / 报名成功反馈 / 任务中心。
 *
 * 使用方式：
 * import { courseStore } from '@/utils/courseStore'
 * const res = await courseStore.enroll(course)
 */

import { taskStore } from './taskStore'

const STORAGE_KEY = 'billiard_user_courses'

/** 课程默认名额（未单独配置 capacity 时使用） */
export const DEFAULT_CAPACITY = 200

/** 各课程名额配置 */
const COURSE_CAPACITY = {
  1: 160,
  2: 100,
  3: 45, // 已满（与基础报名人数一致）
  4: 40
}

const logger = {
  info: (...args) => console.log('[courseStore]', ...args),
  warn: (...args) => console.warn('[courseStore]', ...args),
  error: (...args) => console.error('[courseStore]', ...args)
}

/**
 * 模拟支付结果控制（仅用于演示/测试异常分支）
 * - success：支付成功
 * - fail：支付失败（网关拒绝）
 */
let paymentMode = 'success'

/** 进行中的报名请求：courseId -> { reject }，用于取消支付 */
const pendingEnrollments = new Map()

// ==================== 工具函数 ====================

function toSafeInt(value, fallback = 0) {
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) ? n : fallback
}

/** 解析课时数量，如 "8课时" -> 8 */
export function parseLessons(lessons) {
  if (typeof lessons === 'number') return Math.max(0, lessons)
  if (typeof lessons === 'string') {
    const match = lessons.match(/\d+/)
    if (match) return Number.parseInt(match[0], 10)
  }
  return 0
}

/** 计算学习进度百分比（0-100，整数） */
export function calcProgress(completed, total) {
  if (!total || total <= 0) return 0
  const c = Math.min(Math.max(0, toSafeInt(completed)), total)
  return Math.round((c / total) * 100)
}

/** 根据完成课时计算任务状态：0 -> upcoming，未完成全部 -> ongoing，全部完成 -> completed */
export function courseStatus(completed, total) {
  if (!total || completed <= 0) return 'upcoming'
  if (completed >= total) return 'completed'
  return 'ongoing'
}

/** 课程任务副标题 */
export function courseSubtitle(completed, total) {
  if (!total || completed <= 0) return '报名成功，等待开课'
  if (completed >= total) return `已完成全部 ${total} 课时`
  return `学习中 · 已完成 ${completed}/${total} 课时`
}

function formatDate(date) {
  const d = new Date(date)
  const pad = n => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function generateOrderNo() {
  return 'CR' + Date.now().toString().slice(-8) + Math.floor(Math.random() * 100).toString().padStart(2, '0')
}

/**
 * 可中断的模拟网络延迟
 * 取消报名时通过控制器 reject（{ cancelled: true }），避免 Promise 悬挂
 */
function interruptibleDelay(ms, controller) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(), ms)
    controller.reject = err => {
      clearTimeout(timer)
      reject(err)
    }
  })
}

/** 报名流程中的业务错误 */
class EnrollError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

// ==================== 记录校验与修复 ====================

/**
 * 将任意来源的报名记录规范化为安全结构
 * 学习记录损坏（字段缺失/类型错误）时回退为安全默认值，不产生错误进度
 */
function sanitizeEnrollment(raw, fallbackCourse = null) {
  if (!raw || typeof raw !== 'object') return null

  const courseId = toSafeInt(raw.courseId, NaN)
  if (!Number.isFinite(courseId)) return null

  const orderNo = typeof raw.orderNo === 'string' && raw.orderNo ? raw.orderNo : 'CR' + courseId
  const total = Math.max(0, toSafeInt(raw.totalLessons, parseLessons(fallbackCourse?.lessons)))
  const completed = Math.min(Math.max(0, toSafeInt(raw.completedLessons, 0)), total)
  const progress = calcProgress(completed, total)
  const status = courseStatus(completed, total)

  return {
    orderNo,
    courseId,
    courseName: typeof raw.courseName === 'string' ? raw.courseName : fallbackCourse?.name || `课程${courseId}`,
    courseIcon: typeof raw.courseIcon === 'string' ? raw.courseIcon : fallbackCourse?.icon || '📚',
    coach: typeof raw.coach === 'string' ? raw.coach : fallbackCourse?.coach || '',
    lessons: typeof raw.lessons === 'string' && raw.lessons
      ? raw.lessons
      : (fallbackCourse?.lessons || (total ? `${total}课时` : '')),
    price: Number.isFinite(Number(raw.price)) ? Number(raw.price) : (fallbackCourse?.price ?? 0),
    expireDate: typeof raw.expireDate === 'string' && raw.expireDate ? raw.expireDate : '',
    createTime: typeof raw.createTime === 'string' && raw.createTime ? raw.createTime : formatDate(new Date()),
    totalLessons: total,
    completedLessons: completed,
    progress,
    status
  }
}

// ==================== 读写存储 ====================

function loadEnrollments() {
  const stored = localStorage.getItem(STORAGE_KEY)

  // 空记录：返回规范化后的预置示例数据（仅首次，不写入存储）
  if (stored == null) return getDefaultEnrollments().map(r => sanitizeEnrollment(r)).filter(Boolean)

  let parsed
  try {
    parsed = JSON.parse(stored)
  } catch (e) {
    // 学习记录损坏：不使用默认数据覆盖，安全降级为空列表
    logger.error('学习记录解析失败，已忽略损坏数据', e)
    return []
  }

  if (!Array.isArray(parsed)) {
    logger.warn('学习记录结构异常，已重置为空列表')
    return []
  }

  // 逐条过滤修复；同一 courseId 只保留最新一条，同一 orderNo 去重
  const byCourseId = new Map()
  const seenOrderNo = new Set()
  for (const item of parsed) {
    const record = sanitizeEnrollment(item)
    if (!record) continue
    if (seenOrderNo.has(record.orderNo)) continue
    seenOrderNo.add(record.orderNo)
    byCourseId.set(record.courseId, record)
  }

  return Array.from(byCourseId.values())
}

function saveEnrollments(records) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
    return true
  } catch (e) {
    logger.error('学习记录保存失败', e)
    return false
  }
}

/** 预置学习记录：与任务中心的预置课程任务保持一致（同一订单号） */
function getDefaultEnrollments() {
  return [
    {
      orderNo: 'CR20260001',
      courseId: 1,
      courseName: '台球入门基础课',
      courseIcon: '🎯',
      coach: '张明',
      lessons: '8课时',
      price: 599,
      expireDate: '',
      createTime: formatDate(new Date(Date.now() - 259200000)),
      totalLessons: 8,
      completedLessons: 2
    }
  ]
}

// ==================== 导出对象 ====================

export const courseStore = {
  STORAGE_KEY,

  /** 设置模拟支付结果（演示/测试用） */
  setPaymentMode(mode) {
    paymentMode = mode === 'fail' ? 'fail' : 'success'
  },

  /**
   * 获取全部报名记录（按报名时间倒序）
   * 每次调用都从持久化存储读取，离开课程页再回来进度依旧最新
   */
  getAll() {
    return loadEnrollments().sort((a, b) => (a.createTime < b.createTime ? 1 : -1))
  },

  getByCourseId(courseId) {
    return loadEnrollments().find(r => r.courseId === toSafeInt(courseId, -1)) || null
  },

  getByOrderNo(orderNo) {
    return loadEnrollments().find(r => r.orderNo === orderNo) || null
  },

  hasEnrolled(courseId) {
    return !!this.getByCourseId(courseId)
  },

  /**
   * 课程名额信息
   * @param {Object} course 课程（需含 id、students，可选 capacity）
   * @param {number} [localCountOverride] 本地报名数（传入时不再读取存储，便于响应式计算）
   * @returns {{capacity:number, enrolled:number, remaining:number, isFull:boolean}}
   */
  getQuota(course, localCountOverride) {
    const capacity = Math.max(0, toSafeInt(
      course?.capacity ?? COURSE_CAPACITY[toSafeInt(course?.id, NaN)] ?? DEFAULT_CAPACITY
    ))
    const baseStudents = Math.max(0, toSafeInt(course?.students))
    // 本地新增的报名（不在基础 students 中）计入占用名额
    const localCount = localCountOverride == null
      ? loadEnrollments().filter(r => r.courseId === toSafeInt(course?.id, -1)).length
      : Math.max(0, toSafeInt(localCountOverride))
    const enrolled = baseStudents + localCount
    const remaining = Math.max(0, capacity - enrolled)
    return { capacity, enrolled, remaining, isFull: remaining <= 0 }
  },

  /**
   * 报名课程（幂等）
   *
   * 保证：
   * - 名额已满 -> { success:false, code:'full' }，不产生订单/任务
   * - 重复报名 -> { success:true, duplicated:true }，复用已有订单/任务，不重复创建
   * - 支付失败 -> { success:false, code:'payment_failed' }，不产生订单/任务
   * - 支付取消 -> { success:false, code:'cancelled' }，不产生订单/任务
   * - 同一课程并发请求 -> 复用进行中的 Promise，不重复报名
   * - 中断后重试 -> 已有成功记录直接返回，未成功则重新走支付，绝不重复
   *
   * @returns {Promise<{success:boolean, data?:Object, code?:string, error?:string}>}
   */
  enroll(course) {
    const courseId = toSafeInt(course?.id, NaN)
    if (!Number.isFinite(courseId)) {
      return Promise.resolve({ success: false, code: 'invalid_course', error: '课程信息异常' })
    }

    // 幂等：已报名直接返回已有记录
    const existing = this.getByCourseId(courseId)
    if (existing) {
      return Promise.resolve({ success: true, data: existing, duplicated: true })
    }

    // 并发去重：同一课程已有进行中的报名请求，复用该请求
    const pending = pendingEnrollments.get(courseId)
    if (pending) return pending

    // 名额预校验（支付前）
    if (this.getQuota(course).isFull) {
      return Promise.resolve({ success: false, code: 'full', error: '该课程名额已满' })
    }

    const controller = { reject: null }
    const promise = this._runEnroll(course, courseId, controller).finally(() => {
      if (pendingEnrollments.get(courseId) === promise) pendingEnrollments.delete(courseId)
    })
    pendingEnrollments.set(courseId, promise)
    promise._controller = controller

    return promise
  },

  async _runEnroll(course, courseId, controller) {
    try {
      await interruptibleDelay(1200, controller)

      // 支付网关结果（支付失败：不落任何数据）
      if (paymentMode === 'fail') {
        throw new EnrollError('payment_failed', '支付失败，请检查支付方式后重试')
      }

      // 支付成功后二次校验（名额可能在支付期间被占满）
      const existingAfter = this.getByCourseId(courseId)
      if (existingAfter) {
        return { success: true, data: existingAfter, duplicated: true }
      }
      if (this.getQuota(course).isFull) {
        throw new EnrollError('full', '该课程名额已满')
      }

      const expireDate = new Date()
      expireDate.setMonth(expireDate.getMonth() + 6)

      const record = sanitizeEnrollment({
        orderNo: generateOrderNo(),
        courseId,
        courseName: course.name,
        courseIcon: course.icon,
        coach: course.coach,
        lessons: course.lessons,
        price: course.price,
        expireDate: expireDate.toISOString().split('T')[0],
        createTime: formatDate(new Date()),
        totalLessons: parseLessons(course.lessons),
        completedLessons: 0
      }, course)

      const records = loadEnrollments()
      // 最终幂等防线：写入前再确认一次
      if (records.some(r => r.courseId === courseId)) {
        return { success: true, data: this.getByCourseId(courseId), duplicated: true }
      }
      records.push(record)

      if (!saveEnrollments(records)) {
        throw new EnrollError('system_error', '报名信息保存失败，请稍后重试')
      }

      // 同步到任务中心（taskStore 内部按 courseId/orderNo 幂等，不会产生重复任务）
      taskStore.syncCourseEnrollments(records)

      logger.info('课程报名成功', { orderNo: record.orderNo, courseId })
      return { success: true, data: record }
    } catch (err) {
      if (err && err.cancelled) {
        logger.info('报名支付已取消', { courseId })
        return { success: false, code: 'cancelled', error: '支付已取消' }
      }
      const code = err?.code || 'system_error'
      logger.warn('课程报名失败', { courseId, code, message: err?.message })
      return {
        success: false,
        code,
        error: err?.message || (code === 'payment_failed' ? '支付失败，请稍后重试' : '报名失败，请稍后重试')
      }
    }
  },

  /** 取消进行中的支付（不产生订单与任务） */
  cancelEnroll(courseId) {
    const id = toSafeInt(courseId, NaN)
    if (!Number.isFinite(id)) return false
    const pending = pendingEnrollments.get(id)
    if (pending && pending._controller?.reject) {
      pending._controller.reject(Object.assign(new Error('cancelled'), { cancelled: true }))
      return true
    }
    return false
  },

  /**
   * 切换某节课的完成状态
   * 进度值由 completed/total 派生并夹取在 [0,100]，任何异常输入都不会产生错误进度
   * @returns {Object|null} 更新后的报名记录
   */
  toggleLesson(courseId, lessonIndex) {
    const id = toSafeInt(courseId, NaN)
    const index = toSafeInt(lessonIndex, -1)
    if (!Number.isFinite(id) || index < 0) return null

    const records = loadEnrollments()
    const record = records.find(r => r.courseId === id)
    if (!record || index >= record.totalLessons) return null

    const isDone = index < record.completedLessons
    // 顺序学习：只能回退已完成的最后一节（index === completed-1），
    // 不允许回退中间课时；未完成的只能点击当前待学习课时（index === completed）
    if (isDone && index !== record.completedLessons - 1) return null
    if (!isDone && index !== record.completedLessons) return null

    // 已完成的最后一节 -> 回退一节；否则顺序学习到该节
    record.completedLessons = isDone ? index : index + 1
    record.progress = calcProgress(record.completedLessons, record.totalLessons)
    record.status = courseStatus(record.completedLessons, record.totalLessons)

    if (!saveEnrollments(records)) return null

    taskStore.syncCourseEnrollments(records)
    return record
  },

  /**
   * 将本地报名记录与任务中心强制同步一次
   * 用于进入课程页时修复历史不一致（重复任务 / 缺失任务）
   */
  syncTasks() {
    taskStore.syncCourseEnrollments(loadEnrollments())
  }
}

export default courseStore
