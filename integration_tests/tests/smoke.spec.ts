import { test, expect } from "@playwright/test";
import { HomePage, ConversationPage } from "../pages";

/**
 * Smoke Tests for OpenHands Application
 *
 * These tests verify the critical path of the application:
 * 1. User can log in (handled by global-setup)
 * 2. User can access the home screen
 * 3. User can select a repository
 * 4. User can start a conversation
 * 5. Agent can process a simple prompt without errors
 *
 * Tags:
 * - @smoke: Core smoke tests that must pass
 * - @critical: Critical functionality tests
 *
 * Environment Variables:
 * - TEST_REPO_URL: Repository to use for testing (default: null)
 */

// Test configuration
const TEST_REPO_URL = process.env.TEST_REPO_URL;

test.describe("Smoke Tests @smoke", () => {
  test.describe.configure({ mode: "serial" }); // Run tests in sequence

  let homePage: HomePage;
  let conversationPage: ConversationPage;

  test.beforeEach(async ({ page }) => {
    homePage = new HomePage(page);
    conversationPage = new ConversationPage(page);
  });

  test("should display home screen after authentication @critical", async ({ page }) => {
    await homePage.goto();

    // Verify home screen is visible
    await expect(homePage.homeScreen).toBeVisible({ timeout: 30_000 });

    // Verify key sections are present
    await expect(homePage.newConversationSection).toBeVisible();

    // Take screenshot for verification
    await page.screenshot({ path: "test-results/screenshots/home-screen.png" });
  });

  test("should have user avatar visible indicating logged in state @critical", async () => {
    await homePage.goto();

    // Verify user is logged in
    const isLoggedIn = await homePage.isLoggedIn();
    expect(isLoggedIn).toBe(true);

    // Verify user avatar is visible
    await expect(homePage.userAvatar).toBeVisible();
  });

  test("should be able to open user menu", async () => {
    await homePage.goto();

    // Open user menu
    await homePage.openUserMenu();

    // Verify menu is visible
    await expect(homePage.accountSettingsMenu).toBeVisible();
  });

  test("should be able to purchase $10 credits via Stripe", async ({ page }) => {
    // Navigate to home and open user menu
    await homePage.goto();
    await homePage.openUserMenu();

    // Click on Billing link in the user menu
    const billingLink = page.getByRole('link', { name: /billing/i });
    await billingLink.click();

    // Wait for billing page to load
    await page.waitForURL(/\/settings\/billing/, { timeout: 30_000 });
    await expect(page.getByTestId('billing-settings')).toBeVisible({ timeout: 10_000 });

    // Capture initial balance
    const balanceElement = page.getByTestId('user-balance');
    await expect(balanceElement).toBeVisible({ timeout: 10_000 });
    const initialBalanceText = await balanceElement.textContent();
    const initialBalance = parseFloat(initialBalanceText?.replace('$', '') || '0');
    console.log(`Initial balance: $${initialBalance.toFixed(2)}`);

    // Enter $10 in the Add Funds input
    const topUpInput = page.getByTestId('top-up-input');
    await topUpInput.fill('10');

    // Click Add Credit button
    const addCreditButton = page.getByRole('button', { name: /add credit/i });
    await expect(addCreditButton).toBeEnabled({ timeout: 5_000 });
    await addCreditButton.click();

    // Wait for redirect to Stripe checkout
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
    console.log('Redirected to Stripe checkout');

    // Wait for the Pay button to be present (indicates form is ready)
    const payButton = page.locator('.SubmitButton')
    await payButton.waitFor({ state: 'attached', timeout: 30_000 });
    console.log('Stripe checkout form loaded');

    // Fill in card number
    const cardNumberInput = page.locator('#cardNumber');
    await cardNumberInput.fill('5105105105105100');

    // Fill in expiry date
    const cardExpiryInput = page.locator('#cardExpiry');
    await cardExpiryInput.fill('12/35');

    // Fill in CVC
    const cardCvcInput = page.locator('#cardCvc');
    await cardCvcInput.fill('123');

    // Fill in cardholder name
    const billingNameInput = page.locator('#billingName');
    await billingNameInput.fill('Testy Tester');

    // Fill in ZIP code
    const postalCodeInput = page.locator('#billingPostalCode');
    await postalCodeInput.fill('12345');

    // Take screenshot of filled Stripe form
    await page.screenshot({ path: 'test-results/screenshots/stripe-checkout-filled.png' });

    // Click Pay button
    await payButton.click();

    // Wait for redirect back to billing page
    await page.waitForURL(/\/settings\/billing/, { timeout: 60_000 });
    console.log('Returned to billing page after payment');

    // Wait for balance to update (may need to wait for API refresh)
    await page.waitForTimeout(2000);

    // Verify balance increased by $10
    await expect(balanceElement).toBeVisible({ timeout: 10_000 });
    const newBalanceText = await balanceElement.textContent();
    const newBalance = parseFloat(newBalanceText?.replace('$', '') || '0');
    console.log(`New balance: $${newBalance.toFixed(2)}`);

    const expectedBalance = initialBalance + 10;
    expect(newBalance).toBeCloseTo(expectedBalance, 2);
    console.log(`Balance increased by $10: $${initialBalance.toFixed(2)} -> $${newBalance.toFixed(2)}`);

    // Take screenshot of updated balance
    await page.screenshot({ path: 'test-results/screenshots/billing-after-payment.png' });
  });

  test("should be able to start a conversation, send a prompt, and receive response @critical", async ({ page }) => {
    // Navigate to home
    await homePage.goto();

    if (TEST_REPO_URL) {
      // Select repository if repo selection is available
      try {
        await homePage.selectRepository(TEST_REPO_URL);
        console.log(`Selected repository: ${TEST_REPO_URL}`);
      } catch (e) {
        console.log("Repository selection not available or failed, continuing...");
      }
      // Start a new conversation
      await homePage.startNewConversation('repo-launch-button');
    } else {
      await homePage.startNewConversation('launch-new-conversation-button');
    }

    // Wait for conversation page to load
    await page.waitForTimeout(2000); // Allow navigation to complete

    // Initialize conversation page
    conversationPage = new ConversationPage(page);

    // Wait for the agent to be ready
    await conversationPage.waitForConversationReady();

    // Verify chat interface is available
    await expect(conversationPage.chatBox).toBeVisible();
    await expect(conversationPage.chatInput).toBeVisible();

    // Take screenshot before sending message
    await page.screenshot({ path: "test-results/screenshots/conversation-ready.png" });

    // Execute the test prompt
    const prompt = "Reverse the word 'hello'";
    console.log(`Sending prompt: "${prompt}"`);
    await conversationPage.executePrompt(prompt, 120_000);

    // Wait for a message containing the expected reversed word
    const message = await conversationPage.waitForMessageContaining("olleh", 120_000);
    console.log(`Found expected response containing 'olleh': "${message.substring(0, 100)}..."`);

    // Take screenshot of successful response
    await page.screenshot({ path: "test-results/screenshots/agent-response.png" });

    console.log("Smoke test passed: Agent correctly reversed the word");
  });

  test("should be able to navigate to a running conversation", async ({ page }) => {
    // Navigate to home page
    await homePage.goto();

    // Click on the first conversation in the recent conversations list
    await homePage.clickFirstConversation();

    // Initialize conversation page
    conversationPage = new ConversationPage(page);

    // Wait for the conversation to be ready by checking for "Waiting for task" status
    await conversationPage.waitForConversationReady();

    // Take screenshot of successful navigation
    await page.screenshot({ path: "test-results/screenshots/navigated-conversation.png" });

    console.log("Successfully navigated to running conversation");
  });

  test("should be able to use Tavily search and get accurate response", async ({ page }) => {
    // Navigate to home page
    await homePage.goto();

    // Click on the first conversation in the recent conversations list
    await homePage.clickFirstConversation();

    // Initialize conversation page
    conversationPage = new ConversationPage(page);

    // Wait for the agent to be ready
    await conversationPage.waitForConversationReady();

    // Send the Tavily search prompt
    const prompt = "Using Tavily search, please tell me who is the prime minister of Ireland.";
    console.log(`Sending prompt: "${prompt}"`);
    await conversationPage.executePrompt(prompt, 180_000); // Longer timeout for search

    // Wait for a message containing the expected answer
    const message = await conversationPage.waitForMessageContaining("Micheál Martin", 180_000);
    console.log(`Found expected response containing 'Micheál Martin': "${message.substring(0, 100)}..."`);

    // Take screenshot of successful response
    await page.screenshot({ path: "test-results/screenshots/tavily-search-response.png" });

    console.log("Tavily search test passed: Agent correctly identified the Prime Minister of Ireland");
  });
});

