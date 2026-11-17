import { test, expect, type Page } from '@playwright/test';

async function login(page: Page, account: string) {
  await page.goto('/#/auth');
  await page.getByLabel('邮箱', { exact: true }).fill(account + '@example.test');
  await page.getByLabel('密码', { exact: true }).fill('CampusCrew-Dev-2026');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByRole('heading', { name: '发现值得同行的事' })).toBeVisible();
}

async function createPost(page: Page, title: string) {
  const result = await page.request.post('/api/posts', {
    data: {
      title,
      description: '治理功能测试',
      category: '课程项目',
      deadline: new Date(Date.now() + 86400000 * 3).toISOString(),
      roles: [{ name: '志愿者', capacity: 3 }],
    },
  });
  expect(result.status()).toBe(201);
  return result.json();
}

test('personal message deletion, hiding, sharing and bilateral messaging restrictions', async ({
  browser,
}) => {
  const first = await browser.newContext(),
    second = await browser.newContext();
  const chen = await first.newPage(),
    shen = await second.newPage();
  await login(chen, 'chen');
  await login(shen, 'shen');
  const post = await createPost(chen, '浏览器测试：分享招募');
  await chen.goto('/#/chats?peer=3');
  await chen.getByRole('button', { name: '分享招募链接', exact: true }).click();
  await chen.getByLabel('分享我的招募').selectOption(String(post.id));
  await chen.getByRole('button', { name: '发送', exact: true }).click();
  await expect(chen.locator('.message').last().getByRole('link')).toBeVisible();
  await chen.getByRole('button', { name: '删除', exact: true }).last().click();
  await chen.getByRole('button', { name: '确认删除消息' }).click();
  await expect(chen.getByRole('heading', { name: '还没有消息' })).toBeVisible();
  await shen.goto('/#/chats?peer=2');
  await expect(shen.locator('.message').last().getByRole('link')).toBeVisible();
  await shen.locator('.message').last().getByRole('link').click();
  await expect(shen.getByRole('heading', { name: post.title, exact: true })).toBeVisible();
  await shen.goto('/#/chats?peer=2');
  await shen.getByRole('button', { name: '隐藏会话', exact: true }).click();
  await shen.getByRole('button', { name: '确认隐藏会话' }).click();
  await expect(shen.getByRole('heading', { name: '暂无私信消息', exact: true })).toBeVisible();
  await chen.getByLabel('私信内容').fill('隐藏后的新消息');
  await chen.getByRole('button', { name: '发送', exact: true }).click();
  await shen.reload();
  await expect(shen.locator('.conversations')).toContainText('陈书宁');
  await chen.getByRole('button', { name: '拉黑', exact: true }).click();
  await chen.getByRole('button', { name: '确认拉黑', exact: true }).click();
  await expect(chen.getByLabel('私信内容')).toBeDisabled();
  await expect(chen.getByRole('button', { name: '发送', exact: true })).toBeDisabled();
  await expect(chen.getByLabel('私信内容')).toHaveCSS('background-color', 'rgb(240, 240, 242)');
  await shen.goto('/#/chats?peer=2');
  await expect(shen.getByText('当前无法向该同学发送消息。', { exact: true })).toBeVisible();
  await expect(shen.getByLabel('私信内容')).toBeDisabled();
  await expect(shen.getByRole('button', { name: '发送', exact: true })).toBeDisabled();
  await chen.goto('/#/blocks');
  await expect(chen.getByRole('heading', { name: '沈亦舟', exact: true })).toBeVisible();
  await chen.getByRole('button', { name: '解除拉黑', exact: true }).click();
  await chen.getByRole('button', { name: '确认解除拉黑', exact: true }).click();
  await expect(chen.getByRole('heading', { name: '这里还没有记录', exact: true })).toBeVisible();
  await chen.goto('/#/chats?peer=3');
  await shen.reload();
  await expect(chen.getByLabel('私信内容')).toBeEnabled();
  await expect(shen.getByLabel('私信内容')).toBeEnabled();
  await expect(chen.getByRole('button', { name: '发送', exact: true })).toBeEnabled();
  await expect(shen.getByRole('button', { name: '发送', exact: true })).toBeEnabled();
  await first.close();
  await second.close();
});

