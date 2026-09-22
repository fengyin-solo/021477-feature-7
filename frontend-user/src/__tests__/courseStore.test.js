/**
 * 课程报名领域服务测试
 *
 * 覆盖：
 * - 名额计算、名额已满拒绝报名
 * - 重复报名幂等、待付款订单继续支付（中断重试）
 * - 支付失败 / 支付取消不产生重复任务或错误进度
 * - 并发支付防重入
 * - 成功报名结果与任务中心、课程列表一致
 * - 学习进度切换与「我的课程」列表
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import courseStore, {
  PAY_RESULT,
  getEnrollmentMap,
  getMyCourses,
  getSeatsInfo
} from '../utils/courseStore'
import { taskStore, STORAGE_KEY } from '../utils/taskStore'
import COURSES, { getCourseById } from '../utils/coursesData'

// 选择一门未满课程与已满课程（course 1 基础报名 155/156，用户报名 1 次后满）
const OPEN_COURSE = () => getCourseById(2) // 89/120，名额充足
const NEAR_FULL_COURSE = () => getCourseById(1) // 155/156，仅剩 1 个名额

describe('courseStore 名额', () => {
  beforeEach(() => {
    localStorage.setItem(STORAGE_KEY, "[]")
    vi.useRealTimers()
  })

  it('名额信息基于课程目录基础人数与用户占用之和', () => {
    const info = getSeatsInfo(OPEN_COURSE())
    expect(info.capacity).toBe(120)
    expect(info.baseStudents).toBe(89)
    expect(info.taken).toBe(0)
    expect(info.remaining).toBe(31)
    expect(info.full).toBe(false)
  })

  it('课程名额剩 1 个时：报名成功后再次报名被拒绝，不产生重复任务', async () => {
    const course = NEAR_FULL_COURSE()
    expect(getSeatsInfo(course).remaining).toBe(1)

    const start = courseStore.startEnrollment(course)
    expect(start.ok).toBe(true)
    expect(getSeatsInfo(course).full).toBe(true)

    const again = courseStore.startEnrollment(course)
    expect(again.ok).toBe(false)
    expect(again.reason).toBe('duplicated')

    const paid = await courseStore.payEnrollment(course.id, PAY_RESULT.SUCCESS, { delayMs: 0 })
    expect(paid.ok).toBe(true)

    // 支付完成后仍不能再报名
    const afterPaid = courseStore.startEnrollment(course)
    expect(afterPaid.ok).toBe(false)
    expect(afterPaid.reason).toBe('duplicated')

    expect(taskStore.getAll().filter(t => t.type === 'course' && t.courseId === course.id)).toHaveLength(1)
  })

  it('基础人数已满的课程 startEnrollment 返回 full 且不创建任何任务', () => {
    // 构造一门基础报名已达容量、用户尚未报名的满额课程
    const template = NEAR_FULL_COURSE()
    const fullCourse = { ...template, students: template.capacity }
    expect(getSeatsInfo(fullCourse).full).toBe(true)
    const result = courseStore.startEnrollment(fullCourse)
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('full')
    expect(taskStore.getAll().filter(t => t.type === 'course')).toHaveLength(0)
  })
})

describe('courseStore 报名与支付', () => {
  beforeEach(() => {
    localStorage.setItem(STORAGE_KEY, "[]")
  })

  it('正常报名支付：任务状态、名额、成功结果彼此对应', async () => {
    const course = OPEN_COURSE()
    const start = courseStore.startEnrollment(course)
    expect(start.ok).toBe(true)
    expect(start.enrollment.status).toBe('pending_payment')
    expect(start.enrollment.amount).toBe(course.price)

    const result = await courseStore.payEnrollment(course.id, PAY_RESULT.SUCCESS, { delayMs: 0 })
    expect(result.ok).toBe(true)
    expect(result.enrollment.status).toBe('upcoming')
    expect(result.enrollment.orderNo).toMatch(/^CR\d+$/)

    // 任务中心可查到对应任务
    const inStore = taskStore.findCourseTask(course.id)
    expect(inStore.status).toBe('upcoming')
    expect(inStore.title).toBe(course.name)
    expect(inStore.amount).toBe(course.price)

    // 名额被占用
    expect(getSeatsInfo(course).taken).toBe(1)

    // 报名映射
    expect(getEnrollmentMap()[course.id].id).toBe(inStore.id)
  })

  it('重复报名返回已有记录，绝不产生第二条任务', async () => {
    const course = OPEN_COURSE()
    courseStore.startEnrollment(course)
    const dup = courseStore.startEnrollment(course)
    expect(dup.ok).toBe(false)
    expect(dup.reason).toBe('duplicated')
    expect(dup.enrollment.id).toBe(taskStore.findCourseTask(course.id).id)

    await courseStore.payEnrollment(course.id, PAY_RESULT.SUCCESS, { delayMs: 0 })
    const dup2 = courseStore.startEnrollment(course)
    expect(dup2.reason).toBe('duplicated')
    expect(dup2.status).toBe('upcoming')
    expect(taskStore.getAll().filter(t => t.type === 'course' && t.courseId === course.id)).toHaveLength(1)
  })

  it('支付失败：任务保持待付款，可中断重试成功，不重复建单', async () => {
    const course = OPEN_COURSE()
    const start = courseStore.startEnrollment(course)
    const taskId = start.enrollment.id

    const failed = await courseStore.payEnrollment(course.id, PAY_RESULT.FAIL, { delayMs: 0 })
    expect(failed.ok).toBe(false)
    expect(failed.reason).toBe('failed')
    expect(taskStore.getById(taskId).status).toBe('pending_payment')
    expect(getMyCourses()).toHaveLength(0) // 未支付不出现在我的课程

    // 中断后重试
    const retry = await courseStore.payEnrollment(taskId, PAY_RESULT.SUCCESS, { delayMs: 0 })
    expect(retry.ok).toBe(true)
    expect(retry.enrollment.id).toBe(taskId)
    expect(retry.enrollment.status).toBe('upcoming')
    expect(taskStore.getAll().filter(t => t.type === 'course' && t.courseId === course.id)).toHaveLength(1)
    expect(getMyCourses()).toHaveLength(1)
  })

  it('支付取消：任务保持待付款，无错误进度，可继续支付', async () => {
    const course = OPEN_COURSE()
    courseStore.startEnrollment(course)

    const cancelled = await courseStore.payEnrollment(course.id, PAY_RESULT.CANCEL, { delayMs: 0 })
    expect(cancelled.ok).toBe(false)
    expect(cancelled.reason).toBe('cancelled')

    const stillPending = taskStore.findCourseTask(course.id)
    expect(stillPending.status).toBe('pending_payment')
    expect(stillPending.doneLessons).toBe(0)

    const paid = await courseStore.payEnrollment(course.id, PAY_RESULT.SUCCESS, { delayMs: 0 })
    expect(paid.ok).toBe(true)
    expect(paid.enrollment.status).toBe('upcoming')
  })

  it('已支付任务再次支付为幂等成功，不改变进度', async () => {
    const course = OPEN_COURSE()
    courseStore.startEnrollment(course)
    await courseStore.payEnrollment(course.id, PAY_RESULT.SUCCESS, { delayMs: 0 })

    courseStore.toggleLesson(course.id, 0)
    const again = await courseStore.payEnrollment(course.id, PAY_RESULT.SUCCESS, { delayMs: 0 })
    expect(again.ok).toBe(true)
    expect(again.reason).toBe('already_paid')
    expect(again.enrollment.doneLessons).toBe(1)
  })

  it('并发支付同一课程：第二个请求被忽略，只有一次成功流转', async () => {
    const course = OPEN_COURSE()
    courseStore.startEnrollment(course)

    const [a, b] = await Promise.all([
      courseStore.payEnrollment(course.id, PAY_RESULT.SUCCESS, { delayMs: 0 }),
      courseStore.payEnrollment(course.id, PAY_RESULT.SUCCESS, { delayMs: 0 })
    ])
    const results = [a, b].map(r => r.ok || r.reason)
    expect(results).toContain(true)
    expect(results).toContain('in_flight')
    expect(taskStore.getAll().filter(t => t.type === 'course' && t.courseId === course.id)).toHaveLength(1)
    expect(taskStore.findCourseTask(course.id).status).toBe('upcoming')
  })

  it('取消待付款报名释放名额', async () => {
    const course = OPEN_COURSE()
    courseStore.startEnrollment(course)
    expect(getSeatsInfo(course).taken).toBe(1)
    expect(courseStore.cancelEnrollment(course.id).ok).toBe(true)
    expect(getSeatsInfo(course).taken).toBe(0)
    expect(courseStore.getEnrollment(course.id)).toBeNull()

    // 释放后可以重新报名
    const restart = courseStore.startEnrollment(course)
    expect(restart.ok).toBe(true)
  })

  it('对不存在的课程/任务操作安全返回失败', async () => {
    expect(courseStore.startEnrollment(999).ok).toBe(false)
    expect((await courseStore.payEnrollment(999)).ok).toBe(false)
    expect(courseStore.cancelEnrollment(999).ok).toBe(false)
    expect(courseStore.toggleLesson(999, 0)).toBeNull()
  })
})

describe('courseStore 学习进度与列表', () => {
  beforeEach(() => {
    localStorage.setItem(STORAGE_KEY, "[]")
  })

  it('我的课程只包含已支付课程，进度与课时对应', async () => {
    const course = OPEN_COURSE()
    courseStore.startEnrollment(course)
    // 未支付时列表为空
    expect(getMyCourses()).toHaveLength(0)

    await courseStore.payEnrollment(course.id, PAY_RESULT.SUCCESS, { delayMs: 0 })
    let list = getMyCourses()
    expect(list).toHaveLength(1)
    expect(list[0].courseName).toBe(course.name)
    expect(list[0].lessonCount).toBe(course.lessonCount)
    expect(list[0].progress).toBe(0)
    expect(list[0].status).toBe('upcoming')

    courseStore.toggleLesson(course.id, 0)
    courseStore.toggleLesson(course.id, 1)
    list = getMyCourses()
    expect(list[0].doneLessons).toBe(2)
    expect(list[0].status).toBe('ongoing')

    // 离开后重新进入（重新读取 localStorage）数据仍在
    const fresh = getMyCourses()[0]
    expect(fresh.doneLessons).toBe(2)
    expect(fresh.progress).toBe(Math.round((2 / course.lessonCount) * 100))
  })

  it('所有课程目录价格在报名前后保持不变', () => {
    const before = COURSES.map(c => ({ id: c.id, price: c.price, originalPrice: c.originalPrice }))
    courseStore.startEnrollment(OPEN_COURSE())
    const after = COURSES.map(c => ({ id: c.id, price: c.price, originalPrice: c.originalPrice }))
    expect(after).toEqual(before)
  })

  it('多门课程报名互不干扰', async () => {
    for (const c of [getCourseById(1), getCourseById(2), getCourseById(3)]) {
      courseStore.startEnrollment(c)
      await courseStore.payEnrollment(c.id, PAY_RESULT.SUCCESS, { delayMs: 0 })
    }
    expect(getMyCourses()).toHaveLength(3)
    courseStore.toggleLesson(2, 0)
    expect(courseStore.getEnrollment(2).doneLessons).toBe(1)
    expect(courseStore.getEnrollment(1).doneLessons).toBe(0)
    expect(courseStore.getEnrollment(3).doneLessons).toBe(0)
    expect(getSeatsInfo(getCourseById(1)).full).toBe(true)
  })

  it('存储被写坏后读取不抛错，课程列表可以安全重建', () => {
    localStorage.setItem(STORAGE_KEY, 'garbage{{{')
    expect(() => getEnrollmentMap()).not.toThrow()
    expect(() => getMyCourses()).not.toThrow()
    expect(() => getSeatsInfo(OPEN_COURSE())).not.toThrow()
    expect(getMyCourses()).toEqual([])
    // 损坏后仍可重新报名
    const start = courseStore.startEnrollment(OPEN_COURSE())
    expect(start.ok).toBe(true)
  })
})
