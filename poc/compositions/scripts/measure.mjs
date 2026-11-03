import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const base = 'http://127.0.0.1:4173';

async function visit(path) {
  await page.goto(base + path, { waitUntil: 'networkidle' });
}

function metricsScript() {
  const visible = (element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  const fullyVisible = (element) => {
    const rect = element.getBoundingClientRect();
    return visible(element) && rect.top >= 0 && rect.bottom <= window.innerHeight;
  };
  const rows = Array.from(document.querySelectorAll('[data-testid^="issue-row-"]'));
  const nav = document.querySelector('nav.navbar');
  const sidebar = document.querySelector('.app-sidebar');
  const list = document.querySelector('.split-list');
  const detail = document.querySelector('.split-detail');
  const main = document.querySelector('main');
  const table = document.querySelector('table');
  const firstTitleCell = document.querySelector('tbody tr[data-testid] td:nth-child(2)');
  return {
    viewport: { width: innerWidth, height: innerHeight },
    scrollWidth: document.documentElement.scrollWidth,
    navHeight: nav ? Math.round(nav.getBoundingClientRect().height) : 0,
    sidebarWidth: sidebar ? Math.round(sidebar.getBoundingClientRect().width) : 0,
    listWidth: list ? Math.round(list.getBoundingClientRect().width) : 0,
    detailWidth: detail ? Math.round(detail.getBoundingClientRect().width) : 0,
    mainWidth: main ? Math.round(main.getBoundingClientRect().width) : 0,
    tableWidth: table ? Math.round(table.getBoundingClientRect().width) : 0,
    titleColumnWidth: firstTitleCell ? Math.round(firstTitleCell.getBoundingClientRect().width) : 0,
    rowsInDom: rows.length,
    rowsFullyVisible: rows.filter(fullyVisible).length,
    tableTop: table ? Math.round(table.getBoundingClientRect().top) : 0
  };
}

const data = {};

await visit('/#/a/issues');
data.a = await page.evaluate(metricsScript);

await visit('/#/b/issues/FUN-58');
data.b = await page.evaluate(metricsScript);

await visit('/#/c/issues');
data.c = await page.evaluate(metricsScript);

await page.setViewportSize({ width: 390, height: 844 });
for (const [key, path] of [
  ['mobileA', '/#/a/issues'],
  ['mobileAInbox', '/#/a/inbox'],
  ['mobileADetail', '/#/a/issues/FUN-58'],
  ['mobileBList', '/#/b/issues'],
  ['mobileBDetail', '/#/b/issues/FUN-58'],
  ['mobileC', '/#/c/issues'],
  ['mobileCInbox', '/#/c/inbox'],
  ['mobileCDetail', '/#/c/issues/FUN-58']
]) {
  await visit(path);
  data[key] = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    overflow: document.documentElement.scrollWidth - window.innerWidth
  }));
}

console.log(JSON.stringify(data, null, 2));
await browser.close();
