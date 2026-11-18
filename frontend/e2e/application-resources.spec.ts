import { expect, test } from '@playwright/test';

test('applicant submits website and attachment, and both participants can view them', async ({
  page,
}) => {
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
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
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
          title: post.title,
          role_name: '开发',
          post_status: 'open',
          status: 'pending',
          message: '',
          experience: '',
          portfolio: '',
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
  await page.getByRole('button', { name: '添加网页或附件' }).click();
  await page.getByLabel('资料标题 *', { exact: true }).fill('个人主页');
  await page.getByLabel('网页地址 *', { exact: true }).fill('https://example.com/me');
  await page.getByRole('button', { name: '添加网页或附件' }).click();
  await page.getByLabel('资料标题 *', { exact: true }).nth(1).fill('申请简历');
  await page.getByRole('combobox', { name: '资料类型' }).nth(1).selectOption('attachment');
  await page
    .getByLabel('附件 *', { exact: true })
    .setInputFiles({
      name: '简历.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('resume content'),
    });
  await expect(page.getByText('已上传：简历.txt')).toBeVisible();
  await page.getByRole('button', { name: '提交申请', exact: true }).click();
  await expect(page.getByText('申请已提交，等待审核')).toBeVisible();
  expect(submitted?.resources).toEqual([
    { title: '个人主页', type: 'link', content: 'https://example.com/me', attachment_id: null },
    { title: '申请简历', type: 'attachment', content: '', attachment_id: 91 },
  ]);
  for (const path of ['/#/applications', '/#/posts/10/applications']) {
    if (path.includes('/posts/')) user.id = 2;
    await page.goto(path);
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
