/* Buildless static prototype. All business data stays in this browser. */
const $ = (s, root = document) => root.querySelector(s);
const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const icons = {
  arch: 'M3 20V9h18v11M2 9l10-6 10 6M6 9V6m12 3V6M8 20v-7h8v7M3 12h5m8 0h5M6 3v3m12-3v3M1 20h22',
  search: 'm20 20-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
  plus: 'M12 5v14M5 12h14',
  arrow: 'M5 12h14m-5-5 5 5-5 5',
  clock: 'M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  pin: 'M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0M14 10a2 2 0 1 1-4 0 2 2 0 0 1 4 0',
  users:
    'M15 21v-3a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v3m18 0v-3a4 4 0 0 0-3-4M13 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0m3-4a4 4 0 0 1 0 8',
  bookmark: 'M6 3h12v18l-6-4-6 4V3',
  close: 'm6 6 12 12M6 18 18 6',
  chevron: 'm8 10 4 4 4-4',
  filter: 'M4 5h16M7 12h10m-7 7h4',
  check: 'm5 12 4 4L19 6',
  file: 'M14 2H5v20h14V7l-5-5v5h5M8 12h8m-8 4h6',
  edit: 'm15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14v6',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
  grid: 'M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z',
  user: 'M20 21v-2a7 7 0 0 0-14 0v2M17 7a5 5 0 1 1-10 0 5 5 0 0 1 10 0',
  leaf: 'M20 3S4 1 4 12a7 7 0 0 0 11 6c5-4 5-15 5-15M5 20 16 9',
  shield: 'm12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4m-4 9 3 3 5-5',
  logout: 'M9 3H3v18h6m6-14 5 5-5 5M8 12h12',
  back: 'm14 6-6 6 6 6',
  book: 'M3 3h7l2 2 2-2h7v17h-7l-2 2-2-2H3V3m9 2v17',
};
const icon = (name) =>
  `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${(icons[name] || icons.file)
    .split('~')
    .map((d) => `<path d="${d}"/>`)
    .join('')}</svg>`;
const cats = ['全部', '学科竞赛', '课程项目', '科研学术', '社团活动', '运动生活', '创意开发'];
const catColor = {
  学科竞赛: '',
  课程项目: 'blue',
  科研学术: 'gold',
  社团活动: 'rose',
  运动生活: 'green',
  创意开发: 'blue',
};
const storeKey = 'campuscrew-prototype-v1';
const passwordDigest = async (value) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))))
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
const now = Date.now();
const future = (days) => new Date(now + days * 86400000).toISOString().slice(0, 16);
const past = (days) => new Date(now - days * 86400000).toISOString();
const position = (id, name, count, skills, description) => ({
  id,
  name,
  count,
  skills,
  description,
});
function seed() {
  return {
    users: [
      {
        id: 'lin',
        name: '林知夏',
        email: 'lin@example.edu',
        dept: '计算机科学与技术系',
        grade: '2024 级本科生',
        bio: '喜欢把想法变成真实的作品。关注人机交互与校园生活，期待与你一起做点有趣的事。',
        skills: '前端开发,交互设计,摄影',
        avatar: '',
      },
      {
        id: 'zhou',
        name: '周予安',
        email: 'zhou@example.edu',
        dept: '自动化系',
        grade: '2023 级本科生',
        bio: '热爱算法，也热爱操场。希望在跨学科合作中认识更多朋友。',
        skills: 'Python,数学建模,羽毛球',
        avatar: '',
      },
      {
        id: 'chen',
        name: '陈以宁',
        dept: '美术学院',
        grade: '2024 级本科生',
        skills: '视觉设计,摄影',
      },
      {
        id: 'xu',
        name: '许清和',
        dept: '经济管理学院',
        grade: '2023 级本科生',
        skills: '数据分析,学术写作',
      },
    ],
    posts: [
      {
        id: 'r1',
        owner: 'zhou',
        title: '一起挑战美赛，寻找热爱建模的你',
        category: '学科竞赛',
        description:
          '准备参加 2027 年美国大学生数学建模竞赛，希望找到两位认真投入、互相补位的伙伴。不要求你经验丰富，但期待我们有共同的热情。\n\n我们会在赛前每周安排一次讨论，一起完成历年题练习。希望你有稳定的时间投入，也愿意主动交流自己的想法。\n\n从一道题开始，一起把复杂的问题想明白。',
        tags: ['数学建模', 'MCM/ICM', '跨学科'],
        location: '六教 / 线上',
        activity: '2026-11-15 14:00',
        deadline: future(12),
        created: past(0.4),
        status: 'open',
        positions: [
          position(
            'p11',
            '算法与编程',
            1,
            ['Python', 'MATLAB'],
            '负责模型实现与结果可视化，熟悉一种编程语言即可。',
          ),
          position(
            'p12',
            '论文写作',
            1,
            ['学术写作', '英语'],
            '梳理模型思路，参与英文论文撰写和排版。',
          ),
        ],
      },
      {
        id: 'r2',
        owner: 'lin',
        title: '用设计连接校园：校园活动组队平台',
        category: '课程项目',
        description:
          '软件工程课程项目，想和你一起解决校园里“有想法，却找不到伙伴”的小问题。我们正在开发一个面向清华同学的组队平台。\n\n目前已完成需求分析，接下来将进入原型和开发阶段。每周线下讨论一次，其他时间灵活协作。期待愿意认真打磨产品细节的同学加入。',
        tags: ['软件工程', 'Web 开发', '产品设计'],
        location: '东主楼',
        activity: '2026-11-08 15:00',
        deadline: future(8),
        created: past(0.8),
        status: 'open',
        positions: [
          position('p21', '后端开发', 2, ['Python', 'FastAPI'], '参与接口设计与核心业务逻辑开发。'),
          position(
            'p22',
            '交互与视觉设计',
            1,
            ['Figma', 'UI 设计'],
            '一起完善页面原型和视觉规范。',
          ),
        ],
      },
      {
        id: 'r3',
        owner: 'chen',
        title: '把秋天留在镜头里，校园漫步摄影计划',
        category: '社团活动',
        description:
          '银杏渐黄，想约几位同学一起在校园走走，用镜头记录这个秋天。\n\n从二校门出发，经过大礼堂、水木清华，到近春园。相机和手机都可以，欢迎第一次尝试摄影的你。活动结束后自愿分享照片。',
        tags: ['校园摄影', '秋日漫步', '零基础友好'],
        location: '二校门集合',
        activity: '2026-11-02 15:30',
        deadline: future(3),
        created: past(1.2),
        status: 'open',
        positions: [position('p31', '摄影同伴', 4, ['摄影'], '带上相机或手机，以及发现美的眼睛。')],
      },
      {
        id: 'r4',
        owner: 'xu',
        title: '“AI 与社会”跨学科读书小组招募',
        category: '科研学术',
        description:
          '当技术走进日常，我们如何理解它带来的改变？邀请来自不同专业的同学，每两周共读一篇论文或一本书的章节。\n\n不追求标准答案，重视有依据的讨论和不同学科的视角。第一次从人工智能与教育公平开始。',
        tags: ['人工智能', '跨学科', '读书交流'],
        location: '图书馆研讨间',
        activity: '2026-11-09 19:00',
        deadline: future(9),
        created: past(2),
        status: 'open',
        positions: [
          position('p41', '共读伙伴', 5, ['阅读', '交流'], '每期阅读材料并分享自己的观察。'),
        ],
      },
      {
        id: 'r5',
        owner: 'zhou',
        title: '周末羽毛球搭子，来一场轻松的双打',
        category: '运动生活',
        description:
          '周末下午想约一场羽毛球，强度适中，开心运动。不限制水平，带好球拍和运动鞋就可以。',
        tags: ['羽毛球', '周末运动'],
        location: '气膜体育馆',
        activity: '2026-11-01 16:00',
        deadline: future(2),
        created: past(2.3),
        status: 'open',
        positions: [position('p51', '双打球友', 3, ['羽毛球'], '喜欢运动，准时赴约。')],
      },
      {
        id: 'r6',
        owner: 'lin',
        title: '做一个有温度的校园地图',
        category: '创意开发',
        description:
          '想记录大家心中的校园角落：适合读书的树荫、深夜的灯光和好吃的食堂窗口。上一轮原型组队已经完成，保留此记录供回看。',
        tags: ['校园地图', '交互设计'],
        location: '线上',
        deadline: future(-4),
        created: past(18),
        status: 'ended',
        endReason: 'filled',
        positions: [position('p61', '开发伙伴', 1, ['JavaScript'], '一起完成交互地图。')],
      },
    ],
    applications: [
      {
        id: 'a1',
        post: 'r2',
        position: 'p21',
        user: 'zhou',
        message: '熟悉 Python，做过 FastAPI 小项目，希望负责后端开发。每周可以投入 8 小时。',
        status: 'pending',
        created: past(0.2),
        history: [{ text: '提交申请，等待审核', time: past(0.2) }],
      },
      {
        id: 'a2',
        post: 'r2',
        position: 'p22',
        user: 'zhou',
        message: '也很希望参与交互设计，愿意和大家一起打磨原型。',
        status: 'pending',
        created: past(0.15),
        history: [{ text: '提交申请，等待审核', time: past(0.15) }],
      },
      {
        id: 'a3',
        post: 'r2',
        position: 'p22',
        user: 'chen',
        message: '有 Figma 原型设计经验，希望参与视觉设计。',
        status: 'pending',
        created: past(0.1),
        history: [{ text: '提交申请，等待审核', time: past(0.1) }],
      },
      {
        id: 'a4',
        post: 'r1',
        position: 'p12',
        user: 'lin',
        message: '喜欢梳理问题和写作，希望一起备赛。',
        status: 'pending',
        created: past(0.3),
        history: [{ text: '提交申请，等待审核', time: past(0.3) }],
      },
      {
        id: 'a5',
        post: 'r6',
        position: 'p61',
        user: 'zhou',
        message: '期待一起制作校园地图。',
        status: 'accepted',
        created: past(12),
        history: [
          { text: '提交申请', time: past(12) },
          { text: '申请通过', time: past(10) },
        ],
      },
    ],
    drafts: [],
    favorites: { lin: ['r1', 'r3'], zhou: ['r2'] },
    notifications: [],
    session: null,
  };
}
// Persisted demo records and transient view settings are kept separate so filters do not overwrite data.
let db;
try {
  db = JSON.parse(localStorage.getItem(storeKey));
  if (!db?.posts || !db?.users) db = seed();
} catch {
  db = seed();
}
let ui = {
  category: '全部',
  query: '',
  sort: 'latest',
  advanced: false,
  tag: '',
  place: '',
  from: '',
  to: '',
  only: false,
  page: 1,
  manageTab: 'published',
  applicationTab: 'all',
  profileTab: 'profile',
  reviewPosition: 'all',
  reviewStatus: 'all',
  notices: false,
  authMode: 'login',
  returnTo: '',
  pendingAuth: null,
};
let toastTimer;
let lastFocus;
const user = () => db.users.find((u) => u.id === db.session);
const getPost = (id) => db.posts.find((p) => p.id === id);
const getPosition = (post, id) => post?.positions.find((p) => p.id === id);
const getUser = (id) => db.users.find((u) => u.id === id) || { name: '已注销用户' };
const accepted = (post, pid) =>
  db.applications.filter((a) => a.post === post.id && a.position === pid && a.status === 'accepted')
    .length;
