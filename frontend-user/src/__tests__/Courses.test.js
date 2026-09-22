/**
 * 课程页（Courses.vue）端到端交互测试
 *
 * 覆盖用户可见链路：
 * - 课程卡片展示名额（含已满课程禁用报名，价格不受影响）
 * - 报名 → 支付成功 → 成功反馈（订单号/课时/金额与任务中心一致）
 * - 学习课时勾选，离开页面重挂载后进度仍在
 * - 重复点击立即报名不会产生重复任务
 * - 模拟支付失败 / 支付取消后继续付款可成功，且只有一条任务
 * - 带 courseId 进入时自动打开对应弹窗
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import Courses from '../views/Courses.vue'
import { taskStore, STORAGE_KEY } from '../utils/taskStore'
import COURSES from '../utils/coursesData'

vi.mock('../utils/auth', () => ({
  isAuthenticated: () => true
}))

const OPEN_COURSE = COURSES[1] // 斯诺克进阶训练，名额充足
const FULL_COURSE = COURSES[3] // 比赛心理训练，40/40 已满

function mountPage(query = {}) {
  return mount(Courses, {
    global: {
      mocks: {
        $route: { query },
        $router: { push: vi.fn() }
      },
      stubs: {
        // Teleport 内容测试不稳定，登录流不在本文件范围
        LoginModal: { template: '<div class="login-stub" />' }
      }
    }
  })
}

// 每个用例后清理 Teleport 到 body 的弹窗残留
afterEach(() => {
  document.body.innerHTML = ''
})

function visibleOverlays() {
  // jsdom 无布局，不能使用 offsetParent 判断；
  // Vue <Transition> 离场后的残留节点带有 modal-leave-active 类，将其排除
  return Array.from(document.querySelectorAll('.modal-overlay'))
    .filter(el => !el.className.includes('modal-leave-active'))
}

function modalText() {
  return visibleOverlays().map(el => el.textContent).join('\n')
}

function clickInModal(text) {
  for (const overlay of visibleOverlays()) {
    const btn = Array.from(overlay.querySelectorAll('button'))
      .find(b => b.textContent.replace(/\s+/g, ' ').trim().includes(text))
    if (btn) {
      expect(btn.disabled).toBeFalsy()
      btn.click()
      return btn
    }
  }
  throw new Error(`可见弹窗中未找到按钮: ${text}`)
}

async function openEnrollForCard(wrapper, cardIndex = 1) {
  const buttons = wrapper.findAll('.course-card .btn-enroll')
  await buttons[cardIndex].trigger('click')
  await nextTick()
}

async function advancePay() {
  vi.advanceTimersByTime(2000)
  await flushPromises()
  await nextTick()
}

describe('Courses 页面：名额与价格展示', () => {
  beforeEach(() => {
    localStorage.setItem(STORAGE_KEY, '[]')
  })

  it('课程卡片展示 已报名/容量，已满课程按钮禁用但价格正常展示', () => {
    const wrapper = mountPage()
    const html = wrapper.html()
    expect(html).toContain('89/120人')
    expect(html).toContain('¥1299')
    expect(html).toContain('40/40人')
    expect(html).toContain('名额已满')

    const buttons = wrapper.findAll('.course-card .btn-enroll')
    const fullBtn = buttons.find(b => b.text().includes('名额已满'))
    expect(fullBtn).toBeTruthy()
    expect(fullBtn.attributes('disabled')).toBeDefined()
  })

  it('课程详情弹窗展示名额与价格', async () => {
    const wrapper = mountPage()
    await wrapper.findAll('.course-card')[1].trigger('click')
    await nextTick()
    const text = modalText()
    expect(text).toContain('12课时')
    expect(text).toContain('¥1299')
    expect(text).toContain('89/120')
  })
})

describe('Courses 页面：报名支付与学习进度主链路', () => {
  beforeEach(() => {
    localStorage.setItem(STORAGE_KEY, '[]')
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0.01)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('报名→支付成功→成功反馈→学习课时，数据四处对应并持久化', async () => {
    const wrapper = mountPage()

    await openEnrollForCard(wrapper, 1)
    expect(modalText()).toContain('确认报名')
    expect(modalText()).toContain('剩余 31 个')

    clickInModal('确认支付')
    await advancePay()

    // 成功反馈
    const text = modalText()
    expect(text).toContain('报名成功')
    expect(text).toContain('0/12 课时')

    // 与任务中心对应
    const tasks = taskStore.getAll().filter(t => t.type === 'course' && t.courseId === OPEN_COURSE.id)
    expect(tasks).toHaveLength(1)
    expect(tasks[0].status).toBe('upcoming')
    expect(tasks[0].amount).toBe(1299)
    expect(text).toContain(tasks[0].orderNo)

    // 卡片按钮变为开始学习
    expect(wrapper.html()).toContain('开始学习')

    // 成功弹窗「开始学习」-> 我的课程列表
    clickInModal('开始学习')
    await nextTick()
    expect(modalText()).toContain('我的课程')
    // 我的课程中再点「开始学习」-> 学习弹窗
    clickInModal('开始学习')
    await nextTick()
    expect(modalText()).toContain('课程学习')

    const lessonItems = () => document.querySelectorAll('.modal-overlay .lesson-item')
    expect(lessonItems().length).toBe(OPEN_COURSE.outline.length)
    lessonItems()[0].click()
    await nextTick()
    lessonItems()[1].click()
    await nextTick()

    const afterStudy = taskStore.findCourseTask(OPEN_COURSE.id)
    expect(afterStudy.doneLessons).toBe(2)
    expect(afterStudy.progress).toBe(17)
    expect(afterStudy.status).toBe('ongoing')
    expect(modalText()).toContain('2/12 课时')

    // 离开课程页再回来：进度仍在
    wrapper.unmount()
    const reWrapper = mountPage()
    await nextTick()
    expect(reWrapper.html()).toContain('继续学习 17%')
    expect(taskStore.findCourseTask(OPEN_COURSE.id).completedLessons).toEqual([0, 1])
  })

  it('支付取消/失败后关闭弹窗，再次点击进入继续付款，支付后只有一条任务', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01)
    const wrapper = mountPage()
    await openEnrollForCard(wrapper, 1)

    // 首次支付失败，生成待付款订单
    clickInModal('模拟支付失败')
    await nextTick()
    clickInModal('确认支付')
    await advancePay()
    expect(taskStore.findCourseTask(OPEN_COURSE.id).status).toBe('pending_payment')

    // 关闭支付弹窗，卡片显示待付款
    clickInModal('取消')
    await nextTick()
    expect(wrapper.html()).toContain('待付款')

    // 再次点击进入继续付款弹窗（复用同一订单，不重新建单）
    await openEnrollForCard(wrapper, 1)
    expect(modalText()).toContain('继续付款')

    clickInModal('确认支付')
    await advancePay()

    expect(modalText()).toContain('报名成功')
    expect(taskStore.findCourseTask(OPEN_COURSE.id).status).toBe('upcoming')
    expect(taskStore.getAll().filter(t => t.type === 'course' && t.courseId === OPEN_COURSE.id)).toHaveLength(1)
  })
})

describe('Courses 页面：名额已满 / 支付失败 / 支付取消', () => {
  beforeEach(() => {
    localStorage.setItem(STORAGE_KEY, '[]')
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('名额已满课程无法报名，不产生任务且价格仍正常展示', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01)
    const wrapper = mountPage()
    const buttons = wrapper.findAll('.course-card .btn-enroll')
    const fullBtn = buttons.find(b => b.text().includes('名额已满'))
    await fullBtn.trigger('click')
    await nextTick()
    await flushPromises()

    expect(modalText()).toBe('')
    expect(taskStore.getAll().filter(t => t.type === 'course' && t.courseId === FULL_COURSE.id)).toHaveLength(0)
    expect(wrapper.html()).toContain('¥999')
  })

  it('模拟支付失败后继续付款成功，自始至终只有一条任务', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01)
    const wrapper = mountPage()
    await openEnrollForCard(wrapper, 1)

    clickInModal('模拟支付失败')
    await nextTick()
    clickInModal('确认支付')
    await advancePay()

    expect(modalText()).toContain('支付失败，请重新支付')
    expect(taskStore.findCourseTask(OPEN_COURSE.id).status).toBe('pending_payment')
    expect(taskStore.getAll().filter(t => t.type === 'course' && t.courseId === OPEN_COURSE.id)).toHaveLength(1)

    // 同一弹窗内再次确认（中断重试）
    clickInModal('确认支付')
    await advancePay()

    expect(modalText()).toContain('报名成功')
    expect(taskStore.findCourseTask(OPEN_COURSE.id).status).toBe('upcoming')
    expect(taskStore.getAll().filter(t => t.type === 'course' && t.courseId === OPEN_COURSE.id)).toHaveLength(1)
  })

  it('模拟支付取消后订单保留，不产生错误进度', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01)
    const wrapper = mountPage()
    await openEnrollForCard(wrapper, 1)

    clickInModal('模拟取消支付')
    await nextTick()
    clickInModal('确认支付')
    await advancePay()

    expect(modalText()).toContain('支付已取消')
    const pending = taskStore.findCourseTask(OPEN_COURSE.id)
    expect(pending.status).toBe('pending_payment')
    expect(pending.doneLessons).toBe(0)
  })
})

describe('Courses 页面：从任务中心带 courseId 进入', () => {
  beforeEach(() => {
    localStorage.setItem(STORAGE_KEY, '[]')
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('待付款课程跳转后自动打开继续付款弹窗', async () => {
    taskStore.addCoursePendingTask(OPEN_COURSE)
    const wrapper = mountPage({ courseId: OPEN_COURSE.id })
    await nextTick()
    expect(wrapper.vm.showEnrollModal).toBe(true)
    expect(wrapper.vm.payMode).toBe(true)
    expect(modalText()).toContain('继续付款')
  })

  it('已支付课程跳转后自动打开学习弹窗并显示进度', async () => {
    taskStore.addCoursePendingTask(OPEN_COURSE)
    const pending = taskStore.findCourseTask(OPEN_COURSE.id)
    taskStore.markCoursePaid(pending.id)
    taskStore.toggleCourseLesson(pending.id, 0)

    mountPage({ courseId: OPEN_COURSE.id })
    await nextTick()
    expect(modalText()).toContain('课程学习')
    expect(modalText()).toContain('1/12 课时')
  })
})
