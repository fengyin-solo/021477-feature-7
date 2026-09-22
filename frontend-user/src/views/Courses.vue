<template>
  <div class="courses-page">
    <header class="page-header">
      <div class="header-content">
        <span class="page-tag">专业培训</span>
        <h1>教学课程</h1>
        <p>专业教练团队，助您快速提升球技</p>
        <button v-if="isLoggedIn" class="btn-my-courses" @click="openMyCourses">
          📖 我的课程
        </button>
      </div>
    </header>

    <div class="courses-grid">
      <div
        v-for="course in courses"
        :key="course.id"
        class="course-card"
        @click="openCourseDetail(course)"
      >
        <div class="card-visual">
          <div class="visual-bg" :style="{ background: course.gradient }"></div>
          <div class="course-icon">{{ course.icon }}</div>
          <div class="level-badge">{{ course.level }}</div>
        </div>

        <div class="card-content">
          <div class="course-meta">
            <span class="duration">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 6v6l4 2"/>
              </svg>
              {{ course.duration }}
            </span>
            <span class="students" :class="{ full: seatsFor(course).full }">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
              {{ seatsFor(course).enrolled }}/{{ seatsFor(course).capacity }}人
            </span>
          </div>

          <h3>{{ course.name }}</h3>
          <p class="description">{{ course.description }}</p>

          <div class="coach-info">
            <div class="coach-avatar">{{ course.coach.charAt(0) }}</div>
            <div class="coach-details">
              <span class="coach-name">{{ course.coach }}</span>
              <span class="coach-title">{{ course.coachTitle }}</span>
            </div>
          </div>

          <div v-if="enrollmentFor(course) && enrollmentFor(course).status !== 'pending_payment'" class="card-progress">
            <div class="progress-bar">
              <div class="progress-fill" :style="{ width: enrollmentFor(course).progress + '%' }"></div>
            </div>
            <span>已完成 {{ enrollmentFor(course).doneLessons }}/{{ enrollmentFor(course).lessonCount }} 课时</span>
          </div>

          <div class="card-footer">
            <div class="price">
              <span class="amount">¥{{ course.price }}</span>
              <span v-if="course.originalPrice" class="original">¥{{ course.originalPrice }}</span>
            </div>
            <button
              class="btn-enroll"
              :class="enrollBtnState(course).class"
              :disabled="enrollBtnState(course).disabled"
              @click.stop="onEnrollClick(course)"
            >
              <span>{{ enrollBtnState(course).text }}</span>
              <svg v-if="enrollBtnState(course).showArrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </button>
          </div>
        </div>

        <div class="card-hover-effect"></div>
      </div>
    </div>

    <!-- Course Detail Modal -->
    <Modal
      v-model="showDetailModal"
      size="large"
      :show-footer="false"
    >
      <div v-if="selectedCourse" class="course-detail">
        <div class="detail-header" :style="{ background: selectedCourse.gradient }">
          <div class="detail-icon">{{ selectedCourse.icon }}</div>
          <div class="detail-badge">{{ selectedCourse.level }}</div>
        </div>

        <div class="detail-content">
          <h2>{{ selectedCourse.name }}</h2>
          <p class="detail-desc">{{ selectedCourse.description }}</p>

          <div class="detail-stats">
            <div class="stat">
              <span class="stat-value">{{ selectedCourse.duration }}</span>
              <span class="stat-label">课程时长</span>
            </div>
            <div class="stat">
              <span class="stat-value">{{ selectedCourse.lessons }}</span>
              <span class="stat-label">课时数量</span>
            </div>
            <div class="stat">
              <span class="stat-value" :class="{ 'stat-full': seatsFor(selectedCourse).full }">
                {{ seatsFor(selectedCourse).enrolled }}/{{ seatsFor(selectedCourse).capacity }}
              </span>
              <span class="stat-label">报名名额</span>
            </div>
          </div>

          <div v-if="detailEnrollment" class="detail-enroll-status">
            <template v-if="detailEnrollment.status === 'pending_payment'">
              <span class="enroll-flag pending">⏳ 订单待付款，名额预留中</span>
              <button class="btn-inline-pay" @click="openPayModal(selectedCourse)">继续付款</button>
            </template>
            <template v-else>
              <div class="detail-progress">
                <div class="progress-bar">
                  <div class="progress-fill" :style="{ width: detailEnrollment.progress + '%' }"></div>
                </div>
                <span>已完成 {{ detailEnrollment.doneLessons }}/{{ detailEnrollment.lessonCount }} 课时 · {{ detailEnrollment.progress }}%</span>
              </div>
            </template>
          </div>

          <div class="detail-coach">
            <div class="coach-avatar large">{{ selectedCourse.coach.charAt(0) }}</div>
            <div class="coach-info">
              <h4>{{ selectedCourse.coach }}</h4>
              <span class="title">{{ selectedCourse.coachTitle }}</span>
              <p class="bio">{{ selectedCourse.coachBio }}</p>
            </div>
          </div>

          <div class="course-outline">
            <h4>课程大纲</h4>
            <div class="outline-list">
              <div v-for="(item, index) in selectedCourse.outline" :key="index" class="outline-item">
                <span class="outline-num">{{ String(index + 1).padStart(2, '0') }}</span>
                <span class="outline-text">{{ item }}</span>
              </div>
            </div>
          </div>

          <div class="detail-footer">
            <div class="detail-price">
              <span class="current">¥{{ selectedCourse.price }}</span>
              <span v-if="selectedCourse.originalPrice" class="original">¥{{ selectedCourse.originalPrice }}</span>
            </div>
            <button
              class="btn-enroll-large"
              :class="enrollBtnState(selectedCourse).class"
              :disabled="enrollBtnState(selectedCourse).disabled"
              @click="onEnrollClick(selectedCourse)"
            >
              {{ enrollBtnState(selectedCourse).text }}
            </button>
          </div>
        </div>
      </div>
    </Modal>

    <!-- Enroll / Pay Modal -->
    <Modal
      v-model="showEnrollModal"
      icon="📚"
      icon-type="info"
      :title="payMode ? '继续付款' : '确认报名'"
      :subtitle="enrollCourse?.name"
      size="small"
      :confirm-text="enrollLoading ? '支付处理中...' : '确认支付'"
      :confirm-disabled="enrollLoading"
      @confirm="confirmEnroll"
      @cancel="onEnrollModalCancel"
    >
      <div v-if="enrollCourse" class="enroll-info">
        <div v-if="pendingTask" class="info-row">
          <span class="label">订单编号</span>
          <span class="value">{{ pendingTask.orderNo }}</span>
        </div>
        <div class="info-row">
          <span class="label">课程</span>
          <span class="value">{{ enrollCourse.name }}</span>
        </div>
        <div class="info-row">
          <span class="label">教练</span>
          <span class="value">{{ enrollCourse.coach }}</span>
        </div>
        <div class="info-row">
          <span class="label">课时</span>
          <span class="value">{{ enrollCourse.lessons }}</span>
        </div>
        <div class="info-row">
          <span class="label">名额</span>
          <span class="value">剩余 {{ seatsFor(enrollCourse).remaining }} 个</span>
        </div>
        <div class="info-row total">
          <span class="label">应付金额</span>
          <span class="value price">¥{{ enrollCourse.price }}</span>
        </div>

        <div class="pay-method">
          <span class="pay-method-label">支付方式</span>
          <span class="pay-method-option">💳 模拟支付</span>
        </div>

        <div v-if="payMessage" class="pay-message" :class="payMessageType">
          {{ payMessage }}
        </div>

        <div v-if="!enrollLoading" class="pay-demo-actions">
          <button class="demo-link" @click="setDemoOutcome('fail')">模拟支付失败</button>
          <button class="demo-link" @click="setDemoOutcome('cancel')">模拟取消支付</button>
        </div>
        <p v-if="payMode" class="pay-tip">该订单尚未支付成功，重新支付不会产生重复订单</p>
      </div>
    </Modal>

    <!-- Success Modal -->
    <Modal
      v-model="showSuccessModal"
      icon="🎉"
      icon-type="success"
      title="报名成功"
      subtitle="课程已添加到您的学习列表"
      size="small"
      :show-cancel="false"
      confirm-text="开始学习"
      @confirm="goToMyCourses"
    >
      <div v-if="enrollResult" class="success-info">
        <div class="info-row">
          <span class="label">订单编号</span>
          <span class="value">{{ enrollResult.orderNo }}</span>
        </div>
        <div class="info-row">
          <span class="label">课程</span>
          <span class="value">{{ enrollResult.courseName }}</span>
        </div>
        <div class="info-row">
          <span class="label">支付金额</span>
          <span class="value price-inline">¥{{ enrollResult.price }}</span>
        </div>
        <div class="info-row">
          <span class="label">已完成课时</span>
          <span class="value">{{ enrollResult.doneLessons }}/{{ enrollResult.lessonCount }} 课时</span>
        </div>
        <div class="info-row">
          <span class="label">有效期至</span>
          <span class="value">{{ enrollResult.expireDate }}</span>
        </div>
      </div>
    </Modal>

    <!-- Study Modal -->
    <Modal v-model="showStudyModal" :title="'课程学习'" :subtitle="studyCourse?.name" size="medium" :show-footer="false">
      <div v-if="studyCourse && studyEnrollment" class="study-content">
        <div class="study-summary">
          <div class="study-icon">{{ studyCourse.icon }}</div>
          <div class="study-meta">
            <h4>{{ studyCourse.name }}</h4>
            <p>教练：{{ studyCourse.coach }} · {{ studyCourse.lessons }}</p>
            <div class="course-progress">
              <div class="progress-bar"><div class="progress-fill" :style="{ width: studyEnrollment.progress + '%' }"></div></div>
              <span>{{ studyEnrollment.doneLessons }}/{{ studyEnrollment.lessonCount }} 课时 · {{ studyEnrollment.progress }}%</span>
            </div>
          </div>
        </div>
        <div class="study-lessons">
          <p class="lessons-tip">点击课时可标记完成 / 取消完成，进度自动保存</p>
          <div
            v-for="(item, index) in studyCourse.outline"
            :key="index"
            class="lesson-item"
            :class="{ done: isLessonDone(index) }"
            @click="toggleStudyLesson(index)"
          >
            <span class="lesson-check">{{ isLessonDone(index) ? '✓' : String(index + 1).padStart(2, '0') }}</span>
            <span class="lesson-name">{{ item }}</span>
          </div>
        </div>
      </div>
    </Modal>

    <!-- Toast -->
    <Toast v-model="showToast" :type="toastType" :title="toastTitle" :message="toastMessage" />

    <!-- Login Modal -->
    <LoginModal v-model="showLoginModal" @login-success="onLoginSuccess" />

    <!-- My Courses Modal -->
    <Modal v-model="showMyCoursesModal" title="我的课程" size="medium" :show-footer="false">
      <div class="my-courses-content">
        <div v-if="myCourses.length > 0" class="my-courses-list">
          <div v-for="course in myCourses" :key="course.taskId" class="my-course-card">
            <div class="course-icon-small">{{ course.courseIcon }}</div>
            <div class="course-info-main">
              <h4>{{ course.courseName }}</h4>
              <p>教练：{{ course.coach }} · {{ course.lessons }}</p>
              <div class="course-progress">
                <div class="progress-bar"><div class="progress-fill" :style="{ width: course.progress + '%' }"></div></div>
                <span>{{ course.doneLessons }}/{{ course.lessonCount }} 课时 · {{ course.progress }}%</span>
              </div>
            </div>
            <button class="btn-study" @click="startStudy(course)">
              {{ course.status === 'completed' ? '查看课程' : course.progress > 0 ? '继续学习' : '开始学习' }}
            </button>
          </div>
        </div>
        <div v-else class="courses-empty">
          <div class="empty-icon">📚</div>
          <p>暂无已报名课程</p>
        </div>
      </div>
    </Modal>
  </div>
