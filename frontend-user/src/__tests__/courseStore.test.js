/**
 * 课程报名与学习进度模块单元测试
 *
 * 测试范围：
 * - 空记录与预置数据
 * - 名额计算（满员 / 本地报名占用名额）
 * - 报名成功与任务中心同步
 * - 名额已满、重复报名
 * - 支付失败、支付取消、中断后重试（不产生重复任务/错误进度）
 * - 并发请求去重
 * - 学习进度更新与持久化（损坏数据修复）
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { courseStore, parseLessons, calcProgress } from '../utils/courseStore'
import { taskStore } from '../utils/taskStore'

const COURSE_KEY = 'billiard_user_courses'
const TASK_KEY = 'billiard_user_tasks'

const sampleCourse = {
  id: 9,
  name: '测试课程',
  icon: '🎱',
  level: '入门',
  duration: '2周',
  lessons: '4课时',
  students: 10,
  capacity: 12,
  price: 399,
  originalPrice: 499,
  coach: '测试教练'
}

function clearStorage() {
  localStorage.removeItem(COURSE_KEY)
  localStorage.removeItem(TASK_KEY)
}

function courseTasks() {
  return taskStore.getAll().filter(t => t.type === 'course')
}

describe('Course Store', () => {
  beforeEach(() => {
    clearStorage()
    vi.useRealTimers()
    courseStore.setPaymentMode('success')
  })

  describe('工具函数', () => {
    it('parseLessons 解析课时字符串', () => {
      expect(parseLessons('8课时')).toBe(8)
      expect(parseLessons('12 课时')).toBe(12)
      expect(parseLessons(5)).toBe(5)
      expect(parseLessons('无')).toBe(0)
      expect(parseLessons(null)).toBe(0)
    })

    it('calcProgress 夹取到 0-100', () => {
      expect(calcProgress(2, 8)).toBe(25)
      expect(calcProgress(0, 8)).toBe(0)
      expect(calcProgress(8, 8)).toBe(100)
      expect(calcProgress(99, 8)).toBe(100)
      expect(calcProgress(-5, 8)).toBe(0)
      expect(calcProgress(2, 0)).toBe(0)
    })
  })

  describe('空记录与默认数据', () => {
    it('首次访问返回预置报名记录，且与任务中心课程任务一致', () => {
      const list = courseStore.getAll()
      expect(list.length).toBe(1)
      expect(list[0].courseId).toBe(1)
      expect(list[0].completedLessons).toBe(2)
      expect(list[0].progress).toBe(25)

      // 任务中心预置课程任务使用同一订单号
      const tasks = courseTasks()
      expect(tasks.some(t => t.extra.orderNo === 'CR20260001')).toBe(true)
      const task = tasks.find(t => t.extra.orderNo === 'CR20260001')
      expect(task.extra.completedLessons).toBe(2)
      expect(task.extra.progress).toBe(25)
      expect(task.status).toBe('ongoing')
    })

    it('损坏的 JSON 记录返回空列表，不抛出，不使用默认数据覆盖', () => {
      localStorage.setItem(COURSE_KEY, '{损坏的json')
      expect(() => courseStore.getAll()).not.toThrow()
      expect(courseStore.getAll()).toEqual([])
    })

    it('非数组记录返回空列表', () => {
      localStorage.setItem(COURSE_KEY, JSON.stringify({ foo: 1 }))
      expect(courseStore.getAll()).toEqual([])
    })

    it('逐条过滤损坏记录并修复非法进度', () => {
      localStorage.setItem(COURSE_KEY, JSON.stringify([
        { orderNo: 'A', courseId: 1, totalLessons: 8, completedLessons: 3 },
        null,
        { courseId: 'x' },
        { orderNo: 'B', courseId: 2, totalLessons: '坏', completedLessons: 999, price: 'abc' },
        { orderNo: 'A', courseId: 1, totalLessons: 8, completedLessons: 5 } // 重复订单号
      ]))
      const list = courseStore.getAll()
      expect(list.length).toBe(2)
      const a = list.find(r => r.orderNo === 'A')
      expect(a.completedLessons).toBe(3)
      const b = list.find(r => r.orderNo === 'B')
      expect(b.totalLessons).toBe(0)
      expect(b.completedLessons).toBe(0)
      expect(b.progress).toBe(0)
      expect(b.price).toBe(0)
    })

    it('同一课程多条记录只保留一条', () => {
      localStorage.setItem(COURSE_KEY, JSON.stringify([
        { orderNo: 'A', courseId: 1, totalLessons: 8, completedLessons: 1 },
        { orderNo: 'B', courseId: 1, totalLessons: 8, completedLessons: 2 }
      ]))
      expect(courseStore.getAll().filter(r => r.courseId === 1).length).toBe(1)
    })
  })

  describe('名额', () => {
    it('根据 students 与 capacity 计算剩余名额', () => {
      const quota = courseStore.getQuota(sampleCourse)
      expect(quota.capacity).toBe(12)
      expect(quota.enrolled).toBe(10)
      expect(quota.remaining).toBe(2)
      expect(quota.isFull).toBe(false)
    })

    it('名额已满', () => {
      const full = { ...sampleCourse, id: 10, students: 20, capacity: 20 }
      const quota = courseStore.getQuota(full)
      expect(quota.isFull).toBe(true)
      expect(quota.remaining).toBe(0)
    })

    it('预置的九球高级技巧课已满员', () => {
      expect(courseStore.getQuota({ id: 3, students: 45 }).isFull).toBe(true)
    })

    it('报名成功后占用一个名额', async () => {
      await courseStore.enroll(sampleCourse)
      const quota = courseStore.getQuota(sampleCourse)
      expect(quota.enrolled).toBe(11)
      expect(quota.remaining).toBe(1)
    })
  })

  describe('报名成功', () => {
    it('成功报名并持久化，记录与任务中心一致', async () => {
      const result = await courseStore.enroll(sampleCourse)
      expect(result.success).toBe(true)
      expect(result.duplicated).toBeFalsy()

      const record = result.data
      expect(record.orderNo).toMatch(/^CR\d+$/)
      expect(record.courseId).toBe(9)
      expect(record.courseName).toBe('测试课程')
      expect(record.price).toBe(399)
      expect(record.totalLessons).toBe(4)
      expect(record.completedLessons).toBe(0)
      expect(record.progress).toBe(0)
      expect(record.status).toBe('upcoming')
      expect(record.expireDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)

      // 持久化
      const stored = courseStore.getByCourseId(9)
      expect(stored.orderNo).toBe(record.orderNo)

      // 任务中心恰好一个对应任务
      const tasks = courseTasks().filter(t => t.extra.courseId === 9)
      expect(tasks.length).toBe(1)
      expect(tasks[0].extra.orderNo).toBe(record.orderNo)
      expect(tasks[0].status).toBe('upcoming')
      expect(tasks[0].amount).toBe(399)
    })
  })

  describe('重复报名', () => {
    it('重复报名返回已有记录，不产生重复订单与任务', async () => {
      const first = await courseStore.enroll(sampleCourse)
      const second = await courseStore.enroll(sampleCourse)

      expect(second.success).toBe(true)
      expect(second.duplicated).toBe(true)
      expect(second.data.orderNo).toBe(first.data.orderNo)

      expect(courseStore.getAll().filter(r => r.courseId === 9).length).toBe(1)
      expect(courseTasks().filter(t => t.extra.courseId === 9).length).toBe(1)
    })

    it('并发报名同一课程只产生一个订单和任务', async () => {
      const [r1, r2] = await Promise.all([
        courseStore.enroll(sampleCourse),
        courseStore.enroll(sampleCourse)
      ])
      expect(r1.success).toBe(true)
      expect(r2.success).toBe(true)
      expect(r1.data.orderNo).toBe(r2.data.orderNo)
      expect(courseStore.getAll().filter(r => r.courseId === 9).length).toBe(1)
      expect(courseTasks().filter(t => t.extra.courseId === 9).length).toBe(1)
    })
  })

  describe('名额已满', () => {
    it('满员课程报名失败，不产生记录与任务', async () => {
      const full = { ...sampleCourse, id: 11, students: 12, capacity: 12 }
      const result = await courseStore.enroll(full)
      expect(result.success).toBe(false)
      expect(result.code).toBe('full')
      expect(courseStore.getByCourseId(11)).toBeNull()
      expect(courseTasks().some(t => t.extra.courseId === 11)).toBe(false)
    })
  })

  describe('支付失败', () => {
    it('支付失败不产生订单、记录与任务，可重试成功', async () => {
      courseStore.setPaymentMode('fail')
      const failed = await courseStore.enroll(sampleCourse)
      expect(failed.success).toBe(false)
      expect(failed.code).toBe('payment_failed')
      expect(failed.error).toContain('支付失败')

      expect(courseStore.getByCourseId(9)).toBeNull()
      expect(courseTasks().some(t => t.extra.courseId === 9)).toBe(false)

      // 重试成功，且只有一个任务
      courseStore.setPaymentMode('success')
      const retry = await courseStore.enroll(sampleCourse)
      expect(retry.success).toBe(true)
      expect(courseTasks().filter(t => t.extra.courseId === 9).length).toBe(1)
    })
  })

  describe('支付取消', () => {
    it('支付处理中取消，不产生记录与任务，可重新报名', async () => {
      const pending = courseStore.enroll(sampleCourse)
      // 立即取消（模拟用户关闭弹窗）
      courseStore.cancelEnroll(9)
      const result = await pending

      expect(result.success).toBe(false)
      expect(result.code).toBe('cancelled')
      expect(courseStore.getByCourseId(9)).toBeNull()
      expect(courseTasks().some(t => t.extra.courseId === 9)).toBe(false)

      // 重新报名成功，只有一个任务
      const retry = await courseStore.enroll(sampleCourse)
      expect(retry.success).toBe(true)
      expect(courseTasks().filter(t => t.extra.courseId === 9).length).toBe(1)
    })

    it('取消不存在的报名返回 false', () => {
      expect(courseStore.cancelEnroll(999)).toBe(false)
    })
  })

  describe('学习进度', () => {
    async function enroll() {
      return (await courseStore.enroll(sampleCourse)).data
    }

    it('按顺序完成课时，进度与任务中心同步', async () => {
      await enroll()
      const updated = courseStore.toggleLesson(9, 0)
      expect(updated.completedLessons).toBe(1)
      expect(updated.progress).toBe(25)
      expect(updated.status).toBe('ongoing')

      const task = courseTasks().find(t => t.extra.courseId === 9)
      expect(task.extra.completedLessons).toBe(1)
      expect(task.extra.progress).toBe(25)
      expect(task.status).toBe('ongoing')
      expect(task.subtitle).toContain('1/4')
    })

    it('完成全部课时后状态为已完成', async () => {
      await enroll()
      courseStore.toggleLesson(9, 0)
      courseStore.toggleLesson(9, 1)
      courseStore.toggleLesson(9, 2)
      const done = courseStore.toggleLesson(9, 3)
      expect(done.completedLessons).toBe(4)
      expect(done.progress).toBe(100)
      expect(done.status).toBe('completed')

      const task = courseTasks().find(t => t.extra.courseId === 9)
      expect(task.status).toBe('completed')
    })

    it('回退最后一节课时', async () => {
      await enroll()
      courseStore.toggleLesson(9, 0) // 完成1节
      const back = courseStore.toggleLesson(9, 0) // 点击已完成的最后一节 -> 回退到0
      expect(back.completedLessons).toBe(0)
      expect(back.progress).toBe(0)
    })

    it('不能跳过课时学习，返回 null 且进度不变', async () => {
      await enroll()
      expect(courseStore.toggleLesson(9, 2)).toBeNull()
      expect(courseStore.getByCourseId(9).completedLessons).toBe(0)
    })

    it('未报名课程更新进度返回 null', () => {
      expect(courseStore.toggleLesson(123, 0)).toBeNull()
    })

    it('非法课时索引返回 null', async () => {
      await enroll()
      expect(courseStore.toggleLesson(9, -1)).toBeNull()
      expect(courseStore.toggleLesson(9, 10)).toBeNull()
    })

    it('离开后重新读取进度保持一致（持久化）', async () => {
      await enroll()
      courseStore.toggleLesson(9, 0)
      courseStore.toggleLesson(9, 1)
      // 模拟离开课程页再回来：重新从存储读取
      const again = courseStore.getByCourseId(9)
      expect(again.completedLessons).toBe(2)
      expect(again.progress).toBe(50)
    })
  })

  describe('同步与修复', () => {
    it('syncTasks 为已有报名补建缺失的课程任务，且不重复', () => {
      localStorage.setItem(COURSE_KEY, JSON.stringify([
        { orderNo: 'X1', courseId: 7, courseName: '缺失任务的课程', price: 100, lessons: '2课时', totalLessons: 2, completedLessons: 1, createTime: '2026-01-01 10:00' }
      ]))
      courseStore.syncTasks()
      const tasks = courseTasks().filter(t => t.extra.courseId === 7)
      expect(tasks.length).toBe(1)
      expect(tasks[0].extra.orderNo).toBe('X1')

      // 再次同步不重复
      courseStore.syncTasks()
      expect(courseTasks().filter(t => t.extra.courseId === 7).length).toBe(1)
    })

    it('syncTasks 清理同一课程的历史重复任务', () => {
      localStorage.setItem(COURSE_KEY, JSON.stringify([
        { orderNo: 'Y1', courseId: 8, courseName: '重复任务课程', price: 200, lessons: '3课时', totalLessons: 3, completedLessons: 0, createTime: '2026-01-01 10:00' }
      ]))
      // 写入两个指向同一课程的旧任务
      taskStore.add({ type: 'course', title: '重复任务课程', subtitle: '旧', amount: 200, status: 'upcoming', extra: { courseId: 8, orderNo: 'OLD1' } })
      taskStore.add({ type: 'course', title: '重复任务课程', subtitle: '旧', amount: 200, status: 'upcoming', extra: { courseId: 8, orderNo: 'OLD2' } })
      expect(courseTasks().filter(t => t.extra.courseId === 8).length).toBe(2)

      courseStore.syncTasks()
      expect(courseTasks().filter(t => t.extra.courseId === 8).length).toBe(1)
    })

    it('支付失败遗留的无报名课程任务会被清理', async () => {
      // 手工模拟一条孤儿课程任务（带 orderNo，但报名记录不存在）
      taskStore.add({ type: 'course', title: '孤儿', subtitle: 'x', amount: 1, status: 'upcoming', extra: { courseId: 99, orderNo: 'ORPHAN' } })
      expect(courseTasks().some(t => t.extra.orderNo === 'ORPHAN')).toBe(true)
      courseStore.syncTasks()
      expect(courseTasks().some(t => t.extra.orderNo === 'ORPHAN')).toBe(false)
    })
  })

  describe('任务存储损坏', () => {
    it('任务存储 JSON 损坏时报名仍可成功且不抛错', async () => {
      localStorage.setItem(TASK_KEY, '损坏的任务json')
      const result = await courseStore.enroll(sampleCourse)
      expect(result.success).toBe(true)
      // 同步后任务中心可用，且只有新课程任务 + 不重复
      expect(courseTasks().filter(t => t.extra.courseId === 9).length).toBe(1)
    })

    it('任务存储中的非法条目被过滤，不影响课程任务同步', async () => {
      localStorage.setItem(TASK_KEY, JSON.stringify([
        { id: 'OK1', type: 'booking', title: '正常预约', amount: 10, status: 'upcoming', extra: {} },
        { id: 'BAD1' },
        { id: 'BAD2', type: 'unknown', status: 'upcoming' },
        { id: 'OK1', type: 'booking', title: '重复id', amount: 10, status: 'upcoming', extra: {} }
      ]))
      const all = taskStore.getAll()
      expect(all.length).toBe(1)
      expect(all[0].id).toBe('OK1')

      const result = await courseStore.enroll(sampleCourse)
      expect(result.success).toBe(true)
      expect(courseTasks().filter(t => t.extra.courseId === 9).length).toBe(1)
    })
  })

  describe('非法课程', () => {
    it('课程信息异常时报名失败', async () => {
      const result = await courseStore.enroll(null)
      expect(result.success).toBe(false)
      expect(result.code).toBe('invalid_course')
    })
  })
})
