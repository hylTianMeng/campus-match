/* CampusCrew static prototype: all records are fictional and browser-local. */
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
// Page IDs match the coverage guide; the third entry is the hash route used by the UI.
const routes = [
  ['DISC-01', '发现组队', 'discover'],
  ['DISC-02', '招募详情', 'detail'],
  ['PEOPLE-01', '找同学', 'people'],
  ['PEOPLE-02', '同学主页', 'person'],
  ['POST-01', '发布招募', 'publish'],
  ['POST-02', '草稿箱', 'drafts'],
  ['POST-03', '编辑已发布', 'edit'],
  ['MSG-01', '私信', 'chats'],
  ['MSG-02', '系统通知', 'notices'],
  ['ME-01', '个人资料', 'profile'],
  ['ME-02', '我的发布', 'posts'],
  ['ME-03', '我的申请', 'applications'],
  ['ME-04', '组队历史', 'teams'],
  ['ME-05', '我的收藏', 'favorites'],
  ['ME-06', '账号设置', 'settings'],
  ['ME-07', '申请管理', 'review'],
  ['ADMIN-01', '用户管理', 'admin-users'],
  ['ADMIN-02', '招募管理', 'admin-posts'],
  ['ADMIN-03', '举报管理', 'admin-reports'],
  ['ADMIN-04', '分类与标签', 'admin-tags'],
  ['ADMIN-05', '私信与访问审计', 'admin-audit'],
  ['AUTH-01', '登录 / 注册 / 校园认证', 'auth'],
  ['SYS-01', '全局访问与异常', 'system'],
];
// The review identity, scenarios, and records are local demonstration state, not real accounts.
let stored = {};
try {
  stored = JSON.parse(localStorage.getItem('campuscrew-v2') || '{}');
} catch {}
const state = Object.assign(
  {
    identity: 'normal',
    privacy: [true, true, false, false],
    saved: false,
    appOverrides: {},
    blocked: false,
    drafts: [],
    apps: [],
    approved: [],
    rejected: [],
    ended: false,
    endedReason: '已招满',
    messages: [],
    deletedMessage: false,
    hiddenChat: false,
    unread: 3,
    noticeRead: [],
    audits: [],
    banned: false,
    takenDown: false,
    merged: false,
    verified: false,
    form: null,
    closedAccount: false,
    profile: {
      name: '林知夏',
      dept: '计算机系',
      year: '2024 级',
      bio: '希望用技术解决身边的小问题。喜欢设计、徒步与校园观察。',
      tags: 'React, 用户研究, 徒步',
    },
  },
  stored,
);
let route = 'discover',
  params = new URLSearchParams(),
  scenario = 'normal',
  filter = '全部',
  authMode = 'login',
  returnTask = null,
  tab = '';
function persist() {
  try {
    localStorage.setItem('campuscrew-v2', JSON.stringify(state));
  } catch {
    // The demo remains usable in memory when browser storage is unavailable.
  }
}
const titles = [
  '校园碳足迹地图 · 挑战杯共创计划',
  '软件工程大作业 · 校园互助平台',
  '让古籍里的文字重新被看见',
  '周末紫荆摄影散步计划',
  '用机器学习读懂城市的呼吸',
  '无障碍校园地图 · 用户研究',
];
const cats = ['学科竞赛', '课程项目', '学术科研', '兴趣活动', '学术科研', '公益实践'];
const tags = [
  ['产品设计', 'Python', '数据分析'],
  ['React', 'Java', 'UI 设计'],
  ['数字人文', 'OCR', '文献研究'],
  ['摄影', '校园记录'],
  ['机器学习', '遥感'],
  ['用户研究', '无障碍'],
];
const routeLink = (to, label, cls = 'btn secondary') =>
  `<a class="${cls}" href="#${to}">${label}</a>`;
const actionButton = (label, action, cls = 'btn secondary', attrs = '') =>
  `<button class="${cls}" data-action="${action}" ${attrs}>${label}</button>`;
const badge = (text, color = '') => `<span class="badge ${color}">${text}</span>`;
const chips = (xs) =>
  `<div class="tags">${xs.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>`;
const note = (t, c = '') => `<div class="notice ${c}">${t}</div>`;
const header = (title, sub = '', actions = '') =>
  `<div class="pagehead"><div><div class="eyebrow">CAMPUSCREW / TSINGHUA CAMPUS</div><h1>${title}</h1><p>${sub}</p></div><div class="actions">${actions}</div></div>`;