</template>

<script>
import Modal from '../components/Modal.vue'
import Toast from '../components/Toast.vue'
import LoginModal from '../components/LoginModal.vue'
import { isAuthenticated } from '../utils/auth'
import courseStore from '../utils/courseStore'
import { getSeatsInfo } from '../utils/courseStore'
import COURSES from '../utils/coursesData'

export default {
  name: 'Courses',
  components: { Modal, Toast, LoginModal },
  data() {
    return {
      showDetailModal: false,
      showEnrollModal: false,
      showSuccessModal: false,
      showMyCoursesModal: false,
      showStudyModal: false,
      enrollLoading: false,
      selectedCourse: null,
      enrollCourse: null,
      pendingTask: null,
      payMode: false,
      payMessage: '',
      payMessageType: 'error',
      demoOutcome: null,
      enrollResult: null,
      myCourses: [],
      studyCourse: null,
      studyEnrollment: null,
      showToast: false,
      toastType: 'success',
      toastTitle: '',
      toastMessage: '',
      showLoginModal: false,
      pendingCourse: null,
      // 报名映射：localStorage 中的数据非响应式，变更后整体替换该对象以触发视图更新
      enrollmentMapData: {},
      courses: COURSES
    }
  },
  computed: {
    isLoggedIn() {
      return isAuthenticated()
    },
    detailEnrollment() {
      if (!this.selectedCourse) return null
      return this.enrollmentFor(this.selectedCourse)
    }
  },
  mounted() {
    this.refreshEnrollments()
    this.handleRouteQuery()
  },
  methods: {
    refreshEnrollments() {
      this.enrollmentMapData = courseStore.getEnrollmentMap()
    },
    handleRouteQuery() {
      const { courseId } = this.$route.query
      if (!courseId) return
      const id = Number(courseId)
      const course = this.courses.find(c => c.id === id)
      if (!course) return
      // 直接从存储读取，避免依赖计算属性的首次求值时序
      const enrollment = courseStore.getEnrollment(id)
      if (enrollment && enrollment.status === 'pending_payment') {
        // 任务中心「继续付款」进入
        this.enrollCourse = course
        this.pendingTask = enrollment
        this.payMode = true
        this.payMessage = ''
        this.demoOutcome = null
        this.showEnrollModal = true
      } else if (enrollment) {
        // 任务中心「继续学习/开始学习」进入
        this.studyCourse = course
        this.studyEnrollment = enrollment
        this.showStudyModal = true
      }
    },
    seatsFor(course) {
      // 读取映射建立响应式依赖：报名状态变化后名额同步刷新
      this.enrollmentMapData
      return getSeatsInfo(course)
    },
    enrollmentFor(course) {
      return this.enrollmentMapData[course.id] || null
    },
    enrollBtnState(course) {
      const enrollment = this.enrollmentFor(course)
      if (enrollment) {
        if (enrollment.status === 'pending_payment') {
          return { text: '待付款', class: 'btn-pending', disabled: false, showArrow: false }
        }
        if (enrollment.status === 'completed') {
          return { text: '已完成', class: 'btn-done', disabled: false, showArrow: false }
        }
        if (enrollment.status === 'ongoing') {
          return { text: `继续学习 ${enrollment.progress}%`, class: 'btn-studying', disabled: false, showArrow: false }
        }
        return { text: '开始学习', class: 'btn-studying', disabled: false, showArrow: false }
      }
      if (this.seatsFor(course).full) {
        return { text: '名额已满', class: 'btn-full', disabled: true, showArrow: false }
      }
      return { text: '立即报名', class: '', disabled: false, showArrow: true }
    },
    onEnrollClick(course) {
      const enrollment = this.enrollmentFor(course)
      if (enrollment) {
        if (enrollment.status === 'pending_payment') {
          this.openPayModal(course)
        } else {
          this.openStudy(course)
        }
        return
      }
      this.openEnrollModal(course)
    },
    openCourseDetail(course) {
      this.selectedCourse = course
      this.refreshEnrollments()
      this.showDetailModal = true
    },
    openEnrollModal(course) {
      if (!isAuthenticated()) {
        this.pendingCourse = course
        this.showLoginModal = true
        return
      }
      if (this.seatsFor(course).full) {
        this.showNotification('warning', '名额已满', `「${course.name}」报名名额已满，无法报名`)
        return
      }
      this.enrollCourse = course
      this.pendingTask = null
      this.payMode = false
      this.payMessage = ''
      this.demoOutcome = null
      this.showDetailModal = false
      this.showEnrollModal = true
    },
    openPayModal(course) {
      const enrollment = this.enrollmentFor(course)
      if (!enrollment || enrollment.status !== 'pending_payment') {
        // 记录不存在或已支付：不新建任务，直接给出对应反馈
        if (enrollment) {
          this.openStudy(course)
        } else {
          this.openEnrollModal(course)
        }
        return
      }
      this.enrollCourse = course
      this.pendingTask = enrollment
      this.payMode = true
      this.payMessage = ''
      this.demoOutcome = null
      this.showDetailModal = false
      this.showEnrollModal = true
    },
    onLoginSuccess() {
      this.showLoginModal = false
      if (this.pendingCourse) {
        const course = this.pendingCourse
        this.pendingCourse = null
        this.openEnrollModal(course)
      }
    },
    setDemoOutcome(outcome) {
      this.demoOutcome = outcome
      this.showNotification(
        'info',
        outcome === 'fail' ? '已选择模拟失败' : '已选择模拟取消',
        '点击「确认支付」将触发该支付结果'
      )
    },
    async confirmEnroll() {
      if (this.enrollLoading || !this.enrollCourse) return
      this.payMessage = ''

      // 已有待付款订单：直接走支付（中断重试），绝不重复建单
      let enrollment = this.pendingTask
      if (!enrollment) {
        const started = courseStore.startEnrollment(this.enrollCourse)
        if (!started.ok) {
          if (started.reason === 'full') {
            this.showEnrollModal = false
            this.showNotification('error', '名额已满', `「${this.enrollCourse.name}」报名名额已满`)
          } else if (started.reason === 'duplicated') {
            // 并发/重复点击兜底：复用已有记录
            if (started.enrollment.status === 'pending_payment') {
              this.pendingTask = started.enrollment
              this.payMode = true
              this.showNotification('info', '已有待付款订单', '请继续完成支付，无需重复报名')
            } else {
              this.showEnrollModal = false
              this.showNotification('info', '您已报名该课程', '可在「我的课程」中继续学习')
            }
          } else {
            this.showNotification('error', '操作失败', '本地存储异常，请稍后重试')
          }
          return
        }
        enrollment = started.enrollment
        this.pendingTask = enrollment
      }

      this.enrollLoading = true
      const outcome = this.demoOutcome
      this.demoOutcome = null
      const result = await courseStore.payEnrollment(enrollment.id, outcome)
      this.enrollLoading = false

      if (result.ok) {
        this.refreshEnrollments()
        const paid = result.enrollment
        const expireDate = new Date()
        expireDate.setMonth(expireDate.getMonth() + 6)
        this.enrollResult = {
          orderNo: paid.orderNo,
          courseName: this.enrollCourse.name,
          price: this.enrollCourse.price,
          lessonCount: paid.lessonCount,
          doneLessons: paid.doneLessons,
          expireDate: expireDate.toISOString().split('T')[0]
        }
        this.pendingTask = null
        this.showEnrollModal = false
        this.showSuccessModal = true
        this.showNotification('info', '已添加到任务中心', '您可以在任务中心查看并管理此课程')
        return
      }

      // 失败 / 取消：任务保持待付款，不产生重复任务或错误进度
      this.payMode = true
      this.refreshEnrollments()
      this.pendingTask = courseStore.getEnrollment(this.enrollCourse.id)
      if (result.reason === 'cancelled') {
        this.payMessageType = 'warning'
        this.payMessage = '支付已取消，订单已为您保留，可重新支付或在任务中心稍后处理'
      } else if (result.reason === 'in_flight') {
        this.payMessageType = 'warning'
        this.payMessage = '上一笔支付正在处理中，请勿重复提交'
      } else {
        this.payMessageType = 'error'
        this.payMessage = '支付失败，请重新支付；订单已保留，不会产生重复订单'
      }
    },
    onEnrollModalCancel() {
      if (this.enrollLoading) {
        // 支付处理中不允许关闭，避免中断流程造成状态不明
        this.showEnrollModal = true
        this.showNotification('warning', '支付处理中', '请等待本次支付结果返回')
        return
      }
      if (this.pendingTask) {
        this.refreshEnrollments()
        this.showNotification('info', '订单已保留', '可在任务中心或课程页继续付款')
      }
      this.pendingTask = null
      this.payMode = false
      this.payMessage = ''
    },
    goToMyCourses() {
      this.showSuccessModal = false
      this.openMyCourses()
    },
    openMyCourses() {
      if (!isAuthenticated()) {
        this.showLoginModal = true
        return
      }
      this.refreshEnrollments()
      this.myCourses = courseStore.getMyCourses()
      this.showMyCoursesModal = true
    },
    startStudy(courseItem) {
      const course = this.courses.find(c => c.id === Number(courseItem.courseId))
      this.showMyCoursesModal = false
      if (course) {
        this.openStudy(course)
      } else {
        this.showNotification('error', '课程信息缺失', '未找到对应课程信息，不影响其他课程')
      }
    },
    openStudy(course) {
      if (!isAuthenticated()) {
        this.pendingCourse = course
        this.showLoginModal = true
        return
      }
      const enrollment = courseStore.getEnrollment(course.id)
      if (!enrollment || enrollment.status === 'pending_payment') {
        this.openPayModal(course)
        return
      }
      this.studyCourse = course
      this.studyEnrollment = enrollment
      this.showDetailModal = false
      this.showStudyModal = true
    },
    isLessonDone(index) {
      return this.studyEnrollment.completedLessons.includes(index)
    },
    toggleStudyLesson(index) {
      const updated = courseStore.toggleLesson(this.studyCourse.id, index)
      if (!updated) {
        this.showNotification('error', '操作失败', '学习记录保存失败，请稍后重试')
        return
      }
      this.studyEnrollment = updated
      this.refreshEnrollments()
      // 同步刷新已打开的「我的课程」列表
      this.myCourses = courseStore.getMyCourses()
      const doneText = this.isLessonDone(index) ? '已完成' : '已取消完成'
      this.showNotification(
        'success',
        `课时${doneText}`,
        `当前进度 ${updated.doneLessons}/${updated.lessonCount} 课时`
      )
    },
    showNotification(type, title, message) {
      this.toastType = type
      this.toastTitle = title
      this.toastMessage = message
      this.showToast = true
    }
  }
}
</script>