const totalAccepted = (post) => post.positions.reduce((sum, p) => sum + accepted(post, p.id), 0);
// One person may apply to several roles in a post, but the public count represents people.
const pendingApplicants = (post) =>
  new Set(
    db.applications
      .filter((application) => application.post === post.id && application.status === 'pending')
      .map((application) => application.user),
  ).size;

// Only absolute web links are rendered as clickable links in user supplied optional fields.
function safeUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function optionalText(label, value) {
  return value
    ? `<div class="extra-item"><strong>${label}</strong><p class="prose">${esc(value)}</p></div>`
    : '';
}

function optionalLink(label, value, linkText) {
  const url = safeUrl(value);
  return url
    ? `<div class="extra-item"><strong>${label}</strong><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${linkText} ${icon('arrow')}</a></div>`
    : '';
}

function recruitmentExtras(post) {
  const rows = [
    optionalText('赛事或活动介绍', post.eventIntro),
    optionalText('导师介绍', post.mentorIntro),
    optionalText('预期成果', post.expectedOutcome),
    optionalText('附件说明', post.attachmentDescription),
    optionalLink('参考附件', post.attachmentUrl, '查看附件'),
    optionalLink('活动页面', post.activityUrl, '打开活动页面'),
    optionalText('联系招募者', post.contact),
  ].filter(Boolean);
  return rows.length
    ? `<div class="panel"><h2 class="section-title">更多信息</h2><div class="extra-list">${rows.join('')}</div></div>`
    : '';
}

