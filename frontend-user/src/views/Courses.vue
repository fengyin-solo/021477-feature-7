<template>
  <div class="courses-page">
    <header class="page-header">
      <div class="header-content">
        <span class="page-tag">专业培训</span>
        <h1>教学课程</h1>
        <p>专业教练团队，助您快速提升球技</p>
        <button class="btn-my-courses" @click="openMyCourses">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
          </svg>
          我的课程
          <span v-if="enrollmentCount > 0" class="my-courses-badge">{{ enrollmentCount }}</span>
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
          <div class="quota-badge" :class="{ full: quotaMap[course.id].isFull }">
            {{ quotaMap[course.id].isFull ? '名额已满' : `剩 ${quotaMap[course.id].remaining} 个名额` }}
          </div>
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
            <span class="students">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
              {{ quotaMap[course.id].enrolled }}/{{ quotaMap[course.id].capacity }}人
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

          <!-- 已报名：学习进度与课程列表对应 -->
          <div v-if="getEnrollment(course.id)" class="enrolled-progress">
            <div class="progress-info">
              <span class="progress-label">学习进度</span>
              <span class="progress-text">
                已完成 {{ getEnrollment(course.id).completedLessons }}/{{ getEnrollment(course.id).totalLessons }} 课时 · {{ getEnrollment(course.id).progress }}%
              </span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" :style="{ width: getEnrollment(course.id).progress + '%' }"></div>
            </div>
          </div>

          <div class="card-footer">
            <div class="price">
              <span class="amount">¥{{ course.price }}</span>
              <span v-if="course.originalPrice" class="original">¥{{ course.originalPrice }}</span>
            </div>
            <button
              v-if="getEnrollment(course.id)"
              class="btn-enroll enrolled"
              @click.stop="startStudyByCourse(course)"
            >
              <span>{{ getEnrollment(course.id).progress === 100 ? '查看课程' : '继续学习' }}</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </button>
            <button
              v-else-if="quotaMap[course.id].isFull"
              class="btn-enroll full"
              disabled
              @click.stop
            >
              名额已满
            </button>
            <button v-else class="btn-enroll" @click.stop="openEnrollModal(course)">
              <span>立即报名</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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
              <span class="stat-value" :class="{ 'stat-full': quotaMap[selectedCourse.id].isFull }">
                {{ quotaMap[selectedCourse.id].remaining }}
              </span>
              <span class="stat-label">剩余名额</span>
            </div>
          </div>

          <!-- 已报名：课程详情中可直接看到对应学习进度 -->
          <div v-if="selectedEnrollment" class="detail-progress">
            <div class="progress-info">
              <span class="progress-label">我的学习进度</span>
              <span class="progress-text">
                已完成 {{ selectedEnrollment.completedLessons }}/{{ selectedEnrollment.totalLessons }} 课时 · {{ selectedEnrollment.progress }}%
              </span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" :style="{ width: selectedEnrollment.progress + '%' }"></div>
            </div>
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
              v-if="selectedEnrollment"
              class="btn-enroll-large"
              @click="startStudyByCourse(selectedCourse)"
            >
              {{ selectedEnrollment.progress === 100 ? '查看课程' : '继续学习' }}
            </button>
            <button
              v-else-if="quotaMap[selectedCourse.id].isFull"
              class="btn-enroll-large btn-full"
              disabled
            >
              名额已满
            </button>
            <button v-else class="btn-enroll-large" @click="openEnrollModal(selectedCourse)">
              立即报名
            </button>
          </div>
        </div>
      </div>
    </Modal>

    <!-- Enroll Modal -->
    <Modal
      v-model="showEnrollModal"
      icon="📚"
      icon-type="info"
      title="确认报名"
      :subtitle="enrollCourse?.name"
      size="small"
      confirm-text="确认支付"
      :loading="enrollLoading"
      @confirm="confirmEnroll"
      @cancel="onEnrollCancel"
    >
      <div v-if="enrollCourse" class="enroll-info">
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
          <span class="label">剩余名额</span>
          <span class="value" :class="{ 'quota-full': quotaMap[enrollCourse.id].isFull }">
            {{ quotaMap[enrollCourse.id].isFull ? '名额已满' : `剩 ${quotaMap[enrollCourse.id].remaining} 个名额` }}
          </span>
        </div>
        <div class="info-row total">
          <span class="label">应付金额</span>
          <span class="value price">¥{{ enrollCourse.price }}</span>
        </div>
        <p v-if="enrollLoading" class="pay-tip">支付处理中，请勿重复点击，取消支付不会产生报名记录…</p>
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
      @confirm="goToStudy"
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
          <span class="label">课程课时</span>
          <span class="value">{{ enrollResult.totalLessons }} 课时</span>
        </div>
        <div class="info-row">
          <span class="label">已完成课时</span>
          <span class="value">{{ enrollResult.completedLessons }}/{{ enrollResult.totalLessons }}（{{ enrollResult.progress }}%）</span>
        </div>
        <div class="info-row">
          <span class="label">有效期至</span>
          <span class="value">{{ enrollResult.expireDate }}</span>
        </div>
      </div>
    </Modal>

    <!-- Toast -->
    <Toast v-model="showToast" :type="toastType" :title="toastTitle" :message="toastMessage" />

    <!-- Login Modal -->
    <LoginModal v-model="showLoginModal" @success="onLoginSuccess" />

    <!-- My Courses Modal -->
    <Modal v-model="showMyCoursesModal" title="我的课程" size="medium" :show-footer="false">
      <div class="my-courses-content">
        <div v-if="myCourses.length > 0" class="my-courses-list">
          <div v-for="item in myCourses" :key="item.orderNo" class="my-course-card">
            <div class="course-icon-small">{{ item.courseIcon }}</div>
            <div class="course-info-main">
              <h4>{{ item.courseName }}</h4>
              <p>教练：{{ item.coach }} · {{ item.totalLessons }}课时</p>
              <div class="course-progress">
                <div class="progress-bar"><div class="progress-fill" :style="{ width: item.progress + '%' }"></div></div>
                <span>{{ item.completedLessons }}/{{ item.totalLessons }} · {{ item.progress }}%</span>
              </div>
            </div>
            <button class="btn-study" @click="startStudyByEnrollment(item)">
              {{ item.progress === 100 ? '查看课程' : '继续学习' }}
            </button>
          </div>
        </div>
        <div v-else class="courses-empty">
          <div class="empty-icon">📚</div>
          <p>暂无已报名课程</p>
        </div>
      </div>
    </Modal>

    <!-- Study Modal：课时打卡，进度持久化 -->
    <Modal
      v-model="showStudyModal"
      :title="studyCourse?.name"
      :subtitle="studyEnrollment ? `已完成 ${studyEnrollment.completedLessons}/${studyEnrollment.totalLessons} 课时` : ''"
      size="medium"
      :show-footer="false"
    >
      <div v-if="studyCourse && studyEnrollment" class="study-content">
        <div class="study-summary">
          <div class="course-icon-small large">{{ studyCourse.icon }}</div>
          <div class="study-meta">
            <p>教练：{{ studyCourse.coach }} · {{ studyCourse.lessons }}</p>
            <div class="course-progress">
              <div class="progress-bar"><div class="progress-fill" :style="{ width: studyEnrollment.progress + '%' }"></div></div>
              <span>{{ studyEnrollment.progress }}%</span>
            </div>
            <p v-if="studyEnrollment.progress === 100" class="study-done">🎉 恭喜完成全部课时</p>
          </div>
        </div>
        <div class="lesson-list">
          <div
            v-for="(lesson, index) in studyLessons"
            :key="index"
            class="lesson-item"
            :class="{ done: index < studyEnrollment.completedLessons }"
            @click="toggleLesson(index)"
          >
            <span class="lesson-check">
              <svg v-if="index < studyEnrollment.completedLessons" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              <span v-else>{{ String(index + 1).padStart(2, '0') }}</span>
            </span>
            <span class="lesson-name">{{ lesson }}</span>
            <span class="lesson-state">{{ index < studyEnrollment.completedLessons ? '已完成' : (index === studyEnrollment.completedLessons ? '点击学习' : '未解锁') }}</span>
          </div>
        </div>
        <div class="study-footer">
          <button class="btn-view-tasks" @click="goToTasks">前往任务中心查看</button>
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
import { courseStore, parseLessons } from '../utils/courseStore'

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
      enrollResult: null,
      studyCourse: null,
      enrollments: [], // 报名记录（来自持久化存储）
      showToast: false,
      toastType: 'success',
      toastTitle: '',
      toastMessage: '',
      showLoginModal: false,
      pendingCourse: null,
      courses: [
        {
          id: 1,
          name: '台球入门基础课',
          icon: '🎯',
          level: '入门',
          duration: '4周',
          lessons: '8课时',
          students: 156,
          capacity: 160,
          price: 599,
          originalPrice: 799,
          description: '从零开始学习台球，掌握基本姿势、握杆方法和击球技巧，适合完全没有基础的新手',
          coach: '张明',
          coachTitle: '高级教练',
          coachBio: '10年教学经验，培养学员超过500人，擅长基础教学和纠正动作',
          gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          outline: ['台球基础知识介绍', '正确的站姿与握杆', '基本击球动作练习', '直线球练习', '简单角度球', '基础走位概念', '实战练习', '结业考核']
        },
        {
          id: 2,
          name: '斯诺克进阶训练',
          icon: '🎱',
          level: '进阶',
          duration: '6周',
          lessons: '12课时',
          students: 89,
          capacity: 100,
          price: 1299,
          originalPrice: 1599,
          description: '深入学习斯诺克战术布局，提升走位和防守能力，掌握高级杆法技巧',
          coach: '李强',
          coachTitle: '国家级教练',
          coachBio: '前省队选手，15年执教经验，多次带队获得全国比赛冠军',
          gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
          outline: ['斯诺克规则深度解析', '高级杆法：低杆与高杆', '塞球技术详解', '走位规划与执行', '防守策略', '清台技巧', '比赛心态调整', '模拟比赛训练', '连续得分训练', '围球技巧', '长台进攻', '结业实战']
        },
        {
          id: 3,
          name: '九球高级技巧',
          icon: '🏆',
          level: '高级',
          duration: '8周',
          lessons: '16课时',
          students: 45,
          capacity: 45,
          price: 1999,
          originalPrice: 2499,
          description: '掌握高级杆法、塞球技术和复杂局面处理，提升比赛实战能力',
          coach: '王磊',
          coachTitle: '职业选手',
          coachBio: '现役职业选手，全国九球锦标赛前八，擅长实战技巧教学',
          gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
          outline: ['九球比赛规则与策略', '开球技巧优化', '组合球与翻袋', '高级塞球应用', '困难球处理', '安全球战术', '关键球心理', '实战对抗训练', '跳球技术', '借力球', '清台路线', '防守反击', '冲球控制', '战术布局', '高压实战', '结业考核']
        },
        {
          id: 4,
          name: '比赛心理训练',
          icon: '🧠',
          level: '专业',
          duration: '3周',
          lessons: '6课时',
          students: 32,
          capacity: 40,
          price: 999,
          description: '提升比赛心理素质，学习压力管理和专注力训练，突破瓶颈期',
          coach: '赵芳',
          coachTitle: '运动心理师',
          coachBio: '国家认证运动心理咨询师，服务多支省级运动队',
          gradient: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
          outline: ['运动心理学基础', '压力与焦虑管理', '专注力训练方法', '比赛前心理准备', '失误后的心态调整', '建立自信心']
        }
      ]
    }
  },
  computed: {
    enrollmentMap() {
      const map = {}
      for (const item of this.enrollments) {
        map[item.courseId] = item
      }
      return map
    },
    myCourses() {
      return this.enrollments
    },
    enrollmentCount() {
      return this.enrollments.length
    },
    /** 课程名额表（随 enrollments 响应式更新，供模板直接使用） */
    quotaMap() {
      // 本地报名占用名额（基于响应式 enrollments 计算，报名后即时刷新）
      const localCounts = {}
      for (const e of this.enrollments) {
        localCounts[e.courseId] = (localCounts[e.courseId] || 0) + 1
      }
      const map = {}
      for (const course of this.courses) {
        map[course.id] = courseStore.getQuota(course, localCounts[course.id] || 0)
      }
      return map
    },
    selectedEnrollment() {
      return this.selectedCourse ? this.enrollmentMap[this.selectedCourse.id] || null : null
    },
    studyEnrollment() {
      return this.studyCourse ? this.enrollmentMap[this.studyCourse.id] || null : null
    },
    studyLessons() {
      if (!this.studyCourse) return []
      const total = parseLessons(this.studyCourse.lessons)
      const outline = this.studyCourse.outline || []
      const lessons = outline.slice(0, total).map(item => item)
      while (lessons.length < total) {
        lessons.push(`综合训练与指导 ${lessons.length + 1}`)
      }
      return lessons
    }
  },
  mounted() {
    // 进入页面先同步任务中心，修复历史重复/缺失的课程任务
    courseStore.syncTasks()
    // 从持久化存储读取报名记录（在同步写入后读取，保证首屏即一致）
    this.refreshEnrollments()
    this.handleRouteQuery()
  },
  methods: {
    /** 从持久化存储重新读取报名记录，离开再回来进度保持一致 */
    refreshEnrollments() {
      this.enrollments = courseStore.getAll()
    },
    handleRouteQuery() {
      const courseId = Number(this.$route.query.courseId)
      if (!courseId) return
      const course = this.courses.find(c => c.id === courseId)
      if (!course) return
      // 从任务中心进入：已报名直接继续学习，未报名则查看课程详情
      if (courseStore.hasEnrolled(courseId)) {
        this.openStudy(course)
      } else {
        this.openCourseDetail(course)
      }
    },
    getEnrollment(courseId) {
      return this.enrollmentMap[courseId] || null
    },
    openCourseDetail(course) {
      this.selectedCourse = course
      this.showDetailModal = true
    },
    openMyCourses() {
      if (!isAuthenticated()) {
        this.showLoginModal = true
        return
      }
      this.refreshEnrollments()
      this.showMyCoursesModal = true
    },
    openEnrollModal(course) {
      if (!isAuthenticated()) {
        this.pendingCourse = course
        this.showLoginModal = true
        return
      }
      // 重复报名：直接进入学习，不产生重复订单/任务
      if (courseStore.hasEnrolled(course.id)) {
        this.refreshEnrollments()
        this.openStudy(course)
        return
      }
      // 名额已满：禁止报名，不影响课程详情与价格展示
      if (courseStore.getQuota(course).isFull) {
        this.showNotification('warning', '名额已满', `「${course.name}」名额已满，可关注其他课程`)
        return
      }
      this.enrollCourse = course
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
    onEnrollCancel() {
      // 支付处理中关闭弹窗 = 取消支付：取消进行中的请求，不产生订单与任务
      if (this.enrollLoading && this.enrollCourse) {
        courseStore.cancelEnroll(this.enrollCourse.id)
      }
    },
    async confirmEnroll() {
      if (this.enrollLoading || !this.enrollCourse) return
      const course = this.enrollCourse

      // 二次防护：重复报名 / 名额已满
      if (courseStore.hasEnrolled(course.id)) {
        this.refreshEnrollments()
        this.showEnrollModal = false
        this.openStudy(course)
        return
      }
      if (courseStore.getQuota(course).isFull) {
        this.showEnrollModal = false
        this.showNotification('warning', '名额已满', `「${course.name}」名额已满`)
        return
      }

      this.enrollLoading = true
      const result = await courseStore.enroll(course)
      this.enrollLoading = false

      if (result.success) {
        this.refreshEnrollments()
        this.enrollResult = result.data
        this.showEnrollModal = false
        this.showSuccessModal = true
        if (result.duplicated) {
          this.showNotification('info', '您已报名该课程', '请勿重复报名，可直接继续学习')
        } else {
          this.showNotification('success', '报名成功', '订单与学习进度已同步到任务中心')
        }
        return
      }

      // 失败分支：均未产生订单/任务，进度不受影响
      if (result.code === 'full') {
        this.showEnrollModal = false
        this.showNotification('error', '名额已满', result.error || '该课程名额已满')
      } else if (result.code === 'cancelled') {
        this.showEnrollModal = false
        this.showNotification('info', '支付已取消', '未产生报名记录，可重新发起报名')
      } else if (result.code === 'payment_failed') {
        // 保留支付弹窗，允许直接重试（重试不会产生重复任务）
        this.showNotification('error', '支付失败', result.error || '请检查支付方式后重试')
      } else {
        this.showNotification('error', '报名失败', result.error || '请稍后重试')
      }
    },
    /** 成功反馈弹窗「开始学习」：直接进入对应课程的学习 */
    goToStudy() {
      this.showSuccessModal = false
      if (this.enrollResult) {
        const course = this.courses.find(c => c.id === this.enrollResult.courseId)
        if (course) this.openStudy(course)
      }
    },
    startStudyByCourse(course) {
      this.showDetailModal = false
      this.showMyCoursesModal = false
      this.openStudy(course)
    },
    startStudyByEnrollment(enrollment) {
      const course = this.courses.find(c => c.id === enrollment.courseId)
      if (course) {
        this.showMyCoursesModal = false
        this.openStudy(course)
      }
    },
    openStudy(course) {
      this.refreshEnrollments()
      if (!courseStore.hasEnrolled(course.id)) {
        this.showNotification('warning', '暂未报名', '请先完成课程报名')
        this.openCourseDetail(course)
        return
      }
      this.studyCourse = course
      this.showStudyModal = true
    },
    toggleLesson(index) {
      if (!this.studyCourse) return
      const enrollment = this.enrollmentMap[this.studyCourse.id]
      // 必须顺序学习：只允许操作当前待学习课时或回退已完成的最后一节
      if (index > enrollment.completedLessons) {
        this.showNotification('info', '请按顺序学习', '先完成前面的课时后再继续')
        return
      }
      const updated = courseStore.toggleLesson(this.studyCourse.id, index)
      if (updated) {
        this.refreshEnrollments()
        if (updated.progress === 100) {
          this.showNotification('success', '课时已完成', '恭喜！您已完成本课程全部课时')
        } else if (updated.completedLessons > enrollment.completedLessons) {
          this.showNotification('success', '学习进度已更新', `已完成 ${updated.completedLessons}/${updated.totalLessons} 课时`)
        }
      } else {
        this.showNotification('error', '进度保存失败', '请稍后重试')
      }
    },
    goToTasks() {
      this.showStudyModal = false
      this.$router.push('/tasks')
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

.btn-enroll:hover {
  box-shadow: 0 5px 20px var(--primary-glow);
}

.btn-enroll:hover svg {
  transform: translateX(3px);
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

.stat-label {
  font-size: 0.75rem;
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

.btn-enroll-large:hover {
  transform: scale(1.02);
  box-shadow: 0 8px 30px var(--primary-glow);
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
.course-icon-small { font-size: 2rem; width: 50px; height: 50px; background: var(--bg-card-hover); border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.course-icon-small.large { width: 56px; height: 56px; font-size: 2.2rem; }
.course-info-main { flex: 1; min-width: 0; }
.course-info-main h4 { font-size: 0.95rem; font-weight: 500; margin-bottom: 0.25rem; }
.course-info-main p { font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.5rem; }
.course-progress { display: flex; align-items: center; gap: 0.5rem; }
.progress-bar { flex: 1; height: 6px; background: rgba(255, 255, 255, 0.1); border-radius: 3px; overflow: hidden; }
.progress-fill { height: 100%; background: var(--gradient-1); border-radius: 3px; transition: width 0.3s; }
.course-progress span { font-size: 0.75rem; color: var(--text-muted); min-width: 72px; text-align: right; }
.btn-study { background: var(--gradient-1); border: none; color: var(--bg-dark); padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.8rem; font-weight: 600; cursor: pointer; transition: all 0.3s; flex-shrink: 0; }
.btn-study:hover { box-shadow: 0 4px 15px var(--primary-glow); }
.courses-empty { padding: 3rem; text-align: center; color: var(--text-muted); }
.courses-empty .empty-icon { font-size: 3rem; margin-bottom: 0.5rem; opacity: 0.5; }

/* 名额徽标 */
.quota-badge {
  position: absolute;
  top: 1rem;
  left: 1rem;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(10px);
  padding: 0.35rem 0.75rem;
  border-radius: 20px;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--primary);
}
.quota-badge.full { color: #ff9f43; }

/* 卡片已报名进度 */
.enrolled-progress { margin-bottom: 1.25rem; }
.progress-info { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem; }
.progress-label { font-size: 0.75rem; color: var(--text-secondary); }
.progress-text { font-size: 0.75rem; color: var(--primary); font-weight: 500; }

.btn-enroll.enrolled {
  background: rgba(0, 217, 165, 0.12);
  color: var(--primary);
  border: 1px solid rgba(0, 217, 165, 0.35);
}
.btn-enroll.full,
.btn-enroll-large.btn-full {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-muted);
  cursor: not-allowed;
  box-shadow: none;
}
.btn-enroll:disabled { opacity: 0.7; cursor: not-allowed; }

/* 详情弹窗中的进度 */
.detail-progress {
  padding: 1rem 1.25rem;
  background: rgba(0, 217, 165, 0.06);
  border: 1px solid rgba(0, 217, 165, 0.15);
  border-radius: 12px;
  margin-bottom: 1.5rem;
}
.stat-value.stat-full { color: #ff9f43; }

/* 支付提示 */
.pay-tip {
  font-size: 0.75rem;
  color: var(--text-muted);
  text-align: center;
  margin-top: 0.25rem;
}
.quota-full { color: #ff9f43; }

/* 我的课程入口按钮 */
.btn-my-courses {
  margin-top: 1.25rem;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  background: rgba(0, 217, 165, 0.1);
  border: 1px solid rgba(0, 217, 165, 0.3);
  color: var(--primary);
  padding: 0.6rem 1.25rem;
  border-radius: 50px;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
}
.btn-my-courses:hover { background: rgba(0, 217, 165, 0.18); }
.btn-my-courses svg { width: 16px; height: 16px; }
.my-courses-badge {
  background: var(--gradient-1);
  color: var(--bg-dark);
  min-width: 20px;
  height: 20px;
  border-radius: 10px;
  font-size: 0.72rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 6px;
}

/* 学习弹窗 */
.study-content { margin: -20px -24px; }
.study-summary {
  display: flex;
  gap: 1rem;
  align-items: center;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid var(--border);
}
.study-meta { flex: 1; }
.study-meta p { font-size: 0.82rem; color: var(--text-secondary); margin-bottom: 0.5rem; }
.study-done { color: var(--primary); font-weight: 600; margin-top: 0.5rem; }
.lesson-list { padding: 1rem 1.5rem; max-height: 360px; overflow-y: auto; }
.lesson-item {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  padding: 0.8rem 1rem;
  border-radius: 10px;
  margin-bottom: 0.5rem;
  background: rgba(255, 255, 255, 0.03);
  cursor: pointer;
  transition: all 0.2s;
}
.lesson-item:hover { background: rgba(255, 255, 255, 0.06); }
.lesson-item.done { background: rgba(0, 217, 165, 0.08); }
.lesson-check {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 1.5px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.72rem;
  color: var(--text-muted);
  flex-shrink: 0;
}
.lesson-item.done .lesson-check {
  background: var(--gradient-1);
  border-color: transparent;
  color: var(--bg-dark);
}
.lesson-check svg { width: 14px; height: 14px; }
.lesson-name { flex: 1; font-size: 0.88rem; }
.lesson-item.done .lesson-name { color: var(--primary); }
.lesson-state { font-size: 0.75rem; color: var(--text-muted); }
.lesson-item.done .lesson-state { color: var(--primary); }
.study-footer { padding: 0.75rem 1.5rem 1.25rem; text-align: center; }
.btn-view-tasks {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-secondary);
  padding: 0.6rem 1.5rem;
  border-radius: 10px;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.3s;
}
.btn-view-tasks:hover { border-color: var(--primary); color: var(--primary); }
</style>