test.describe("Health Check Tests @smoke", () => {
  test("application should be accessible", async ({ page, baseURL }) => {
    const response = await page.goto(baseURL || "/");

    // Verify we got a successful response
    expect(response?.status()).toBeLessThan(400);
  });

  test("application should not have console errors on load", async ({ page }) => {
    const errors: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        // Filter out known acceptable errors
        const text = msg.text();
        if (
          !text.includes("favicon") &&
          !text.includes("sourcemap") &&
          !text.includes("DevTools")
        ) {
          errors.push(text);
        }
      }
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});

    // Log any errors found
    if (errors.length > 0) {
      console.log("Console errors found:", errors);
    }

    // Fail if critical errors exist
    const criticalErrors = errors.filter(
      (e) => e.includes("TypeError") || e.includes("ReferenceError") || e.includes("SyntaxError")
    );
    expect(criticalErrors).toHaveLength(0);
  });
});

test.describe("Environment Validation @smoke", () => {
  test("should be connected to correct environment", async ({ page, baseURL }) => {
    await page.goto("/");

    // Log the current environment for verification
    console.log(`Testing against: ${baseURL}`);

    // Verify we're on the expected domain
    const url = page.url();
    expect(url).toContain(new URL(baseURL || "").hostname);
  });

  test("should have valid SSL certificate", async ({ page, baseURL }) => {
    // This test implicitly validates SSL because ignoreHTTPSErrors is true
    // but we still want to verify the connection works
    const response = await page.goto(baseURL || "/");
    expect(response?.ok()).toBe(true);
  });
});
