import { expect, test } from '@playwright/test';

test('loads the Storybook shell', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/Storybook/i);
  await expect(page.getByText('Foundations')).toBeVisible();
  await expect(page.getByText('Bootstrap')).toBeVisible();
});

test('renders the bootstrap foundation story', async ({ page }) => {
  await page.goto('/iframe.html?id=foundations-bootstrap--default&viewMode=story');

  await expect(page.getByText('Mobile UI Foundation')).toBeVisible();
  await expect(page.getByText('Storybook bootstrap ready.')).toBeVisible();
});