test('message report → audited evidence → moderation → private notifications', async ({
  browser,
}) => {
  const first = await browser.newContext(),
    second = await browser.newContext(),
    third = await browser.newContext();
  const sender = await first.newPage(),
    reporter = await second.newPage(),
    admin = await third.newPage();
  await login(sender, 'zhou');
  await login(reporter, 'shen');
  await login(admin, 'lin');
  await sender.goto('/#/chats?peer=3');
  await sender.getByLabel('私信内容').fill('需要人工核实的消息');
  await sender.getByRole('button', { name: '发送', exact: true }).click();
  await expect(sender.locator('.message').last()).toContainText('需要人工核实的消息');
  await reporter.goto('/#/chats?peer=4');
  await reporter.getByRole('button', { name: '举报消息', exact: true }).last().click();
  await reporter.getByLabel('举报理由').fill('内部证据：需要人工核实的消息');
  await reporter.getByRole('button', { name: '提交举报', exact: true }).click();
  await expect(reporter.getByRole('status')).toContainText('举报已提交');
  await admin.goto('/#/admin/reports');
  await expect(
    admin.getByText('私信举报说明需完成会话访问审计后查看', { exact: false }),
  ).toBeVisible();
  await expect(admin.getByText('内部证据：需要人工核实的消息', { exact: false })).toHaveCount(0);
  await admin.getByRole('link', { name: '填写原因后查看会话证据' }).click();
  await admin.getByLabel('查看原因').fill('核实具体举报');
  await admin.getByRole('button', { name: '记录审计并查看' }).click();
  await expect(admin.getByText('需要人工核实的消息', { exact: true })).toBeVisible();
  await expect(
    admin.getByText('举报说明：内部证据：需要人工核实的消息', { exact: true }),
  ).toBeVisible();
  await admin.goto('/#/admin/audits');
  await expect(admin.getByText('核实具体举报', { exact: true })).toBeVisible();
  await admin.goto('/#/admin/reports');
  await admin.getByRole('button', { name: '核实并处理', exact: true }).click();
  await admin.getByLabel('处理方式').selectOption('ban');
  await admin.getByLabel('核实结论与内部原因').fill('确认，内部证据来自举报人');
  await admin.getByRole('button', { name: '确认处理', exact: true }).click();
  await expect(admin.getByRole('status')).toContainText('举报处理已完成');
  await reporter.goto('/#/reports');
  await expect(reporter.getByText('已处理', { exact: true })).toBeVisible();
  await sender.goto('/#/notices');
  await expect(sender.getByRole('heading', { name: /你的账号已被封禁/ })).toBeVisible();
  await expect(sender.getByText('确认，内部证据来自举报人', { exact: false })).toHaveCount(0);
  await sender.goto('/#/chats?peer=3');
  await expect(sender.getByText('当前无法向该同学发送消息。', { exact: true })).toBeVisible();
  await expect(sender.getByLabel('私信内容')).toBeDisabled();
  await expect(sender.getByRole('button', { name: '发送', exact: true })).toBeDisabled();
  // Restore the account for subsequent independent tests.
  expect(
    (
      await admin.request.post('/api/admin/users/4/unban', { data: { reason: '测试清理' } })
    ).status(),
  ).toBe(200);
  await first.close();
  await second.close();
  await third.close();
});

test('post report → take down → paused application → restore with history', async ({ browser }) => {
  const first = await browser.newContext(),
    second = await browser.newContext(),
    third = await browser.newContext();
  const owner = await first.newPage(),
    reporter = await second.newPage(),
    admin = await third.newPage();
  await login(owner, 'chen');
  await login(reporter, 'zhou');
  await login(admin, 'lin');
  const post = await createPost(owner, '浏览器测试：下架与恢复');
  await reporter.goto('/#/detail/' + post.id);
  await reporter.getByRole('button', { name: '举报', exact: true }).click();
  await reporter.getByLabel('举报理由').fill('请核查此活动内容');
  await reporter.getByRole('button', { name: '提交举报', exact: true }).click();
  await expect(reporter.getByRole('status')).toContainText('举报已提交');
  await admin.goto('/#/admin/reports');
  await admin.getByRole('button', { name: '核实并处理', exact: true }).click();
  await admin.getByLabel('处理方式').selectOption('take-down');
  await admin.getByLabel('核实结论与内部原因').fill('活动说明待修正');
  await admin.getByRole('button', { name: '确认处理', exact: true }).click();
  await expect(admin.getByRole('status')).toContainText('举报处理已完成');
  await owner.goto('/#/detail/' + post.id);
  await expect(owner.getByText('该招募当前暂停申请与审核，历史记录保留。')).toBeVisible();
  await reporter.goto('/#/detail/' + post.id);
  await reporter.reload();
  await expect(reporter.getByRole('alert')).toContainText('此内容暂不可查看');
  await admin.goto('/#/admin/posts');
  await admin.getByLabel('招募标题', { exact: true }).fill(post.title);
  await admin.getByRole('button', { name: '搜索', exact: true }).click();
  await admin.getByRole('button', { name: '恢复招募', exact: true }).click();
  await admin.getByLabel('操作原因').fill('已复核，恢复');
  await admin.getByRole('button', { name: '确认恢复', exact: true }).click();
  await expect(admin.getByRole('status').filter({ hasText: '操作已完成' })).toBeVisible();
  await reporter.goto('/#/detail/' + post.id);
  await reporter.reload();
  await expect(reporter.getByRole('button', { name: '一键参与', exact: true })).toBeEnabled();
  await admin.goto('/#/admin/history');
  await expect(admin.getByText('已复核，恢复', { exact: true })).toBeVisible();
  await first.close();
  await second.close();
  await third.close();
});

