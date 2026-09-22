/**
 * 任务中心存储测试
 *
 * 覆盖：
 * - 空记录 / 损坏记录 / 单条非法记录的容错与自愈
 * - 课程报名幂等、支付幂等、取消守卫
 * - 课时进度推导、重复切换不累加
 * - 课程任务状态与进度对齐
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { taskStore, STORAGE_KEY, CORRUPT_BACKUP_KEY } from '../utils/taskStore'

const COURSE = {
  id: 101,
  name: '测试课程',
  coach: '陈教练',
  price: 399,
  lessonCount: 4
}

function seedTasks(tasks) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks))
}

describe('taskStore 数据容错', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('首次访问无记录时返回演示任务', () => {
    expect(taskStore.getAll().length).toBeGreaterThan(0)
    // 演示数据应被持久化，再次读取一致
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).length).toBe(taskStore.getAll().length)
  })

  it('空记录返回空列表，不生成默认任务', () => {
    seedTasks([])
    expect(taskStore.getAll()).toEqual([])
  })

  it('整个 JSON 损坏时返回空列表并备份原始内容', () => {
    localStorage.setItem(STORAGE_KEY, '{not-valid-json')
    expect(taskStore.getAll()).toEqual([])
    expect(localStorage.getItem(CORRUPT_BACKUP_KEY)).toBe('{not-valid-json')
  })

  it('存储内容不是数组时重置为空', () => {
    seedTasks({ foo: 'bar' })
    expect(taskStore.getAll()).toEqual([])
  })

  it('单条非法记录被丢弃，其余记录正常展示', () => {
    const good = {
      id: 'T-ok',
      type: 'booking',
      title: '正常预约',
      subtitle: '',
      amount: 80,
      status: 'upcoming',
      createdAt: '2026-03-01 10:00',
      extra: { tableId: 1 }
    }
    seedTasks([
      good,
      null,
      { id: 'bad-no-type', type: 'unknown', title: 'x', status: 'upcoming' },
      { id: 'bad-course', type: 'course', title: '无课程ID', status: 'upcoming', extra: {} },
      'string-record'
    ])
    const tasks = taskStore.getAll()
    expect(tasks).toHaveLength(1)
    expect(tasks[0].id).toBe('T-ok')
  })

  it('读取时对重复 id 去重', () => {
    seedTasks([
      { id: 'T-dup', type: 'booking', title: 'A', status: 'upcoming', amount: 1, createdAt: '2026-03-01 10:00' },
      { id: 'T-dup', type: 'booking', title: 'B', status: 'upcoming', amount: 2, createdAt: '2026-03-01 11:00' }
    ])
    expect(taskStore.getAll()).toHaveLength(1)
  })
})

describe('taskStore 课程学习记录损坏自愈', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('completedLessons 非数组时重置为空', () => {
    seedTasks([
      { id: 'T1', type: 'course', title: 'C', amount: 100, status: 'upcoming', createdAt: '2026-03-01 10:00',
        extra: { courseId: 1, lessonCount: 4, completedLessons: 'broken' } }
    ])
    const task = taskStore.findCourseTask(1)
    expect(task.completedLessons).toEqual([])
    expect(task.progress).toBe(0)
  })

  it('越界、重复、非整数课时索引被清理', () => {
    seedTasks([
      { id: 'T1', type: 'course', title: 'C', amount: 100, status: 'ongoing', createdAt: '2026-03-01 10:00',
        extra: { courseId: 1, lessonCount: 4, completedLessons: [0, 0, 1, 9, -2, 2.5] } }
    ])
    const task = taskStore.findCourseTask(1)
    expect(task.completedLessons).toEqual([0, 1])
    expect(task.progress).toBe(50)
  })

  it('声称已完成全部课时但记录为空时回退为待开始', () => {
    seedTasks([
      { id: 'T1', type: 'course', title: 'C', amount: 100, status: 'completed', createdAt: '2026-03-01 10:00',
        extra: { courseId: 1, lessonCount: 4, completedLessons: [] } }
    ])
    expect(taskStore.findCourseTask(1).status).toBe('upcoming')
  })

  it('所有课时完成时状态自动对齐为已完成', () => {
    seedTasks([
      { id: 'T1', type: 'course', title: 'C', amount: 100, status: 'ongoing', createdAt: '2026-03-01 10:00',
        extra: { courseId: 1, lessonCount: 3, completedLessons: [0, 1, 2] } }
    ])
    const task = taskStore.findCourseTask(1)
    expect(task.status).toBe('completed')
    expect(task.progress).toBe(100)
  })

  it('待付款任务携带的进度被清空', () => {
    seedTasks([
      { id: 'T1', type: 'course', title: 'C', amount: 100, status: 'pending_payment', createdAt: '2026-03-01 10:00',
        extra: { courseId: 1, lessonCount: 3, completedLessons: [0, 1] } }
    ])
    const task = taskStore.findCourseTask(1)
    expect(task.completedLessons).toEqual([])
    expect(task.status).toBe('pending_payment')
  })

  it('旧版本记录缺少课时字段时从课程目录迁移，不产生错误进度', () => {
    // 旧格式：只有 courseId/orderNo/coach/lessons(字符串)，没有 lessonCount/completedLessons
    seedTasks([
      { id: 'T-legacy', type: 'course', title: '台球入门基础课', subtitle: '报名成功，等待开课',
        amount: 599, status: 'upcoming', createdAt: '2026-02-01 10:00',
        extra: { courseId: 1, orderNo: 'CR123', coach: '张明', lessons: '8课时' } }
    ])
    const task = taskStore.findCourseTask(1)
    expect(task.lessonCount).toBe(8)
    expect(task.completedLessons).toEqual([])
    expect(task.doneLessons).toBe(0)
    expect(task.progress).toBe(0)
    expect(task.status).toBe('upcoming')
  })
})

describe('taskStore 课程报名幂等', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('重复创建报名只保留一条任务', () => {
    const first = taskStore.addCoursePendingTask(COURSE)
    const second = taskStore.addCoursePendingTask(COURSE)
    expect(first.created).toBe(true)
    expect(second.created).toBe(false)
    expect(second.task.id).toBe(first.task.id)
    expect(taskStore.countCourseSeats(COURSE.id)).toBe(1)
    expect(taskStore.getAll().filter(t => t.type === 'course' && t.courseId === COURSE.id)).toHaveLength(1)
  })

  it('支付成功后状态为待开始，重复支付不产生副作用', () => {
    const { task } = taskStore.addCoursePendingTask(COURSE)
    const paid = taskStore.markCoursePaid(task.id)
    expect(paid.status).toBe('upcoming')

    const paidAgain = taskStore.markCoursePaid(task.id)
    expect(paidAgain.id).toBe(paid.id)
    expect(paidAgain.status).toBe('upcoming')
    expect(taskStore.getAll().filter(t => t.type === 'course' && t.courseId === COURSE.id)).toHaveLength(1)
  })

  it('markAsPaid 对已支付任务幂等', () => {
    const { task } = taskStore.addCoursePendingTask(COURSE)
    taskStore.markCoursePaid(task.id)
    const result = taskStore.markAsPaid(task.id)
    expect(result.status).toBe('upcoming')
  })

  it('已支付课程不能取消，待付款课程取消后释放名额', () => {
    const { task } = taskStore.addCoursePendingTask(COURSE)
    expect(taskStore.cancelCourseTask(task.id)).toBe(true)
    expect(taskStore.findCourseTask(COURSE.id)).toBeNull()

    const { task: t2 } = taskStore.addCoursePendingTask(COURSE)
    taskStore.markCoursePaid(t2.id)
    expect(taskStore.cancelCourseTask(t2.id)).toBe(false)
    expect(taskStore.findCourseTask(COURSE.id)).not.toBeNull()
  })
})

describe('taskStore 课时进度', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('勾选课时推进进度，重复点击取消勾选，不累加', () => {
    const { task } = taskStore.addCoursePendingTask(COURSE)
    taskStore.markCoursePaid(task.id)

    let t = taskStore.toggleCourseLesson(task.id, 0)
    expect(t.doneLessons).toBe(1)
    expect(t.status).toBe('ongoing')
    expect(t.progress).toBe(25)

    t = taskStore.toggleCourseLesson(task.id, 0)
    expect(t.doneLessons).toBe(0)
    expect(t.status).toBe('upcoming')

    t = taskStore.toggleCourseLesson(task.id, 1)
    t = taskStore.toggleCourseLesson(task.id, 2)
    expect(t.doneLessons).toBe(2)
    expect(t.progress).toBe(50)
  })

  it('全部勾选后状态为已完成', () => {
    const { task } = taskStore.addCoursePendingTask(COURSE)
    taskStore.markCoursePaid(task.id)
    let t
    for (let i = 0; i < COURSE.lessonCount; i++) {
      t = taskStore.toggleCourseLesson(task.id, i)
    }
    expect(t.status).toBe('completed')
    expect(t.progress).toBe(100)
    // 取消一节课回到进行中
    t = taskStore.toggleCourseLesson(task.id, 3)
    expect(t.status).toBe('ongoing')
    expect(t.progress).toBe(75)
  })

  it('越界课时索引与待付款课程被拒绝', () => {
    const { task } = taskStore.addCoursePendingTask(COURSE)
    expect(taskStore.toggleCourseLesson(task.id, 0)).toBeNull()
    taskStore.markCoursePaid(task.id)
    expect(taskStore.toggleCourseLesson(task.id, 99)).toBeNull()
    expect(taskStore.toggleCourseLesson('not-exist', 0)).toBeNull()
  })

  it('进度持久化：重新读取后仍可继续查看', () => {
    const { task } = taskStore.addCoursePendingTask(COURSE)
    taskStore.markCoursePaid(task.id)
    taskStore.toggleCourseLesson(task.id, 0)
    taskStore.toggleCourseLesson(task.id, 1)

    const reloaded = taskStore.findCourseTask(COURSE.id)
    expect(reloaded.doneLessons).toBe(2)
    expect(reloaded.completedLessons).toEqual([0, 1])
    expect(reloaded.progress).toBe(50)
  })
})
