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

test('personal message deletion, hiding, sharing and directional blacklist', async ({
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
  await chen.getByLabel('分享我的招募').selectOption(String(post.id));
  await chen.getByRole('button', { name: '发送', exact: true }).click();
  await expect(chen.locator('.message').last().getByRole('link')).toBeVisible();
  await chen.getByRole('button', { name: '仅为我删除', exact: true }).last().click();
  await chen.getByRole('button', { name: '确认仅为我删除消息' }).click();
  await expect(chen.getByRole('heading', { name: '还没有消息，打个招呼吧' })).toBeVisible();
  await shen.goto('/#/chats?peer=2');
  await expect(shen.locator('.message').last().getByRole('link')).toBeVisible();
  await shen.locator('.message').last().getByRole('link').click();
  await expect(shen.getByRole('heading', { name: post.title, exact: true })).toBeVisible();
  await shen.goto('/#/chats?peer=2');
  await shen.getByRole('button', { name: '隐藏会话', exact: true }).click();
  await shen.getByRole('button', { name: '确认隐藏会话' }).click();
  await expect(shen.getByRole('heading', { name: '暂无会话', exact: true })).toBeVisible();
  await chen.getByLabel('私信内容').fill('隐藏后的新消息');
  await chen.getByRole('button', { name: '发送', exact: true }).click();
  await shen.reload();
  await expect(shen.locator('.conversations')).toContainText('隐藏后的新消息');
  await chen.getByRole('button', { name: '拉黑', exact: true }).click();
  await chen.getByRole('button', { name: '确认拉黑', exact: true }).click();
  await shen.goto('/#/chats?peer=2');
  await expect(shen.getByRole('button', { name: '发送', exact: true })).toBeDisabled();
  await chen.goto('/#/blocks');
  await expect(chen.getByRole('heading', { name: '沈亦舟', exact: true })).toBeVisible();
  await chen.getByRole('button', { name: '解除拉黑', exact: true }).click();
  await chen.getByRole('button', { name: '确认解除拉黑', exact: true }).click();
  await expect(chen.getByRole('heading', { name: '这里还没有记录', exact: true })).toBeVisible();
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
  await expect(admin.getByRole('status')).toContainText('操作已完成');
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
  await page.getByRole('button', { name: '刷新会话', exact: true }).click();
  await expect(page.getByLabel('私信内容')).toHaveValue('刷新时保留的草稿');
});