test('retry after a committed response is lost keeps the draft and sends one copy', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(crypto, 'randomUUID', { value: undefined });
  });
  await login(page, 'zhou');
  await page.goto('/#/chats?peer=2');
  const text = '发送结果丢失后重试，保留唯一消息';
  await page.getByLabel('私信内容').fill(text);
  await page.route('**/api/messages/2', async (route) => {
    if (route.request().method() === 'POST') {
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      await route.abort('failed');
    } else await route.continue();
  });
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.getByRole('button', { name: '发送', exact: true })).toBeEnabled();
  await expect(page.getByLabel('私信内容')).toHaveValue(text);
  await page.unroute('**/api/messages/2');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.getByLabel('私信内容')).toHaveValue('');
  const messages = await (await page.request.get('/api/messages/2')).json();
  expect(messages.filter((message: { body: string }) => message.body === text)).toHaveLength(1);
  await page.getByLabel('私信内容').fill('刷新时保留的草稿');
  await page.getByRole('button', { name: '关闭会话', exact: true }).click();
  await page
    .locator('.conversations')
    .getByRole('link', { name: /陈书宁/ })
    .click();
  await expect(page.getByLabel('私信内容')).toHaveValue('刷新时保留的草稿');
});

test('reference chat composer supports keyboard, IME, emoji and mobile layout', async ({
  page,
}) => {
  await login(page, 'chen');
  await page.route('**/api/messages/3?after=*', (route) => route.fulfill({ json: [] }));
  await page.goto('/#/chats?peer=3');
  await expect(page.getByRole('heading', { name: '还没有消息', exact: true })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/chat-reference-empty.png', fullPage: true });
  await page.unroute('**/api/messages/3?after=*');
  const input = page.getByLabel('私信内容');
  await expect(input).toBeVisible();
  await input.fill('键盘发送第一行');
  await input.press('End');
  await input.press('Shift+Enter');
  await input.press('End');
  await input.press('a');
  await expect(input).toHaveValue('键盘发送第一行\na');
  await input.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true });
  await expect(input).toHaveValue('键盘发送第一行\na');
  await input.press('Enter');
  await expect(input).toHaveValue('');
  await expect(page.locator('.message').last()).toHaveText('键盘发送第一行\na');
  await page.getByRole('button', { name: '插入表情', exact: true }).click();
  await page.getByRole('button', { name: '插入 👋', exact: true }).click();
  await expect(input).toHaveValue('👋');
  await input.fill('   ');
  await expect(page.getByRole('button', { name: '发送', exact: true })).toBeEnabled();
  const beforeEmptySend = await (await page.request.get('/api/messages/3')).json();
  await page.getByRole('button', { name: '发送', exact: true }).click();
  expect(await (await page.request.get('/api/messages/3')).json()).toEqual(beforeEmptySend);
  await page.getByRole('button', { name: '分享招募链接', exact: true }).click();
  await page.getByLabel('分享我的招募').press('Escape');
  await expect(page.getByLabel('分享我的招募')).toHaveCount(0);
  await input.fill('');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/chat-reference-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '分享招募链接', exact: true }).click();
  await expect(page.getByLabel('分享我的招募')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/chat-reference-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('conversation unread badges and scroll position remain consistent across sending and refresh', async ({
  browser,
}) => {
  const senderContext = await browser.newContext();
  const recipientContext = await browser.newContext();
  const sender = await senderContext.newPage();
  const recipient = await recipientContext.newPage();
  await login(sender, 'zhou');
  await login(recipient, 'chen');
  const existing = await (await recipient.request.get('/api/conversations')).json();
  const previousCount =
    existing.find((row: { peer: { id: number } }) => row.peer.id === 4)?.unread_count ?? 0;
  for (let index = 0; index < 25; index++) {
    expect(
      (
        await sender.request.post('/api/messages/2', {
          data: { body: '滚动测试 ' + index + '\n' + '历史消息内容。'.repeat(40) },
        })
      ).status(),
    ).toBe(201);
  }
  await recipient.goto('/#/chats');
  const conversation = recipient.locator('.conversations').getByRole('link', { name: /周映雪/ });
  await expect(conversation.getByLabel(previousCount + 25 + ' 条未读消息')).toBeVisible();
  await conversation.click();
  const history = recipient.getByLabel('私信记录');
  await expect(recipient.locator('.message').last()).toContainText('滚动测试 24');
  await expect(conversation.locator('.conversation-unread')).toHaveCount(0);
  const distanceFromBottom = () =>
    history.evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop);
  await expect.poll(distanceFromBottom).toBeLessThan(2);
  await recipient.reload();
  await expect(recipient.locator('.message').last()).toContainText('滚动测试 24');
  await expect.poll(distanceFromBottom).toBeLessThan(2);
  await history.evaluate((element) => {
    element.scrollTop = 0;
  });
  await expect.poll(() => history.evaluate((element) => element.scrollTop)).toBe(0);
  await history.dispatchEvent('scroll');
  expect(
    (
      await sender.request.post('/api/messages/2', { data: { body: '阅读历史时收到的新消息' } })
    ).status(),
  ).toBe(201);
  await expect(recipient.locator('.message').last()).toHaveText('阅读历史时收到的新消息', {
    timeout: 15000,
  });
  expect(await history.evaluate((element) => element.scrollTop)).toBe(0);
  await recipient.getByLabel('私信内容').fill('发送后应定位到最新消息');
  await recipient.getByRole('button', { name: '发送', exact: true }).click();
  await expect(recipient.locator('.message').last()).toHaveText('发送后应定位到最新消息');
  await expect.poll(distanceFromBottom).toBeLessThan(2);
  await senderContext.close();
  await recipientContext.close();
});

