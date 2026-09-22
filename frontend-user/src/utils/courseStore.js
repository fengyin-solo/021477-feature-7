/**
 * 课程报名领域服务
 *
 * 在 taskStore 之上编排「名额校验 → 创建待付款任务 → 模拟支付 → 更新状态」完整流程，
 * 供课程列表、报名弹窗、成功反馈与任务中心共用，保证四处数据互相对应。
 *
 * 保证：
 * - 名额已满：拒绝报名，不创建任何任务
 * - 重复报名：复用已有任务，不产生重复记录
 * - 支付失败 / 支付取消：任务保持待付款，可在任务中心或课程页继续付款（中断重试）
 * - 支付过程防重入：同一课程同一时刻只允许一个支付流程
 */

import { taskStore } from './taskStore'
import { getCourseById, COURSES } from './coursesData'

const logger = {
  info: (...args) => console.log('[courseStore]', ...args),
  warn: (...args) => console.warn('[courseStore]', ...args),
  error: (...args) => console.error('[courseStore]', ...args)
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))

/** 支付结果：success 成功；fail 失败（可重试）；cancel 用户取消 */
export const PAY_RESULT = {
  SUCCESS: 'success',
  FAIL: 'fail',
  CANCEL: 'cancel'
}

// 支付中的课程 ID，防止双击/并发造成重复支付
const payingCourseIds = new Set()

/**
 * 获取当前用户对课程的报名信息（无报名返回 null）
 */
export function getEnrollment(courseId) {
  return taskStore.findCourseTask(courseId)
}

/**
 * 所有课程的报名信息映射：{ [courseId]: enrollment }
 * 统一使用数字键，避免响应式代理对键名的转换导致取值失败
 */
export function getEnrollmentMap() {
  const map = {}
  for (const course of COURSES) {
    const enrollment = taskStore.findCourseTask(course.id)
    if (enrollment) map[Number(course.id)] = enrollment
  }
  return map
}

/**
 * 我的课程列表（已支付，即待开始/进行中/已完成；不含待付款）
 */
export function getMyCourses() {
  return taskStore
    .getAll()
    .filter(t => t.type === 'course' && t.status !== 'pending_payment')
    .map(t => {
      const course = getCourseById(t.courseId) || {}
      return {
        taskId: t.id,
        courseId: t.courseId,
        orderNo: t.orderNo,
        courseName: course.name || t.title,
        courseIcon: course.icon || '📚',
        coach: t.extra?.coach || course.coach || '',
        lessons: course.lessons || (t.lessonCount ? `${t.lessonCount}课时` : ''),
        lessonCount: t.lessonCount || course.lessonCount || 0,
        price: t.amount,
        progress: t.progress,
        doneLessons: t.doneLessons,
        status: t.status
      }
    })
}

/**
 * 课程剩余名额（基于「课程目录基础人数 + 当前用户占用名额」）
 */
export function getSeatsInfo(courseIdOrCourse) {
  const course =
    typeof courseIdOrCourse === 'object'
      ? courseIdOrCourse
      : getCourseById(courseIdOrCourse)
  if (!course) return { capacity: 0, baseStudents: 0, taken: 0, remaining: 0, full: true }

  const taken = taskStore.countCourseSeats(course.id)
  const baseStudents = course.students || 0
  const capacity = course.capacity || 0
  const enrolled = Math.min(baseStudents + taken, capacity)
  const remaining = Math.max(0, capacity - enrolled)
  return {
    capacity,
    baseStudents,
    taken,
    enrolled,
    remaining,
    full: remaining <= 0
  }
}

/**
 * 进入报名/支付流程：
 * - 名额已满：{ ok: false, reason: 'full' }
 * - 已有报名：{ ok: false, reason: 'duplicated', enrollment }
 * - 创建成功或已有待付款记录：返回待付款任务
 *
 * 该函数幂等，重复调用不会产生重复任务。
 */
export function startEnrollment(courseIdOrCourse) {
  const course =
    typeof courseIdOrCourse === 'object'
      ? courseIdOrCourse
      : getCourseById(courseIdOrCourse)
  if (!course) {
    return { ok: false, reason: 'not_found' }
  }

  const existing = taskStore.findCourseTask(course.id)
  if (existing) {
    return { ok: false, reason: 'duplicated', enrollment: existing, status: existing.status }
  }

  const seats = getSeatsInfo(course)
  if (seats.full) {
    logger.warn('课程名额已满，拒绝报名', { courseId: course.id })
    return { ok: false, reason: 'full' }
  }

  const { task } = taskStore.addCoursePendingTask(course)
  if (!task) {
    return { ok: false, reason: 'storage_error' }
  }
  return { ok: true, enrollment: task, created: true }
}