<style scoped>
.courses-page {
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 3rem 4rem;
}

.page-header {
  text-align: center;
  padding: 2rem 0 4rem;
}

.header-content {
  position: relative;
}

.page-tag {
  display: inline-block;
  background: rgba(0, 217, 165, 0.1);
  color: var(--primary);
  padding: 0.5rem 1rem;
  border-radius: 50px;
  font-size: 0.85rem;
  font-weight: 500;
  margin-bottom: 1rem;
}

.page-header h1 {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 3rem;
  font-weight: 700;
  margin-bottom: 0.75rem;
}

.page-header p {
  color: var(--text-secondary);
  font-size: 1.1rem;
}

.btn-my-courses {
  margin-top: 1.25rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border);
  color: var(--text-primary);
  padding: 0.6rem 1.4rem;
  border-radius: 50px;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-my-courses:hover {
  border-color: var(--primary);
  color: var(--primary);
}

/* Courses Grid */
.courses-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 1.5rem;
}

.course-card {
  position: relative;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 24px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.course-card:hover {
  transform: translateY(-8px);
  border-color: rgba(255, 255, 255, 0.15);
}

.card-hover-effect {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, transparent 0%, rgba(0, 217, 165, 0.05) 100%);
  opacity: 0;
  transition: opacity 0.4s;
  pointer-events: none;
}

