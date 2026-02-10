import { test as setup, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

const authFile = path.join(import.meta.dirname, "../fixtures/auth.json");

/**
 * Global setup test that handles authentication.
 *
 * This test runs before all other tests and saves the authentication state
 * to a file that can be reused across test runs.
 *
 * Authentication Methods:
 * 1. GitHub OAuth (default) - Requires GITHUB_TEST_USERNAME and GITHUB_TEST_PASSWORD
 * 2. Keycloak - Can be customized via KEYCLOAK_* environment variables
 * 3. Pre-existing auth state - If fixtures/auth.json exists and is valid
 *
 * Environment Variables:
 * - AUTH_METHOD: "github" | "keycloak" | "skip" (default: "github")
 * - GITHUB_TEST_USERNAME: GitHub username for test account
 * - GITHUB_TEST_PASSWORD: GitHub password for test account
 * - GITHUB_TEST_TOTP_SECRET: (Optional) TOTP secret for 2FA
 * - KEYCLOAK_URL: Keycloak server URL
 * - KEYCLOAK_USERNAME: Keycloak test username
 * - KEYCLOAK_PASSWORD: Keycloak test password
 */
setup("authenticate", async ({ page, baseURL }) => {
  const authMethod = process.env.AUTH_METHOD || "github";

  // Check if we should skip authentication (use existing auth state)
  if (authMethod === "skip") {
    if (fs.existsSync(authFile)) {
      console.log("Using existing authentication state from fixtures/auth.json");
      return;
    }
    throw new Error(
      "AUTH_METHOD=skip but no existing auth.json found. Please run authentication first."
    );
  }

  // Navigate to the application
  await page.goto(baseURL || "/");

  // Check if already authenticated
  const isAuthenticated = await checkIfAuthenticated(page);
  if (isAuthenticated) {
    console.log("Already authenticated, saving state...");
    await page.context().storageState({ path: authFile });
    return;
  }

  // Perform authentication based on method
  if (authMethod === "github") {
    await authenticateWithGitHub(page);
  } else if (authMethod === "keycloak") {
    await authenticateWithKeycloak(page);
  } else {
    throw new Error(`Unknown AUTH_METHOD: ${authMethod}`);
  }

  // Wait for successful redirect back to app
  await page.waitForURL((url) => {
    const urlString = url.toString();
    return (
      !urlString.includes("github.com") &&
      !urlString.includes("login") &&
      !urlString.includes("keycloak")
    );
  }, { timeout: 60_000 });

  // Verify authentication succeeded
  await expect(page.getByTestId("home-screen")).toBeVisible({ timeout: 30_000 });

  // Save authentication state
  await page.context().storageState({ path: authFile });
  console.log("Authentication successful, state saved to fixtures/auth.json");
});

/**
 * Check if the user is already authenticated
 */
async function checkIfAuthenticated(page: import("@playwright/test").Page): Promise<boolean> {
  try {
    // Look for elements that indicate authentication
    const homeScreen = page.getByTestId("home-screen");
    const loginPage = page.getByTestId("login-page");

    // Wait a bit for the page to stabilize
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

    // Check if we're on the home screen (authenticated)
    const isOnHome = await homeScreen.isVisible().catch(() => false);
    const isOnLogin = await loginPage.isVisible().catch(() => false);

    return isOnHome && !isOnLogin;
  } catch {
    return false;
  }
}

/**
 * Authenticate using GitHub OAuth
 */
async function authenticateWithGitHub(page: import("@playwright/test").Page): Promise<void> {
  const username = process.env.GITHUB_TEST_USERNAME;
  const password = process.env.GITHUB_TEST_PASSWORD;

  if (!username || !password) {
    throw new Error(
      "GitHub authentication requires GITHUB_TEST_USERNAME and GITHUB_TEST_PASSWORD environment variables"
    );
  }

  console.log("Starting GitHub authentication...");

  // Click the GitHub login button
  const githubButton = page.getByRole("button", { name: /connect to github/i });
  await expect(githubButton).toBeVisible({ timeout: 10_000 });
  await githubButton.click();

  // Wait for GitHub login page
  await page.waitForURL(/github\.com/, { timeout: 30_000 });

  // Fill in GitHub credentials
  const usernameField = page.locator('input[name="login"]');
  const passwordField = page.locator('input[name="password"]');

  await usernameField.waitFor({ state: "visible", timeout: 10_000 });

  await usernameField.fill(username);
  await passwordField.fill(password);

  // Submit the form
  await page.locator('input[type="submit"][value="Sign in"]').click();

  // Handle potential 2FA
  const totpSecret = process.env.GITHUB_TEST_TOTP_SECRET;
  if (totpSecret) {
    await handle2FA(page, totpSecret);
  }

  // Handle OAuth authorization if needed
  await handleOAuthAuthorization(page);

  console.log("GitHub authentication flow completed");
}

/**
 * Handle GitHub 2FA if enabled
 */
async function handle2FA(page: import("@playwright/test").Page, totpSecret: string): Promise<void> {
  try {
    // Check if 2FA page appears
    const otpField = page.locator('input[name="otp"]');
    const isOtpVisible = await otpField.isVisible({ timeout: 5_000 }).catch(() => false);

    if (isOtpVisible) {
      console.log("2FA required, generating TOTP code...");

      // Generate TOTP code (you'd need to implement this or use a library)
      const totpCode = await generateTOTP(totpSecret);
      await otpField.fill(totpCode);

      // Submit 2FA
      await page.locator('button[type="submit"]').click();
    }
  } catch {
    // 2FA not required, continue
  }
}

/**
 * Generate TOTP code from secret
 * Note: In production, use a proper TOTP library like 'otplib'
 */
async function generateTOTP(secret: string): Promise<string> {
  // This is a placeholder - in production, use:
  // import { authenticator } from 'otplib';
  // return authenticator.generate(secret);
  throw new Error(
    "TOTP generation not implemented. Install 'otplib' package and implement generateTOTP function."
  );
}

/**
 * Handle OAuth authorization prompt if it appears
 */
async function handleOAuthAuthorization(page: import("@playwright/test").Page): Promise<void> {
  try {
    // Check if we need to authorize the app
    const authorizeButton = page.locator('button[name="authorize"]');
    const isAuthVisible = await authorizeButton.isVisible({ timeout: 5_000 }).catch(() => false);

    if (isAuthVisible) {
      console.log("OAuth authorization required, clicking authorize...");
      await authorizeButton.click();
    }
  } catch {
    // No authorization needed, continue
  }
}

/**
 * Authenticate using Keycloak
 */
async function authenticateWithKeycloak(page: import("@playwright/test").Page): Promise<void> {
  const username = process.env.KEYCLOAK_USERNAME;
  const password = process.env.KEYCLOAK_PASSWORD;

  if (!username || !password) {
    throw new Error(
      "Keycloak authentication requires KEYCLOAK_USERNAME and KEYCLOAK_PASSWORD environment variables"
    );
  }

  console.log("Starting Keycloak authentication...");

  // Navigate to login page and initiate Keycloak flow
  // The exact flow depends on your Keycloak configuration
  await page.goto("/login");

  // Wait for Keycloak login page
  await page.waitForURL(/keycloak|auth/, { timeout: 30_000 });

  // Fill in Keycloak credentials
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(password);

  // Submit
  await page.locator("#kc-login").click();

  console.log("Keycloak authentication flow completed");
}