test('settings and empty management pages omit redundant sections', async ({ page }) => {
  await login(page, 'lin');
  await page.goto('/#/settings');
  await expect(page.getByRole('heading', { name: '账号设置', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '登录账号', exact: true })).toHaveCount(0);
  await expect(
    page.locator('main').getByRole('button', { name: '退出登录', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('banner').getByRole('button', { name: '退出登录', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: '注销账号', exact: true })).toBeVisible();
  await page.goto('/#/admin');
  await page.getByLabel('搜索用户').fill('不存在的用户-空状态测试');
  await page.getByRole('button', { name: '搜索', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '没有符合条件的用户', exact: true }),
  ).toBeVisible();
  await expect(page.locator('table')).toHaveCount(0);
  await page.getByLabel('封禁筛选').selectOption('1');
  await expect(
    page.getByRole('heading', { name: '没有符合条件的用户', exact: true }),
  ).toBeVisible();
  await expect(page.locator('table')).toHaveCount(0);
  await page.route('**/api/me/posts', (route) => route.fulfill({ json: [] }));
  await page.goto('/#/posts');
  await expect(page.getByRole('heading', { name: '管理发布', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '这里还没有记录', exact: true })).toBeVisible();
  await expect(page.locator('main .panel')).toHaveCount(0);
});

test('sending keeps a grey disabled composer and a fixed chat size', async ({ page }) => {
  await login(page, 'chen');
  let releaseSend: (() => void) | undefined;
  let showEmptyHistory = true;
  await page.route('**/api/messages/3', async (route) => {
    if (route.request().method() === 'POST') {
      await new Promise<void>((resolve) => {
        releaseSend = resolve;
      });
    }
    await route.continue();
  });
  await page.route('**/api/messages/3?after=*', async (route) => {
    if (showEmptyHistory) {
      await route.fulfill({ json: [] });
    } else await route.continue();
  });
  await page.goto('/#/chats?peer=3');
  await expect(page.getByRole('heading', { name: '还没有消息', exact: true })).toBeVisible();
  showEmptyHistory = false;
  const input = page.getByLabel('私信内容');
  const send = page.getByRole('button', { name: '发送', exact: true });
  const sizes = () =>
    page.locator('.chat').evaluate((element) => ({
      chat: element.getBoundingClientRect().height,
      history: element.querySelector('.chat-body')!.getBoundingClientRect().height,
      input: element.querySelector('textarea')!.getBoundingClientRect().height,
    }));
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const before = await sizes();
    const text = '固定聊天区测试 ' + width + '\n' + '消息较长时应在内部滚动。'.repeat(60);
    await input.fill(text);
    await send.click();
    await expect(input).toBeDisabled();
    await expect(send).toBeDisabled();
    await expect(send).toHaveText('➤ 发送');
    await expect(page.getByText('发送中', { exact: false })).toHaveCount(0);
    await expect(input).toHaveCSS('background-color', 'rgb(240, 240, 242)');
    await expect(send).toHaveCSS('background-color', 'rgb(229, 231, 235)');
    expect(await sizes()).toEqual(before);
    await page.screenshot({ path: 'test-results/chat-sending-' + width + '.png', fullPage: true });
    releaseSend!();
    await expect(input).toBeEnabled();
    await expect(input).toHaveValue('');
    await expect(send).toBeEnabled();
    await expect(send).toHaveCSS('background-color', 'rgb(102, 8, 116)');
    await expect(input).toHaveCSS('background-color', 'rgb(254, 252, 255)');
    await expect(page.locator('.message').last()).toHaveText(text);
    expect(await sizes()).toEqual(before);
    await expect(page.locator('.composer')).toHaveAttribute('aria-busy', 'false');
  }
});

