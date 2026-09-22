/**
 * 课程页面组件冒烟测试
 *
 * 验证视图层与 courseStore / taskStore 的协作：
 * - 名额、满员状态在课程列表正确展示
 * - 报名成功后成功反馈、我的课程、任务中心数据对应
 * - 满员课程不可报名
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import Courses from '../views/Courses.vue'
import { courseStore } from '../utils/courseStore'
import { taskStore } from '../utils/taskStore'
import { authState } from '../utils/auth'

async function mountCourses(query = {}) {
  const wrapper = mount(Courses, {
    global: {
      mocks: {
        $router: { push: vi.fn() },
        $route: { query }
      }
    }
  })
  await flushPromises()
  return wrapper
}

describe('Courses View', () => {
  beforeEach(() => {
    localStorage.clear()
    courseStore.setPaymentMode('success')
    authState.isLoggedIn = true
    authState.token = 'test-token'
    authState.user = { id: 'U1', name: '张三' }
  })

  it('渲染课程卡片并展示名额与满员标识', async () => {
    const wrapper = await mountCourses()
    const html = wrapper.html()
    expect(html).toContain('台球入门基础课')
    expect(html).toContain('¥599')
    // 九球高级技巧课预置满员
    expect(html).toContain('名额已满')
  })

  it('预置学习进度在课程列表中可见', async () => {
    const wrapper = await mountCourses()
    wrapper.vm.refreshEnrollments()
    const html = wrapper.html()
    // 预置：台球入门基础课已完成 2/8 课时
    expect(html).toContain('继续学习')
    expect(html).toContain('2/8')
  })

  it('满员课程点击报名只提示，不产生记录与任务', async () => {
    const wrapper = await mountCourses()
    const beforeCount = taskStore.getAll().filter(t => t.type === 'course').length

    const vm = wrapper.vm
    const fullCourse = vm.courses.find(c => c.id === 3)
    vm.openEnrollModal(fullCourse)
    await flushPromises()

    expect(courseStore.hasEnrolled(3)).toBe(false)
    expect(taskStore.getAll().filter(t => t.type === 'course').length).toBe(beforeCount)
    expect(wrapper.vm.showEnrollModal).toBe(false)
  })

  it('报名成功后成功反馈数据与报名记录、任务中心一致', async () => {
    const wrapper = await mountCourses()
    const vm = wrapper.vm
    const course = vm.courses.find(c => c.id === 4) // 比赛心理训练，未满员

    // 打开报名弹窗并确认支付
    vm.openEnrollModal(course)
    expect(vm.showEnrollModal).toBe(true)
    await vm.confirmEnroll()
    await flushPromises()

    // 成功反馈弹窗
    expect(vm.showSuccessModal).toBe(true)
    const result = vm.enrollResult
    expect(result.courseId).toBe(4)
    expect(result.courseName).toBe('比赛心理训练')
    expect(result.price).toBe(999)
    expect(result.totalLessons).toBe(6)
    expect(result.completedLessons).toBe(0)
    expect(result.progress).toBe(0)

    // 报名记录
    const stored = courseStore.getByCourseId(4)
    expect(stored.orderNo).toBe(result.orderNo)

    // 任务中心唯一对应任务，数据一致
    const tasks = taskStore.getAll().filter(t => t.type === 'course' && t.extra.courseId === 4)
    expect(tasks.length).toBe(1)
    expect(tasks[0].extra.orderNo).toBe(result.orderNo)
    expect(tasks[0].amount).toBe(999)
    expect(tasks[0].status).toBe('upcoming')

    // 课程列表中出现继续学习入口
    expect(wrapper.html()).toContain('继续学习')
  })

  it('支付失败时不关闭报名弹窗，不产生记录与任务，重试可成功', async () => {
    const wrapper = await mountCourses()
    const vm = wrapper.vm
    const course = vm.courses.find(c => c.id === 4)

    vm.openEnrollModal(course)
    courseStore.setPaymentMode('fail')
    await vm.confirmEnroll()
    await flushPromises()

    expect(vm.showEnrollModal).toBe(true) // 保留弹窗便于重试
    expect(courseStore.getByCourseId(4)).toBeNull()
    expect(taskStore.getAll().some(t => t.type === 'course' && t.extra.courseId === 4)).toBe(false)

    courseStore.setPaymentMode('success')
    await vm.confirmEnroll()
    await flushPromises()

    expect(vm.showSuccessModal).toBe(true)
    expect(taskStore.getAll().filter(t => t.type === 'course' && t.extra.courseId === 4).length).toBe(1)
  })

  it('课时打卡后课程列表与任务中心进度同步', async () => {
    const wrapper = await mountCourses()
    const vm = wrapper.vm

    // 预置课程 1 已完成 2/8，继续完成第 3 节（index 2）
    const updated = courseStore.toggleLesson(1, 2)
    expect(updated.completedLessons).toBe(3)
    vm.refreshEnrollments()
    await flushPromises()

    const html = wrapper.html()
    expect(html).toContain('3/8')
    const task = taskStore.getAll().find(t => t.type === 'course' && t.extra.courseId === 1)
    expect(task.extra.completedLessons).toBe(3)
  })
})
