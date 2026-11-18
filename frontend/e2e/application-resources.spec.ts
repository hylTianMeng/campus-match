import { expect, test } from '@playwright/test';

test('applicant submits website and attachment, and both participants can view them', async ({
  page,
}, testInfo) => {
  const user = {
    id: 3,
    name: '申请同学',
    email: 'applicant@example.test',
    verified: true,
    banned: false,
    is_admin: false,
    tags: [],
    searchable: true,
    public_posts: true,
    public_teams: false,
  };
  const post = {
    id: 10,
    owner_id: 2,
    title: '申请资料演示',
    category: '课程项目',
    description: '一起完成项目',
    tags: [],
    place: '',
    deadline: '2030-01-01T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    status: 'open',
    extras: {},
    attachment: null,
    owner: { id: 2, name: '发布同学', tags: [] },
    pending_count: 0,
    roles: [
      {
        id: 11,
        name: '开发',
        capacity: 2,
        accepted: 0,
        accepting: true,
        tags: [],
        description: '',
        application_count: 0,
      },
    ],
  };
  let submitted:
    | {
        resources: {
          title: string;
          type: string;
          content: string;
          attachment_id: number | null;
          filename?: string;
        }[];
      }
    | undefined;
  let applicantAvatarUrl: string | null = '/api/users/3/avatar';
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/users/3/avatar') {
      await route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="76" height="76"><rect width="76" height="76" fill="#ece1f1"/><circle cx="38" cy="28" r="14" fill="#725580"/><ellipse cx="38" cy="68" rx="26" ry="22" fill="#725580"/></svg>',
      });
      return;
    }
    let body: unknown = [];
    if (path === '/api/auth/me') body = user;
    else if (path === '/api/posts/10') body = post;
    else if (path === '/api/unread') body = { total: 0, messages: 0, notices: 0 };
    else if (path === '/api/application-attachments') {
      expect(route.request().postDataJSON()).toEqual({
        filename: '简历.txt',
        content_base64: Buffer.from('resume content').toString('base64'),
      });
      body = { id: 91, filename: '简历.txt', size: 14 };
    } else if (path === '/api/posts/10/applications' && route.request().method() === 'POST') {
      submitted = route.request().postDataJSON();
      body = { id: 31, status: 'pending' };
    } else if (path === '/api/me/applications' || path === '/api/posts/10/applications') {
      body = [
        {
          id: 31,
          post_id: 10,
          role_id: 11,
          user_id: 3,
          applicant_name: user.name,
          applicant_avatar_url: applicantAvatarUrl,
          owner_id: 2,
          owner_name: '发布同学',
          owner_avatar_url: null,
          title: post.title,
          role_name: '开发',
          post_status: 'open',
          status: 'pending',
          message: '',
          experience: '',
          portfolio: 'https://example.com/legacy',
          reason: '',
          created_at: post.created_at,
          events: [],
          resources: submitted?.resources.map((item) =>
            item.type === 'attachment' ? { ...item, filename: '简历.txt' } : item,
          ),
        },
      ];
    }
    await route.fulfill({ json: body });
  });
  await page.goto('/#/detail/10');
  await page.getByRole('button', { name: '一键参与', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '申请此岗位', exact: true }).click();
  await expect(page.getByLabel('简历 / 作品链接（选填）')).toHaveCount(0);
  await page.getByRole('button', { name: '添加网页或附件' }).click();
  await page.getByLabel('资料标题 *', { exact: true }).fill('个人主页');
  await page.getByLabel('网页地址 *', { exact: true }).fill('https://example.com/me');
  await page.getByRole('button', { name: '添加网页或附件' }).click();
  await page.getByLabel('资料标题 *', { exact: true }).nth(1).fill('申请简历');
  await page.getByRole('combobox', { name: '资料类型' }).nth(1).selectOption('attachment');
  await page.getByLabel('附件 *', { exact: true }).setInputFiles({
    name: '简历.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('resume content'),
  });
  await expect(page.getByText('已上传：简历.txt')).toBeVisible();
  await page.getByRole('button', { name: '提交申请', exact: true }).click();
  await expect(page.getByText('申请已提交，等待审核')).toBeVisible();
  expect(submitted).not.toHaveProperty('portfolio');
  expect(submitted?.resources).toEqual([
    { title: '个人主页', type: 'link', content: 'https://example.com/me', attachment_id: null },
    { title: '申请简历', type: 'attachment', content: '', attachment_id: 91 },
  ]);
  for (const path of ['/#/applications', '/#/posts/10/applications']) {
    if (path.includes('/posts/')) user.id = 2;
    await page.goto(path);
    if (path.includes('/posts/')) {
      await expect(page.getByRole('link', { name: '查看主页', exact: true })).toHaveAttribute(
        'href',
        '#/person/3',
      );
      await expect(page.getByRole('link', { name: '私信联系', exact: true })).toHaveAttribute(
        'href',
        '#/chats?peer=3',
      );
      const identity = page.locator('.application-person');
      await expect(identity.getByRole('heading', { name: '申请同学' })).toBeVisible();
      await expect(identity.getByRole('img', { name: '申请同学' })).toHaveAttribute(
        'src',
        '/api/users/3/avatar',
      );
      await expect(identity.getByRole('img')).toHaveJSProperty('naturalWidth', 76);
      await page.screenshot({
        path: testInfo.outputPath('application-management-desktop.png'),
        fullPage: true,
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(identity.getByRole('img')).toBeVisible();
      await expect(page.getByRole('link', { name: '私信联系', exact: true })).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath('application-management-mobile.png'),
        fullPage: true,
      });
      applicantAvatarUrl = null;
      await page.reload();
      await expect(page.locator('.application-person .avatar')).toHaveText('申');
    } else {
      await expect(page.getByRole('link', { name: '查看主页', exact: true })).toHaveAttribute(
        'href',
        '#/person/2',
      );
      await expect(page.getByRole('link', { name: '私信联系', exact: true })).toHaveAttribute(
        'href',
        '#/chats?peer=2',
      );
      await expect(
        page.locator('.application-heading').getByRole('heading', { name: post.title }),
      ).toBeVisible();
      await expect(page.locator('.application-heading')).not.toContainText('申请同学');
      await expect(page.locator('.application-recruiter')).toContainText('发布同学');
      await page.screenshot({
        path: testInfo.outputPath('current-applications-desktop.png'),
        fullPage: true,
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.getByRole('link', { name: '私信联系', exact: true })).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath('current-applications-mobile.png'),
        fullPage: true,
      });
      await page.setViewportSize({ width: 1280, height: 720 });
    }
    await expect(page.getByText('简历 / 作品', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'https://example.com/legacy' })).toHaveAttribute(
      'href',
      'https://example.com/legacy',
    );
    await expect(page.getByRole('link', { name: 'https://example.com/me' })).toHaveAttribute(
      'href',
      'https://example.com/me',
    );
    await expect(page.getByRole('link', { name: '简历.txt' })).toHaveAttribute(
      'href',
      '/api/applications/31/attachments/91',
    );
  }
});