function field(label, name, val = '', type = 'text', extra = '') {
  return `<div class="field"><label for="${name}">${label}</label><input id="${name}" name="${name}" type="${type}" value="${esc(val)}" ${extra}></div>`;
}
function modal(title, body, foot = '') {
  const d = $('#modal');
  d.innerHTML = `<div class="modalhead"><h2 id="modal-title">${title}</h2><button class="close" data-action="close" aria-label="关闭弹窗">×</button></div>${body}<div class="actions">${foot || actionButton('知道了', 'close', 'btn')}</div>`;
  if (!d.open) d.showModal();
}
function close() {
  if ($('#modal').open) $('#modal').close();
}
let toastTimer;
function toast(t) {
  $('#toast').textContent = t;
  $('#toast').style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($('#toast').style.display = 'none'), 3500);
}
function confirmAction(title, text, action, reason = false) {
  modal(
    title,
    note(text, action.includes('delete') || action.includes('end') ? 'warn' : '') +
      (reason
        ? `<div class="field"><label for="reason">操作原因（必填）</label><textarea id="reason" required placeholder="请填写具体原因，记录将保留在历史中"></textarea><small class="error" id="reason-error"></small></div>`
        : ''),
    actionButton('取消', 'close') + actionButton('确认' + title, action, 'btn'),
  );
}
function reason() {
  const v = $('#reason')?.value.trim();
  if (!v) {
    $('#reason-error').textContent = '请先填写原因。';
    return false;
  }
  return v;
}
function authGate(task) {
  if (state.identity === 'guest' || state.identity === 'unverified') {
    returnTask = task;
    openAuth(state.identity === 'guest' ? 'login' : 'verify');
    return false;
  }
  if (state.identity === 'banned' || state.banned) {
    toast('账号当前只读，无法执行此业务操作。');
    return false;
  }
  return true;
}
function go(to) {
  location.hash = to;
  if (location.hash.slice(1) === to) render();
}
function topbar() {
  let active =
    route === 'discover' || route === 'detail'
      ? 'discover'
      : route.startsWith('people') || route === 'person'
        ? 'people'
        : ['publish', 'drafts', 'edit'].includes(route)
          ? 'publish'
          : ['chats', 'notices'].includes(route)
            ? 'chats'
            : 'profile';
  return `<header class="topbar"><a class="brand" href="#discover"><span class="seal">紫</span><span><strong>CampusCrew</strong><small>清华大学校园组队</small></span></a><nav class="nav">${[
    ['discover', '发现组队'],
    ['people', '找同学'],
    ['publish', '发布招募'],
    ['chats', `消息中心${state.unread ? `<span class="num">${state.unread}</span>` : ''}`],
    ['profile', '个人中心'],
  ]
    .map(([r, n]) => routeLink(r, n, r === active ? 'active' : ''))
    .join(
      '',
    )}</nav><div class="account">${state.identity === 'guest' ? actionButton('登录 / 注册', 'auth', 'btn secondary') : `<a href="#profile" class="avatar">林</a><a class="name" href="#settings">林知夏 · ${state.identity === 'unverified' ? '待校园认证' : '已认证'}</a>`}</div></header>`;
}
function reviewbar() {
  return `<div class="reviewbar"><a href="#guide">◈ 原型目录 / 覆盖索引</a><label>评审身份 <select id="identity">${[
    ['normal', '认证学生'],
    ['guest', '游客'],
    ['unverified', '未认证'],
    ['banned', '封禁只读'],
    ['admin', '管理员'],
  ]
    .map(([k, v]) => `<option value="${k}" ${state.identity === k ? 'selected' : ''}>${v}</option>`)
    .join(
      '',
    )}</select></label><a href="#scenarios">场景走查</a><span>静态演示 · 虚构数据 · 本机状态</span>${actionButton('重置', 'reset', 'link')}</div>`;
}
function side(content) {
  return `<div class="side-layout"><aside class="sidemenu"><div class="profilemini"><span class="avatar">林</span><b>林知夏</b></div>${routes
    .filter((x) => x[0].startsWith('ME-'))
    .map(([id, n, r]) => routeLink(r, n, route === r ? 'active' : ''))
    .join('')}</aside><section>${content}</section></div>`;
}
function admin(content) {
  return `<div class="admin-layout"><aside class="adminside"><a href="#admin-users" class="brand"><span class="seal">紫</span><span><strong>CampusCrew</strong><small>平台治理工作台</small></span></a>${routes
    .filter((x) => x[0].startsWith('ADMIN'))
    .map(([id, n, r]) => routeLink(r, n, 'menu ' + (route === r ? 'active' : '')))
    .join(
      '',
    )}</aside><div class="adminbody"><div class="adminhead"><span>校园组队平台 / 管理后台</span><div class="actions"><span>管理员 · 许老师</span>${routeLink('discover', '返回学生端', 'link')}${actionButton('退出', 'logout', 'link')}</div></div><main class="wrap">${state.identity === 'admin' ? content : empty('需要管理员权限', '请使用底部评审工具选择管理员身份后查看后台样例。', routeLink('discover', '返回发现组队'))}</main></div></div>`;
}
function empty(title, text, action = '', symbol = '○') {
  return `<div class="empty"><div class="symbol">${symbol}</div><h2>${title}</h2><p>${text}</p><div class="actions">${action}</div></div>`;
}
function sceneControl() {
  return `<div class="panel"><div class="between"><span class="small muted">评审状态样例（不属于正式产品导航）</span><select id="scene" aria-label="切换页面状态">${[
    ['normal', '正常内容'],
    ['loading', '加载中'],
    ['empty', '暂无数据'],
    ['noresult', '筛选无结果'],
    ['error', '加载失败'],
    ['ended-full', '已结束 · 已招满'],
    ['ended-time', '已结束 · 已截止'],
    ['ended-manual', '已结束 · 提前结束'],
    ['restricted', '内容不可用'],
    ['conflict', '旧页面提交冲突'],
    ['paused', '管理暂停 · 编辑边界待定'],
  ]
    .map(([k, v]) => `<option value="${k}" ${scenario === k ? 'selected' : ''}>${v}</option>`)
    .join('')}</select></div></div>`;
}
function commonScene() {
  if (scenario === 'loading')
    return empty(
      '正在加载',
      '正在获取最新内容，请稍候。',
      actionButton('展示加载完成', 'scene-normal'),
    );
  if (scenario === 'empty')
    return empty('这里还没有记录', '记录出现后会显示在这里。', routeLink('discover', '去发现组队'));
  if (scenario === 'noresult')
    return empty(
      '没有符合条件的结果',
      '试试减少筛选条件。',
      actionButton('清空筛选', 'scene-normal'),
    );
  if (scenario === 'error')
    return empty(
      '加载失败，请重试',
      '暂时无法取得最新内容，已填内容会保留。',
      actionButton('重新加载', 'scene-normal'),
    );
  if (scenario === 'restricted')
    return empty(
      '此内容暂不可查看',
      '你可以返回发现组队浏览其他公开招募。',
      routeLink('discover', '发现组队'),
      '◇',
    );
  return '';
}
function card(i = 0, ended = false) {
  return `<article class="card"><div class="between"><span class="eyebrow">${cats[i]} / ${String(i + 1).padStart(2, '0')}</span>${badge(ended ? '已结束 · 已截止' : '招募中', ended ? 'gray' : 'green')}</div><h3>${routeLink(`detail?id=${i}${ended ? '&scene=ended-time' : ''}`, titles[i], '')}</h3><p>${['寻找对可持续发展感兴趣的伙伴，一起把校园观察变成可使用的作品。', '从真实需求出发，完成一个可以展示、可以使用的课程项目。', '跨学科的小型研究与共创，欢迎带着好奇心加入。'][i % 3]}</p>${chips(tags[i])}<div class="roleline"><span>${i === 0 ? '前端开发 · 数据分析' : '研究 / 实践岗位'}</span><span>${i === 0 ? '1 / 4' : '1 / 4'} 已录取</span></div><div class="progress"><span style="width:25%"></span></div><div class="small muted">截止 ${ended ? '2026.10.20' : '2026.11.12'} · ${i % 2 ? '线上协作' : '校内 / 紫荆'}</div><div class="cardfoot"><span><span class="avatar">${['陈', '林', '沈', '周', '许', '唐'][i]}</span> ${['陈书宁', '林知夏', '沈亦舟', '周映雪', '许言', '唐以安'][i]}</span>${routeLink(`detail?id=${i}${ended ? '&scene=ended-time' : ''}`, '查看招募 ↗', 'link')}</div></article>`;
}
function discover() {
  return (
    header(
      '发现值得同行的事',
      '从课程合作到校园实践，找到适合自己的岗位。',
      routeLink('publish', '＋ 发布招募', 'btn'),
    ) +
    `<section class="panel"><form id="search-form"><div class="search"><input id="keyword" placeholder="搜索招募标题、描述或标签" aria-label="招募关键词"><button class="btn">搜索招募</button></div><div class="filters"><label class="sr-only" for="category">一级分类</label><select id="category"><option>全部分类</option>${[...new Set(cats)].map((c) => `<option>${c}</option>`).join('')}</select><input id="tag-search" placeholder="标签，如 Python" aria-label="标签"><select id="available" aria-label="是否仍可申请"><option>全部开放招募</option><option>仍可申请</option></select><input id="place" placeholder="活动地点" aria-label="活动地点"><label class="small muted">截止 <input id="date-start" type="date" aria-label="截止起始时间"> 至 <input id="date-end" type="date" aria-label="截止结束时间"></label>${actionButton('清空条件', 'clear-search', 'link')}</div></form><div id="selected-filters" class="tags" style="margin-top:15px"></div></section><div class="sectionline"><h2>正在寻找伙伴 <small class="muted" id="result-count"> / 6 条招募</small></h2><select id="sort" aria-label="排序"><option>最新发布</option><option>即将截止</option></select></div><div class="grid" id="results">${titles.map((_, i) => card(i)).join('')}</div><div class="pagination">${actionButton('上一页', 'page-first', 'btn ghost', 'disabled')}<span class="btn">1</span>${actionButton('下一页', 'page-last', 'btn ghost', 'disabled')}</div><p class="small muted right" style="margin-top:12px">样例共 6 条，已全部显示；默认不展示已结束招募。</p>`
  );
}
function detail() {
  let i = +(params.get('id') || 0);
  i = Math.max(0, Math.min(5, i));
  const ended = scenario.startsWith('ended') || state.ended;
  const why =
    scenario === 'ended-time'
      ? '已截止'
      : scenario === 'ended-manual'
        ? '提前结束'
        : state.endedReason;
  const own = params.has('own');
  return `<div class="crumb">${routeLink('discover', '发现组队', 'link')} / ${cats[i]} / 招募详情</div><div class="columns"><section><div class="panel"><div class="between">${chips([cats[i], ...tags[i]])}${badge(ended ? '已结束 · ' + why : '招募中', ended ? 'gray' : 'green')}</div><h1 class="title">${titles[i]}</h1><p class="small">发布于 2026.10.29 · 截止 ${ended && why === '已截止' ? '2026.10.20' : '2026.11.12 23:59'}</p><p class="small" style="margin-top:8px">活动安排：2026.11.15 下午 / 紫荆综合服务楼（示例）</p>${ended ? note('招募已结束，录取结果已锁定，不能重新开放、撤销或放弃录取。' + (why === '提前结束' ? '提前结束时待审申请的终态与通知文案待确认。' : ''), 'warn') : ''}${scenario === 'paused' ? note('当前暂停申请与审核。已存在记录保留；暂停期间撤回、放弃及文字编辑边界待确认。', 'warn') : ''}<h2 style="margin:28px 0 13px">关于这次合作</h2><div class="bodycopy">我们想把校园里的低碳行动变成看得见的数据。
从食堂、通勤和宿舍生活三个场景出发，进行访谈、数据整理与原型实现。

你不需要是全能选手。我们希望每位伙伴都能负责一个明确的小方向，每周投入约 3–5 小时，共同完成调研与作品展示。</div></div><div class="panel"><h2>开放岗位 <small class="muted">逐岗申请 · 独立名额</small></h2>${[
    '前端开发',
    '数据分析',
    '视觉设计',
  ]
    .map((r, j) => {
      const used = j === 2 ? 1 : state.approved.filter((a) => a.role === r).length,
        total = j === 0 ? 2 : 1;
      let app = state.apps.find((a) => a.role === r && a.status === '待审核');
      let full = j === 2 || used >= total;
      return `<div class="role"><div class="between"><h3>${r}</h3>${badge(ended ? '已结束' : full ? '岗位已满' : app ? '本人已申请 · 待审核' : '剩余 ' + (total - used) + ' 名', full ? 'gray' : '')}</div><p>${['实现招募发现与申请体验，熟悉 HTML / CSS / React。', '整理调研结果，用 Python 完成数据分析与可视化。', '为最终展示设计视觉规范与信息图。'][j]}</p>${chips(
        [
          ['React', 'TypeScript'],
          ['Python', '数据分析'],
          ['Figma', '视觉设计'],
        ][j],
      )}<div class="progress"><span style="width:${(used / total) * 100}%"></span></div><div class="between"><span class="small muted">已录取 ${used} / ${total} 人</span>${own ? routeLink('review', '管理本岗申请') : actionButton(ended ? '招募已结束' : full ? '岗位已满' : app ? '已申请，等待审核' : '申请此岗位', `apply:${r}`, 'btn', ended || full || app || scenario === 'paused' ? 'disabled' : '')}</div></div>`;
    })
    .join(
      '',
    )}${routeLink('applications', '查看我的申请与历史 →', 'link')}</div></section><aside><div class="panel"><div class="actions"><span class="avatar lg">陈</span><div><h3>陈书宁</h3><p class="small">${state.identity === 'guest' ? '发布者' : '环境学院 · 2024 级'}</p></div></div><p class="small" style="margin:18px 0">关注可持续发展，希望与不同专业的伙伴共同探索。</p><div class="actions">${routeLink('person', '查看主页')}${actionButton('私信', 'message', 'btn')}</div></div><div class="panel"><h3>把想法留在这里</h3><p class="small" style="margin:12px 0">收藏后可在个人中心回看，已结束招募也会保留。</p><div class="actions">${actionButton(state.saved ? '★ 已收藏' : '☆ 收藏招募', 'favorite')}${actionButton('举报招募', 'report:招募', 'link')}</div></div>${own ? `<div class="panel"><h3>发布者工具</h3><div class="actions" style="margin-top:18px">${routeLink('edit', '编辑招募')}${routeLink('review', '管理申请')}</div></div>` : ''}</aside></div>`;
}
function people() {
  return (
    header('找到同频的同学', '用技能和兴趣建立连接。仅展示允许被搜索的认证用户。') +
    `<div class="panel"><form id="people-search"><div class="search"><input id="people-key" aria-label="搜索同学昵称" placeholder="输入同学昵称"><input id="people-tag" aria-label="技能或兴趣" placeholder="技能 / 兴趣标签"><button class="btn">搜索同学</button>${actionButton('清空', 'clear-people', 'btn ghost')}</div></form></div><div class="grid" id="people-results">${personCards('', '')}</div>`
  );
}
function personCards(q, t) {
  return (
    ['陈书宁', '沈亦舟', '周映雪', '唐以安']
      .filter(
        (n, i) =>
          n.includes(q) &&
          [
            'Python 产品设计 可持续',
            'OCR 文献研究 数字人文',
            '摄影 UI设计 校园记录',
            '用户研究 无障碍 徒步',
          ][i].includes(t),
      )
      .map(
        (n, i) =>
          `<article class="card"><div class="actions"><span class="avatar lg">${n[0]}</span><div><h3>${n}</h3><p>${['环境学院', '人文学院', '美术学院', '软件学院'][i]} · 2024 级</p></div></div><p>喜欢从不同学科看问题，期待一次有意思的合作。</p>${chips(tags[i])}<div class="actions">${routeLink('person?person=' + i, '查看主页')}${actionButton('发私信', 'message', 'link')}</div></article>`,
      )
      .join('') ||
    empty(
      '没有符合条件的同学',
      '关闭被搜索的用户不出现在结果中。',
      actionButton('清空筛选', 'clear-people'),
    )
  );
}
function person() {
  let preview = params.has('preview'),
    p = state.privacy;
  return (
    header(preview ? '我的对外主页' : '同学主页', '公开资料不展示校园邮箱、审核结果或申请留言。') +
    `<div class="panel"><div class="actions"><span class="avatar lg">${preview ? '林' : '陈'}</span><div class="grow"><h1>${preview ? esc(state.profile.name) : '陈书宁'}</h1><p>${preview ? esc(state.profile.dept) : '环境学院'} · 2024 级</p></div>${actionButton('私信联系', 'message', 'btn')}${actionButton('分享我的招募', 'share')}${actionButton(state.blocked ? '已拉黑' : '拉黑用户', 'block', 'btn ghost')}${actionButton('举报用户', 'report:用户', 'link')}</div><p style="margin:20px 0">${preview ? esc(state.profile.bio) : '关注可持续发展与校园公共生活。希望把一个小想法认真做成作品。'}</p>${chips(preview ? state.profile.tags.split(/[,，]/) : ['Python', '产品设计', '可持续发展'])}</div><div class="grid two"><section class="panel"><h2>发布的招募</h2>${preview && !p[1] ? note('对方未公开此项') : card(0)}</section><section><div class="panel"><h2>申请记录</h2>${!preview || !p[2] ? note('对方未公开此项') : `<div class="row"><div><h3>${titles[1]}</h3><p>申请岗位：前端开发</p></div></div><p class="small muted">公开记录仅展示招募与岗位。</p>`}</div><div class="panel"><h2>组队历史</h2>${!preview || !p[3] ? note('对方未公开此项') : `<p>校园碳足迹地图 · 数据分析</p>`}</div></section></div>`
  );
}
function roleForm(i = 0, data = {}) {
  return `<div class="roleform" data-role-index="${i}"><div class="between"><h3>岗位 ${i > 100 ? $$('#roles .roleform').length + 1 : i + 1}</h3>${actionButton('删除岗位', 'remove-role', 'link')}</div><div class="formgrid" style="margin-top:15px">${field('岗位名称 *', 'role-name-' + i, data.name || '')}${field('招募人数 *', 'role-count-' + i, data.count || '', 'number', 'min="1" step="1"')}${field('技能标签', 'role-tags-' + i, data.tags || '')}<div class="field"><label for="role-desc-${i}">岗位描述</label><textarea id="role-desc-${i}" name="role-desc-${i}">${esc(data.desc || '')}</textarea></div></div></div>`;
}
function publish(edit = false) {
  const d = edit
    ? state.published || {
        title: titles[0],
        description: '把校园低碳行动变成看得见的数据，一起完成访谈、整理和原型。',
        category: '学科竞赛',
        deadline: '2026-11-12T23:59',
        place: '紫荆综合服务楼',
        tags: 'Python, 产品设计',
        roles: [
          { name: '前端开发', count: 2 },
          { name: '数据分析', count: 1 },
        ],
      }
    : params.has('draft')
      ? state.drafts[+params.get('draft')] || {}
      : state.form || {};
  return (
    header(
      edit ? '编辑已发布招募' : '让一个想法，找到伙伴',
      edit
        ? '仅保存一般信息；不会改变原发布时间或重新开放招募。'
        : '按岗位描述合作期待。草稿由你手动保存。',
      routeLink('drafts', '草稿箱'),
    ) +
    `${edit ? note('已发布的截止时间、岗位人数及增删已锁定。岗位名称、描述、技能与活动时间暂作只读，编辑边界待确认。', 'warn') : ''}<form id="publish-form" data-edit="${edit}"><div class="columns"><section><div class="panel"><h2>01 / 基本信息</h2>${field('招募标题 *', 'title', d.title || '')}<div class="field"><label for="category-form">一级分类 *</label><select id="category-form" name="category"><option value="">请选择分类</option>${[...new Set(cats)].map((c) => `<option ${d.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div><div class="field"><label for="description">招募说明 *</label><textarea id="description" name="description" rows="6" placeholder="介绍目标、协作方式与投入期待">${esc(d.description || '')}</textarea></div></div><div class="panel"><div class="between"><h2>02 / 招募岗位</h2>${edit ? '' : actionButton('＋ 新增岗位', 'add-role')}</div><div id="roles" style="margin-top:18px">${edit ? d.roles.map((r) => `<div class="role"><div class="between"><h3>${r.name}</h3>${badge('发布后锁定', 'gray')}</div><p>招募人数 ${r.count} · 岗位描述 / 技能标签只读，编辑边界待定。</p></div>`).join('') : (d.roles || [{}, {}]).map((r, i) => roleForm(i, r)).join('')}</div></div><div class="panel"><h2>03 / 时间、地点与标签</h2><div class="formgrid">${field('招募截止时间 *', 'deadline', d.deadline || '', 'datetime-local', edit ? 'disabled' : '')}${field('活动时间（选填）', 'eventTime', d.eventTime || '', 'datetime-local', edit ? 'disabled' : '')}${field('活动地点（选填）', 'place', d.place || '')}${field('招募标签（选填，可新建）', 'tags', d.tags || '')}</div><p class="small muted">标签用逗号分隔；分类只能选择平台已有项。</p></div></section><aside><div class="panel"><div class="eyebrow">A GOOD START</div><h3>明确期待，让合作更轻松</h3><p style="margin-top:15px;line-height:2">描述一个具体目标。<br>让每个岗位都有清楚职责。<br>区分招募截止和活动时间。<br>发布后名额与截止不能修改。</p></div>${note('本原型不上传招募图片或附件，也不会自动保存草稿。')}</aside></div><div id="form-errors" role="alert"></div><div class="stickyfoot"><span class="small muted">${edit ? '保留原发布时间' : '草稿仅自己可见 · 正式发布后直接公开'}</span><div class="actions">${routeLink('posts', '返回', 'btn ghost')}${edit ? '' : actionButton('手动保存草稿', 'save-draft')}<button class="btn" type="submit">${edit ? '保存一般信息' : '正式发布招募'}</button></div></div></form>`
  );
}
function draftPage() {
  return (
    header(
      '草稿箱',
      '缺项也可以保存。只有点击保存才会更新草稿。',
      routeLink('publish', '＋ 新建招募', 'btn'),
    ) +
    `<div class="panel">${state.drafts.length ? state.drafts.map((d, i) => `<div class="row"><div class="grow"><h3>${esc(d.title || '未命名招募')}</h3><p>最近手动保存：${esc(d.savedAt)} · ${d.roles?.length || 0} 个岗位</p><p>${esc(d.roles?.map((r) => r.name || '未命名岗位').join(' / ') || '岗位信息尚未填写')}</p></div><div class="actions">${routeLink('publish?draft=' + i, '继续编辑')}${actionButton('删除', 'delete-draft:' + i, 'btn danger')}</div></div>`).join('') : empty('还没有草稿', '可以先保存不完整的想法，稍后继续。', routeLink('publish', '创建招募', 'btn'))}</div>`
  );
}
function profile() {
  return side(
    header(
      '个人资料',
      '完善你的介绍，让合作从了解开始。',
      routeLink('person?preview', '查看对外主页'),
    ) +
      `<div class="panel"><div class="actions"><span class="avatar lg">林</span><div><b>${esc(state.profile.name)}</b><p class="small">${state.identity === 'unverified' ? '待校园认证' : '校园身份已认证'} · 本人账号</p></div></div></div><form id="profile-form" class="panel"><div class="field"><label for="avatar-upload">个人头像（可选）</label><input id="avatar-upload" type="file" accept="image/*"><small>仅作本地选图预览，正式上传规则待确认。</small><div id="avatar-preview"></div></div><div class="formgrid">${field('昵称 *', 'profile-name', state.profile.name, 'text', 'required')}${field('院系', 'profile-dept', state.profile.dept)}${field('年级', 'profile-year', state.profile.year)}${field('技能与兴趣标签（可新建）', 'profile-tags', state.profile.tags)}</div><div class="field"><label for="profile-bio">个人简介</label><textarea id="profile-bio">${esc(state.profile.bio)}</textarea></div><button class="btn">保存资料</button></form>`,
  );
}
function posts() {
  return side(
    header(
      '我的发布',
      '管理自己的招募与岗位申请。',
      routeLink('drafts', '草稿箱') + routeLink('publish', '＋ 新建招募', 'btn'),
    ) +
      tabs(['全部', '招募中', '已结束', '受管理限制']) +
      `<div class="panel">${
        [0, 1, 2]
          .filter(
            (i) =>
              filter === '全部' ||
              (filter === '招募中' && i < 2) ||
              (filter === '已结束' && i === 2) ||
              (filter === '受管理限制' && i === 1),
          )
          .map(
            (i) =>
              `<div class="row"><div class="grow"><div class="tags">${badge(i === 2 || state.ended ? '已结束 · ' + (i === 2 ? '已截止' : state.endedReason) : '招募中', i === 2 ? 'gray' : 'green')}${i === 1 ? badge('独立下架', 'red') : ''}${i === 1 ? badge('封禁暂停', 'amber') : ''}</div><h3 style="margin-top:10px">${i === 0 && state.published ? esc(state.published.title) : titles[i]}</h3><p>2026.10.29 发布 · ${i === 2 ? '2026.10.20' : '2026.11.12'} 截止</p><p>前端开发 ${state.approved.length} / 2 · 数据分析 0 / 1 · 待审 3</p><div class="actions">${routeLink(`detail?own&id=${i}${i === 2 ? '&scene=ended-time' : ''}`, '查看详情', 'link')}${routeLink('review', '管理申请', 'link')}${i === 0 && !state.ended ? routeLink('edit', '编辑', 'link') : actionButton('编辑暂不可用', 'edit-unavailable', 'link', 'disabled')}<span class="small muted">${i > 0 ? '结束 / 限制下编辑边界待定' : ''}</span></div></div><div class="actions">${actionButton('提前结束', 'end-post', 'btn danger', i > 0 || state.ended ? 'disabled' : '')}${actionButton('删除', 'delete-post:' + i, 'btn ghost', i === 0 || i === 2 ? 'disabled' : '')}<span class="small muted">${i === 0 || i === 2 ? '曾有申请历史，不可删除' : '无申请历史，可删除'}</span></div></div>`,
          )
          .join('') || empty('暂无对应记录', '调整筛选条件试试。')
      }</div>`,
  );
}
function tabs(xs) {
  return `<div class="tabs">${xs.map((x) => actionButton(x, 'filter:' + x, filter === x ? 'active' : '')).join('')}</div>`;
}
function baseApps() {
  return [
    {
      role: '前端开发',
      status: '待审核',
      title: titles[0],
      message: '有 React 项目经验，希望负责页面实现。',
    },
    { role: '数据分析', status: '待审核', title: titles[0], message: '愿意参与访谈及分析。' },
    {
      role: '用户研究',
      status: '未通过',
      reason: '普通拒绝：本期研究方向不匹配',
      title: titles[5],
      message: '对无障碍设计感兴趣。',
    },
    { role: '摄影', status: '已撤回', reason: '本人主动撤回', title: titles[3] },
    { role: '数据整理', status: '已过期', reason: '招募已截止，待审申请已过期', title: titles[2] },
    { role: '前端开发', status: '已通过', ended: false, title: titles[4] },
    { role: '视觉设计', status: '已通过', ended: true, title: titles[1] },
    { role: '数据分析', status: '未通过', reason: '岗位已满，未进入录取', title: titles[4] },
    {
      role: '产品设计',
      status: '未通过',
      reason: '原录取已撤销；保留原通过及撤销记录，重申请资格待确认',
      title: titles[5],
    },
    { role: '用户研究', status: '未通过', reason: '此申请当前无法继续处理', title: titles[2] },
  ];
}
function getApps() {
  return [...state.apps, ...baseApps()].map((a, i) => {
    let o = { ...a, index: i, ...(state.appOverrides[i] || {}) };
    let own = state.approved.find((x) => x.name === '林知夏');
    if (own && a.title === titles[0] && o.status === '待审核') {
      if (own.role === a.role) {
        o.status = '已通过';
        o.reason = '发布者已通过此岗位';
      } else {
        o.status = '已撤回';
        o.reason = '本人在本招募另一岗位通过，自动撤回';
      }
    }
    if (
      (scenario === 'ended-time' || (state.ended && state.endedReason === '已截止')) &&
      o.status === '待审核'
    ) {
      o.status = '已过期';
      o.reason = '招募已截止，待审申请已过期';
    }
    if (state.ended && state.endedReason === '提前结束' && o.status === '待审核') {
      o.reason = '招募已提前结束，结果锁定；待审终态待确认';
    }
    return o;
  });
}
function applications() {
  return side(
    header('我的申请', '每次申请都有记录，新的申请不会覆盖旧结果。') +
      tabs(['全部', '待审核', '已通过', '未通过', '已撤回', '已过期']) +
      `<div class="panel">${getApps()
        .filter((a) => filter === '全部' || filter === a.status)
        .map(
          (a) =>
            `<article class="row"><div class="grow"><div class="between"><h3>${a.title || titles[0]}</h3>${badge(a.status, a.status === '已通过' ? 'green' : a.status === '待审核' ? '' : 'gray')}</div><p>申请岗位：${esc(a.role)} · 2026.10.29 10:30 提交</p><p>本人留言：${esc(a.message || '未填写留言')}</p>${a.reason ? note(esc(a.reason)) : ''}${a.ended || (state.ended && a.status === '已通过') ? note('招募已结束 · 已招满，结果已锁定。') : ''}<details><summary>查看申请历史</summary><div class="timeline"><p>10.29 10:30 提交申请 · ${esc(a.role)}</p>${a.reason ? `<p>10.29 11:00 ${esc(a.reason)}</p>` : '<p>等待发布者审核</p>'}${a.status === '未通过' && a.role === '产品设计' ? '<p>10.29 10:45 曾通过申请 → 11:00 发布者撤销录取</p>' : ''}</div></details></div><div class="actions">${routeLink('detail' + (a.ended ? '?scene=ended-full' : ''), '查看招募', 'link')}${a.status === '待审核' ? actionButton('撤回申请', 'withdraw:' + a.index) : a.status === '已通过' ? actionButton(a.ended || state.ended ? '结果已锁定' : '放弃录取', 'giveup:' + a.index, 'btn danger', a.ended || state.ended ? 'disabled' : '') : (a.status === '已撤回' && a.reason?.includes('主动')) || (a.status === '未通过' && a.reason?.includes('普通拒绝')) ? actionButton('重新申请', 'apply:' + a.role) : ''}</div></article>`,
        )
        .join('')}</div>`,
  );
}
function teams() {
  return side(
    header('我的队伍', '这里记录你通过申请加入的招募，不提供后续团队协作管理。') +
      note('仅展示仍保持通过结果的记录。曾通过后撤销或放弃是否纳入此处，待确认。') +
      `<div class="grid two">${[0, 1].map((i) => `<article class="card"><div>${badge(i ? '已结束 · 已招满' : '招募中', i ? 'gray' : 'green')}</div><h3>${titles[i]}</h3><p>本人录取岗位：${i ? '前端开发' : '数据分析'}<br>通过时间：2026.10.28 16:20</p><div class="actions">${routeLink('detail' + (i ? '?scene=ended-full' : ''), '查看详情')}${actionButton('联系发布者', 'message', 'link')}</div></article>`).join('')}</div>`,
  );
}
function favorites() {
  return side(
    header('我的收藏', '结束后的公开招募仍可回看。') +
      `<div class="grid two">${card(0)}${card(1, true)}<div class="card"><h3>此内容暂不可查看</h3><p>该目标当前不可用，不显示原招募正文。</p>${routeLink('system?scene=restricted', '查看反馈', 'link')}${actionButton('取消收藏', 'unfavorite', 'link')}</div></div><div style="margin-top:20px">${actionButton('取消当前样例收藏', 'unfavorite')}</div>`,
  );
}
function settings() {
  const names = ['可被搜索', '公开我的发布', '公开我的申请', '公开我的队伍'];
  return side(
    header('账号设置', '管理账号、公开范围和个人边界。') +
      `<div class="panel"><h2>账号与校园认证</h2><div class="row"><div class="grow"><h3>lin.demo@example.edu（演示邮箱）</h3><p>邮箱允许域与验证参数待确认，演示地址不代表正式规则。</p></div>${badge(state.identity === 'unverified' ? '待校园认证' : '已认证', 'green')}${actionButton('继续认证', 'verify', 'link')}${actionButton('退出登录', 'logout', 'link')}</div></div><div class="panel"><h2>隐私设置</h2>${names.map((n, i) => `<label class="switchrow"><span><b>${n}</b><p>${['关闭后不进入同学搜索，不影响正常业务。', '仅影响主页栏目，公开招募仍出现在发现页。', '仅公开招募与岗位，不公开结果或留言。', '仅公开本人通过的招募及岗位，不公开其他成员。'][i]}</p></span><input type="checkbox" data-privacy="${i}" ${state.privacy[i] ? 'checked' : ''}></label>`).join('')}<div class="actions" style="margin-top:18px">${routeLink('person?preview', '预览对外主页')}${actionButton('保存隐私设置', 'privacy-save', 'btn')}</div></div><div class="panel"><h2>黑名单</h2>${state.blocked ? `<div class="row"><span class="avatar">陈</span><div class="grow"><b>陈书宁</b><p>解除不会恢复旧申请或删除历史。</p></div>${actionButton('解除拉黑', 'unblock')}</div>` : '<p>暂未拉黑任何用户。</p>'}</div><div class="panel"><h2>注销账号</h2><p>注销后原账号无法登录。历史记录、招募及审计的清理与保留规则待确认，不承诺全部立即删除。</p><div style="margin-top:18px">${actionButton('了解并开始注销', 'cancel-account', 'btn danger')}</div></div>`,
  );
}
function review() {
  const closed = state.ended || scenario.startsWith('ended');
  return side(
    header('申请管理', '校园碳足迹地图 · 按岗位独立审核', routeLink('posts', '返回我的发布')) +
      note(
        closed
          ? '招募已结束，结果已锁定，审批与撤销录取均不可用。'
          : '通过一个岗位会自动撤回该同学在本招募其他岗位的待审申请。',
        closed ? 'warn' : '',
      ) +
      `<div class="statrow"><div class="panel"><strong>${state.approved.length} / 2</strong><span class="small muted">前端开发</span></div><div class="panel"><strong>0 / 1</strong><span class="small muted">数据分析</span></div><div class="panel"><strong>${closed ? '已结束' : '招募中'}</strong><span class="small muted">原截止 11.12 23:59</span></div></div>${tabs(['全部', '前端开发', '数据分析', '已通过'])}<div class="panel">${[
        '林知夏',
        '沈亦舟',
        '周映雪',
      ]
        .map((n, i) => {
          const r = i === 2 ? '数据分析' : '前端开发';
          if (filter !== '全部' && filter !== '已通过' && filter !== r) return '';
          let yes = state.approved.some((a) => a.name === n),
            no = state.rejected.includes(n);
          if (filter === '已通过' && !yes) return '';
          return `<div class="row"><span class="avatar">${n[0]}</span><div class="grow"><div class="between"><h3>${n}</h3>${badge(yes ? '已通过' : no ? '未通过' : '待审核', yes ? 'green' : '')}</div><p>申请岗位：${r} · 10.29 10:30</p><p>留言：有相关实践经验，希望参与一个完整项目。</p><details><summary>必要资料与历史</summary><div class="timeline"><p>计算机系 · 2024 级 · React / Python</p><p>10:30 提交 ${r}；${i === 0 ? '10:35 同招募申请数据分析，待审核' : '等待审核'}</p>${yes ? '<p>11:00 已通过，其他岗位待审自动撤回</p>' : ''}${no ? '<p>11:00 已拒绝，原因已记录</p>' : ''}</div></details><div class="actions" style="margin-top:10px">${routeLink('person', '个人主页', 'link')}${actionButton('私信', 'message', 'link')}</div></div><div class="actions">${!yes && !no ? actionButton('通过', `approve:${n}:${r}`, 'btn', closed || scenario === 'paused' ? 'disabled' : '') + actionButton('拒绝', `reject:${n}`, 'btn danger', closed || scenario === 'paused' ? 'disabled' : '') : yes ? actionButton('撤销录取', `revoke:${n}`, 'btn danger', closed ? 'disabled' : '') : ''}</div></div>`;
        })
        .join(
          '',
        )}</div>${note('评审补充：通过最后一个岗位名额时，当前岗位其他待审未通过；全岗满员则立即结束。')}${actionButton('演示最后一个名额通过', 'last-slot', 'btn secondary')}`,
  );
}
function chats() {
  return (
    header('消息中心', '与同学自由沟通，无需先建立申请关系。') +
    `<div class="tabs">${routeLink('chats', '私信', 'active')}${routeLink('notices', '系统通知' + (state.unread ? ' · ' + state.unread : ''), '')}</div>${note('管理员可在填写查看原因并成功记录访问审计后，查看会话内容。个人删除与隐藏只影响自己。')}<div class="panel chat mobile-list" id="chat-shell"><aside class="conversations"><h3 style="padding:10px">最近会话</h3>${state.hiddenChat ? '<p class="small muted" style="padding:15px">此会话已为你隐藏</p>' : actionButton('<span class="avatar">陈</span> 陈书宁 <span class="num">2</span>', 'open-chat', 'row link')}<div class="row"><div><b>沈亦舟</b><p>可以一起讨论研究方向。</p></div></div></aside><section class="chatmain"><div class="chathead between"><div>${actionButton('← 会话', 'chat-back', 'mobile-back link')}<b>陈书宁</b> <small class="muted">校园同学</small></div><div class="actions">${actionButton('隐藏会话', 'hide-chat', 'link')}${actionButton('拉黑', 'block', 'link')}</div></div><div class="bubbles" id="bubbles"><p class="small muted" style="text-align:center">2026 年 10 月 29 日</p>${state.deletedMessage ? '' : `<div class="bubble">你好！我正在寻找一起完成校园项目的伙伴。</div><div class="actions">${actionButton('仅为我删除', 'delete-message', 'link')}${actionButton('举报此消息', 'report:消息', 'link')}</div>`}<div class="bubble self">可以先看看我的招募：${routeLink('detail', titles[0], '')}</div>${state.messages.map((m) => `<div class="bubble self">${esc(m)}</div>`).join('')}</div><form id="message-form" class="composer"><textarea id="message-input" placeholder="输入文字，或粘贴招募链接…" aria-label="私信内容"></textarea><div class="between" style="margin-top:10px"><span class="small muted">仅文字 · 无已读回执</span><button class="btn" ${state.blocked ? 'disabled' : ''}>发送</button></div>${state.blocked ? '<p class="small muted">已拉黑该用户，当前发送受限。</p>' : ''}</form></section></div>${actionButton('演示新消息更新', 'new-message', 'link')} · ${actionButton('演示发送失败', 'send-error', 'link')} · ${actionButton('查看对方保留记录样例', 'other-history', 'link')}`
  );
}
const noticesData = [
  ['申请通过', '你申请的前端开发岗位已通过，请查看本人记录。', 'applications'],
  ['申请未通过', '本次申请未通过，原因可在申请历史中查看。', 'applications'],
  ['申请到期', '招募已截止，尚未审核的申请已过期。', 'applications'],
  ['申请者放弃录取', '有一位申请者放弃了尚在招募中的录取，名额已释放。', 'review'],
  ['招募下架', '你发布的招募已暂停公开；本人可查看适当处置说明。', 'posts'],
  ['招募恢复', '管理限制已解除，符合原截止与生命周期条件的招募恢复展示。', 'posts'],
  ['账号处罚', '账号业务操作受到限制，请查看账号状态说明。', 'settings'],
  ['举报处理完成', '你提交的举报已核查并处理，感谢维护校园社区。', 'discover'],
];
function notices() {
  return (
    header('系统通知', '只向你展示与你有关的安全结果摘要。') +
    `<div class="tabs">${routeLink('chats', '私信', '')}${routeLink('notices', '系统通知', 'active')}</div>${tabs(['全部', '未读'])}<div class="panel">${noticesData.map(([title, text, to], i) => (filter === '未读' && state.noticeRead.includes(i) ? '' : `<div class="row"><span class="avatar">${state.noticeRead.includes(i) ? '✓' : '·'}</span><div class="grow"><h3>${title} ${state.noticeRead.includes(i) ? '' : badge('未读')}</h3><p>${text}</p><p>2026.10.29 11:${String(i * 5).padStart(2, '0')}</p></div>${actionButton('查看', 'notice:' + i + ':' + to, 'link')}</div>`)).join('')}</div>${note('申请者收到的下架提示仅为“此招募暂不可查看”；处罚通知不包含举报者身份或识别性证据。')}`
  );
}
function table(headers, rows) {
  return `<table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((cells) => `<tr>${cells.map((c, i) => `<td data-label="${headers[i]}">${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
function adminUsers() {
  return (
    header('用户管理', '账号资格与学生业务权限分别管理。') +
    `<div class="panel"><div class="search"><input placeholder="搜索昵称 / 账号" id="admin-key" aria-label="用户关键词"><select id="admin-user-filter"><option>全部状态</option><option>正常</option><option>封禁</option></select>${actionButton('查询', 'admin-query')}</div>${table(
      ['用户', '校园认证', '账号状态', '操作'],
      [
        [
          '林知夏<br><span class="muted">lin.demo@example.edu</span>',
          badge('已认证', 'green'),
          badge(state.banned ? '封禁' : '正常', state.banned ? 'red' : 'green'),
          `<div class="actions">${actionButton('详情', 'user-detail', 'link')}${actionButton(state.banned ? '解封' : '封禁', state.banned ? 'unban' : 'ban', state.banned ? 'btn secondary' : 'btn danger')}</div>`,
        ],
        [
          '沈亦舟<br><span class="muted">shen.demo@example.edu</span>',
          badge('待认证', 'amber'),
          badge('正常', 'green'),
          actionButton('详情', 'user-detail', 'link'),
        ],
      ],
    )}</div>${note('封禁后可登录只读；未结束招募隐藏。解封不会解除独立违规下架，也不会重开已结束招募。')}`
  );
}
function adminPosts() {
  return (
    header('招募管理', '生命周期与管理限制独立显示。') +
    `<div class="panel"><div class="search"><input id="admin-key" placeholder="标题 / 发布者" aria-label="招募关键词"><select><option>全部生命周期</option><option>招募中</option><option>已结束</option></select><select><option>全部管理限制</option><option>独立下架</option><option>封禁暂停</option></select>${actionButton('查询', 'admin-query')}</div>${table(
      ['招募', '岗位 / 原截止', '生命周期', '管理限制', '操作'],
      titles
        .slice(0, 3)
        .map((t, i) => [
          t + '<p>发布者：林知夏</p>',
          '前端 1/2 · 分析 0/1<br>2026.11.12 23:59',
          badge(i === 2 ? '已结束 · 已截止' : '招募中', i === 2 ? 'gray' : 'green'),
          (state.takenDown || i > 0 ? badge('独立下架', 'red') : '无独立下架') +
            ' ' +
            (state.banned || i === 1 ? badge('封禁暂停', 'amber') : ''),
          `<div class="actions">${actionButton('详情', 'post-detail', 'link')}${i === 0 ? actionButton(state.takenDown ? '恢复' : '下架', state.takenDown ? 'restore' : 'takedown', 'btn secondary') : actionButton('恢复', 'restore-fail:' + i, 'btn ghost')}</div>`,
        ]),
    )}</div>${note('下架期间待审记录保留，截止不延长。双限制需要分别解除；到期后即使清除管理限制，也不能恢复招募中。')}`
  );
}
function adminReports() {
  return (
    header('举报管理', '人工核查后再决定处置，举报本身不会触发处罚。') +
    tabs(['全部', '招募', '用户', '消息']) +
    `<div class="panel">${table(
      ['目标', '举报摘要', '状态', '操作'],
      ['招募', '用户', '消息']
        .filter((t) => filter === '全部' || t === filter)
        .map((t, i) => [
          `${t} #R00${i + 1}`,
          t === '消息'
            ? '涉及具体消息，正文需经过访问审计后查看。'
            : '用户反馈内容可能不符合社区规则。',
          badge('待处理', 'amber'),
          actionButton('核查详情', 'report-detail:' + t, 'link'),
        ]),
    )}</div>`
  );
}
function adminTags() {
  return (
    header('分类与标签', '维护共享词汇，让搜索与资料引用保持一致。') +
    tabs(['全部', '一级分类', '招募标签', '技能与兴趣标签']) +
    `<div class="panel"><div class="between"><p>分类为预设项，学生仅能创建标签。</p>${actionButton('新增分类 / 标签', 'taxonomy-create', 'btn')}</div>${table(
      ['名称', '类型', '引用数', '维护'],
      [
        ['学科竞赛', '一级分类', '12', actionButton('修改名称', 'rename', 'link')],
        [
          state.merged ? 'Python' : 'Python / python',
          '技能与兴趣标签',
          '资料 8 · 招募 5',
          actionButton('合并重复标签', 'merge-tags', 'link'),
        ],
        ['用户研究', '招募标签', '7', actionButton('引用与停用说明', 'tag-impact', 'link')],
      ].filter((r) => filter === '全部' || r[1] === filter),
    )}</div>${note('被引用项的停用 / 删除策略待确认，原型不执行引用数据删除。')}`
  );
}
function adminAudit() {
  return (
    header('私信与访问审计', '每次进入正文前填写原因，先完成审计，再开放只读内容。') +
    tabs(['全部', '会话检索', '访问审计']) +
    (filter === '访问审计'
      ? `<div class="panel">${
          state.audits.length
            ? table(
                ['管理员', '会话', '访问时间', '原因'],
                state.audits.map((x) => ['许老师', x.target, esc(x.time), esc(x.reason)]),
              )
            : empty('暂无访问记录', '填写有效原因并成功记录审计后，访问记录会显示于此。')
        }</div>`
      : `<div class="panel"><div class="search"><input id="admin-key" placeholder="按会话参与人检索" aria-label="会话检索">${actionButton('检索', 'admin-query')}</div>${table(
          ['会话', '参与人', '访问状态', '操作'],
          [
            [
              'DM-001',
              '林知夏 / 陈书宁',
              '未访问 · 无正文预览',
              actionButton('填写原因后查看', 'audit-open:DM-001', 'btn secondary'),
            ],
            [
              'DM-002',
              '沈亦舟 / 唐以安',
              '未访问 · 无正文预览',
              actionButton('填写原因后查看', 'audit-open:DM-002', 'btn secondary'),
            ],
          ],
        )}</div>`) +
    note('空原因、无权限、审计失败均不能展示正文。审计记录只读，无修改或删除入口。')
  );
}
function systemPage() {
  return (
    header('全局访问与异常反馈', '关键失败会解释原因，并提供下一步。') +
    `<div class="grid two">${[
      [
        '校园认证后继续',
        '申请、发布、收藏、私信等业务操作需要校园认证。',
        actionButton('继续认证', 'verify', 'btn'),
      ],
      [
        '你没有权限查看此内容',
        '请确认账号身份，或返回公开页面。',
        routeLink('discover', '返回发现组队'),
      ],
      ['此内容暂不可查看', '不展示隐藏正文和具体管理原因。', routeLink('discover', '浏览其他招募')],
      [
        '状态已变化，请刷新后继续',
        '岗位已满、已截止或申请已处理。此时不能提示提交成功。',
        actionButton('刷新最新状态', 'refresh-conflict', 'btn'),
      ],
    ]
      .map(
        ([t, p, a]) =>
          `<div class="panel"><h2>${t}</h2><p style="margin:15px 0">${p}</p>${a}</div>`,
      )
      .join('')}</div>`
  );
}
function guide() {
  return (
    header(
      '原型目录与功能覆盖',
      '依据 04-pages-and-functions.md v1.0 · 所有数据均为虚构演示',
      routeLink('scenarios', '21 条业务走查', 'btn'),
    ) +
    `<div class="banner"><div><b>清华紫 · 一次完整的校园协作旅程</b><p>发现 → 发布与申请 → 沟通与隐私 → 人工治理</p></div><span>21 业务视图 + 认证 + 全局反馈</span></div><div class="review-grid">${routes.map(([id, n, r]) => routeLink(r, `<span class="eyebrow">${id}</span><b>${n}</b><small>${r.startsWith('admin') ? '后台样例需选择管理员身份' : '点击打开页面 →'}</small>`, 'review-card')).join('')}</div><section class="panel" style="margin-top:25px"><h2>39 项功能落点</h2>${table(
      ['功能', '页面 / 组件', '验收重点'],
      COVERAGE.features.map((x) => [x[0], x[1], x[2]]),
    )}</section><section class="panel"><h2>28 条用户故事落点</h2>${table(
      ['用户故事', '页面 / 组件'],
      COVERAGE.stories.map((x) => [x[0], x[1]]),
    )}</section><section class="panel"><h2>待确认业务</h2><p>未定事项保留为说明和只读变体，不把演示成功当作产品决策。</p>${table(
      ['事项', '原型处理'],
      COVERAGE.pending.map((x) => [x[0], x[2]]),
    )}</section>`
  );
}
function scenarios() {
  return (
    header(
      '业务走查工作台',
      '评审工具，不属于正式学生端或后台菜单。',
      routeLink('guide', '页面与覆盖目录'),
    ) +
    note(
      '点击“进入场景”会加载对应演示状态。静态原型不发送邮件、不做真实鉴权、并发控制、轮询或审计；演示记录仅保存在本机。',
    ) +
    `<div class="grid two">${COVERAGE.walks.map(([id, path, result], i) => `<article class="card"><div class="eyebrow">${id} / WALKTHROUGH</div><h3>${path}</h3><p>${result}</p>${actionButton('进入场景 →', 'walk:' + i, 'link')}</article>`).join('')}</div>`
  );
}
function publishedDetail() {
  const d = state.published;
  return `<div class="crumb">${routeLink('posts', '我的发布', 'link')} / 已公开详情</div>${header(esc(d.title || titles[0]), '发布者本人视图 · 一般信息保存不改变发布时间', routeLink('edit', '编辑一般信息') + routeLink('review', '管理申请', 'btn'))}<div class="columns"><section><div class="panel">${chips([d.category || '学科竞赛', ...(d.tags || '').split(/[,，]/).filter(Boolean)])}<h2 style="margin:24px 0 12px">招募说明</h2><div class="bodycopy">${esc(d.description || '')}</div><p style="margin-top:20px">原截止：${esc(d.deadline || '2026-11-12T23:59')}<br>活动时间：${esc(d.eventTime || '未填写')}<br>地点：${esc(d.place || '未填写')}</p></div><div class="panel"><h2>招募岗位</h2>${(d.roles || []).map((r) => `<div class="role"><div class="between"><h3>${esc(r.name)}</h3>${badge('0 / ' + r.count + ' 已录取')}</div><p>${esc(r.desc || '暂无补充描述')}</p>${chips((r.tags || '').split(/[,，]/).filter(Boolean))}${routeLink('review', '管理岗位申请', 'link')}</div>`).join('')}</div></section><aside><div class="panel"><h3>发布成功，即刻公开</h3><p style="margin:15px 0">这是本机保存的演示内容，不包含管理员审批等待环节。</p>${badge(state.ended ? '已结束 · ' + state.endedReason : '招募中', state.ended ? 'gray' : 'green')}</div></aside></div>`;
}
// The hash selects a page; query parameters select a review scenario on that page.
function render() {
  const hash = location.hash.slice(1) || 'discover';
  let [r, q] = hash.split('?');
  route = r;
  params = new URLSearchParams(q || '');
  scenario = params.get('scene') || 'normal';
  const protectedRoutes = [
    'people',
    'person',
    'publish',
    'drafts',
    'edit',
    'chats',
    'notices',
    'profile',
    'posts',
    'applications',
    'teams',
    'favorites',
    'settings',
    'review',
  ];
  let content = '';
  const functions = {
    discover,
    detail: () => (params.has('own') && state.published ? publishedDetail() : detail()),
    people,
    person,
    publish: () => publish(false),
    drafts: draftPage,
    edit: () => publish(true),
    profile,
    posts,
    applications,
    teams,
    favorites,
    settings,
    review,
    chats,
    notices,
    'admin-users': adminUsers,
    'admin-posts': adminPosts,
    'admin-reports': adminReports,
    'admin-tags': adminTags,
    'admin-audit': adminAudit,
    guide,
    scenarios,
    system: systemPage,
    auth: () =>
      header('校园身份认证', '使用校园邮箱注册或登录。') +
      empty(
        '在合作之前，先认识彼此',
        '登录或完成校园认证，继续你的组队旅程。',
        actionButton('登录 / 注册 / 认证', 'auth', 'btn'),
      ),
  };
  if (protectedRoutes.includes(route) && ['guest', 'unverified'].includes(state.identity)) {
    content = empty(
      '请先完成校园认证',
      '公开招募可以自由浏览，完整资料与业务操作需要校园身份。',
      actionButton('登录 / 继续认证', 'auth', 'btn'),
    );
  } else content = commonScene() || (functions[route] || systemPage)();
  let readOnly = state.identity === 'banned' || state.banned;
  $('#app').innerHTML =
    (route.startsWith('admin')
      ? admin(content)
      : topbar() +
        `<main class="wrap">${readOnly ? note('账号当前只读：可查看允许的历史，业务写操作不可用。封禁期间注销等例外边界待确认。', 'warn') : ''}${['guide', 'scenarios', 'auth'].includes(route) ? '' : sceneControl()}${content}<footer class="footer">CAMPUSCREW · 清华大学校园组队 / 静态交互原型 · 非官方校方网站</footer></main>`) +
    reviewbar();
  document.title = (routes.find((x) => x[2] === route)?.[1] || '原型目录') + ' · CampusCrew';
  if (readOnly) {
    $$('form button,.stickyfoot button,[data-privacy]').forEach((b) => (b.disabled = true));
  }
  if (route === 'auth') openAuth('login');
  if (route === 'chats' && params.has('thread'))
    $('#chat-shell')?.classList.replace('mobile-list', 'mobile-thread');
  if (scenario === 'conflict')
    modal(
      '状态已变化，请刷新后继续',
      note('旧页面中的岗位可能已满、已截止或申请已经处理。当前操作没有成功。', 'error'),
      actionButton('刷新最新状态', 'refresh-conflict', 'btn'),
    );
}
function openAuth(mode = 'login') {
  authMode = mode;
  const isVerify = mode === 'verify';
  modal(
    isVerify ? '完成校园邮箱认证' : mode === 'register' ? '加入 CampusCrew' : '欢迎回到 CampusCrew',
    `<div class="tabs">${actionButton('登录', 'auth-login', mode === 'login' ? 'active' : '')}${actionButton('注册', 'auth-register', mode === 'register' ? 'active' : '')}${actionButton('邮箱认证', 'auth-verify', isVerify ? 'active' : '')}</div>${note('允许邮箱域、验证码时效及频率待配置。这里不会发送真实邮件。')}<form id="auth-form">${mode === 'register' ? field('昵称 *', 'auth-name', '', 'text', 'required') : ''}${field('校园邮箱 *', 'auth-email', '', 'email', 'required placeholder="演示使用有效邮箱格式"')}${!isVerify ? field('密码 *', 'auth-password', '', 'password', 'required') : ''}${mode !== 'login' ? field('邮件验证码 *', 'auth-code', '', 'text', 'required placeholder="演示验证码 123456"') : ''}${mode !== 'login' ? actionButton('发送演示验证码', 'send-code', 'btn secondary') : ''}<div id="auth-error" role="alert"></div><div class="actions"><button class="btn">${isVerify ? '验证并回到原任务' : mode === 'register' ? '注册并验证' : '登录'}</button></div></form><p class="small muted" style="margin-top:18px">管理员填写原因并记录审计后可查看私信。此原型不保存密码。</p><details style="margin-top:15px"><summary>认证异常样例</summary><div class="tags" style="margin-top:12px">${['邮箱已注册', '邮箱格式或允许域不符', '验证码过期', '邮件发送失败', '登录失败', '已注销账号不可登录'].map((s) => actionButton(s, 'auth-error:' + s, 'chip')).join('')}</div></details>`,
    actionButton('返回原页面', 'close', 'link'),
  );
}
function collectForm() {
  const f = $('#publish-form');
  const data = Object.fromEntries(new FormData(f));
  data.roles = $$('#roles [data-role-index]').map((el) => {
    let i = el.dataset.roleIndex;
    return {
      name: $('#role-name-' + i).value,
      count: $('#role-count-' + i).value,
      tags: $('#role-tags-' + i).value,
      desc: $('#role-desc-' + i).value,
    };
  });
  return data;
}
function openApply(role) {
  if (!authGate('apply:' + role)) return;
  if (state.apps.some((a) => a.role === role && a.status === '待审核')) {
    toast('你已在此岗位有待审申请，不能重复提交。');
    return;
  }
  modal(
    '申请岗位 · ' + esc(role),
    note('申请将进入待审核。不同岗位可分别申请，在一个岗位通过后，本招募其他岗位待审会自动撤回。') +
      `<div class="field"><label for="apply-message">申请留言（选填）</label><textarea id="apply-message" placeholder="介绍相关经验与参与期待…"></textarea></div>`,
    actionButton('取消', 'close') + actionButton('提交岗位申请', 'submit-apply:' + role, 'btn'),
  );
}
// All generated controls dispatch through data-action to keep the static views interactive.
function action(a, el) {
  if (a === 'close') return close();
  if (a === 'auth') return openAuth(state.identity === 'unverified' ? 'verify' : 'login');
  if (a === 'verify') return openAuth('verify');
  if (a.startsWith('auth-') && ['auth-login', 'auth-register', 'auth-verify'].includes(a))
    return openAuth(a.slice(5));
  if (a.startsWith('auth-error:'))
    return ($('#auth-error').innerHTML = note(a.slice(11) + '，请检查后重试。', 'error'));
  if (a === 'send-code') {
    el.disabled = true;
    el.textContent = '演示验证码已发送';
    return toast('演示验证码为 123456；重发时效未设定。');
  }
  if (a === 'logout') {
    state.identity = 'guest';
    persist();
    go('discover');
    return toast('已退出登录');
  }
  if (a === 'reset') {
    return confirmAction(
      '重置演示',
      '清除本机演示申请、草稿、消息及设置，恢复初始样例。',
      'reset-confirm',
    );
  }
  if (a === 'reset-confirm') {
    localStorage.removeItem('campuscrew-v2');
    location.reload();
    return;
  }
  if (a === 'scene-normal') {
    go(route);
    return;
  }
  if (a === 'refresh-conflict') {
    close();
    go('detail?scene=ended-full');
    return toast('已刷新：岗位已满，招募已结束。');
  }
  if (a === 'favorite') {
    if (!authGate(a)) return;
    state.saved = !state.saved;
    persist();
    render();
    return toast(state.saved ? '已收藏，可到我的收藏回看。' : '已取消收藏');
  }
  if (a === 'unfavorite') {
    if (!authGate(a)) return;
    el.closest('.card')?.remove();
    state.saved = false;
    persist();
    return toast('已取消此条收藏。');
  }
  if (a === 'message') {
    if (!authGate(a)) return;
    return go('chats?thread');
  }
  if (a === 'share') {
    if (!authGate(a)) return;
    go('chats?thread');
    $('#message-input').value = '我的招募：' + location.href.split('#')[0] + '#detail';
    return toast('已填入招募链接；对方仍需要按岗位申请。');
  }
  if (a.startsWith('apply:')) return openApply(a.slice(6));
  if (a.startsWith('submit-apply:')) {
    if (!authGate(a)) return;
    state.apps.push({
      role: a.slice(13),
      status: '待审核',
      title: titles[0],
      message: $('#apply-message').value,
    });
    persist();
    close();
    render();
    return toast('申请已提交，当前状态：待审核。');
  }
  if (a === 'add-role') {
    const i = Date.now();
    $('#roles').insertAdjacentHTML('beforeend', roleForm(i));
    return;
  }
  if (a === 'remove-role') {
    el.closest('.roleform').remove();
    return;
  }
  if (a === 'save-draft') {
    if (!authGate(a)) return;
    const d = collectForm();
    d.savedAt = new Date().toLocaleString('zh-CN');
    if (params.has('draft')) state.drafts[+params.get('draft')] = d;
    else state.drafts.push(d);
    state.form = d;
    persist();
    return toast('草稿已手动保存 · ' + d.savedAt);
  }
  if (a.startsWith('delete-draft:'))
    return confirmAction(
      '删除草稿',
      '删除后无法在本原型中恢复。',
      'do-delete-draft:' + a.split(':')[1],
    );
  if (a.startsWith('do-delete-draft:')) {
    if (!authGate(a)) return;
    state.drafts.splice(+a.split(':')[1], 1);
    persist();
    close();
    render();
    return toast('草稿已删除');
  }
  if (a.startsWith('filter:')) {
    filter = a.slice(7);
    return render();
  }
  if (a === 'end-post')
    return confirmAction(
      '提前结束招募',
      '结束不可逆，结果将锁定，不能重开。待审申请的终态与通知文案尚待确认，不在此擅自改变其结果。',
      'do-end',
    );
  if (a === 'do-end') {
    if (!authGate(a)) return;
    state.ended = true;
    state.endedReason = '提前结束';
    persist();
    close();
    render();
    return toast('招募已提前结束，结果已锁定。');
  }
  if (a.startsWith('delete-post:'))
    return confirmAction('删除招募', '该样例没有申请历史，允许条件删除。', 'do-delete-post');
  if (a === 'do-delete-post') {
    if (!authGate(a)) return;
    close();
    el = undefined;
    toast('无申请历史的招募已删除（样例反馈）。');
    return;
  }
  if (a.startsWith('withdraw:') || a.startsWith('giveup:'))
    return confirmAction(
      a.startsWith('withdraw') ? '撤回申请' : '放弃录取',
      a.startsWith('withdraw')
        ? '保留原申请历史。若招募仍开放且符合资格，可重新提交新申请。'
        : '仅限未结束招募；放弃后释放名额，不会自动恢复旧申请。重申请资格待确认。',
      'do-app:' + a,
    );
  if (a.startsWith('do-app:')) {
    if (!authGate(a)) return;
    const [, kind, index] = a.split(':');
    let all = getApps();
    const x = all[+index];
    state.appOverrides[+index] = {
      status: kind === 'withdraw' ? '已撤回' : '放弃录取',
      reason: kind === 'withdraw' ? '本人主动撤回' : '本人放弃录取，释放名额；重申请资格待确认',
    };
    persist();
    close();
    render();
    return toast('操作已记录，历史仍保留。');
  }
  if (a.startsWith('approve:')) {
    const [, name, role] = a.split(':');
    return confirmAction(
      '通过申请',
      `通过 ${name} 的 ${role} 申请。该同学本招募其他岗位待审将自动撤回。若岗位满员，其他待审未通过；全岗满员则招募立即结束。`,
      'do-approve:' + name + ':' + role,
    );
  }
  if (a.startsWith('do-approve:')) {
    if (!authGate(a)) return;
    const [, name, role] = a.split(':');
    state.approved.push({ name, role });
    persist();
    close();
    render();
    return toast('已通过；其他岗位待审已自动撤回，名额与通知同步更新。');
  }
  if (a.startsWith('reject:') || a.startsWith('revoke:'))
    return confirmAction(
      a.startsWith('reject') ? '拒绝申请' : '撤销录取',
      '原因将出现在本人申请记录中；结束后不能调整结果。',
      'do-' + a,
      true,
    );
  if (a.startsWith('do-reject:') || a.startsWith('do-revoke:')) {
    if (!authGate(a) || !reason()) return;
    const name = a.split(':')[1];
    state.rejected.push(name);
    state.approved = state.approved.filter((x) => x.name !== name);
    persist();
    close();
    render();
    return toast('结果已更新，原因与历史已记录。');
  }
  if (a === 'last-slot')
    return confirmAction(
      '通过最后一个名额',
      '同人其他岗位待审自动撤回；本岗位其他待审未通过；全岗满员立即结束，无法撤销或放弃。',
      'last-slot-confirm',
    );
  if (a === 'last-slot-confirm') {
    if (!authGate(a)) return;
    state.approved.push({ name: '林知夏', role: '前端开发' });
    state.rejected.push('沈亦舟', '周映雪');
    state.ended = true;
    state.endedReason = '已招满';
    persist();
    close();
    render();
    return toast('全岗已招满，结果已锁定。');
  }
  if (a === 'privacy-save') {
    if (!authGate(a)) return;
    persist();
    return toast('四个独立隐私设置已保存。');
  }
  if (a === 'block')
    return confirmAction(
      '拉黑用户',
      '该用户向你发送私信、申请你的招募将受限；你全部招募中该用户的待审申请将未通过。解黑不会恢复旧申请，历史不会删除。',
      'do-block',
    );
  if (a === 'do-block') {
    if (!authGate(a)) return;
    state.blocked = true;
    persist();
    close();
    render();
    return toast('已拉黑，相关待审申请已按规则处理。');
  }
  if (a === 'unblock')
    return confirmAction('解除拉黑', '允许后续正常交互，旧申请不会自动恢复。', 'do-unblock');
  if (a === 'do-unblock') {
    if (!authGate(a)) return;
    state.blocked = false;
    persist();
    close();
    render();
    return toast('已解除拉黑，旧申请保持原结果。');
  }
  if (a.startsWith('report:')) {
    if (!authGate(a)) return;
    return modal(
      '举报' + a.slice(7),
      note('目标：' + a.slice(7) + '样例。提交后等待人工核查，不会自动处罚。') +
        `<div class="field"><label for="report-reason">举报理由 *</label><textarea id="report-reason" placeholder="请描述问题，不要提交无关个人信息"></textarea><small class="error" id="report-error"></small></div>`,
      actionButton('取消', 'close') + actionButton('提交举报', 'submit-report', 'btn'),
    );
  }
  if (a === 'submit-report') {
    if (!$('#report-reason').value.trim())
      return ($('#report-error').textContent = '请填写举报理由。');
    close();
    return toast('举报已提交，等待人工核查。');
  }
  if (a === 'open-chat') {
    $('#chat-shell').classList.replace('mobile-list', 'mobile-thread');
    state.unread = Math.max(0, state.unread - 2);
    persist();
    return;
  }
  if (a === 'chat-back') return $('#chat-shell').classList.replace('mobile-thread', 'mobile-list');
  if (a === 'delete-message' || a === 'hide-chat')
    return confirmAction(
      a === 'delete-message' ? '仅为我删除' : '隐藏会话',
      '此操作仅对你生效，对方的记录保持。隐藏后新消息的重现规则待确认。',
      'do-' + a,
    );
  if (a === 'do-delete-message' || a === 'do-hide-chat') {
    if (!authGate(a)) return;
    if (a.includes('delete')) state.deletedMessage = true;
    else state.hiddenChat = true;
    persist();
    close();
    render();
    return toast('已仅为你更新；对方记录保持。');
  }
  if (a === 'other-history')
    return modal(
      '对方视角 · 历史仍保留',
      note('仅为我删除 / 隐藏不改变对方记录。') +
        '<div class="bubble">你好！我正在寻找一起完成校园项目的伙伴。</div><div class="bubble self">可以先看看我的招募：校园碳足迹地图</div>',
    );
  if (a === 'new-message') {
    state.unread++;
    persist();
    render();
    return toast('收到一条新消息，会话与全站未读已更新（本地事件模拟）。');
  }
  if (a === 'send-error')
    return modal(
      '消息发送失败',
      note('网络暂时不可用，内容保留。请重试。', 'error'),
      actionButton('保留内容并返回', 'close', 'btn'),
    );
  if (a.startsWith('notice:')) {
    const [, i, to] = a.split(':');
    state.noticeRead.push(+i);
    state.unread = Math.max(0, state.unread - 1);
    persist();
    return go(to);
  }
  if (a === 'cancel-account')
    return modal(
      '注销账号 · 1 / 3 影响说明',
      note(
        '原账号将无法登录。招募、申请、私信和审计记录的保留与清理细则待确认，不承诺全部删除。',
        'warn',
      ),
      actionButton('取消', 'close') + actionButton('继续验证身份', 'cancel-verify', 'btn danger'),
    );
  if (a === 'cancel-verify')
    return modal(
      '注销账号 · 2 / 3 身份验证',
      field('演示身份验证码', 'cancel-code', '', 'text', 'placeholder="123456"') +
        '<div id="cancel-error"></div>',
      actionButton('取消', 'close') + actionButton('验证并继续', 'cancel-check', 'btn danger'),
    );
  if (a === 'cancel-check') {
    if ($('#cancel-code').value !== '123456')
      return ($('#cancel-error').innerHTML = note('验证码不正确，不能继续。', 'error'));
    return modal(
      '注销账号 · 3 / 3 再次确认',
      note('确认后退出，原账号将不能登录。此处为本地静态演示。', 'warn') +
        '<label class="actions"><input id="cancel-agree" type="checkbox">我已了解注销影响并确认继续</label>',
      actionButton('保留账号', 'close') + actionButton('确认注销', 'cancel-final', 'btn danger'),
    );
  }
  if (a === 'cancel-final') {
    if (!$('#cancel-agree').checked) return toast('请先勾选确认注销影响。');
    if (!authGate(a)) return;
    state.closedAccount = true;
    state.identity = 'guest';
    persist();
    close();
    go('discover');
    return toast('演示账号已注销并退出，原账号不可再次登录。');
  }
  if (route.startsWith('admin') && state.identity !== 'admin') return toast('需要管理员权限。');
  if (a === 'ban')
    return confirmAction(
      '封禁用户',
      '用户登录后只读，未结束招募隐藏；无自动解封期限。独立下架保持。',
      'do-ban',
      true,
    );
  if (a === 'unban')
    return confirmAction(
      '解封用户',
      '仅恢复未结束、未截止且仅因封禁隐藏的招募。独立下架不会被解除。',
      'do-unban',
    );
  if (a === 'do-ban') {
    if (!reason()) return;
    state.banned = true;
    persist();
    close();
    render();
    return toast('用户已封禁，管理历史已追加。');
  }
  if (a === 'do-unban') {
    state.banned = false;
    persist();
    close();
    render();
    return toast('已解封，独立下架仍保留。');
  }
  if (a === 'user-detail')
    return modal(
      '用户详情与管理历史',
      '<p>林知夏 · lin.demo@example.edu · 已校园认证</p>' +
        note('未结束招募：2 条；封禁影响公开展示与业务写入。') +
        '<div class="timeline"><p>2026.10.29 账号状态：' +
        (state.banned ? '封禁' : '正常') +
        '</p><p>管理记录只向必要权限角色展示。</p></div>',
    );
  if (a === 'post-detail')
    return modal(
      '招募治理详情',
      `<h3>${titles[0]}</h3><p>生命周期：招募中 · 原截止 2026.11.12</p>${note('管理限制：' + (state.takenDown ? '独立下架' : '无独立下架') + ' / ' + (state.banned ? '封禁暂停' : '无封禁暂停'))}<div class="timeline"><p>原申请记录与原截止保持，不因下架删除或延期。</p></div>`,
    );
  if (a === 'takedown')
    return confirmAction(
      '下架招募',
      '暂停公开、申请与审核。待审保留，原截止不延长。',
      'do-takedown',
      true,
    );
  if (a === 'do-takedown') {
    if (!reason()) return;
    state.takenDown = true;
    persist();
    close();
    render();
    return toast('已独立下架，处置记录与安全通知已生成（样例）。');
  }
  if (a === 'restore')
    return confirmAction(
      '恢复招募',
      state.banned
        ? '恢复仅解除独立下架，封禁暂停仍在，公开展示仍不可用。'
        : '该招募未结束且未截止，可以清除独立下架恢复展示。',
      'do-restore',
    );
  if (a === 'do-restore') {
    state.takenDown = false;
    persist();
    close();
    render();
    return toast(state.banned ? '独立下架已解除，封禁暂停仍保留。' : '已恢复公开，原截止不变。');
  }
  if (a.startsWith('restore-fail:'))
    return modal(
      '不能恢复为招募中',
      note(
        a.endsWith('2')
          ? '下架期间已经到期，生命周期已结束，不能重开。'
          : '仍有封禁暂停；清除独立下架也不会解除另一项限制。',
        'warn',
      ),
    );
  if (a.startsWith('report-detail:')) {
    const t = a.split(':')[1];
    return modal(
      '人工核查 · ' + t,
      `<p>举报目标：${t} #R001</p><p>理由：用户反馈可能存在不合适内容，等待核实。</p>${t === '消息' ? note('消息正文未开放，必须先完成原因填写与访问审计。') + actionButton('进入私信访问审计', 'report-audit', 'link') : note('目标当前状态及必要证据仅向管理权限展示。')}<div class="field" style="margin-top:18px"><label for="reason">核实结论与处理原因 *</label><textarea id="reason"></textarea><small class="error" id="reason-error"></small></div>`,
      actionButton('驳回举报', 'report-dismiss') +
        actionButton(
          '核实并进入处置',
          t === '用户' ? 'report-ban' : 'report-takedown',
          'btn danger',
        ),
    );
  }
  if (a === 'report-audit') {
    close();
    return go('admin-audit');
  }
  if (a === 'report-dismiss') {
    if (!reason()) return;
    close();
    return toast('举报已驳回，处理原因已记录；举报者收到结果摘要。');
  }
  if (a === 'report-ban' || a === 'report-takedown') {
    if (!reason()) return;
    return action(a === 'report-ban' ? 'ban' : 'takedown', el);
  }
  if (a === 'taxonomy-create' || a === 'rename')
    return modal(
      a === 'rename' ? '修改名称' : '新增分类 / 标签',
      field('名称 *', 'taxonomy-name') + note('普通用户不可新建一级分类。'),
      actionButton('取消', 'close') + actionButton('保存', 'taxonomy-save', 'btn'),
    );
  if (a === 'taxonomy-save') {
    if (!$('#taxonomy-name').value.trim()) return toast('请填写名称。');
    close();
    return toast('名称已保存（静态样例反馈）。');
  }
  if (a === 'merge-tags')
    return modal(
      '合并重复标签',
      note('来源：python → 目标：Python。已有 8 条资料、5 条招募引用将统一到目标，引用不删除。'),
      actionButton('取消', 'close') + actionButton('确认合并', 'do-merge', 'btn'),
    );
  if (a === 'do-merge') {
    state.merged = true;
    persist();
    close();
    render();
    return toast('标签已合并，个人资料与招募引用统一为 Python。');
  }
  if (a === 'tag-impact')
    return modal(
      '引用影响说明',
      note('当前有 7 条引用。停用与删除被引用项的策略待确认，暂不提供破坏性删除。', 'warn'),
    );
  if (a.startsWith('audit-open:'))
    return modal(
      '填写私信访问原因',
      note('会话 ' + a.split(':')[1] + '。成功记录审计前，不显示任何消息正文。') +
        `<div class="field"><label for="reason">查看原因 *</label><textarea id="reason" placeholder="说明具体管理目的"></textarea><small class="error" id="reason-error"></small></div>`,
      actionButton('取消', 'close') +
        actionButton('演示审计失败', 'audit-fail') +
        actionButton('记录审计并查看', 'audit-view:' + a.split(':')[1], 'btn'),
    );
  if (a === 'audit-fail') {
    if (!reason()) return;
    $('#reason-error').textContent = '审计记录失败，正文仍不可访问。请重试。';
    return;
  }
  if (a.startsWith('audit-view:')) {
    const why = reason();
    if (!why) return;
    const target = a.split(':')[1];
    state.audits.push({ target, reason: why, time: new Date().toLocaleString('zh-CN') });
    persist();
    return modal(
      '会话正文 · 只读',
      note('✓ 审计记录成功 · 管理员：许老师 · 原因：' + esc(why), 'success') +
        '<div class="audit">会话 ' +
        target +
        ' · 访问记录已追加</div><div class="bubble">陈书宁 / 10.29 10:00<br>你好！想交流一下校园项目。</div><div class="bubble self">林知夏 / 10.29 10:02<br>可以，招募链接我稍后发给你。</div>',
      actionButton('查看访问审计', 'audit-log', 'btn secondary'),
    );
  }
  if (a === 'audit-log') {
    close();
    filter = '访问审计';
    return render();
  }
  if (a === 'admin-query') {
    const q = $('#admin-key')?.value.trim() || '';
    $$('tbody tr').forEach((tr) => (tr.hidden = q && !tr.textContent.includes(q)));
    const status = $('#admin-user-filter')?.value;
    if (status && status !== '全部状态')
      $$('tbody tr').forEach((tr) => {
        tr.hidden = tr.hidden || !tr.textContent.includes(status);
      });
    return toast('筛选已更新。');
  }
  if (a === 'clear-search') {
    const f = $('#search-form');
    f.reset();
    $('#results').innerHTML = titles.map((_, i) => card(i)).join('');
    $('#selected-filters').innerHTML = '';
    $('#result-count').textContent = ' / 6 条招募';
    return;
  }
  if (a === 'clear-people') {
    $('#people-search').reset();
    $('#people-results').innerHTML = personCards('', '');
    return;
  }
  if (a.startsWith('remove-filter:')) {
    const id = a.split(':')[1];
    const input = document.getElementById(id);
    input.value = input.tagName === 'SELECT' ? input.options[0].value : '';
    $('#search-form').requestSubmit();
    return;
  }
  if (a.startsWith('walk:')) return startWalk(+a.split(':')[1]);
  toast('操作已触发；此处为静态演示反馈。');
}
function startWalk(i) {
  state.ended = false;
  state.banned = false;
  state.takenDown = false;
  state.approved = [];
  state.rejected = [];
  state.appOverrides = {};
  if (i === 0) state.apps = [];
  if (i === 3)
    state.apps = [
      { title: titles[0], role: '前端开发', status: '待审核', message: '希望参与开发。' },
      { title: titles[0], role: '数据分析', status: '待审核', message: '也愿意参与分析。' },
    ];
  const dest = [
    'detail',
    'publish',
    'edit',
    'review',
    'review',
    'applications',
    'applications',
    'applications?scene=ended-time',
    'people',
    'chats?thread',
    'settings',
    'person',
    'admin-reports',
    'admin-posts',
    'admin-users',
    'admin-audit',
    'admin-tags',
    'favorites',
    'posts',
    'settings',
    'detail?scene=conflict',
  ][i];
  if (i === 0) state.identity = 'guest';
  else if (i >= 12 && i <= 16) state.identity = 'admin';
  else state.identity = 'normal';
  if (i === 7) {
    state.ended = true;
    state.endedReason = '已截止';
  }
  if (i === 14) {
    state.banned = true;
    state.takenDown = true;
  }
  persist();
  filter = '全部';
  go(dest);
  toast(COVERAGE.walks[i][0] + '：' + COVERAGE.walks[i][2]);
}
// Event delegation covers controls created after navigation or a scenario change.
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (el) {
    e.preventDefault();
    action(el.dataset.action, el);
  }
});
document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.id === 'identity') {
    state.identity = el.value;
    persist();
    return render();
  }
  if (el.id === 'scene') {
    go(route + '?' + new URLSearchParams({ ...Object.fromEntries(params), scene: el.value }));
    return;
  }
  if (el.dataset.privacy !== undefined) {
    if (!authGate('privacy-save')) {
      el.checked = !el.checked;
      return;
    }
    state.privacy[+el.dataset.privacy] = el.checked;
    persist();
  }
  if (el.id === 'avatar-upload' && el.files[0]) {
    let img = new Image();
    img.alt = '本地头像预览';
    img.style.cssText = 'width:80px;height:80px;object-fit:cover;border-radius:50%;margin-top:12px';
    img.src = URL.createObjectURL(el.files[0]);
    $('#avatar-preview').replaceChildren(img);
  }
  if (el.id === 'sort') {
    const container = $('#results');
    container.replaceChildren(...[...container.children].reverse());
    toast('排序已更新：' + el.value);
  }
});
document.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  if (f.id === 'auth-form') {
    if (state.closedAccount) {
      $('#auth-error').innerHTML = note(
        '此演示账号已注销，无法登录。请重置演示开始新的评审。',
        'error',
      );
      return;
    }
    if (authMode !== 'login' && $('#auth-code').value !== '123456') {
      return ($('#auth-error').innerHTML = note(
        '验证码不正确或已过期。演示请填写 123456。',
        'error',
      ));
    }
    state.identity = 'normal';
    state.verified = true;
    persist();
    close();
    const task = returnTask;
    returnTask = null;
    render();
    toast(authMode === 'login' ? '登录成功（演示）' : '校园认证完成（演示）');
    if (task?.startsWith('apply:')) openApply(task.slice(6));
    return;
  }
  if (f.id === 'publish-form') {
    if (!authGate('publish')) return;
    const d = collectForm();
    let errors = [];
    for (const [k, n] of [
      ['title', '标题'],
      ['category', '分类'],
      ['description', '描述'],
    ]) {
      if (!d[k]?.trim()) {
        errors.push(n + '不能为空');
        f.elements[k]?.setAttribute('aria-invalid', 'true');
      }
    }
    if (f.dataset.edit === 'false') {
      if (!d.roles.length) errors.push('至少需要一个岗位');
      d.roles.forEach((r, i) => {
        if (!r.name.trim()) errors.push('岗位 ' + (i + 1) + ' 名称不能为空');
        if (!Number.isInteger(+r.count) || +r.count < 1)
          errors.push('岗位 ' + (i + 1) + ' 人数须为正整数');
      });
      if (!d.deadline) errors.push('请选择招募截止时间');
      else if (new Date(d.deadline) <= new Date())
        errors.push('截止时间应晚于当前时间（演示校验建议）');
    }
    if (errors.length) {
      $('#form-errors').innerHTML = note(errors.map(esc).join('<br>'), 'error');
      f.querySelector('[aria-invalid]')?.focus();
      return;
    }
    state.form = d;
    state.published =
      f.dataset.edit === 'true'
        ? {
            ...(state.published || {}),
            ...d,
            roles: state.published?.roles || [
              { name: '前端开发', count: 2 },
              { name: '数据分析', count: 1 },
            ],
          }
        : d;
    persist();
    toast(
      f.dataset.edit === 'true'
        ? '一般信息已保存，原发布时间与结构不变。'
        : '招募已直接公开，可管理岗位申请。',
    );
    go('detail?own');
    return;
  }
  if (f.id === 'profile-form') {
    if (!authGate('save-profile')) return;
    state.profile = {
      name: $('#profile-name').value,
      dept: $('#profile-dept').value,
      year: $('#profile-year').value,
      bio: $('#profile-bio').value,
      tags: $('#profile-tags').value,
    };
    persist();
    return toast('个人资料已保存。');
  }
  if (f.id === 'message-form') {
    if (!authGate('message')) return;
    let t = $('#message-input').value.trim();
    if (!t) return toast('请输入要发送的文字。');
    state.messages.push(t);
    persist();
    render();
    $('#chat-shell').classList.replace('mobile-list', 'mobile-thread');
    return toast('消息已发送（本地演示）。');
  }
  if (f.id === 'search-form') {
    let q = $('#keyword').value.trim(),
      cat = $('#category').value,
      t = $('#tag-search').value.trim(),
      place = $('#place').value.trim(),
      start = $('#date-start').value,
      end = $('#date-end').value;
    let ids = titles
      .map((_, i) => i)
      .filter(
        (i) =>
          (titles[i] + tags[i].join('')).includes(q) &&
          (cat === '全部分类' || cats[i] === cat) &&
          tags[i].join('').includes(t) &&
          (!place || '校内 紫荆 线上协作'.includes(place)) &&
          (!start || start <= '2026-11-12') &&
          (!end || end >= '2026-11-12'),
      );
    $('#results').innerHTML =
      ids.map((i) => card(i)).join('') ||
      empty(
        '没有符合条件的招募',
        '清空部分筛选条件后再试。',
        actionButton('清空条件', 'clear-search'),
      );
    $('#result-count').textContent = ' / ' + ids.length + ' 条招募';
    $('#selected-filters').innerHTML = [
      ['keyword', q],
      ['category', cat === '全部分类' ? '' : cat],
      ['tag-search', t],
      ['place', place],
      ['date-start', start],
      ['date-end', end],
    ]
      .filter((x) => x[1])
      .map(([id, v]) => actionButton(esc(v) + ' ×', 'remove-filter:' + id, 'chip active'))
      .join('');
    return;
  }
  if (f.id === 'people-search') {
    $('#people-results').innerHTML = personCards(
      $('#people-key').value.trim(),
      $('#people-tag').value.trim(),
    );
  }
});
window.addEventListener('hashchange', () => {
  filter = '全部';
  render();
  scrollTo(0, 0);
});
render();
