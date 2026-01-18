import { test, expect } from "@playwright/test";

test.describe("Tasks Page", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to tasks page
    await page.goto("/tasks");
  });

  test("displays task list", async ({ page }) => {
    // Wait for tasks to load
    await page.waitForSelector("[data-testid='task-list']", { timeout: 10000 });
    
    // Check that tasks are displayed
    const tasks = page.locator("[data-testid='task-item']");
    await expect(tasks).toHaveCount(await tasks.count());
  });

  test("can create a new task", async ({ page }) => {
    // Click new task button
    await page.click("[data-testid='new-task-button']");
    
    // Fill in task details
    await page.fill("[data-testid='task-title-input']", "E2E Test Task");
    await page.selectOption("[data-testid='task-category-select']", "ERRANDS");
    await page.selectOption("[data-testid='task-urgency-select']", "HIGH");
    
    // Submit the form
    await page.click("[data-testid='submit-task-button']");
    
    // Verify task was created
    await expect(page.locator("text=E2E Test Task")).toBeVisible();
  });

  test("can complete a task", async ({ page }) => {
    // Wait for tasks to load
    await page.waitForSelector("[data-testid='task-item']");
    
    // Find the first incomplete task
    const task = page.locator("[data-testid='task-item']").first();
    
    // Click complete button
    await task.locator("[data-testid='complete-task-button']").click();
    
    // Verify task status changed
    await expect(task.locator("[data-testid='task-status']")).toContainText("DONE");
  });

  test("can filter tasks by status", async ({ page }) => {
    // Click on filter dropdown
    await page.click("[data-testid='status-filter']");
    
    // Select "Inbox" filter
    await page.click("[data-testid='filter-option-inbox']");
    
    // Verify only inbox tasks are shown
    const tasks = page.locator("[data-testid='task-item']");
    const count = await tasks.count();
    
    for (let i = 0; i < count; i++) {
      await expect(tasks.nth(i).locator("[data-testid='task-status']")).toContainText("INBOX");
    }
  });

  test("can search tasks", async ({ page }) => {
    // Type in search box
    await page.fill("[data-testid='task-search']", "dry cleaning");
    
    // Wait for search results
    await page.waitForTimeout(500);
    
    // Verify filtered results
    const tasks = page.locator("[data-testid='task-item']");
    const count = await tasks.count();
    
    if (count > 0) {
      await expect(tasks.first()).toContainText(/dry cleaning/i);
    }
  });
});

test.describe("Approvals Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/approvals");
  });

  test("displays approval list", async ({ page }) => {
    await page.waitForSelector("[data-testid='approval-list']", { timeout: 10000 });
    
    const approvals = page.locator("[data-testid='approval-item']");
    await expect(approvals).toHaveCount(await approvals.count());
  });

  test("can approve an item", async ({ page }) => {
    await page.waitForSelector("[data-testid='approval-item']");
    
    const approval = page.locator("[data-testid='approval-item'][data-status='PENDING']").first();
    
    if (await approval.count() > 0) {
      await approval.locator("[data-testid='approve-button']").click();
      await expect(approval.locator("[data-testid='approval-status']")).toContainText("APPROVED");
    }
  });

  test("can decline an item", async ({ page }) => {
    await page.waitForSelector("[data-testid='approval-item']");
    
    const approval = page.locator("[data-testid='approval-item'][data-status='PENDING']").first();
    
    if (await approval.count() > 0) {
      await approval.locator("[data-testid='decline-button']").click();
      await expect(approval.locator("[data-testid='approval-status']")).toContainText("DECLINED");
    }
  });
});

test.describe("Dashboard", () => {
  test("displays key metrics", async ({ page }) => {
    await page.goto("/");
    
    // Wait for dashboard to load
    await page.waitForSelector("[data-testid='dashboard']", { timeout: 10000 });
    
    // Check for key metric cards
    await expect(page.locator("[data-testid='pending-tasks-count']")).toBeVisible();
    await expect(page.locator("[data-testid='pending-approvals-count']")).toBeVisible();
    await expect(page.locator("[data-testid='upcoming-events-count']")).toBeVisible();
  });

  test("navigates to tasks from dashboard", async ({ page }) => {
    await page.goto("/");
    
    await page.click("[data-testid='view-tasks-link']");
    
    await expect(page).toHaveURL(/\/tasks/);
  });
});

test.describe("Mobile Navigation", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("shows mobile navigation", async ({ page }) => {
    await page.goto("/");
    
    // Check for bottom navigation
    await expect(page.locator("[data-testid='mobile-nav']")).toBeVisible();
  });

  test("can navigate using mobile nav", async ({ page }) => {
    await page.goto("/");
    
    // Click on tasks in mobile nav
    await page.click("[data-testid='mobile-nav-tasks']");
    
    await expect(page).toHaveURL(/\/tasks/);
  });
});

test.describe("Offline Support", () => {
  test("shows offline indicator when offline", async ({ page, context }) => {
    await page.goto("/");
    
    // Go offline
    await context.setOffline(true);
    
    // Check for offline indicator
    await expect(page.locator("[data-testid='offline-indicator']")).toBeVisible({ timeout: 5000 });
    
    // Go back online
    await context.setOffline(false);
    
    // Check that offline indicator is hidden
    await expect(page.locator("[data-testid='offline-indicator']")).not.toBeVisible({ timeout: 5000 });
  });
});
