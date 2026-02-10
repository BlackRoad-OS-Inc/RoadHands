import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import path from "path";

// Load environment variables from .env file
dotenv.config({ path: path.resolve(import.meta.dirname, ".env") });

/**
 * Environment URLs for different deployment targets
 */
const environments = {
  staging: "https://staging.all-hands.dev",
  production: "https://app.all-hands.dev",
  local: "http://localhost:3000",
};

/**
 * Get the base URL from environment variable or default to staging
 * For feature branches, use: https://<feature_branch_name>.staging.all-hands.dev
 */
function getBaseURL(): string {
  const envUrl = process.env.BASE_URL;
  if (envUrl) {
    return envUrl;
  }

  const env = process.env.TEST_ENV || "staging";
  return environments[env as keyof typeof environments] || environments.staging;
}

/**
 * Playwright configuration for OpenHands integration tests
 *
 * Supports multiple environments:
 * - staging: https://staging.all-hands.dev
 * - production: https://app.all-hands.dev
 * - feature branches: https://<branch>.staging.all-hands.dev
 *
 * Usage:
 * - npm run test                    # Run all tests against staging
 * - npm run test:staging            # Run all tests against staging
 * - npm run test:production         # Run all tests against production
 * - BASE_URL=https://my-branch.staging.all-hands.dev npm test  # Feature branch
 */
export default defineConfig({
  testDir: "./tests",

  // Run tests in parallel
  fullyParallel: false, // Disabled for smoke tests to ensure sequential execution

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry failed tests (more retries in CI)
  retries: process.env.CI ? 2 : 1,

  // Limit parallel workers (smoke tests should run sequentially)
  workers: process.env.CI ? 1 : 1,

  // Reporter configuration
  reporter: process.env.CI
    ? [
        ["html", { outputFolder: "playwright-report" }],
        ["list"],
        ["github"],
      ]
    : [
        ["html", { outputFolder: "playwright-report" }],
        ["list"],
      ],

  // Timeout configuration
  timeout: 120_000, // 2 minutes per test (agent operations can be slow)
  expect: {
    timeout: 30_000, // 30 seconds for assertions
  },

  // Shared settings for all projects
  use: {
    // Base URL for navigation
    baseURL: getBaseURL(),

    // Collect trace on failure
    trace: "on-first-retry",

    // Screenshots on failure
    screenshot: "only-on-failure",

    // Video recording (useful for debugging CI failures)
    video: process.env.CI ? "on-first-retry" : "off",

    // Ignore SSL errors (for staging/development environments)
    ignoreHTTPSErrors: true,

    // Use persisted authentication state
    storageState: "./fixtures/auth.json",

    // Browser viewport
    viewport: { width: 1280, height: 720 },

    // Action timeout
    actionTimeout: 15_000,

    // Navigation timeout
    navigationTimeout: 30_000,
  },

  // Define test projects
  projects: [
    // Setup project - handles authentication
    {
      name: "setup",
      testMatch: /global-setup\.ts/,
      use: {
        storageState: undefined, // Don't use existing auth for setup
      },
    },

    // Chromium tests (primary browser)
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
      dependencies: ["setup"],
    },

    // Firefox tests (optional - run with --project=firefox)
    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
      },
      dependencies: ["setup"],
    },

    // WebKit tests (optional - run with --project=webkit)
    {
      name: "webkit",
      use: {
        ...devices["Desktop Safari"],
      },
      dependencies: ["setup"],
    },
  ],

  // Output directory for test artifacts
  outputDir: "./test-results",

  // Global setup/teardown
  globalSetup: undefined, // We use a setup project instead for better parallelization
  globalTeardown: undefined,
});
