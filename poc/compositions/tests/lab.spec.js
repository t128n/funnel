import { expect, test } from '@playwright/test';
import fs from 'node:fs/promises';

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

async function open(page, path, viewport = DESKTOP) {
  await page.setViewportSize(viewport);
  await page.goto(path, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
}

async function chooseStatus(page, status) {
  await page.getByTestId('status-control').click();
  await page.locator('.dropdown-menu.show .dropdown-item').filter({ hasText: status }).click();
}

test.describe('composition lab', () => {
  test('list-first navigation and issue detail work in all three variants', async ({ page }) => {
    await open(page, '/#/a/issues');
    await expect(page.getByTestId('issues-view')).toBeVisible();
    await expect(page.locator('[data-testid^="issue-row-"]')).toHaveCount(16);
    await page.getByTestId('issue-row-FUN-58').click();
    await expect(page).toHaveURL(/#\/a\/issues\/FUN-58$/);
    await expect(page.getByTestId('issue-title')).toContainText('Comment composer loses formatting');

    await open(page, '/#/b/issues');
    await expect(page.getByTestId('issues-view')).toBeVisible();
    await expect(page.locator('[data-testid^="issue-row-"]')).toHaveCount(16);
    await page.getByTestId('issue-row-FUN-58').click();
    await expect(page).toHaveURL(/#\/b\/issues\/FUN-58$/);
    await expect(page.getByTestId('issue-title')).toContainText('Comment composer loses formatting');

    await open(page, '/#/c/issues');
    await expect(page.getByTestId('issues-view')).toBeVisible();
    await expect(page.locator('[data-testid^="issue-row-"]')).toHaveCount(16);
    await page.getByTestId('issue-row-FUN-58').click();
    await expect(page).toHaveURL(/#\/c\/issues\/FUN-58$/);
    await expect(page.getByTestId('issue-title')).toContainText('Comment composer loses formatting');
  });

  test('navigation between inbox and issues does not leak search state', async ({ page }) => {
    await open(page, '/#/a/issues');
    await page.getByTestId('issue-search').fill('safari');
    await expect(page.locator('[data-testid^="issue-row-"]')).toHaveCount(1);
    await page.getByRole('link', { name: 'Inbox', exact: true }).click();
    await expect(page.getByTestId('inbox-view')).toBeVisible();
    await expect(page.getByTestId('inbox-view')).toContainText('FUN-64');
    await page.getByRole('link', { name: 'Issues', exact: true }).click();
    await expect(page.getByTestId('issues-view')).toBeVisible();
    await expect(page.locator('[data-testid^="issue-row-"]')).toHaveCount(16);
  });

  test('search, filters, and grouping work in the traditional application', async ({ page }) => {
    await open(page, '/#/a/issues');
    await page.getByTestId('issue-search').fill('safari');
    await expect(page.locator('[data-testid^="issue-row-"]')).toHaveCount(1);
    await page.getByTestId('issue-search').fill('');
    await page.getByTestId('status-filter').selectOption('In progress');
    await expect(page.locator('[data-testid^="issue-row-"]')).toHaveCount(6);
    await page.getByTestId('group-control').selectOption('priority');
    await expect(page.locator('tbody tr.table-light').first()).toContainText('P1 High');
  });

  test('search and filtering work in the compact workspace', async ({ page }) => {
    await open(page, '/#/b/issues');
    await page.getByTestId('issue-search').fill('safari');
    await expect(page.locator('[data-testid^="issue-row-"]')).toHaveCount(1);
    await page.getByTestId('issue-search').fill('');
    await page.getByTestId('filter-button').click();
    await page.locator('#b-status-filter').selectOption('In progress');
    await expect(page.locator('[data-testid^="issue-row-"]')).toHaveCount(6);
    await page.locator('#issues-heading').click();
    await page.getByTestId('group-control').click();
    await page.locator('.dropdown-menu.show .dropdown-item').filter({ hasText: 'Priority' }).click();
    await expect(page.locator('.split-list-scroll').getByText('P1 High').first()).toBeVisible();
  });

  test('search and filtering work in the list-first application', async ({ page }) => {
    await open(page, '/#/c/issues');
    await page.getByTestId('issue-search').fill('safari');
    await expect(page.locator('[data-testid^="issue-row-"]')).toHaveCount(1);
    await page.getByTestId('issue-search').fill('');
    await page.getByTestId('status-filter').selectOption('In progress');
    await expect(page.locator('[data-testid^="issue-row-"]')).toHaveCount(6);
    await page.getByTestId('group-control').selectOption('assignee');
    await expect(page.locator('tbody tr.table-light').first()).toContainText('Torben Haack');
  });

  test('global search opens and navigates in all three variants', async ({ page }) => {
    for (const variant of ['a', 'b', 'c']) {
      await open(page, `/#/${variant}/issues`);
      await page.getByRole('button', { name: /Search/ }).first().click();
      await expect(page.getByTestId('global-search-input')).toBeVisible();
      await page.getByTestId('global-search-input').fill('rate limit');
      await expect(page.getByTestId('global-search-input')).toBeVisible();
      await page.getByTestId('global-search-input').press('Enter');
      await expect(page).toHaveURL(new RegExp(`#\\/${variant}\\/issues\\/FRG-18$`));
      await expect(page.getByTestId('issue-title')).toContainText('Rate limit headers');
    }
  });

  test('metadata editing and comments work in the traditional application', async ({ page }) => {
    await open(page, '/#/a/issues/FUN-58');
    await page.getByTestId('status-control').selectOption('In review');
    await expect(page.getByTestId('status-control')).toHaveValue('In review');
    await page.getByTestId('priority-control').selectOption('P2');
    await page.getByTestId('assignee-control').selectOption('otto');
    await page.getByTestId('milestone-control').selectOption('');
    await expect(page.getByTestId('issue-detail')).toContainText('changed the status to In review');
    await page.getByTestId('comment-input').fill('Traditional application audit comment.');
    await page.getByTestId('comment-submit').click();
    await expect(page.getByTestId('issue-detail')).toContainText('Traditional application audit comment.');
    await expect(page.getByTestId('issue-detail')).toContainText('Torben Haack commented just now');
  });

  test('metadata editing and comments work in the compact workspace', async ({ page }) => {
    await open(page, '/#/b/issues/FUN-58');
    await chooseStatus(page, 'In review');
    await expect(page.getByTestId('status-control')).toContainText('In review');
    await page.getByTestId('assignee-control').click();
    await page.locator('.dropdown-menu.show .dropdown-item').filter({ hasText: 'Otto Berg' }).click();
    await page.getByTestId('comment-input').fill('Compact workspace audit comment.');
    await page.getByTestId('comment-submit').click();
    await expect(page.getByTestId('issue-detail')).toContainText('Compact workspace audit comment.');
  });

  test('metadata editing and comments work in the list-first application', async ({ page }) => {
    await open(page, '/#/c/issues/FUN-58');
    await chooseStatus(page, 'In review');
    await expect(page.getByTestId('status-control')).toContainText('In review');
    await page.getByTestId('milestone-control').click();
    await page.locator('.dropdown-menu.show .dropdown-item').filter({ hasText: 'No milestone' }).click();
    await page.getByTestId('comment-input').fill('List-first audit comment.');
    await page.getByTestId('comment-submit').click();
    await expect(page.getByTestId('issue-detail')).toContainText('List-first audit comment.');
  });

  test('inbox triage moves accepted items into the issue index in all variants', async ({ page }) => {
    await open(page, '/#/a/inbox');
    await page.getByTestId('accept-FUN-64').click();
    await expect(page.getByTestId('inbox-view')).not.toContainText('FUN-64');
    await page.getByRole('link', { name: 'Issues', exact: true }).click();
    await expect(page.getByTestId('issues-view')).toBeVisible();
    await expect(page.getByTestId('issue-row-FUN-64')).toBeVisible();

    await open(page, '/#/b/inbox');
    await page.getByTestId('accept-FUN-65').click();
    await expect(page.getByTestId('inbox-view')).toContainText('3 untriaged');
    await page.locator('.app-sidebar a[href="#/b/issues"]').last().click();
    await expect(page.getByTestId('issue-row-FUN-65')).toBeVisible();

    await open(page, '/#/c/inbox');
    await page.getByTestId('accept-FUN-64').click();
    await expect(page.getByTestId('inbox-view')).toContainText('Inbox 3');
    await page.getByRole('link', { name: 'Issues', exact: true }).click();
    await expect(page.getByTestId('issue-row-FUN-64')).toBeVisible();
  });

  test('empty result states are explicit and recoverable', async ({ page }) => {
    await open(page, '/#/a/issues');
    await page.getByTestId('issue-search').fill('zzzz-no-match');
    await expect(page.getByText('No issues match this view')).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(page.locator('[data-testid^="issue-row-"]')).toHaveCount(16);

    await open(page, '/#/b/issues');
    await page.getByTestId('issue-search').fill('zzzz-no-match');
    await expect(page.getByText('No issues found')).toBeVisible();
    await page.locator('.split-list-scroll').getByRole('button', { name: 'Clear filters' }).click();
    await expect(page.locator('[data-testid^="issue-row-"]')).toHaveCount(16);

    await open(page, '/#/c/issues');
    await page.getByTestId('issue-search').fill('zzzz-no-match');
    await expect(page.getByText('No issues match this view')).toBeVisible();
  });

  test('declining an inbox submission removes it from triage', async ({ page }) => {
    await open(page, '/#/a/inbox');
    await page.getByTestId('decline-FUN-65').click();
    await expect(page.getByTestId('inbox-view')).not.toContainText('FUN-65');
    await expect(page.getByTestId('inbox-view')).toContainText('3 untriaged');
  });

  test('responsive behavior is usable at 390px in all three compositions', async ({ page }) => {
    await open(page, '/#/a/issues', MOBILE);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.getByRole('button', { name: 'Toggle navigation' }).click();
    await expect(page.getByRole('link', { name: 'Issues', exact: true }).first()).toBeVisible();
    await page.getByRole('link', { name: 'Issues', exact: true }).first().click();
    await page.getByTestId('issue-row-FUN-58').click();
    await expect(page.getByTestId('issue-detail')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

    await open(page, '/#/b/issues', MOBILE);
    await expect(page.locator('.split-list')).toBeVisible();
    await page.getByTestId('issue-row-FUN-58').click();
    await expect(page.getByTestId('issue-detail')).toBeVisible();
    await expect(page.locator('.split-list')).toBeHidden();
    await page.getByRole('button', { name: 'Issues', exact: true }).click();
    await expect(page.locator('.split-list')).toBeVisible();

    await open(page, '/#/c/issues', MOBILE);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.getByTestId('issue-row-FUN-58').click();
    await expect(page.getByTestId('issue-detail')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });
});

test('capture screenshots @screenshots', async ({ browser }) => {
  test.setTimeout(180000);
  await fs.mkdir('screenshots', { recursive: true });

  async function shot(name, path, viewport = DESKTOP, after = null) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    await page.goto(path, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    if (after) await after(page);
    await page.screenshot({ path: `screenshots/${name}.png`, animations: 'disabled' });
    await page.close();
  }

  const scrollWindowBottom = async (page) => {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(100);
  };
  const scrollDetailBottom = async (page) => {
    await page.evaluate(() => {
      const detail = document.querySelector('.split-detail');
      if (detail) detail.scrollTop = detail.scrollHeight;
    });
    await page.waitForTimeout(100);
  };
  const openInboxDetail = async (page) => {
    await page.getByRole('button', { name: /Localize the date picker/ }).click();
    await page.waitForTimeout(150);
  };

  await shot('desktop-index', '/');
  await shot('desktop-a-issues', '/#/a/issues');
  await shot('desktop-a-issue', '/#/a/issues/FUN-58');
  await shot('desktop-a-activity', '/#/a/issues/FUN-58', DESKTOP, scrollWindowBottom);
  await shot('desktop-a-inbox', '/#/a/inbox');
  await shot('desktop-b-issues', '/#/b/issues/FUN-58');
  await shot('desktop-b-activity', '/#/b/issues/FUN-58', DESKTOP, scrollDetailBottom);
  await shot('desktop-b-inbox', '/#/b/inbox');
  await shot('desktop-c-issues', '/#/c/issues');
  await shot('desktop-c-issue', '/#/c/issues/FUN-58');
  await shot('desktop-c-activity', '/#/c/issues/FUN-58', DESKTOP, scrollWindowBottom);
  await shot('desktop-c-inbox', '/#/c/inbox');

  await shot('mobile-a-issues', '/#/a/issues', MOBILE);
  await shot('mobile-a-issue', '/#/a/issues/FUN-58', MOBILE);
  await shot('mobile-a-inbox', '/#/a/inbox', MOBILE);
  await shot('mobile-b-issues', '/#/b/issues', MOBILE);
  await shot('mobile-b-issue', '/#/b/issues/FUN-58', MOBILE);
  await shot('mobile-b-inbox', '/#/b/inbox', MOBILE);
  await shot('mobile-b-inbox-detail', '/#/b/inbox', MOBILE, openInboxDetail);
  await shot('mobile-c-issues', '/#/c/issues', MOBILE);
  await shot('mobile-c-issue', '/#/c/issues/FUN-58', MOBILE);
  await shot('mobile-c-inbox', '/#/c/inbox', MOBILE);
});