test('a successful send restores the composer while message refresh is delayed', async ({
  page,
}) => {
  await login(page, 'chen');
  await page.goto('/#/chats?peer=3');
  const input = page.getByLabel('私信内容');
  const send = page.getByRole('button', { name: '发送', exact: true });
  await expect(input).toBeEnabled();
  let holdRefresh = false;
  let releaseRefresh: (() => void) | undefined;
  let posts = 0;
  await page.route('**/api/messages/3', async (route) => {
    const response = await route.fetch();
    posts++;
    if (posts === 1) holdRefresh = true;
    await route.fulfill({ response });
  });
  await page.route('**/api/messages/3?after=*', async (route) => {
    if (holdRefresh)
      await new Promise<void>((resolve) => {
        releaseRefresh = resolve;
      });
    await route.continue();
  });
  await input.fill('发送成功后立即恢复输入');
  await send.click();
  await expect.poll(() => Boolean(releaseRefresh)).toBe(true);
  await expect(input).toBeEnabled();
  await expect(input).toHaveValue('');
  await expect(send).toBeEnabled();
  await expect(send).toHaveCSS('background-color', 'rgb(102, 8, 116)');
  await expect(input).toHaveCSS('background-color', 'rgb(254, 252, 255)');
  await input.fill('刷新期间可以继续输入');
  holdRefresh = false;
  releaseRefresh!();
  await expect(page.locator('.message').last()).toHaveText('发送成功后立即恢复输入');
  await expect(input).toHaveValue('刷新期间可以继续输入');
  await send.click();
  await expect(input).toHaveValue('');
  await expect(page.locator('.message').last()).toHaveText('刷新期间可以继续输入');
  await expect(input).toBeEnabled();
  await expect(send).toBeEnabled();
});

test('admin and student views do not offer blacklisting an administrator', async ({ browser }) => {
  const adminContext = await browser.newContext();
  const studentContext = await browser.newContext();
  const admin = await adminContext.newPage();
  const student = await studentContext.newPage();
  await login(admin, 'lin');
  await login(student, 'chen');
  await admin.goto('/#/chats?peer=2');
  await expect(admin.getByLabel('私信内容')).toBeEnabled();
  await expect(admin.getByRole('button', { name: '拉黑', exact: true })).toHaveCount(0);
  await expect(admin.getByRole('button', { name: '解除拉黑', exact: true })).toHaveCount(0);
  expect((await admin.request.put('/api/blocks/2', { data: {} })).status()).toBe(403);
  await admin.goto('/#/person/2');
  await expect(admin.getByRole('heading', { name: '陈书宁', exact: true })).toBeVisible();
  await expect(admin.getByRole('button', { name: '拉黑', exact: true })).toHaveCount(0);
  await student.goto('/#/chats?peer=1');
  await expect(student.getByLabel('私信内容')).toBeEnabled();
  expect((await (await student.request.get('/api/conversations/1')).json()).can_block).toBe(false);
  await expect(student.getByRole('button', { name: '拉黑', exact: true })).toHaveCount(0);
  expect((await student.request.put('/api/blocks/1', { data: {} })).status()).toBe(403);
  await student.goto('/#/person/1');
  await expect(student.getByRole('heading', { name: '林知夏', exact: true })).toBeVisible();
  await expect(student.getByRole('button', { name: '拉黑', exact: true })).toHaveCount(0);
  await adminContext.close();
  await studentContext.close();
});