.course-card:hover .card-hover-effect {
  opacity: 1;
}

.card-visual {
  position: relative;
  height: 140px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.visual-bg {
  position: absolute;
  inset: 0;
  opacity: 0.8;
}

.course-icon {
  font-size: 4rem;
  position: relative;
  z-index: 1;
  filter: drop-shadow(0 4px 8px rgba(0,0,0,0.3));
}

.level-badge {
  position: absolute;
  top: 1rem;
  right: 1rem;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(10px);
  padding: 0.4rem 0.8rem;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 600;
  color: #fff;
}

.card-content {
  padding: 1.5rem;
}

.course-meta {
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
}

.course-meta span {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.course-meta span.full {
  color: #ff6b6b;
  font-weight: 600;
}

.course-meta svg {
  width: 14px;
  height: 14px;
}

.card-content h3 {
  font-size: 1.2rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.description {
  color: var(--text-secondary);
  font-size: 0.85rem;
  line-height: 1.6;
  margin-bottom: 1.25rem;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.coach-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 12px;
  margin-bottom: 1.25rem;
}

.coach-avatar {
  width: 40px;
  height: 40px;
  background: var(--gradient-1);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  color: var(--bg-dark);
}

.coach-details {
  display: flex;
  flex-direction: column;
}

.coach-name {
  font-weight: 500;
  font-size: 0.9rem;
}

.coach-title {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.card-progress {
  margin-bottom: 1rem;
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 1.25rem;
  border-top: 1px solid var(--border);
}

.price {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}

.price .amount {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--primary);
}

.price .original {
  font-size: 0.9rem;
  color: var(--text-muted);
  text-decoration: line-through;
}

.btn-enroll {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: var(--gradient-1);
  color: var(--bg-dark);
  border: none;
  padding: 0.7rem 1.2rem;
  font-size: 0.85rem;
  font-weight: 600;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-enroll svg {
  width: 16px;
  height: 16px;
  transition: transform 0.3s;
}

.btn-enroll:hover:not(:disabled) {
  box-shadow: 0 5px 20px var(--primary-glow);
}

.btn-enroll:hover:not(:disabled) svg {
  transform: translateX(3px);
}

.btn-enroll.btn-full {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-muted);
  cursor: not-allowed;
}

.btn-enroll.btn-full:disabled {
  opacity: 0.7;
}

.btn-enroll.btn-pending {
  background: rgba(255, 193, 7, 0.15);
  color: #ffc107;
  border: 1px solid rgba(255, 193, 7, 0.35);
}

.btn-enroll.btn-studying {
  background: rgba(0, 217, 165, 0.12);
  color: var(--primary);
  border: 1px solid rgba(0, 217, 165, 0.35);
}

.btn-enroll.btn-done {
  background: rgba(108, 117, 125, 0.15);
  color: #adb5bd;
}

/* Course Detail Modal */
.course-detail {
  margin: -20px -24px;
}

.detail-header {
  height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.detail-icon {
  font-size: 5rem;
  filter: drop-shadow(0 4px 12px rgba(0,0,0,0.3));
}

.detail-badge {
  position: absolute;
  top: 1rem;
  left: 1rem;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(10px);
  padding: 0.4rem 0.8rem;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 600;
  color: #fff;
}

.detail-content {
  padding: 1.5rem;
}

.detail-content h2 {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 1.5rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
}

.detail-desc {
  color: var(--text-secondary);
  font-size: 0.9rem;
  line-height: 1.6;
  margin-bottom: 1.5rem;
}

.detail-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.detail-stats .stat {
  text-align: center;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 12px;
}

.stat-value {
  display: block;
  font-family: 'Space Grotesk', sans-serif;
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--primary);
  margin-bottom: 0.25rem;
}

.stat-value.stat-full {
  color: #ff6b6b;
}

.stat-label {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.detail-enroll-status {
  margin-bottom: 1.5rem;
  padding: 1rem 1.25rem;
  background: rgba(0, 217, 165, 0.06);
  border: 1px solid rgba(0, 217, 165, 0.2);
  border-radius: 12px;
}

.enroll-flag {
  font-size: 0.9rem;
}

.enroll-flag.pending {
  color: #ffc107;
}

.btn-inline-pay {
  margin-left: 0.75rem;
  background: rgba(255, 193, 7, 0.15);
  border: 1px solid rgba(255, 193, 7, 0.35);
  color: #ffc107;
  padding: 0.35rem 0.9rem;
  border-radius: 8px;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
}

.detail-progress {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.detail-coach {
  display: flex;
  gap: 1rem;
  padding: 1.25rem;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 16px;
  margin-bottom: 1.5rem;
}

.coach-avatar.large {
  width: 56px;
  height: 56px;
  font-size: 1.25rem;
  border-radius: 14px;
  flex-shrink: 0;
}

.detail-coach .coach-info {
  display: flex;
  flex-direction: column;
  padding: 0;
  background: none;
  margin: 0;
}

.detail-coach h4 {
  font-weight: 600;
  margin-bottom: 0.15rem;
}

.detail-coach .title {
  font-size: 0.8rem;
  color: var(--primary);
  margin-bottom: 0.5rem;
}

.detail-coach .bio {
  font-size: 0.8rem;
  color: var(--text-secondary);
  line-height: 1.5;
}

.course-outline {
  margin-bottom: 1.5rem;
}

.course-outline h4 {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 1rem;
}

.outline-list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.5rem;
}

.outline-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 10px;
}

.outline-num {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--primary);
}

.outline-text {
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.detail-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 1.5rem;
  border-top: 1px solid var(--border);
}

.detail-price {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
}

.detail-price .current {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 2rem;
  font-weight: 700;
  color: var(--primary);
}

.detail-price .original {
  font-size: 1rem;
  color: var(--text-muted);
  text-decoration: line-through;
}

.btn-enroll-large {
  background: var(--gradient-1);
  color: var(--bg-dark);
  border: none;
  padding: 1rem 2rem;
  font-size: 1rem;
  font-weight: 600;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-enroll-large:hover:not(:disabled) {
  transform: scale(1.02);
  box-shadow: 0 8px 30px var(--primary-glow);
}

.btn-enroll-large.btn-full {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-muted);
  cursor: not-allowed;
}

.btn-enroll-large.btn-pending {
  background: rgba(255, 193, 7, 0.15);
  color: #ffc107;
  border: 1px solid rgba(255, 193, 7, 0.35);
}

.btn-enroll-large.btn-studying {
  background: rgba(0, 217, 165, 0.12);
  color: var(--primary);
  border: 1px solid rgba(0, 217, 165, 0.35);
}

.btn-enroll-large.btn-done {
  background: rgba(108, 117, 125, 0.15);
  color: #adb5bd;
}

/* Enroll Info */
.enroll-info, .success-info {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 12px;
  text-align: left;
}

.info-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.9rem;
}

.info-row .label {
  color: var(--text-secondary);
}

.info-row .value {
  font-weight: 500;
}

.info-row.total {
  border-top: 1px solid var(--border);
  padding-top: 0.75rem;
  margin-top: 0.25rem;
}

.info-row .value.price {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 1.25rem;
  color: var(--primary);
}

.price-inline {
  color: var(--primary);
  font-family: 'Space Grotesk', sans-serif;
}

.pay-method {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 10px;
  font-size: 0.85rem;
}

.pay-method-label {
  color: var(--text-secondary);
}

.pay-method-option {
  font-weight: 500;
}

.pay-message {
  padding: 0.6rem 0.9rem;
  border-radius: 10px;
  font-size: 0.82rem;
  line-height: 1.5;
}

.pay-message.error {
  background: rgba(255, 107, 107, 0.1);
  border: 1px solid rgba(255, 107, 107, 0.3);
  color: #ff8a8a;
}

.pay-message.warning {
  background: rgba(255, 193, 7, 0.1);
  border: 1px solid rgba(255, 193, 7, 0.3);
  color: #ffc107;
}

.pay-demo-actions {
  display: flex;
  justify-content: center;
  gap: 1.25rem;
}

.demo-link {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 0.75rem;
  text-decoration: underline;
  cursor: pointer;
  padding: 0.25rem;
}

.demo-link:hover {
  color: var(--text-secondary);
}

.pay-tip {
  font-size: 0.75rem;
  color: var(--text-muted);
  text-align: center;
}

/* Study Modal */
.study-content {
  margin: -20px -24px;
}

.study-summary {
  display: flex;
  gap: 1rem;
  padding: 1.25rem 1.5rem;
  background: rgba(255, 255, 255, 0.03);
}

.study-icon {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  background: var(--bg-card-hover);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.8rem;
  flex-shrink: 0;
}

.study-meta {
  flex: 1;
}

.study-meta h4 {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 0.2rem;
}

.study-meta p {
  font-size: 0.8rem;
  color: var(--text-secondary);
  margin-bottom: 0.6rem;
}

.study-lessons {
  padding: 1.25rem 1.5rem 1.5rem;
}

.lessons-tip {
  font-size: 0.78rem;
  color: var(--text-muted);
  margin-bottom: 0.9rem;
}

.lesson-item {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  padding: 0.85rem 1rem;
  border: 1px solid var(--border);
  border-radius: 12px;
  margin-bottom: 0.6rem;
  cursor: pointer;
  transition: all 0.25s;
}

.lesson-item:hover {
  border-color: rgba(0, 217, 165, 0.4);
}

.lesson-item.done {
  background: rgba(0, 217, 165, 0.08);
  border-color: rgba(0, 217, 165, 0.35);
}

.lesson-check {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1.5px solid var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--text-muted);
  flex-shrink: 0;
  font-family: 'Space Grotesk', sans-serif;
}

