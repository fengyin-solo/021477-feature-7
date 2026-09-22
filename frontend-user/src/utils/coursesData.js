/**
 * 课程目录数据源（Mock Data）
 *
 * 作为课程基础信息的单一数据源：Courses.vue 页面展示、报名名额计算、
 * 成功反馈与任务中心的课程信息均从这里读取，避免多处定义造成价格/名额不一致。
 *
 * 注意：
 * - capacity 为课程总名额（容量上限）
 * - students 为平台演示的历史报名基数（不含当前用户）
 * - 当前用户占用的名额由 courseStore 根据报名记录动态计算
 */

export const COURSES = [
  {
    id: 1,
    name: '台球入门基础课',
    icon: '🎯',
    level: '入门',
    duration: '4周',
    lessons: '8课时',
    lessonCount: 8,
    students: 155,
    capacity: 156,
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
    lessonCount: 12,
    students: 89,
    capacity: 120,
    price: 1299,
    originalPrice: 1599,
    description: '深入学习斯诺克战术布局，提升走位和防守能力，掌握高级杆法技巧',
    coach: '李强',
    coachTitle: '国家级教练',
    coachBio: '前省队选手，15年执教经验，多次带队获得全国比赛冠军',
    gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    outline: ['斯诺克规则深度解析', '高级杆法：低杆与高杆', '塞球技术详解', '走位规划与执行', '防守策略', '清台技巧', '比赛心态调整', '模拟比赛训练']
  },
  {
    id: 3,
    name: '九球高级技巧',
    icon: '🏆',
    level: '高级',
    duration: '8周',
    lessons: '16课时',
    lessonCount: 16,
    students: 45,
    capacity: 60,
    price: 1999,
    originalPrice: 2499,
    description: '掌握高级杆法、塞球技术和复杂局面处理，提升比赛实战能力',
    coach: '王磊',
    coachTitle: '职业选手',
    coachBio: '现役职业选手，全国九球锦标赛前八，擅长实战技巧教学',
    gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    outline: ['九球比赛规则与策略', '开球技巧优化', '组合球与翻袋', '高级塞球应用', '困难球处理', '安全球战术', '关键球心理', '实战对抗训练']
  },
  {
    id: 4,
    name: '比赛心理训练',
    icon: '🧠',
    level: '专业',
    duration: '3周',
    lessons: '6课时',
    lessonCount: 6,
    students: 40,
    capacity: 40,
    price: 999,
    originalPrice: null,
    description: '提升比赛心理素质，学习压力管理和专注力训练，突破瓶颈期',
    coach: '赵芳',
    coachTitle: '运动心理师',
    coachBio: '国家认证运动心理咨询师，服务多支省级运动队',
    gradient: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    outline: ['运动心理学基础', '压力与焦虑管理', '专注力训练方法', '比赛前心理准备', '失误后的心态调整', '建立自信心']
  }
]

/**
 * 按 ID 获取课程
 * @param {number|string} courseId
 * @returns {Object|null}
 */
export function getCourseById(courseId) {
  const id = Number(courseId)
  return COURSES.find(c => c.id === id) || null
}

export default COURSES