function applicationExtras(application) {
  const rows = [
    optionalText('相关经历', application.experience),
    optionalText('可投入时间', application.availability),
    optionalText('联系方式', application.contact),
    optionalLink('简历', application.resumeUrl, '查看简历'),
    optionalLink('作品集', application.portfolioUrl, '查看作品集'),
  ].filter(Boolean);
  return rows.length ? `<div class="application-extras">${rows.join('')}</div>` : '';
}
const capacity = (post) => post.positions.reduce((sum, p) => sum + Number(p.count), 0);
const isOpen = (post) => post.status === 'open' && new Date(post.deadline) > new Date();
const fmt = (date, time = false) =>
  new Date(date).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    ...(time ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
const dateText = (date) =>
  new Date(date).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
const statusNames = {
  pending: '待审核',
  accepted: '已通过',
  not_passed: '未通过',
  withdrawn: '已撤回',
  expired: '已过期',
};
function save() {
  try {
    localStorage.setItem(storeKey, JSON.stringify(db));
  } catch {
    toast('浏览器存储空间不足，本次更改仅在当前页面保留');
  }
}
function notify(uid, title, body, link) {
  db.notifications.unshift({
    id: crypto.randomUUID(),
    user: uid,
    title,
    body,
    link,
    time: new Date().toISOString(),
    read: false,
  });
}
// A deadline closes pending applications once; accepted results remain part of the history.
function expirePosts() {
  let changed = false;
  db.posts.forEach((p) => {
    if (p.status === 'open' && !isOpen(p)) {
      p.status = 'ended';
      p.endReason = 'expired';
      db.applications
        .filter((a) => a.post === p.id && a.status === 'pending')
        .forEach((a) => {
          changeApplication(a, 'expired', '招募截止，申请已过期');
          notify(
            a.user,
            '申请已过期',
            `「${p.title}」已截止，你的待审申请已过期。`,
            '/applications',
          );
        });
      changed = true;
    }
  });
  if (changed) save();
}
function changeApplication(a, status, reason) {
  a.status = status;
  a.reason = reason;
  a.history.push({ text: reason, time: new Date().toISOString() });
}
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}
function go(path) {
  ui.notices = false;
  closeModal();
  if (location.hash === '#' + path) {
    render();
    window.scrollTo(0, 0);
  } else location.hash = path;
}
function requireUser(path) {
  if (user()) return true;
  ui.returnTo = path || location.hash.slice(1) || '/discover';
  go('/auth');
  return false;
}
function avatar(u, cls = '') {
  return u.avatar
    ? `<img class="avatar ${cls}" src="${esc(u.avatar)}" alt="${esc(u.name)}的头像">`
    : `<span class="avatar ${cls} ${u.id === 'zhou' ? 'green' : u.id === 'xu' ? 'gold' : ''}">${esc(u.name?.slice(-2))}</span>`;
}
function badge(p) {
  return `<span class="badge ${catColor[p.category] || ''}">${esc(p.category)}</span>`;
}
function postStatus(p) {
  return isOpen(p)
    ? '<span class="status">招募中</span>'
    : `<span class="status ended">${{ filled: '已招满', expired: '已截止', manual: '提前结束' }[p.endReason] || '已结束'}</span>`;
}
function appBadge(a) {
  const color = {
    pending: 'gold',
    accepted: 'green',
    not_passed: 'rose',
    withdrawn: 'gray',
    expired: 'gray',
  }[a.status];
  return `<span class="badge ${color}">${statusNames[a.status] || esc(a.status)}</span>`;
}
function empty(title, description, action = '') {
  return `<div class="empty">${icon('leaf')}<h3>${title}</h3><p>${description}</p>${action}</div>`;
}
function intro(label, title, sub, action = '') {
  return `<div class="page-intro"><div><div class="eyebrow">${label}</div><h1>${title}</h1><p>${sub}</p></div>${action}</div>`;
}
function header(route) {
  const links = [
    ['/discover', '发现组队', 'grid'],
    ['/publish', '发布招募', 'plus'],
    ['/manage', '我的招募', 'file'],
    ['/applications', '我的申请', 'book'],
    ['/profile', '个人中心', 'user'],
  ];
  const u = user();
  const unread = db.notifications.filter((n) => n.user === db.session && !n.read).length;
  return `<header class="topbar"><div class="nav-wrap"><a href="#/discover" class="brand" aria-label="CampusCrew 首页"><span class="brand-seal">${icon('arch')}</span><span><span class="brand-name">CampusCrew</span><div class="brand-sub">清华大学 · 校园组队</div></span></a><nav class="main-nav" aria-label="主导航">${links.map(([url, label, i]) => `<a class="nav-link ${route === url || (url === '/manage' && route.startsWith('/review')) ? 'active' : ''}" href="#${url}"><span class="mobile-label">${icon(i)}</span>${label}</a>`).join('')}</nav><div class="nav-right"><button class="icon-btn" data-action="notices" aria-label="系统通知${unread ? '，' + unread + '条未读' : ''}">${icon('bell')}${unread ? '<span class="unread-dot"></span>' : ''}</button>${u ? `<a class="account" href="#/profile">${avatar(u)}<span class="account-name">${esc(u.name)}</span></a>` : '<a class="btn primary small" href="#/auth">登录 / 注册</a>'}</div></div></header>`;
}
function footer() {
  return `<footer class="footer"><span>CampusCrew <span style="margin:0 9px;color:#d1c6d8">/</span> 让每一个想法，都有同行者。</span><span>清华校园组队 · 静态交互原型 · 数据仅保存在当前浏览器　<button data-action="reset-demo" class="text-btn" style="font-size:10px">恢复初始演示</button></span></footer>`;
}
function building() {
  return `<svg class="hero-building" viewBox="0 0 520 250" fill="none" stroke="currentColor" stroke-width="1"><path d="M0 235h520M32 220h456M58 211h407M75 93h370v118H75zM65 93h390l-18-9H83l-18 9M113 84V66h294v18M103 66h314l-20-10H123zM142 56V40h236v16M131 40h258l-18-8H149zM242 32V17h30v15M236 17h42M155 84v127m210-127v127M160 90h200M174 211v-56a36 36 0 0 1 72 0v56m30 0v-56a36 36 0 0 1 72 0v56M178 153h63m40 0h63M249 105h24v106M84 110h59v76H84zm293 0h59v76h-59M97 110v76m13-76v76m14-76v76m266-76v76m14-76v76m13-76v76M75 193h77m216 0h77M60 211v-95m398 95v-95M65 116H47l-15 7v96m433-103h17l15 8v94M27 217h35m397 0h44M182 70h155M183 72v8m14-8v8m14-8v8m14-8v8m14-8v8m14-8v8m14-8v8m14-8v8m14-8v8m14-8v8m14-8v8M173 48h175M16 235l-5-40m0 6-10-14m11 26 17-18m480 36 5-48m-3 22-16-18m18 7 8-18"/><text x="259" y="53" fill="currentColor" stroke="none" font-size="9" text-anchor="middle" letter-spacing="7">清 華 園</text><circle cx="210" cy="175" r="1.5"/><circle cx="312" cy="175" r="1.5"/></svg>`;
}
function hero() {
  return `<section class="hero"><div class="hero-copy"><div class="eyebrow">MEET YOUR PEOPLE. MAKE THINGS HAPPEN.</div><h1><span>好的想法，</span><span>值得一起实现。</span></h1><p><span>在清华，找到志同道合的伙伴，</span><span>让热爱不止于想象。</span></p><div class="hero-bottom"><span>${icon('shield')} 校园身份认证</span><span>${icon('users')} 跨学科同行</span><span>${icon('leaf')} 从一个想法开始</span></div></div>${building()}<span class="hero-inscription">自强不息　厚德载物</span></section>`;
}
function recruitmentCard(p) {
  const owner = getUser(p.owner);
  const saved = user() && (db.favorites[db.session] || []).includes(p.id);
  return `<article class="recruit-card"><div class="card-top">${badge(p)}${postStatus(p)}</div><h3><a href="#/detail/${p.id}">${esc(p.title)}</a></h3><p class="card-description">${esc(p.description.split('\n')[0])}</p><div class="tags">${p.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div><div class="card-meta"><span>${icon('users')}${pendingApplicants(p)} 人申请中</span><span>${icon('check')}${totalAccepted(p)} / ${capacity(p)} 名已录取</span><span>${icon('pin')}${esc(p.location || '地点待定')}</span><span>${icon('clock')}${fmt(p.deadline)} 截止</span></div><div class="card-bottom"><div class="person-line">${avatar(owner)}${esc(owner.name)}${user() ? `<span style="color:#b5adbb">· ${esc(owner.dept || '清华同学')}</span>` : ''}</div><div class="card-right"><a href="#/detail/${p.id}" class="text-btn">查看招募 ${icon('arrow')}</a><button class="icon-btn favorite-btn ${saved ? 'saved' : ''}" data-action="favorite" data-id="${p.id}" aria-label="${saved ? '取消收藏' : '收藏'}${esc(p.title)}">${icon('bookmark')}</button></div></div></article>`;
}
function discover() {
  let posts = db.posts.filter(isOpen);
  const q = ui.query.trim().toLowerCase();
  posts = posts.filter(
    (p) =>
      (ui.category === '全部' || p.category === ui.category) &&
      (!q || (p.title + p.description + p.tags.join()).toLowerCase().includes(q)) &&
      (!ui.tag ||
        p.tags
          .concat(p.positions.flatMap((x) => x.skills))
          .join()
          .toLowerCase()
          .includes(ui.tag.toLowerCase())) &&
      (!ui.place || p.location.includes(ui.place)) &&
      (!ui.from || new Date(p.deadline) >= new Date(ui.from)) &&
      (!ui.to || new Date(p.deadline) <= new Date(ui.to + 'T23:59:59')) &&
      (!ui.only || totalAccepted(p) < capacity(p)),
  );
  posts.sort((a, b) =>
    ui.sort === 'deadline'
      ? new Date(a.deadline) - new Date(b.deadline)
      : new Date(b.created) - new Date(a.created),
  );
  const pages = Math.max(1, Math.ceil(posts.length / 4));
  ui.page = Math.min(ui.page, pages);
  return `${hero()}<div class="discover-layout"><section><form class="search-box" id="search-form">${icon('search')}<label class="sr-only" for="search">搜索招募</label><input id="search" name="query" placeholder="搜索你感兴趣的项目、技能或关键词…" value="${esc(ui.query)}"><button class="btn primary" type="submit">搜索</button></form><div class="filters"><div class="category-row"><span class="filter-label">分类</span>${cats.map((c) => `<button class="chip ${ui.category === c ? 'active' : ''}" data-action="category" data-value="${c}">${c}</button>`).join('')}<button class="advanced-toggle" data-action="advanced" aria-expanded="${ui.advanced}">${icon('filter')} 筛选</button></div>${ui.advanced ? `<form class="advanced" id="advanced-form"><label>标签<input name="tag" placeholder="如 Python" value="${esc(ui.tag)}"></label><label>活动地点<input name="place" placeholder="地点关键词" value="${esc(ui.place)}"></label><label>截止起始<input name="from" type="date" value="${esc(ui.from)}"></label><label>截止结束<input name="to" type="date" value="${esc(ui.to)}"></label><label class="check"><input type="checkbox" name="only" ${ui.only ? 'checked' : ''}>仍可申请</label><button class="btn small" type="submit">应用</button><button class="text-btn" type="button" data-action="clear-filters">清空筛选</button></form>` : ''}</div><div class="results-bar"><span>发现 <strong>${posts.length}</strong> 个招募${ui.query ? ` · “${esc(ui.query)}”` : ''}</span><label>排序：<select id="sort" class="sort-select" aria-label="招募排序"><option value="latest" ${ui.sort === 'latest' ? 'selected' : ''}>最新发布</option><option value="deadline" ${ui.sort === 'deadline' ? 'selected' : ''}>即将截止</option></select></label></div><div class="cards">${
    posts.length
      ? posts
          .slice((ui.page - 1) * 4, ui.page * 4)
          .map(recruitmentCard)
          .join('')
      : empty(
          '暂时没有匹配的招募',
          '换一个关键词，或清空筛选试试看。',
          '<button class="btn soft" data-action="clear-filters">清空筛选</button>',
        )
  }</div>${pages > 1 ? `<div class="pagination">${Array.from({ length: pages }, (_, i) => `<button class="${ui.page === i + 1 ? 'active' : ''}" data-action="page" data-value="${i + 1}" aria-label="第${i + 1}页">${i + 1}</button>`).join('')}</div>` : ''}</section><aside><div class="side-panel side-welcome"><div class="small-label">YOUR NEXT CHAPTER</div><h3>故事，从你发起。</h3><p>一个有趣的课题，一场期待的比赛，<br>或者一次说走就走的校园漫步。<br>把想法写下来，伙伴就在身边。</p><a class="btn primary" href="#/publish">${icon('plus')} 发起我的招募</a></div><div class="side-panel"><h3>${icon('leaf')} 组队，只需三步</h3><ol class="steps"><li><span class="step-num">01</span><div><strong>发现感兴趣的招募</strong><small>按方向与技能寻找合适的机会</small></div></li><li><span class="step-num">02</span><div><strong>申请适合你的岗位</strong><small>说说你的想法，等待发布者回应</small></div></li><li><span class="step-num">03</span><div><strong>找到伙伴，一起出发</strong><small>在申请记录中查看组队结果</small></div></li></ol></div><div class="side-panel"><h3>${icon('bookmark')} 探索这些方向</h3><div class="topic-list">${['Python', '产品设计', '数学建模', '摄影', '人工智能', '羽毛球'].map((t) => `<button data-action="topic" data-value="${t}"># ${t}</button>`).join('')}</div></div><div class="side-quote">「独行快，众行远。」<span>FIND YOUR CREW AT TSINGHUA</span></div></aside></div>`;
}
function detail(id) {
  const p = getPost(id);
  if (!p) return unavailable();
  const own = p.owner === db.session;
  const owner = getUser(p.owner);
  return `<div class="breadcrumbs"><a href="#/discover">发现组队</a>${icon('chevron')}<span>招募详情</span></div><div class="detail-layout"><section><div class="panel"><div class="card-top">${badge(p)}${postStatus(p)}</div><h1 class="detail-title">${esc(p.title)}</h1><div class="tags">${p.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div><div class="detail-info"><span>${icon('clock')}${dateText(p.deadline)} 截止</span><span>${icon('pin')}${esc(p.location || '地点待定')}</span><span>${icon('users')}${pendingApplicants(p)} 人申请中</span><span>${icon('check')}${totalAccepted(p)} / ${capacity(p)} 已录取</span></div>${p.activity ? `<div class="note">活动时间：${dateText(p.activity)} ${fmt(p.activity, true).split(' ').pop()}　·　招募截止与活动时间分别计算</div>` : ''}${!isOpen(p) ? `<div class="note warning">本招募${{ filled: '已招满', expired: '已截止', manual: '已提前结束' }[p.endReason] || '已结束'}，录取结果已锁定，历史详情仍可回看。</div>` : ''}<div class="divider"></div><h2 class="section-title">关于这次招募</h2><div class="prose">${esc(p.description)}</div></div>${recruitmentExtras(p)}<div class="panel"><h2 class="section-title">寻找这样的你 <span class="subtle">${p.positions.length} 个岗位</span></h2>${p.positions
    .map((pos) => {
      const count = accepted(p, pos.id),
        full = count >= pos.count;
      const a = db.applications.find(
        (a) =>
          a.post === p.id &&
          a.position === pos.id &&
          a.user === db.session &&
          a.status === 'pending',
      );
      const already = db.applications.some(
        (a) => a.post === p.id && a.user === db.session && a.status === 'accepted',
      );
      return `<article class="position"><div class="position-head"><h3>${esc(pos.name)}</h3><span class="subtle">已录取 <strong style="color:var(--purple)">${count}</strong> / ${pos.count} 名</span></div><p>${esc(pos.description || '欢迎感兴趣的同学申请。')}</p><div class="progress"><span style="width:${Math.min(100, (count / pos.count) * 100)}%"></span></div><div class="position-bottom"><div class="tags">${pos.skills.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>${own ? `<a href="#/review/${p.id}" class="btn soft small">管理申请</a>` : !isOpen(p) ? '<button class="btn small" disabled>招募已结束</button>' : already ? '<span class="badge green">你已在此招募录取</span>' : a ? '<a href="#/applications" class="btn soft small">已申请 · 查看进度</a>' : full ? '<button class="btn small" disabled>岗位已满</button>' : `<button class="btn primary small" data-action="apply" data-id="${p.id}" data-position="${pos.id}">申请此岗位 ${icon('arrow')}</button>`}</div></article>`;
    })
    .join(
      '',
    )}<p class="subtle">可以分别申请不同岗位；同一招募最终只占一个岗位名额。</p></div></section><aside><div class="side-panel profile-publisher"><span class="eyebrow" style="color:var(--muted)">PUBLISHED BY</span><div style="margin-top:22px">${avatar(owner, 'large')}</div><h3>${esc(owner.name)}</h3>${user() ? `<p>${esc(owner.dept || '清华同学')}<br>${esc(owner.grade || '校园认证用户')}</p>` : '<p>登录并完成校园认证后参与组队</p>'}<div class="divider"></div><div class="subtle">发布于 ${dateText(p.created)}</div>${own ? `<a href="#/publish/${p.id}" class="btn soft">${icon('edit')} 编辑招募</a><a href="#/review/${p.id}" class="btn primary">管理申请 ${icon('arrow')}</a>` : `<button class="btn ${(db.favorites[db.session] || []).includes(id) ? 'soft' : ''}" data-action="favorite" data-id="${id}">${icon('bookmark')} ${(db.favorites[db.session] || []).includes(id) ? '已收藏 · 取消收藏' : '收藏这个招募'}</button>`}</div><div class="side-panel"><h3>${icon('shield')} 组队小提示</h3><p>申请时可以简要介绍你的能力、时间安排和参与想法，让彼此更了解。</p><p>请认真考虑自己的时间投入，珍惜每一次合作的机会。</p></div></aside></div>`;
}
function unavailable() {
  return `<div style="padding-top:45px">${empty('此内容暂不可查看', '内容可能不存在，或当前账号没有访问权限。', '<a href="#/discover" class="btn primary">回到发现组队</a>')}</div>`;
}
function authPage() {
  const mode = ui.authMode;
  const register = mode === 'register';
  return `<div class="auth-page"><div class="auth-art"><div class="eyebrow">A PLACE TO BELONG</div><h2>在这里，<br>让想法找到同行者。</h2><p>一场竞赛，一次探索，一个小小的创意。<br>与你志同道合的人，也许就在隔壁课堂。</p><div style="margin-top:35px;opacity:.65">${icon('arch')}　清华校园 · 跨学科同行</div></div><section class="auth-form"><div class="auth-logo">CampusCrew</div><h1>${mode === 'verify' ? '验证校园身份' : '你好，清华同学'}</h1><p class="subtle">${mode === 'verify' ? '完成邮箱验证，开始你的组队之旅。' : '用校园身份，连接每一个值得一起实现的想法。'}</p>${mode !== 'verify' ? `<div class="tabs"><button class="tab ${!register ? 'active' : ''}" data-action="auth-mode" data-value="login">登录</button><button class="tab ${register ? 'active' : ''}" data-action="auth-mode" data-value="register">注册</button></div>` : ''}<form id="auth-form">${register ? '<div class="field"><label for="nickname">昵称</label><input id="nickname" name="nickname" required placeholder="希望大家如何称呼你"></div>' : ''}${mode !== 'verify' ? `<div class="field"><label for="email">校园邮箱</label><input id="email" name="email" type="email" required autocomplete="email" placeholder="输入你的校园邮箱"></div><div class="field"><label for="password">密码</label><input id="password" name="password" type="password" required minlength="6" autocomplete="${register ? 'new-password' : 'current-password'}" placeholder="至少 6 位字符"></div>` : `<div class="note">验证邮箱：${esc(ui.pendingAuth?.email)}<br>静态演示验证码：<strong>123456</strong>（不会发送真实邮件）</div><div class="field"><label for="code">邮件验证码</label><div style="display:flex;gap:8px"><input id="code" name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required placeholder="6 位验证码"><button class="btn small" type="button" data-action="resend">重新发送</button></div></div>`}<div id="auth-error"></div><button class="btn primary full" type="submit">${mode === 'verify' ? '验证并进入校园' : 'login' === mode ? '登录' : '注册并验证邮箱'} ${icon('arrow')}</button></form><div class="auth-examples">静态体验：lin@example.edu / zhou@example.edu，密码 campus123。请勿使用真实密码。<div><button data-action="demo-login" data-id="lin">以林知夏体验 · 发布者</button><button data-action="demo-login" data-id="zhou">以周予安体验 · 申请者</button></div></div></section></div>`;
}
function positionFields(pos, index, locked) {
  return `<div class="position-form" data-position-id="${esc(pos.id || '')}"><header><span>岗位 ${String(index + 1).padStart(2, '0')}</span>${!locked ? `<button type="button" data-action="remove-position" aria-label="删除岗位 ${index + 1}">${icon('trash')}</button>` : '<span class="subtle">已发布 · 结构已锁定</span>'}</header><div class="field-row"><div class="field"><label>岗位名称 <span class="required">*</span><input name="posName" value="${esc(pos.name || '')}" placeholder="如：后端开发" ${locked ? 'disabled' : ''}></label></div><div class="field"><label>招募人数 <span class="required">*</span><input name="posCount" type="number" min="1" step="1" value="${esc(pos.count || '')}" placeholder="1" ${locked ? 'disabled' : ''}></label></div></div><div class="field"><label>技能标签<input name="posSkills" value="${esc((pos.skills || []).join(', '))}" placeholder="用逗号分隔，如 Python, FastAPI" ${locked ? 'disabled' : ''}></label></div><div class="field"><label>岗位描述<textarea name="posDescription" rows="2" style="min-height:65px" placeholder="说说这个岗位需要做什么" ${locked ? 'disabled' : ''}>${esc(pos.description || '')}</textarea></label></div></div>`;
}
function publishPage(id, draftId) {
  const p = id ? getPost(id) : draftId ? db.drafts.find((d) => d.id === draftId) : null;
  if ((id || draftId) && (!p || p.owner !== db.session)) return unavailable();
  const locked = !!id;
  const readonly = locked && !isOpen(p);
  const title = locked ? '编辑招募' : draftId ? '继续你的想法' : '把想法，变成一次招募。';
  return `${intro('CREATE SOMETHING TOGETHER', title, locked ? '更新你的招募说明，让伙伴了解最新的信息。' : '写下你想做的事，让合适的同学找到你。', `<a href="#/manage/drafts" class="btn">${icon('file')} 我的草稿 <span class="count-pill">${db.drafts.filter((d) => d.owner === db.session).length}</span></a>`)}<div class="form-layout"><form id="publish-form" data-post="${esc(id || '')}" data-draft="${esc(draftId || '')}">${readonly ? '<div class="note warning">招募已结束，当前以只读方式展示。录取结果已锁定。</div>' : ''}<fieldset style="border:0;padding:0;margin:0" ${readonly ? 'disabled' : ''}><div class="form-section"><h2><span class="section-number">01</span> 关于你的想法</h2><div class="field"><label for="post-title">招募标题 <span class="required">*</span></label><input id="post-title" name="title" value="${esc(p?.title || '')}" placeholder="一个清楚的标题，是遇见伙伴的开始"></div><div class="field"><label for="post-category">招募分类 <span class="required">*</span></label><select id="post-category" name="category"><option value="">请选择一个分类</option>${cats
    .slice(1)
    .map((c) => `<option ${p?.category === c ? 'selected' : ''}>${c}</option>`)
    .join(
      '',
    )}</select></div><div class="field"><label for="post-description">招募说明 <span class="required">*</span></label><textarea id="post-description" name="description" rows="6" placeholder="介绍一下你想做的事、预计的投入，以及你期待怎样的伙伴…">${esc(p?.description || '')}</textarea><small>先说清目标和投入，再按需补充赛事、导师或成果等信息。</small></div></div><div class="form-section"><h2><span class="section-number">02</span> 你想寻找怎样的伙伴</h2>${locked ? '<div class="note">发布后不能增删岗位或修改名额。岗位其他字段暂以只读展示。</div>' : ''}<div id="position-fields">${(p?.positions?.length ? p.positions : [position('', '', 1, [], '')]).map((pos, i) => positionFields(pos, i, locked)).join('')}</div>${!locked ? `<button type="button" class="btn soft" data-action="add-position">${icon('plus')} 添加一个岗位</button>` : ''}</div><div class="form-section"><h2><span class="section-number">03</span> 时间、地点与标签</h2><div class="field-row"><div class="field"><label for="deadline">招募截止时间 <span class="required">*</span></label><input id="deadline" name="deadline" type="datetime-local" value="${esc(p?.deadline || '')}" ${locked ? 'disabled' : ''}></div><div class="field"><label for="activity">活动时间 <span class="subtle">选填</span></label><input id="activity" name="activity" type="datetime-local" value="${esc(p?.activity || '')}" ${locked ? 'disabled' : ''}></div></div><div class="field"><label for="place">活动地点</label><input id="place" name="location" placeholder="如：东主楼、图书馆研讨间或线上" value="${esc(p?.location || '')}"></div><div class="field"><label for="post-tags">招募标签</label><input id="post-tags" name="tags" placeholder="选择你的方向，用逗号分隔，如 Web 开发, 产品设计" value="${esc((p?.tags || []).join(', '))}" list="tag-suggestions"><datalist id="tag-suggestions">${['Python', '产品设计', '数学建模', '前端开发'].map((t) => `<option value="${t}"></option>`).join('')}</datalist><small>可使用已有标签，也可以输入新的标签。</small></div></div><div class="form-section"><h2><span class="section-number">04</span> 更多信息 <span class="subtle">全部选填</span></h2><p class="subtle">只填写有助于申请者判断的信息；联系方式会在招募详情中公开。</p><div class="field-row"><div class="field"><label for="post-contact">联系方式</label><input id="post-contact" name="contact" value="${esc(p?.contact || '')}" placeholder="如：校园邮箱或微信号"></div><div class="field"><label for="post-outcome">预期成果</label><input id="post-outcome" name="expectedOutcome" value="${esc(p?.expectedOutcome || '')}" placeholder="如：完成一份展示报告"></div></div><div class="field"><label for="post-event-intro">赛事或活动介绍</label><textarea id="post-event-intro" name="eventIntro" rows="3" placeholder="背景、规则或活动目标">${esc(p?.eventIntro || '')}</textarea></div><div class="field"><label for="post-mentor-intro">导师介绍</label><textarea id="post-mentor-intro" name="mentorIntro" rows="3" placeholder="导师姓名、研究方向或指导方式">${esc(p?.mentorIntro || '')}</textarea></div><div class="field"><label for="post-attachment-description">附件内容说明</label><textarea id="post-attachment-description" name="attachmentDescription" rows="2" placeholder="说明附件包含什么内容">${esc(p?.attachmentDescription || '')}</textarea></div><div class="field-row"><div class="field"><label for="post-attachment-url">附件链接</label><input id="post-attachment-url" name="attachmentUrl" type="url" value="${esc(p?.attachmentUrl || '')}" placeholder="https://…"></div><div class="field"><label for="post-activity-url">活动跳转链接</label><input id="post-activity-url" name="activityUrl" type="url" value="${esc(p?.activityUrl || '')}" placeholder="https://…"></div></div><small class="subtle">链接请使用 http 或 https；本地原型通过链接提供附件。</small></div><div id="publish-error"></div><div class="form-actions"><span class="subtle">${locked ? '修改不会重置发布时间' : '草稿需手动保存，正式发布后立即公开'}</span><div>${!locked ? '<button type="button" class="btn" data-action="save-draft">保存草稿</button>' : ''}<button type="submit" class="btn primary">${locked ? '保存修改' : '发布招募'} ${icon('arrow')}</button></div></div></fieldset></form><aside><div class="side-panel"><h3>${icon('edit')} 好的招募，从清楚开始</h3><ol class="steps"><li><span class="step-num">01</span><div><strong>把目标说具体</strong><small>想完成什么？预计投入多久？</small></div></li><li><span class="step-num">02</span><div><strong>让岗位各有所长</strong><small>写清职责，设置合适的名额</small></div></li><li><span class="step-num">03</span><div><strong>为相遇留出时间</strong><small>设置合理的招募截止时间</small></div></li></ol></div><div class="note">发布后岗位结构及截止时间将锁定；所有岗位招满后，招募立即结束。</div></aside></div>`;
}
function manage() {
  const posts = db.posts.filter((p) => p.owner === db.session);
  const drafts = db.drafts.filter((d) => d.owner === db.session);
  return `<div class="page-narrow">${intro('MY RECRUITMENTS', '我的招募', '每一个想法，都在这里慢慢生长。', '<a class="btn primary" href="#/publish">' + icon('plus') + ' 发布新招募</a>')}<div class="tabs"><button class="tab ${ui.manageTab === 'published' ? 'active' : ''}" data-action="manage-tab" data-value="published">已发布 <span class="count-pill">${posts.length}</span></button><button class="tab ${ui.manageTab === 'drafts' ? 'active' : ''}" data-action="manage-tab" data-value="drafts">草稿箱 <span class="count-pill">${drafts.length}</span></button></div>${
    ui.manageTab === 'published'
      ? posts.length
        ? posts
            .sort((a, b) => new Date(b.created) - new Date(a.created))
            .map((p) => {
              const count = db.applications.filter(
                (a) => a.post === p.id && a.status === 'pending',
              ).length;
              const history = db.applications.some((a) => a.post === p.id);
              return `<article class="record"><div class="record-top">${badge(p)}${postStatus(p)}</div><h3><a href="#/detail/${p.id}">${esc(p.title)}</a></h3><div class="record-info"><span>${totalAccepted(p)} / ${capacity(p)} 名已录取</span><span>${count} 条待审核</span><span>${fmt(p.deadline)} 截止</span></div><div class="tags">${p.positions.map((pos) => `<span class="tag">${esc(pos.name)} ${accepted(p, pos.id)}/${pos.count}</span>`).join('')}</div><div class="record-actions"><a href="#/detail/${p.id}" class="text-btn" style="margin-right:auto">查看详情</a>${!history ? `<button class="text-btn" data-action="delete-post" data-id="${p.id}">删除</button>` : '<span class="subtle">有申请历史，不能删除</span>'}${isOpen(p) ? `<button class="btn small" data-action="end-post" data-id="${p.id}">提前结束</button><a class="btn small" href="#/publish/${p.id}">${icon('edit')} 编辑</a>` : '<span class="subtle">结果已锁定</span>'}<a class="btn ${count && isOpen(p) ? 'primary' : 'soft'} small" href="#/review/${p.id}">${isOpen(p) ? '管理申请' : '查看申请'}${count ? ` (${count})` : ''}</a></div></article>`;
            })
            .join('')
        : empty(
            '还没有发起招募',
            '把那个一直想做的事，写给未来的伙伴。',
            '<a href="#/publish" class="btn primary">发布第一条招募</a>',
          )
      : drafts.length
        ? drafts
            .map(
              (d) =>
                `<article class="record"><div class="record-top"><span class="badge gray">未发布 · 私有草稿</span><span class="subtle">保存于 ${fmt(d.updated, true)}</span></div><h3>${esc(d.title || '未命名招募')}</h3><p class="subtle">${esc(d.category || '尚未选择分类')} · ${d.positions.length} 个岗位</p><div class="record-actions"><button class="text-btn" data-action="delete-draft" data-id="${d.id}">删除草稿</button><a href="#/publish/draft/${d.id}" class="btn primary small">继续编辑 ${icon('arrow')}</a></div></article>`,
            )
            .join('')
        : empty(
            '想法可以慢慢打磨',
            '在发布页面手动保存的草稿，会出现在这里。',
            '<a href="#/publish" class="btn soft">写下一个想法</a>',
          )
  }</div>`;
}
function historyHTML(a) {
  return `<details class="history"><summary>查看申请记录</summary><ul>${a.history.map((h) => `<li>${fmt(h.time, true)}　${esc(h.text)}</li>`).join('')}</ul></details>`;
}
function applications() {
  let apps = db.applications.filter((a) => a.user === db.session);
  const filtered = apps.filter(
    (a) => ui.applicationTab === 'all' || a.status === ui.applicationTab,
  );
  return `<div class="page-narrow">${intro('MY APPLICATIONS', '我的申请', '每一次主动，都是遇见伙伴的开始。')}<div class="tabs">${[['all', '全部'], ...Object.entries(statusNames)].map(([s, n]) => `<button class="tab ${ui.applicationTab === s ? 'active' : ''}" data-action="application-tab" data-value="${s}">${n}<span class="count-pill">${apps.filter((a) => s === 'all' || a.status === s).length}</span></button>`).join('')}</div>${
    filtered.length
      ? filtered
          .slice()
          .sort((a, b) => new Date(b.created) - new Date(a.created))
          .map((a) => {
            const p = getPost(a.post),
              pos = getPosition(p, a.position);
            if (!p) return '';
            const canReapply =
              isOpen(p) &&
              ['not_passed', 'withdrawn'].includes(a.status) &&
              ['发布者拒绝申请', '申请者主动撤回'].includes(a.reason) &&
              !db.applications.some(
                (x) =>
                  x.post === p.id &&
                  x.user === db.session &&
                  ['pending', 'accepted'].includes(x.status) &&
                  (x.position === a.position || x.status === 'accepted'),
              ) &&
              accepted(p, pos.id) < pos.count;
            return `<article class="record"><div class="record-top">${badge(p)}${appBadge(a)}</div><h3><a href="#/detail/${p.id}">${esc(p.title)}</a></h3><div class="record-info"><span>申请岗位：<strong style="color:var(--purple)">${esc(pos?.name)}</strong></span><span>${fmt(a.created, true)} 提交</span></div>${a.message ? `<p class="prose" style="font-size:12px;margin:12px 0">${esc(a.message)}</p>` : ''}${applicationExtras(a)}${a.reason ? `<div class="note ${a.status === 'accepted' ? '' : 'warning'}">${esc(a.reason)}</div>` : ''}${!isOpen(p) ? `<div class="subtle">${p.endReason === 'manual' && a.status === 'pending' ? '招募已提前结束；待审申请的最终处理规则尚待确认，当前仅可回看。' : '招募已结束，结果已锁定。'}</div>` : ''}${historyHTML(a)}<div class="record-actions"><a class="text-btn" href="#/detail/${p.id}" style="margin-right:auto">查看招募 ${icon('arrow')}</a>${isOpen(p) && a.status === 'pending' ? `<button class="btn small" data-action="withdraw" data-id="${a.id}">撤回申请</button>` : ''}${isOpen(p) && a.status === 'accepted' ? `<button class="btn danger small" data-action="abandon" data-id="${a.id}">放弃录取</button>` : ''}${canReapply ? `<button class="btn primary small" data-action="apply" data-id="${p.id}" data-position="${pos.id}">重新申请</button>` : ''}${a.status === 'accepted' ? '<a class="btn soft small" href="#/profile/teams">查看组队历史</a>' : ''}</div></article>`;
          })
          .join('')
      : empty(
          '这里还没有申请记录',
          '去发现一个让你心动的招募，迈出第一步。',
          '<a class="btn primary" href="#/discover">发现组队 ' + icon('arrow') + '</a>',
        )
  }</div>`;
}
// Applicant details are rendered only for the post owner in this browser-only prototype.
function review(id) {
  const p = getPost(id);
  if (!p || p.owner !== db.session) return unavailable();
  const all = db.applications.filter((a) => a.post === id);
  const apps = all.filter(
    (a) =>
      (ui.reviewPosition === 'all' || a.position === ui.reviewPosition) &&
      (ui.reviewStatus === 'all' || a.status === ui.reviewStatus),
  );
  return `<div class="page-narrow"><div class="breadcrumbs"><a href="#/manage">我的招募</a>${icon('chevron')}<span>申请管理</span></div>${intro('REVIEW APPLICATIONS', '遇见你的伙伴', esc(p.title))}<div class="panel"><div class="card-top">${badge(p)}${postStatus(p)}</div><div class="review-stats"><div class="stat-box"><strong>${all.filter((a) => a.status === 'pending').length}</strong><span>待审核申请</span></div><div class="stat-box"><strong>${totalAccepted(p)} / ${capacity(p)}</strong><span>已录取 / 总名额</span></div><div class="stat-box"><strong>${p.positions.length}</strong><span>招募岗位</span></div></div>${!isOpen(p) ? '<div class="note warning">招募已结束，录取结果已锁定。不能继续审核、撤销或修改结果。</div>' : ''}</div><div class="tabs"><button class="tab ${ui.reviewPosition === 'all' ? 'active' : ''}" data-action="review-position" data-value="all">全部岗位</button>${p.positions.map((pos) => `<button class="tab ${ui.reviewPosition === pos.id ? 'active' : ''}" data-action="review-position" data-value="${pos.id}">${esc(pos.name)} <span class="count-pill">${accepted(p, pos.id)}/${pos.count}</span></button>`).join('')}</div><div class="toolbar"><span class="subtle">共 ${apps.length} 条申请 · 逐岗审核，让每个名额各得其所</span><select class="sort-select" id="review-status" aria-label="申请状态"><option value="all">全部状态</option>${Object.entries(
    statusNames,
  )
    .map(
      ([k, v]) => `<option value="${k}" ${ui.reviewStatus === k ? 'selected' : ''}>${v}</option>`,
    )
    .join('')}</select></div>${
    apps.length
      ? apps
          .map((a) => {
            const applicant = getUser(a.user);
            const pos = getPosition(p, a.position);
            return `<article class="record"><div class="record-top"><div class="person-line">${avatar(applicant)}<strong>${esc(applicant.name)}</strong><span class="subtle">${esc(applicant.dept || '清华同学')}</span></div>${appBadge(a)}</div><div class="record-info"><span>申请岗位：${esc(pos?.name)}</span><span>${fmt(a.created, true)} 提交</span></div><div class="tags">${String(
              applicant.skills || '',
            )
              .split(',')
              .filter(Boolean)
              .map((t) => `<span class="tag">${esc(t)}</span>`)
              .join(
                '',
              )}</div><p class="prose" style="font-size:12px">${esc(a.message || '申请者未填写留言。')}</p>${applicationExtras(a)}${a.reason ? `<div class="note">${esc(a.reason)}</div>` : ''}${historyHTML(a)}<div class="record-actions">${isOpen(p) && a.status === 'pending' ? `<button class="btn small" data-action="reject" data-id="${a.id}">拒绝</button><button class="btn primary small" data-action="accept" data-id="${a.id}">${icon('check')} 通过申请</button>` : isOpen(p) && a.status === 'accepted' ? `<button class="btn danger small" data-action="revoke" data-id="${a.id}">撤销录取</button>` : '<span class="subtle">当前记录仅供回看</span>'}</div></article>`;
          })
          .join('')
      : empty('这里还没有申请', '暂时没有符合当前岗位或状态的申请记录。')
  }</div>`;
}
function profile() {
  const u = user();
  const tab = ui.profileTab;
  const saved = db.posts.filter((p) => (db.favorites[u.id] || []).includes(p.id));
  const teams = db.applications.filter((a) => a.user === u.id && a.status === 'accepted');
  return `${intro('YOUR CAMPUS IDENTITY', '个人中心', '让伙伴认识你，也留下每一段同行的记录。', `<button class="btn" data-action="logout">${icon('logout')} 退出登录</button>`)}<div class="workspace"><aside class="profile-side">${avatar(u, 'large')}<div><h3>${esc(u.name)}</h3><p>${esc(u.dept || '清华同学')}<br><span style="color:var(--green)">✓ 校园身份已认证</span></p></div><div class="profile-menu">${[
    ['profile', 'user', '基本资料'],
    ['favorites', 'bookmark', '我的收藏'],
    ['teams', 'users', '组队历史'],
  ]
    .map(
      ([key, i, label]) =>
        `<button class="${tab === key ? 'active' : ''}" data-action="profile-tab" data-value="${key}">${icon(i)}${label}</button>`,
    )
    .join('')}</div></aside><section>${
    tab === 'profile'
      ? `<form id="profile-form" class="panel"><h2 class="section-title">关于我</h2><div class="account-info">${avatar(u, 'large')}<div><label class="btn small" for="avatar-file">更换头像</label><input id="avatar-file" type="file" accept="image/png,image/jpeg,image/webp" class="sr-only"><p class="subtle">选填 · JPG / PNG / WebP，建议小于 1MB</p></div></div><div class="field-row"><div class="field"><label for="profile-name">昵称 <span class="required">*</span></label><input id="profile-name" name="name" required value="${esc(u.name)}"></div><div class="field"><label for="profile-email">校园邮箱 <span class="subtle">仅自己可见</span></label><input id="profile-email" disabled value="${esc(u.email)}"></div></div><div class="field-row"><div class="field"><label for="profile-dept">院系</label><input id="profile-dept" name="dept" value="${esc(u.dept || '')}" placeholder="选填"></div><div class="field"><label for="profile-grade">年级</label><input id="profile-grade" name="grade" value="${esc(u.grade || '')}" placeholder="如：2024 级本科生"></div></div><div class="field"><label for="profile-bio">个人简介</label><textarea id="profile-bio" name="bio" placeholder="说说你的兴趣，以及你想与伙伴一起做的事…">${esc(u.bio || '')}</textarea></div><div class="field"><label for="profile-skills">技能与兴趣标签</label><input id="profile-skills" name="skills" value="${esc(u.skills || '')}" placeholder="用逗号分隔，可以创建新标签"><small>这些信息帮助伙伴了解你，选填项留空也可以保存。</small></div><div style="text-align:right"><button class="btn primary" type="submit">保存资料 ${icon('check')}</button></div></form>`
      : tab === 'favorites'
        ? `<h2 class="section-title">我的收藏 <span class="subtle">${saved.length} 个招募</span></h2><div class="cards">${saved.length ? saved.map(recruitmentCard).join('') : empty('把心动的招募留在这里', '看到感兴趣的方向时，点击收藏，方便下次找回。', '<a href="#/discover" class="btn soft">去发现组队</a>')}</div>`
        : `<h2 class="section-title">组队历史</h2><div class="note">这里记录你通过申请加入的招募，不提供后续团队协作管理。</div>${
            teams.length
              ? teams
                  .map((a) => {
                    const p = getPost(a.post);
                    return `<article class="record"><div class="record-top">${badge(p)}${postStatus(p)}</div><h3>${esc(p.title)}</h3><div class="record-info"><span>我的岗位：${esc(getPosition(p, a.position)?.name)}</span><span>${fmt(a.history.find((h) => h.text === '申请通过')?.time || a.created)} 加入</span></div><div class="record-actions"><a class="btn soft small" href="#/detail/${p.id}">回看招募 ${icon('arrow')}</a></div></article>`;
                  })
                  .join('')
              : empty(
                  '下一段同行，正在等待发生',
                  '申请通过后，你加入的招募会记录在这里。',
                  '<a href="#/discover" class="btn primary">寻找我的伙伴</a>',
                )
          }`
  }</section></div>`;
}
function notificationPanel() {
  if (!ui.notices) return '';
  const notices = db.notifications.filter((n) => n.user === db.session);
  return `<aside class="notice-panel" aria-label="系统通知"><div class="record-top"><h3>系统通知</h3><button class="icon-btn" data-action="close-notices" aria-label="关闭通知">${icon('close')}</button></div>${!user() ? '<p class="subtle">登录后查看你的组队消息。</p><a class="btn primary small" href="#/auth">去登录</a>' : notices.length ? notices.map((n) => `<button class="notice-item" data-action="notice" data-id="${n.id}"><strong>${!n.read ? '● ' : ''}${esc(n.title)}</strong><p>${esc(n.body)}</p><small>${fmt(n.time, true)}　查看记录 →</small></button>`).join('') : '<p class="subtle">暂时没有新通知，申请和审核结果会出现在这里。</p>'}</aside>`;
}
function render() {
  expirePosts();
  const route = (location.hash.slice(1) || '/discover').split('?')[0];
  const parts = route.split('/').filter(Boolean);
  if (['publish', 'manage', 'applications', 'review', 'profile'].includes(parts[0]) && !user()) {
    ui.returnTo = route;
    go('/auth');
    return;
  }
  let page;
  if (parts[0] === 'detail') page = detail(parts[1]);
  else if (parts[0] === 'auth') page = authPage();
  else if (parts[0] === 'publish')
    page = publishPage(
      parts[1] === 'draft' ? null : parts[1],
      parts[1] === 'draft' ? parts[2] : null,
    );
  else if (parts[0] === 'manage') {
    if (parts[1] === 'drafts') ui.manageTab = 'drafts';
    page = manage();
  } else if (parts[0] === 'applications') page = applications();
  else if (parts[0] === 'review') page = review(parts[1]);
  else if (parts[0] === 'profile') {
    if (['teams', 'favorites'].includes(parts[1])) ui.profileTab = parts[1];
    page = profile();
  } else if (parts[0] === 'discover' || !parts.length) page = discover();
  else page = unavailable();
  $('#app').innerHTML =
    header('/' + (parts[0] || 'discover')) +
    `<main class="container" id="main-content">${page}</main>` +
    footer() +
    notificationPanel();
  document.title =
    ({
      discover: '发现组队',
      detail: '招募详情',
      publish: '发布招募',
      manage: '我的招募',
      review: '申请管理',
      applications: '我的申请',
      profile: '个人中心',
      auth: '登录与注册',
    }[parts[0]] || '校园组队') + ' · CampusCrew';
}
function openModal(title, content, onSubmit, { submit = '确认', wide = false } = {}) {
  lastFocus = document.activeElement;
  $('#modal-root').innerHTML =
    `<div class="modal-overlay"><section class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button class="icon-btn modal-close" data-action="close-modal" aria-label="关闭弹窗">${icon('close')}</button><h2 id="modal-title">${title}</h2><form id="modal-form">${content}<div id="modal-error"></div><div class="modal-actions"><button class="btn" type="button" data-action="close-modal">取消</button><button class="btn primary" type="submit">${submit}</button></div></form></section></div>`;
  document.body.style.overflow = 'hidden';
  $('#modal-form').addEventListener('submit', (e) => {
    e.preventDefault();
    onSubmit(new FormData(e.target));
  });
  setTimeout(() => $('.modal textarea, .modal input, .modal button')?.focus(), 0);
}
function closeModal() {
  if (!$('#modal-root').innerHTML) return;
  $('#modal-root').innerHTML = '';
  document.body.style.overflow = '';
  lastFocus?.focus?.();
}
function modalError(message) {
  $('#modal-error').innerHTML = `<div class="form-error">${esc(message)}</div>`;
}
function applyFor(postId, positionId) {
  if (!requireUser('/detail/' + postId)) return;
  expirePosts();

  const post = getPost(postId);
  const position = getPosition(post, positionId);
  if (!post || !position || !isOpen(post) || accepted(post, positionId) >= position.count) {
    render();
    toast('岗位状态已变化，请查看最新名额');
    return;
  }
  if (post.owner === db.session) {
    toast('这是你发布的招募，请进入申请管理');
    return;
  }

  const hasActiveApplication = () =>
    db.applications.some(
      (application) =>
        application.user === db.session &&
        application.post === post.id &&
        (application.status === 'accepted' ||
          (application.position === positionId && application.status === 'pending')),
    );
  if (hasActiveApplication()) {
    toast('你已有该岗待审申请，或已在本招募录取');
    return;
  }

  openModal(
    '申请这个岗位',
    `
    <p>你正在申请「${esc(post.title)}」的 <strong>${esc(position.name)}</strong> 岗位。</p>
    <div class="note">以下资料全部选填，仅招募者和你自己可以在页面中查看。公开页面只显示申请人数。</div>
    <div class="field"><label for="application-message">申请留言</label><textarea id="application-message" name="message" placeholder="说说你为什么想参与…"></textarea></div>
    <div class="field-row"><div class="field"><label for="application-experience">相关经历</label><textarea id="application-experience" name="experience" rows="2" placeholder="课程、项目或实践经历"></textarea></div><div class="field"><label for="application-availability">可投入时间</label><textarea id="application-availability" name="availability" rows="2" placeholder="如：每周 6 小时"></textarea></div></div>
    <div class="field"><label for="application-contact">联系方式</label><input id="application-contact" name="contact" placeholder="如：校园邮箱或微信号"></div>
    <div class="field-row"><div class="field"><label for="application-resume">简历链接</label><input id="application-resume" name="resumeUrl" type="url" placeholder="https://…"></div><div class="field"><label for="application-portfolio">作品集链接</label><input id="application-portfolio" name="portfolioUrl" type="url" placeholder="https://…"></div></div>
    <p class="subtle">可分别申请不同岗位，同一招募最终只占一个名额。简历请提供可访问的链接。</p>
  `,
    (fields) => {
      expirePosts();
      if (!isOpen(post) || accepted(post, positionId) >= position.count || hasActiveApplication()) {
        modalError('岗位或申请状态已变化，请关闭弹窗刷新。');
        return;
      }
      const time = new Date().toISOString();
      const optional = Object.fromEntries(
        ['message', 'experience', 'availability', 'contact', 'resumeUrl', 'portfolioUrl'].map(
          (key) => [key, String(fields.get(key) || '').trim()],
        ),
      );
      db.applications.push({
        id: crypto.randomUUID(),
        post: post.id,
        position: positionId,
        user: db.session,
        ...optional,
        status: 'pending',
        created: time,
        history: [{ text: '提交申请，等待审核', time }],
      });
      notify(
        post.owner,
        '收到新的岗位申请',
        `${user().name}申请了「${post.title}」的${position.name}岗位。`,
        '/review/' + post.id,
      );
      save();
      closeModal();
      render();
      toast('申请已提交，在“我的申请”查看进度');
    },
    { submit: '提交申请', wide: true },
  );
}
function applicationAction(type, id) {
  expirePosts();
  const a = db.applications.find((a) => a.id === id);
  const p = a && getPost(a.post);
  if (!a || !p || !isOpen(p)) {
    render();
    toast('招募已结束，结果不可修改');
    return;
  }
  const ownerAction = ['accept', 'reject', 'revoke'].includes(type);
  if ((ownerAction ? p.owner : a.user) !== db.session) {
    toast('没有操作权限');
    return;
  }
  if (
    (['accept', 'reject', 'withdraw'].includes(type) && a.status !== 'pending') ||
    (['revoke', 'abandon'].includes(type) && a.status !== 'accepted')
  ) {
    render();
    toast('申请状态已变化，请查看最新记录');
    return;
  }
  const pos = getPosition(p, a.position);
  const willFull = accepted(p, pos.id) + 1 === pos.count;
  const allFull = totalAccepted(p) + 1 === capacity(p);
  const labels = {
    accept: '通过这位伙伴的申请？',
    reject: '拒绝这次申请？',
    revoke: '撤销这次录取？',
    withdraw: '撤回这次申请？',
    abandon: '放弃这个岗位的录取？',
  };
  const description = {
    accept: `将录取${getUser(a.user).name}加入${pos.name}岗位。该用户在本招募其他岗位的待审会自动撤回。${willFull ? '当前岗位将满员，其余待审会因满员未通过。' : ''}${allFull ? '所有岗位将招满，招募立即结束，之后不能再撤销录取。' : ''}`,
    reject: '申请者会收到未通过结果。请简要说明你的考虑。',
    revoke: '将释放一个名额，原通过记录和撤销原因仍会保留；此前因满员未通过的申请不会自动恢复。',
    withdraw: '撤回会保留申请记录。招募仍开放且符合资格时，可以重新提交。',
    abandon: '放弃后将释放一个名额，并通知发布者。请认真确认你的时间安排。',
  };
  openModal(
    labels[type],
    `<p>${esc(description[type])}</p>${['reject', 'revoke'].includes(type) ? '<div class="field"><label for="reason">原因</label><textarea name="reason" id="reason" required placeholder="请填写简要原因"></textarea></div>' : ''}`,
    (fd) => {
      expirePosts();
      if (
        !isOpen(p) ||
        (['accept', 'reject', 'withdraw'].includes(type)
          ? a.status !== 'pending'
          : a.status !== 'accepted')
      ) {
        modalError('状态已变化，此操作未执行，请刷新查看。');
        return;
      }
      if (type === 'accept') {
        if (
          accepted(p, pos.id) >= pos.count ||
          db.applications.some(
            (x) => x.post === p.id && x.user === a.user && x.status === 'accepted',
          )
        ) {
          modalError('名额或录取状态发生变化，无法通过。');
          return;
        }
        changeApplication(a, 'accepted', '申请通过');
        notify(
          a.user,
          '你的申请通过了',
          `你已通过「${p.title}」的${pos.name}岗位申请。`,
          '/applications',
        );
        db.applications
          .filter((x) => x.post === p.id && x.user === a.user && x.status === 'pending')
          .forEach((x) =>
            changeApplication(x, 'withdrawn', '同一招募的另一岗位申请已通过，自动撤回'),
          );
        if (accepted(p, pos.id) >= pos.count) {
          db.applications
            .filter((x) => x.post === p.id && x.position === pos.id && x.status === 'pending')
            .forEach((x) => {
              changeApplication(x, 'not_passed', '岗位名额已满');
              notify(
                x.user,
                '岗位申请结果更新',
                `「${p.title}」的${pos.name}已满员，申请未通过。`,
                '/applications',
              );
            });
        }
        if (totalAccepted(p) === capacity(p)) {
          p.status = 'ended';
          p.endReason = 'filled';
        }
      } else if (type === 'reject' || type === 'revoke') {
        const reason = fd.get('reason')?.trim();
        if (!reason) {
          modalError('请填写原因');
          return;
        }
        changeApplication(a, 'not_passed', type === 'reject' ? '发布者拒绝申请' : '发布者撤销录取');
        a.history.push({ text: '原因：' + reason, time: new Date().toISOString() });
        notify(
          a.user,
          type === 'reject' ? '申请结果更新' : '录取已撤销',
          `${p.title}：${reason}`,
          '/applications',
        );
      } else {
        changeApplication(
          a,
          'withdrawn',
          type === 'withdraw' ? '申请者主动撤回' : '申请者主动放弃录取',
        );
        notify(
          p.owner,
          type === 'withdraw' ? '申请已撤回' : '申请者放弃录取',
          `${getUser(a.user).name}已${type === 'withdraw' ? '撤回申请' : '放弃录取'}：${p.title} · ${pos.name}`,
          '/review/' + p.id,
        );
      }
      save();
      closeModal();
      render();
      toast('操作已完成，相关记录已更新');
    },
    {
      submit: {
        accept: '确认通过',
        reject: '确认拒绝',
        revoke: '确认撤销',
        withdraw: '确认撤回',
        abandon: '确认放弃',
      }[type],
    },
  );
}
function splitTags(value) {
  return [
    ...new Set(
      String(value || '')
        .split(/[,，、]/)
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  ];
}
function collectPost(form) {
  const fd = new FormData(form);
  const old = getPost(form.dataset.post);
  return {
    title: String(fd.get('title') || '').trim(),
    category: fd.get('category') || '',
    description: String(fd.get('description') || '').trim(),
    deadline: old?.deadline || fd.get('deadline') || '',
    activity: old?.activity || fd.get('activity') || '',
    location: String(fd.get('location') || '').trim(),
    tags: splitTags(fd.get('tags')),
    contact: String(fd.get('contact') || '').trim(),
    eventIntro: String(fd.get('eventIntro') || '').trim(),
    mentorIntro: String(fd.get('mentorIntro') || '').trim(),
    expectedOutcome: String(fd.get('expectedOutcome') || '').trim(),
    attachmentDescription: String(fd.get('attachmentDescription') || '').trim(),
    attachmentUrl: String(fd.get('attachmentUrl') || '').trim(),
    activityUrl: String(fd.get('activityUrl') || '').trim(),
    positions:
      old?.positions ||
      Array.from(form.querySelectorAll('.position-form')).map((el) => ({
        id: el.dataset.positionId || crypto.randomUUID(),
        name: $('[name=posName]', el).value.trim(),
        count: Number($('[name=posCount]', el).value),
        skills: splitTags($('[name=posSkills]', el).value),
        description: $('[name=posDescription]', el).value.trim(),
      })),
  };
}
// Published posts preserve their deadline and role structure; drafts may still change both.
function savePost(draft = false) {
  const form = $('#publish-form');
  const data = collectPost(form);
  const errors = [];
  if (!draft) {
    if (!data.title) errors.push('请填写招募标题');
    if (!data.category) errors.push('请选择分类');
    if (!data.description) errors.push('请填写招募说明');
    if (!data.deadline || new Date(data.deadline) <= new Date())
      errors.push('截止时间必须晚于当前时间');
    if (['attachmentUrl', 'activityUrl'].some((key) => data[key] && !safeUrl(data[key])))
      errors.push('附件和活动链接需使用 http 或 https');
    if (!data.positions.length) errors.push('至少添加一个岗位');
    if (data.positions.some((p) => !p.name || !Number.isInteger(p.count) || p.count < 1))
      errors.push('每个岗位需要名称及正整数名额');
  }
  if (errors.length) {
    $('#publish-error').innerHTML =
      `<div class="form-error" role="alert">${errors.map(esc).join('；')}</div>`;
    $('#publish-error').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  if (draft) {
    let d = db.drafts.find((d) => d.id === form.dataset.draft);
    if (d) Object.assign(d, data, { updated: new Date().toISOString() });
    else {
      d = {
        ...data,
        id: crypto.randomUUID(),
        owner: db.session,
        updated: new Date().toISOString(),
      };
      db.drafts.unshift(d);
      form.dataset.draft = d.id;
    }
    save();
    $('#publish-error').innerHTML = '';
    toast('草稿已手动保存');
    return;
  }
  if (form.dataset.post) {
    const old = getPost(form.dataset.post);
    if (old?.owner !== db.session || !isOpen(old)) {
      toast('招募不可编辑，请刷新查看');
      return;
    }
    Object.assign(old, {
      title: data.title,
      category: data.category,
      description: data.description,
      location: data.location,
      tags: data.tags,
      contact: data.contact,
      eventIntro: data.eventIntro,
      mentorIntro: data.mentorIntro,
      expectedOutcome: data.expectedOutcome,
      attachmentDescription: data.attachmentDescription,
      attachmentUrl: data.attachmentUrl,
      activityUrl: data.activityUrl,
    });
    save();
    go('/detail/' + old.id);
    toast('招募内容已更新');
  } else {
    const p = {
      ...data,
      id: crypto.randomUUID(),
      owner: db.session,
      created: new Date().toISOString(),
      status: 'open',
    };
    db.posts.unshift(p);
    if (form.dataset.draft) db.drafts = db.drafts.filter((d) => d.id !== form.dataset.draft);
    save();
    go('/detail/' + p.id);
    toast('招募已发布，期待你的新伙伴');
  }
}
// Delegated handlers also cover cards and dialogs inserted by later renders.
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action,
    id = el.dataset.id,
    v = el.dataset.value;
  switch (a) {
    case 'reset-demo':
      openModal(
        '恢复初始演示？',
        '<p>这会清除当前浏览器内的演示招募、申请、草稿和账号资料，恢复初始样例。只影响本地原型数据。</p>',
        () => {
          db = seed();
          ui.manageTab = 'published';
          ui.profileTab = 'profile';
          ui.applicationTab = 'all';
          ui.reviewPosition = 'all';
          ui.reviewStatus = 'all';
          save();
          closeModal();
          go('/discover');
          toast('已恢复初始演示');
        },
        { submit: '恢复演示' },
      );
      break;
    case 'category':
      ui.category = v;
      ui.page = 1;
      render();
      break;
    case 'advanced':
      ui.advanced = !ui.advanced;
      render();
      break;
    case 'clear-filters':
      Object.assign(ui, {
        category: '全部',
        query: '',
        tag: '',
        place: '',
        from: '',
        to: '',
        only: false,
        page: 1,
      });
      render();
      break;
    case 'topic':
      ui.query = v;
      ui.category = '全部';
      ui.page = 1;
      render();
      break;
    case 'page':
      ui.page = Number(v);
      render();
      $('.search-box').scrollIntoView({ behavior: 'smooth', block: 'start' });
      break;
    case 'favorite':
      if (!requireUser()) break;
      {
        let list = db.favorites[db.session] || [];
        const saved = list.includes(id);
        db.favorites[db.session] = saved ? list.filter((x) => x !== id) : [...list, id];
        save();
        render();
        toast(saved ? '已取消收藏' : '已收藏，可在个人中心找回');
      }
      break;
    case 'apply':
      applyFor(id, el.dataset.position);
      break;
    case 'auth-mode':
      ui.authMode = v;
      render();
      break;
    case 'demo-login':
      db.session = id;
      ui.authMode = 'login';
      save();
      go(ui.returnTo || '/discover');
      ui.returnTo = '';
      toast('欢迎，' + user().name);
      break;
    case 'resend':
      el.disabled = true;
      el.textContent = '已发送';
      toast('演示验证码为 123456，不会发送真实邮件');
      setTimeout(() => {
        if (el.isConnected) {
          el.disabled = false;
          el.textContent = '重新发送';
        }
      }, 3000);
      break;
    case 'logout':
      db.session = null;
      save();
      go('/discover');
      toast('已退出登录');
      break;
    case 'manage-tab':
      ui.manageTab = v;
      render();
      break;
    case 'application-tab':
      ui.applicationTab = v;
      render();
      break;
    case 'review-position':
      ui.reviewPosition = v;
      render();
      break;
    case 'profile-tab':
      ui.profileTab = v;
      go('/profile');
      render();
      break;
    case 'add-position':
      {
        const root = $('#position-fields');
        root.insertAdjacentHTML('beforeend', positionFields({}, root.children.length, false));
        root.lastElementChild.querySelector('input').focus();
      }
      break;
    case 'remove-position':
      el.closest('.position-form').remove();
      break;
    case 'save-draft':
      savePost(true);
      break;
    case 'withdraw':
    case 'abandon':
    case 'accept':
    case 'reject':
    case 'revoke':
      applicationAction(a, id);
      break;
    case 'close-modal':
      closeModal();
      break;
    case 'notices':
      ui.notices = !ui.notices;
      render();
      break;
    case 'close-notices':
      ui.notices = false;
      render();
      break;
    case 'notice':
      {
        const n = db.notifications.find((n) => n.id === id && n.user === db.session);
        if (n) {
          n.read = true;
          save();
          go(n.link);
        }
      }
      break;
    case 'delete-draft':
      openModal(
        '删除这个草稿？',
        '<p>删除后将无法继续编辑，请确认不再需要这份草稿。</p>',
        () => {
          db.drafts = db.drafts.filter((d) => !(d.id === id && d.owner === db.session));
          save();
          closeModal();
          render();
          toast('草稿已删除');
        },
        { submit: '删除草稿' },
      );
      break;
    case 'delete-post':
      {
        const p = getPost(id);
        if (!p || p.owner !== db.session) break;
        openModal(
          '删除这条招募？',
          '<p>仅从未收到申请的招募可以删除。此操作不可恢复。</p>',
          () => {
            if (db.applications.some((a) => a.post === id)) {
              modalError('已存在申请历史，不能删除，请刷新查看。');
              return;
            }
            db.posts = db.posts.filter((p) => p.id !== id);
            Object.keys(db.favorites).forEach(
              (uid) => (db.favorites[uid] = db.favorites[uid].filter((x) => x !== id)),
            );
            save();
            closeModal();
            render();
            toast('招募已删除');
          },
          { submit: '确认删除' },
        );
      }
      break;
    case 'end-post':
      {
        const p = getPost(id);
        if (!p || p.owner !== db.session) break;
        openModal(
          '提前结束招募？',
          '<p>结束后不再接收申请，录取结果立即锁定，不能撤销、放弃或重新开放。需要补招时，请创建独立新招募。</p><div class="note warning">原需求尚未确定提前结束时待审申请的终态。本原型保留原记录并锁定交互，不擅自标记过期。</div>',
          () => {
            expirePosts();
            if (!isOpen(p)) {
              modalError('招募状态已变化，请关闭后刷新。');
              return;
            }
            p.status = 'ended';
            p.endReason = 'manual';
            save();
            closeModal();
            render();
            toast('招募已提前结束，结果已锁定');
          },
          { submit: '确认结束' },
        );
      }
      break;
  }
});
document.addEventListener('submit', async (e) => {
  if (e.target.id === 'modal-form') return;
  e.preventDefault();
  const form = e.target,
    fd = new FormData(form);
  if (form.id === 'search-form') {
    ui.query = fd.get('query');
    ui.page = 1;
    render();
  } else if (form.id === 'advanced-form') {
    Object.assign(ui, {
      tag: fd.get('tag'),
      place: fd.get('place'),
      from: fd.get('from'),
      to: fd.get('to'),
      only: fd.has('only'),
      page: 1,
    });
    if (ui.from && ui.to && ui.from > ui.to) {
      toast('截止起始日期不能晚于结束日期');
      return;
    }
    render();
  } else if (form.id === 'publish-form') savePost(false);
  else if (form.id === 'profile-form') {
    const name = fd.get('name').trim();
    if (!name) {
      toast('昵称不能为空');
      return;
    }
    Object.assign(user(), {
      name,
      dept: fd.get('dept').trim(),
      grade: fd.get('grade').trim(),
      bio: fd.get('bio').trim(),
      skills: splitTags(fd.get('skills')).join(','),
    });
    save();
    render();
    toast('资料已保存');
  } else if (form.id === 'auth-form') {
    const error = (message) =>
      ($('#auth-error').innerHTML = `<div class="form-error">${esc(message)}</div>`);
    if (ui.authMode === 'verify') {
      if (fd.get('code') !== '123456') {
        error('验证码不正确，静态演示请使用 123456。');
        return;
      }
      const u = {
        id: crypto.randomUUID(),
        name: ui.pendingAuth.name,
        email: ui.pendingAuth.email,
        passwordHash: ui.pendingAuth.passwordHash,
        dept: '',
        grade: '',
        bio: '',
        skills: '',
      };
      db.users.push(u);
      db.session = u.id;
      ui.pendingAuth = null;
      ui.authMode = 'login';
      save();
      go(ui.returnTo || '/discover');
      ui.returnTo = '';
      toast('校园身份认证成功');
    } else {
      const email = fd.get('email').trim().toLowerCase();
      if (ui.authMode === 'login') {
        const account = db.users.find((u) => u.email === email);
        const hash = await passwordDigest(fd.get('password'));
        if (
          !account ||
          (account.passwordHash
            ? account.passwordHash !== hash
            : !['lin', 'zhou'].includes(account.id) || fd.get('password') !== 'campus123')
        ) {
          error('邮箱或密码不正确。体验账号密码为 campus123。');
          return;
        }
        db.session = account.id;
        save();
        go(ui.returnTo || '/discover');
        ui.returnTo = '';
        toast('欢迎，' + account.name);
      } else {
        if (db.users.some((u) => u.email === email)) {
          error('此邮箱已注册，请使用体验账号登录。');
          return;
        }
        if (!fd.get('nickname').trim()) {
          error('请填写昵称');
          return;
        }
        ui.pendingAuth = {
          name: fd.get('nickname').trim(),
          email,
          passwordHash: await passwordDigest(fd.get('password')),
        };
        ui.authMode = 'verify';
        render();
      }
    }
  }
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'sort') {
    ui.sort = e.target.value;
    ui.page = 1;
    render();
  }
  if (e.target.id === 'review-status') {
    ui.reviewStatus = e.target.value;
    render();
  }
  if (e.target.id === 'avatar-file') {
    const file = e.target.files[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 1024 * 1024) {
      toast('请选择小于 1MB 的 JPG、PNG 或 WebP 图片');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      user().avatar = reader.result;
      save();
      render();
      toast('头像已更新');
    };
    reader.readAsDataURL(file);
  }
});
document.addEventListener('keydown', (e) => {
  if (!$('#modal-root').innerHTML) return;
  if (e.key === 'Escape') {
    closeModal();
    return;
  }
  if (e.key === 'Tab') {
    const items = Array.from(
      $('.modal').querySelectorAll('button,input,textarea,select,a[href]'),
    ).filter((el) => !el.disabled);
    const first = items[0],
      last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
});
window.addEventListener('hashchange', () => {
  closeModal();
  ui.notices = false;
  render();
  window.scrollTo(0, 0);
});
window.addEventListener('storage', (e) => {
  if (e.key === storeKey && e.newValue) {
    try {
      db = JSON.parse(e.newValue);
      render();
    } catch {
      toast('数据更新失败，请刷新页面');
    }
  }
});
render();
