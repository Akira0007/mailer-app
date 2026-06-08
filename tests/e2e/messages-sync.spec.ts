import electronPath from 'electron';
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';

type DraftSnapshot = {
  id: string;
  title: string;
  subject: string;
  htmlBody: string;
  textBody: string;
};

const QA_DRAFT_TITLE = 'Sync QA Draft';
const QA_DRAFT_SUBJECT = 'Sync QA Subject';
const QA_INITIAL_HTML = [
  '<!DOCTYPE html>',
  '<html lang="zh-CN">',
  '<head>',
  '  <meta charset="UTF-8" />',
  '  <title>Sync QA Draft</title>',
  '</head>',
  '<body>',
  '  <section>',
  '    <h1>Initial Sync Heading</h1>',
  '    <p>Initial sync body.</p>',
  '  </section>',
  '</body>',
  '</html>',
].join('\n');
const QA_INITIAL_TEXT = 'Initial sync body.';

let app: ElectronApplication;
let page: Page;
let draftToRestore: DraftSnapshot | null = null;
const consoleErrors: string[] = [];
const pageErrors: string[] = [];

async function ensureDraftForQa(currentPage: Page): Promise<DraftSnapshot> {
  return currentPage.evaluate(async ({ title, subject, htmlBody, textBody }) => {
    const drafts = await window.api.mailDrafts.list();
    let draftId = drafts[0]?.id ?? null;

    if (!draftId) {
      const contacts = await window.api.contacts.list({
        keyword: '',
        page: 1,
        pageSize: 20,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });

      if (contacts.items.length < 2) {
        throw new Error('Need at least two contacts to create a QA draft.');
      }

      const created = await window.api.mailDrafts.createFromContacts({
        contactIds: contacts.items.slice(0, 2).map((contact) => contact.id),
      });
      draftId = created.id;
    }

    const original = await window.api.mailDrafts.get(draftId);
    await window.api.mailDrafts.update({
      draftId,
      title,
      subject,
      htmlBody,
      textBody,
    });

    return {
      id: original.id,
      title: original.title,
      subject: original.subject,
      htmlBody: original.htmlBody,
      textBody: original.textBody,
    };
  }, {
    title: QA_DRAFT_TITLE,
    subject: QA_DRAFT_SUBJECT,
    htmlBody: QA_INITIAL_HTML,
    textBody: QA_INITIAL_TEXT,
  });
}

test.beforeAll(async () => {
  app = await electron.launch({
    executablePath: electronPath,
    args: ['dist-electron/main/index.js'],
    cwd: '/Users/raul/Project/mailer-app',
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: 'http://localhost:5173',
    },
  });

  page = await app.firstWindow();
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });

  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByText('Messages').first()).toBeVisible();

  draftToRestore = await ensureDraftForQa(page);

  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByText('Messages').first()).toBeVisible();
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await page.getByRole('button', { name: new RegExp(QA_DRAFT_TITLE) }).click();
  await expect(page.getByLabel('草稿名称')).toHaveValue(QA_DRAFT_TITLE);
});

test.afterAll(async () => {
  if (draftToRestore) {
    await page.evaluate(async (draft) => {
      await window.api.mailDrafts.update({
        draftId: draft.id,
        title: draft.title,
        subject: draft.subject,
        htmlBody: draft.htmlBody,
        textBody: draft.textBody,
      });
    }, draftToRestore);
  }

  await app.close();
});