.lesson-item.done .lesson-check {
  background: var(--gradient-1);
  border-color: var(--primary);
  color: var(--bg-dark);
}

.lesson-name {
  font-size: 0.9rem;
  color: var(--text-secondary);
}

.lesson-item.done .lesson-name {
  color: var(--text-primary);
}

@media (max-width: 768px) {
  .courses-page {
    padding: 0 1.5rem 3rem;
  }

  .page-header h1 {
    font-size: 2rem;
  }

  .courses-grid {
    grid-template-columns: 1fr;
  }

  .outline-list {
    grid-template-columns: 1fr;
  }
}
</style>


<style scoped>
/* My Courses Modal Styles */
.my-courses-content { margin: -20px -24px; }
.my-courses-list { max-height: 400px; overflow-y: auto; padding: 1rem 1.5rem; }
.my-course-card { display: flex; align-items: center; gap: 1rem; background: rgba(255, 255, 255, 0.03); border-radius: 12px; padding: 1rem; margin-bottom: 0.75rem; }
.course-icon-small { font-size: 2rem; width: 50px; height: 50px; background: var(--bg-card-hover); border-radius: 10px; display: flex; align-items: center; justify-content: center; }
.course-info-main { flex: 1; }
.course-info-main h4 { font-size: 0.95rem; font-weight: 500; margin-bottom: 0.25rem; }
.course-info-main p { font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.5rem; }
.course-progress { display: flex; align-items: center; gap: 0.5rem; }
.progress-bar { flex: 1; height: 4px; background: rgba(255, 255, 255, 0.1); border-radius: 2px; overflow: hidden; }
.progress-fill { height: 100%; background: var(--primary); border-radius: 2px; transition: width 0.3s; }
.course-progress span { font-size: 0.75rem; color: var(--text-muted); min-width: 30px; }
.btn-study { background: var(--gradient-1); border: none; color: var(--bg-dark); padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.8rem; font-weight: 600; cursor: pointer; transition: all 0.3s; }
.btn-study:hover { box-shadow: 0 4px 15px var(--primary-glow); }
.courses-empty { padding: 3rem; text-align: center; color: var(--text-muted); }
.courses-empty .empty-icon { font-size: 3rem; margin-bottom: 0.5rem; opacity: 0.5; }
</style>