/**
 * 模拟支付网关
 * @param {Object} enrollment 待付款报名任务
 * @param {string} outcome SUCCESS/FAIL/CANCEL，不传时以固定概率随机
 * @param {Object} [options]
 * @param {number} [options.delayMs] 自定义支付延迟（测试用）
 */
export async function mockPay(enrollment, outcome, options = {}) {
  await delay(options.delayMs != null ? options.delayMs : 1200 + Math.random() * 600)
  if (outcome === PAY_RESULT.CANCEL || outcome === PAY_RESULT.FAIL) {
    return outcome
  }
  if (outcome === PAY_RESULT.SUCCESS) return PAY_RESULT.SUCCESS
  // 默认 85% 成功；失败与取消由界面上的演示入口显式触发
  return Math.random() < 0.85 ? PAY_RESULT.SUCCESS : PAY_RESULT.FAIL
}

/**
 * 完成支付流程（支持从中断中重试）
 *
 * @param {Object|number} courseOrId 课程对象/课程ID/任务ID（字符串以 T 开头时视为任务ID）
 * @param {string} outcome 支付结果，用于模拟失败/取消
 * @param {Object} [options] 透传给支付网关（如 delayMs 测试加速）
 * @returns {{ok: boolean, reason?: string, enrollment?: Object}}
 */
export async function payEnrollment(courseOrId, outcome, options) {
  let enrollment = null
  if (typeof courseOrId === 'object' && courseOrId !== null) {
    enrollment = taskStore.findCourseTask(courseOrId.id)
  } else if (typeof courseOrId === 'string' && courseOrId.startsWith('T')) {
    const task = taskStore.getById(courseOrId)
    enrollment = task && task.type === 'course' ? task : null
  } else {
    enrollment = taskStore.findCourseTask(courseOrId)
  }

  if (!enrollment) {
    return { ok: false, reason: 'not_found' }
  }
  if (enrollment.status !== 'pending_payment') {
    // 已支付成功：重复支付直接幂等返回，不重复修改进度
    return { ok: true, reason: 'already_paid', enrollment }
  }

  const courseId = enrollment.courseId
  if (payingCourseIds.has(courseId)) {
    logger.warn('该课程正在支付中，忽略重复请求', { courseId })
    return { ok: false, reason: 'in_flight' }
  }

  payingCourseIds.add(courseId)
  try {
    // 支付前二次确认名额（极端情况下名额被占满时，待付款预留仍然有效，不做拒绝）
    const result = await mockPay(enrollment, outcome, options)

    if (result === PAY_RESULT.CANCEL) {
      // 用户取消支付：保留待付款任务，回到报名前的可重试状态，不产生错误进度
      return { ok: false, reason: 'cancelled', enrollment }
    }

    if (result === PAY_RESULT.FAIL) {
      // 支付失败：任务保持待付款，可继续付款
      return { ok: false, reason: 'failed', enrollment }
    }

    const updated = taskStore.markCoursePaid(enrollment.id)
    if (!updated) {
      return { ok: false, reason: 'storage_error' }
    }
    logger.info('课程支付成功', { taskId: updated.id, courseId })
    return { ok: true, enrollment: updated }
  } catch (e) {
    logger.error('支付流程异常，任务保持待付款', e)
    return { ok: false, reason: 'failed', enrollment }
  } finally {
    payingCourseIds.delete(courseId)
  }
}

/**
 * 取消报名（仅待付款可取消，释放名额）
 */
export function cancelEnrollment(courseId) {
  const enrollment = taskStore.findCourseTask(courseId)
  if (!enrollment) return { ok: false, reason: 'not_found' }
  const ok = taskStore.cancelCourseTask(enrollment.id)
  return ok ? { ok: true } : { ok: false, reason: 'invalid_status' }
}

/**
 * 切换课时完成状态（重复点击同一课时会取消勾选，不会重复累加进度）
 */
export function toggleLesson(courseId, lessonIndex) {
  const enrollment = taskStore.findCourseTask(courseId)
  if (!enrollment) return null
  return taskStore.toggleCourseLesson(enrollment.id, lessonIndex)
}

export default {
  PAY_RESULT,
  getEnrollment,
  getEnrollmentMap,
  getMyCourses,
  getSeatsInfo,
  startEnrollment,
  payEnrollment,
  cancelEnrollment,
  toggleLesson
}