test('keeps visual editor, source editor, preview, and helper actions in sync', async () => {
  await expect(page).toHaveTitle('mailer-app');
  await expect(page).toHaveURL(/localhost:5173/);
  await expect(page.locator('.newsletter-preview-html')).toContainText('Initial sync body.');

  const preview = page.locator('.newsletter-preview-html');
  const visualEditor = page.locator('.wysiwyg-surface');
  const sourceEditor = page.locator('.html-source-textarea');

  await visualEditor.evaluate((element) => {
    element.innerHTML = '<p>Visual sync body</p>';
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  });
  await expect(sourceEditor).toContainText('Visual sync body');
  await expect(preview).toContainText('Visual sync body');

  await visualEditor.evaluate((element) => {
    const target = element.querySelector('p') ?? element;
    const range = document.createRange();
    range.selectNodeContents(target);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    (element as HTMLElement).focus();
  });
  await page.getByRole('button', { name: 'H1', exact: true }).click();
  await expect(sourceEditor).toContainText('<h1');
  await expect(preview.locator('h1')).toContainText('Visual sync body');

  await visualEditor.evaluate((element) => {
    const target = element.querySelector('h1') ?? element;
    const range = document.createRange();
    range.selectNodeContents(target);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    (element as HTMLElement).focus();
  });
  await page.getByRole('button', { name: '居中', exact: true }).click();
  await expect
    .poll(async () => preview.locator('h1').evaluate((node) => window.getComputedStyle(node).textAlign))
    .toBe('center');

  await visualEditor.evaluate((element) => {
    const target = element.querySelector('h1') ?? element;
    const range = document.createRange();
    range.selectNodeContents(target);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    (element as HTMLElement).focus();
  });
  await page.getByRole('button', { name: '引用', exact: true }).click();
  await expect(sourceEditor).toContainText('<blockquote');
  await expect(preview.locator('blockquote')).toContainText('Visual sync body');

  await page.getByRole('button', { name: '分隔线', exact: true }).click();
  await expect(sourceEditor).toContainText('<hr');
  await expect(preview.locator('hr')).toHaveCount(1);

  await page.getByRole('button', { name: '按钮', exact: true }).click();
  await expect(sourceEditor).toContainText('data-mailer-cta="inline"');
  await expect(preview.getByRole('link', { name: '了解详情' })).toBeVisible();

  await page.getByRole('button', { name: '图片', exact: true }).click();
  await expect(sourceEditor).toContainText('data-mailer-image-placeholder');
  await expect(preview).toContainText('产品示意图');

  await visualEditor.evaluate((element) => {
    element.innerHTML = '<p>Ordered list body</p>';
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
    const target = element.querySelector('p') ?? element;
    const range = document.createRange();
    range.selectNodeContents(target);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    (element as HTMLElement).focus();
  });
  await page.getByRole('button', { name: '有序列表', exact: true }).click();
  await expect(sourceEditor).toContainText('<ol');
  await expect(preview.locator('ol')).toContainText('Ordered list body');

  await visualEditor.evaluate((element) => {
    const target = element.querySelector('ol') ?? element;
    const range = document.createRange();
    range.selectNodeContents(target);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    (element as HTMLElement).focus();
  });
  await page.getByRole('button', { name: '宽松', exact: true }).click();
  await expect(sourceEditor).toContainText('data-mailer-spacing="relaxed"');
  await expect(preview.locator('[data-mailer-spacing="relaxed"]')).toBeVisible();

  const sourceHtml = [
    '<!DOCTYPE html>',
    '<html lang="zh-CN">',
    '<head>',
    '  <meta charset="UTF-8" />',
    '  <title>Sync QA Draft</title>',
    '</head>',
    '<body>',
    '  <section>',
    '    <h2>Source Sync Heading</h2>',
    '    <p data-sync-source="true">Source sync body</p>',
    '  </section>',
    '</body>',
    '</html>',
  ].join('\n');

  await sourceEditor.fill(sourceHtml);
  await expect(visualEditor).toContainText('Source sync body');
  await expect(preview).toContainText('Source sync body');

  await page.getByPlaceholder('链接文案').fill('Sync Link');
  await page.getByPlaceholder('https://example.com').fill('https://example.com/sync');
  await visualEditor.click();
  await page.keyboard.press('End');
  await page.getByRole('button', { name: '插入链接' }).click();
  await expect(sourceEditor).toContainText('https://example.com/sync');
  await expect(preview.getByRole('link', { name: 'Sync Link' })).toBeVisible();

  await page.getByPlaceholder('占位标题').fill('Sync Placeholder');
  await page.getByPlaceholder('占位说明').fill('Placeholder caption');
  await page.getByRole('button', { name: '插入图片占位' }).click();
  await expect(sourceEditor).toContainText('data-mailer-image-placeholder');
  await expect(preview).toContainText('Sync Placeholder');
  await expect(preview).toContainText('Placeholder caption');

  await page.getByPlaceholder('姓名', { exact: true }).fill('Sync Tester');
  await page.getByPlaceholder('职位', { exact: true }).fill('QA');
  await page.getByPlaceholder('公司', { exact: true }).fill('FlowMail');
  await page.getByPlaceholder('邮箱', { exact: true }).fill('sync@example.com');
  await page.getByRole('button', { name: '应用签名' }).click();
  await expect(sourceEditor).toContainText('data-mailer-signature');
  await expect(preview).toContainText('Sync Tester');
  await expect(preview).toContainText('sync@example.com');

  await page.getByPlaceholder('页脚公司名').fill('FlowMail Footer');
  await page.getByPlaceholder('联系地址 / 说明').fill('Shenzhen');
  await page.getByPlaceholder('页脚补充说明').fill('Footer sync note');
  await page.getByPlaceholder('链接文字').fill('Footer Link');
  await page.getByPlaceholder('退订 / 官网链接').fill('https://example.com/footer');
  await page.getByRole('button', { name: '应用页脚' }).click();
  await expect(sourceEditor).toContainText('data-mailer-footer');
  await expect(preview).toContainText('Footer sync note');
  await expect(preview.getByRole('link', { name: 'Footer Link' })).toBeVisible();

  await page.getByPlaceholder('按钮文案').fill('CTA Sync');
  await page.getByPlaceholder('按钮链接').fill('https://example.com/cta');
  await page.getByRole('button', { name: '应用按钮' }).click();
  await expect(sourceEditor).toContainText('data-mailer-cta');
  await expect(preview.getByRole('link', { name: 'CTA Sync' })).toBeVisible();

  await page.getByRole('button', { name: '保存草稿' }).click();
  await expect(page.getByText('草稿已保存。')).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: new RegExp(QA_DRAFT_TITLE) }).click();
  await expect(page.getByLabel('草稿名称')).toHaveValue(QA_DRAFT_TITLE);
  await expect(page.locator('.html-source-textarea')).toContainText('https://example.com/cta');
  await expect(page.locator('.newsletter-preview-html')).toContainText('Sync Tester');

  expect(consoleErrors, `Unexpected console errors: ${consoleErrors.join(' | ')}`).toEqual([]);
  expect(pageErrors, `Unexpected page errors: ${pageErrors.join(' | ')}`).toEqual([]);

  await page.screenshot({
    path: '/tmp/mailer-messages-sync-after.png',
    fullPage: true,
  });
});
