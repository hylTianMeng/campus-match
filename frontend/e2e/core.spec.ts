import { test, expect, type Page } from '@playwright/test';

async function login(page: Page, name: string) {
  await page.goto('/#/auth');
  await page.getByLabel('邮箱', { exact: true }).fill(name + '@example.test');
  await page.getByLabel('密码', { exact: true }).fill('CampusCrew-Dev-2026');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByRole('heading', { name: '发现值得同行的事' })).toBeVisible();
}

test('public discovery, search, mobile navigation and no overflow', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('article.card')).toHaveCount(6);
  await page.screenshot({ path: 'test-results/discover-desktop.png', fullPage: true });
  await page.getByLabel('招募关键词').fill('碳足迹');
  await page.getByRole('button', { name: '搜索招募', exact: true }).click();
  await expect(page.locator('article.card')).toHaveCount(1);
  await page.getByRole('link', { name: '查看招募 ↗' }).click();
  await expect(page.getByRole('heading', { name: '关于这次合作' })).toBeVisible();
  await page.getByRole('button', { name: '一键参与', exact: true }).click();
  await expect(page.getByRole('heading', { name: '欢迎回到 CampusCrew' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/discover');
  await expect(page.locator('article.card')).toHaveCount(6);
  await page.screenshot({ path: 'test-results/discover-mobile.png', fullPage: true });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
  await page.getByRole('navigation').getByRole('link', { name: '发布招募' }).click();
  await expect(page.getByRole('heading', { name: '请先登录' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('real draft → publish → apply → owner approval → notification', async ({ browser }) => {
  const ownerContext = await browser.newContext(),
    applicantContext = await browser.newContext();
  const owner = await ownerContext.newPage(),
    applicant = await applicantContext.newPage();
  await login(owner, 'chen');
  await owner.goto('/#/publish');
  const title = '端到端测试：校园协作';
  await owner.getByLabel('招募标题 *', { exact: true }).fill(title);
  await owner.getByRole('button', { name: '手动保存草稿' }).click();
  await expect(owner.getByRole('status')).toHaveText('草稿已保存');
  await owner.getByRole('link', { name: '草稿箱', exact: true }).click();
  await owner.getByRole('link', { name: '继续编辑' }).click();
  await expect(owner.getByLabel('招募标题 *', { exact: true })).toHaveValue(title);
  await owner.getByLabel('一级分类 *').selectOption('课程项目');
  await owner.getByLabel('招募说明 *').fill('共同完成可运行的校园协作项目。');
  await owner.getByRole('button', { name: '＋ 新增岗位' }).click();
  await owner.getByLabel('岗位名称 *').fill('React 开发');
  await owner.getByLabel('招募人数 *').fill('1');
  const future = new Date(Date.now() + 7 * 86400000);
  const local = new Date(future.getTime() - future.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
  await owner.getByLabel('招募截止时间 *').fill(local);
  await owner.getByLabel('招募者联系方式（选填）').fill('contact@example.test');
  await owner.getByLabel('预期成果').fill('一份可以演示的作品');
  await owner.getByRole('button', { name: '正式发布招募' }).click();
  await expect(owner.getByRole('heading', { name: title, exact: true })).toBeVisible();
  const detail = owner.url();
  await expect(owner.getByText('一份可以演示的作品', { exact: true })).toBeVisible();
  await login(applicant, 'lin');
  await applicant.goto(detail);
  await applicant.getByRole('button', { name: '☆ 收藏招募' }).click();
  await expect(applicant.getByRole('button', { name: '★ 已收藏' })).toBeVisible();
  await applicant.getByRole('button', { name: '一键参与', exact: true }).click();
  await applicant.getByRole('button', { name: '申请此岗位' }).click();
  await applicant.getByLabel('申请留言（选填）').fill('我有 React 项目经验。');
  await applicant.getByLabel('简历 / 作品链接（选填）').fill('https://example.com/portfolio');
  await applicant.getByRole('button', { name: '提交申请' }).click();
  await expect(applicant.getByRole('status')).toHaveText('申请已提交，等待审核');
  await owner.getByRole('link', { name: '管理申请', exact: true }).first().click();
  await expect(owner.getByText('留言：我有 React 项目经验。', { exact: true })).toBeVisible();
  await owner.getByRole('button', { name: '通过', exact: true }).click();
  await owner.getByRole('button', { name: '确认通过申请' }).click();
  await expect(owner.getByText('已通过', { exact: true })).toBeVisible();
  await applicant.goto('/#/applications');
  await expect(applicant.getByText('已通过', { exact: true })).toBeVisible();
  await applicant.goto(detail);
  await expect(applicant.getByRole('button', { name: '招募已结束', exact: true })).toBeDisabled();
  await applicant.goto('/#/notices');
  await expect(applicant.getByRole('heading', { name: /申请已通过/ })).toBeVisible();
  await ownerContext.close();
  await applicantContext.close();
});

test('profile privacy, real messages and empty results', async ({ browser }) => {
  const a = await browser.newContext(),
    b = await browser.newContext();
  const lin = await a.newPage(),
    chen = await b.newPage();
  await login(lin, 'lin');
  await lin.goto('/#/settings');
  await lin.getByLabel('允许通过昵称、技能或兴趣找到我').uncheck();
  await lin.getByRole('button', { name: '保存设置' }).click();
  await expect(lin.getByRole('status')).toHaveText('资料已保存');
  await login(chen, 'chen');
  await chen.goto('/#/people');
  await chen.getByLabel('搜索同学昵称').fill('林知夏');
  await chen.getByRole('button', { name: '搜索同学' }).click();
  await expect(chen.getByRole('heading', { name: '没有符合条件的同学' })).toBeVisible();
  await lin.goto('/#/chats?peer=2');
  await lin.getByLabel('私信内容').fill('你好，一起讨论项目吧。');
  await lin.getByRole('button', { name: '发送', exact: true }).click();
  await expect(lin.getByText('你好，一起讨论项目吧。', { exact: false }).last()).toBeVisible();
  await chen.goto('/#/chats?peer=1');
  await expect(chen.locator('.message')).toContainText('你好，一起讨论项目吧。');
  await lin.setViewportSize({ width: 390, height: 844 });
  for (const route of ['profile', 'settings', 'publish', 'applications', 'chats?peer=2']) {
    await lin.goto('/#/' + route);
    await expect(lin.locator('main h1')).toBeVisible();
    expect(
      await lin.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBeTruthy();
  }
  await expect(lin.getByLabel('私信内容')).toBeVisible();
  await lin.screenshot({ path: 'test-results/chat-mobile.png', fullPage: true });
  await a.close();
  await b.close();
});
