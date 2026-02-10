# OpenHands Integration Tests

End-to-end smoke tests for OpenHands using [Playwright](https://playwright.dev/).

## Overview

These integration tests verify the critical path of the OpenHands application:

1. ✅ User authentication (GitHub OAuth / Keycloak)
2. ✅ Home screen accessibility
3. ✅ Repository selection
4. ✅ Conversation creation
5. ✅ Agent interaction without errors

## Quick Start

### Prerequisites

- Node.js 20.0.0 or higher
- A GitHub test account with access to the test repository

### Installation

```bash
cd integration_tests
npm install
npx playwright install chromium  # Install browser
```

### Configuration

1. Copy the example environment file:

```bash
cp .env.example .env
```

2. Edit `.env` with your test credentials:

```env
GITHUB_TEST_USERNAME=your-test-account
GITHUB_TEST_PASSWORD=your-test-password
TEST_REPO_URL=https://github.com/OpenHands/deploy
```

### Run Tests

```bash
# Run all smoke tests against staging
npm test

# Run with visible browser
npm run test:headed

# Run with Playwright debugger
npm run test:debug

# Run with UI mode (interactive)
npm run test:ui
```

## Environment Support

Tests can run against different environments:

### Staging (Default)

```bash
npm run test:staging
# or
BASE_URL=https://staging.all-hands.dev npm test
```

### Production

```bash
npm run test:production
# or
BASE_URL=https://app.all-hands.dev npm test
```

### Feature Branches

```bash
BASE_URL=https://my-feature-branch.staging.all-hands.dev npm test
```

### Local Development

```bash
BASE_URL=http://localhost:3000 npm test
```

## Authentication

### GitHub OAuth (Default)

The tests use GitHub OAuth for authentication. You'll need a dedicated test account.

**Required Environment Variables:**
- `GITHUB_TEST_USERNAME` - GitHub username
- `GITHUB_TEST_PASSWORD` - GitHub password
- `GITHUB_TEST_TOTP_SECRET` - (Optional) 2FA TOTP secret

**Recommendations:**
- Use a dedicated test account, not your personal account
- Disable 2FA on the test account if possible (simpler automation)
- If 2FA is required, you'll need to implement TOTP generation (see below)

### Keycloak Authentication

For Keycloak-based authentication:

```env
AUTH_METHOD=keycloak
KEYCLOAK_URL=https://auth.your-domain.com
KEYCLOAK_USERNAME=test-user
KEYCLOAK_PASSWORD=test-password
```

### Reusing Authentication State

After running tests once, the authentication state is saved to `fixtures/auth.json`. To skip the auth flow on subsequent runs:

```env
AUTH_METHOD=skip
```

## Project Structure

```
integration_tests/
├── fixtures/               # Test fixtures and auth state
│   └── auth.json          # Saved authentication state (generated)
├── pages/                  # Page Object Models
│   ├── BasePage.ts        # Base page with common utilities
│   ├── HomePage.ts        # Home screen interactions
│   ├── ConversationPage.ts # Conversation/chat interactions
│   └── index.ts           # Page exports
├── tests/                  # Test specifications
│   ├── global-setup.ts    # Authentication setup
│   └── smoke.spec.ts      # Smoke test suite
├── utils/                  # Utility functions
├── .env.example           # Environment configuration template
├── playwright.config.ts   # Playwright configuration
├── package.json           # Dependencies and scripts
└── README.md              # This file
```

## Writing Tests

### Using Page Objects

```typescript
import { test, expect } from "@playwright/test";
import { HomePage, ConversationPage } from "../pages";

test("example test", async ({ page }) => {
  const homePage = new HomePage(page);
  const conversationPage = new ConversationPage(page);

  // Navigate and verify home screen
  await homePage.goto();
  await expect(homePage.homeScreen).toBeVisible();

  // Start a conversation
  await homePage.selectRepository("https://github.com/owner/repo");
  await homePage.startNewConversation();

  // Interact with agent
  await conversationPage.waitForConversationReady();
  await conversationPage.executePrompt("Your prompt here");
  await conversationPage.verifyNoErrors();
});
```

### Test Tags

Tests are organized with tags:

- `@smoke` - Core smoke tests (run by default)
- `@critical` - Critical functionality that must always work

```bash
# Run only smoke tests
npm run test:smoke

# Run specific tag
npx playwright test --grep @critical
```

## CI/CD Integration

### GitHub Actions

The tests can be run in GitHub Actions. See `.github/workflows/smoke-tests.yml`.

**Required Secrets:**
- `GITHUB_TEST_USERNAME` - Test account username
- `GITHUB_TEST_PASSWORD` - Test account password

### Example Workflow

```yaml
name: Smoke Tests

on:
  push:
    branches: [main]
  pull_request:
  schedule:
    - cron: '0 */6 * * *'  # Every 6 hours

jobs:
  smoke-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install dependencies
        working-directory: ./integration_tests
        run: npm ci

      - name: Install Playwright
        working-directory: ./integration_tests
        run: npx playwright install --with-deps chromium

      - name: Run smoke tests
        working-directory: ./integration_tests
        env:
          BASE_URL: https://staging.all-hands.dev
          GITHUB_TEST_USERNAME: ${{ secrets.GITHUB_TEST_USERNAME }}
          GITHUB_TEST_PASSWORD: ${{ secrets.GITHUB_TEST_PASSWORD }}
        run: npm test

      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: integration_tests/playwright-report/
          retention-days: 30
```

## Troubleshooting

### Authentication Fails

1. Verify credentials are correct
2. Check if 2FA is enabled (need TOTP secret)
3. Check if account is locked or needs verification
4. Try running `AUTH_METHOD=skip` with manual login first

### Tests Timeout

1. Increase timeout in `playwright.config.ts`
2. Check if the environment is accessible
3. Check agent response times

### Debug Mode

```bash
# Run with headed browser and pause on failure
PWDEBUG=1 npm test

# Generate test code interactively
npm run codegen
```

### View Test Report

```bash
npm run report
```

## Adding 2FA Support

If your test account requires 2FA, install `otplib`:

```bash
npm install otplib
```

Then update `global-setup.ts`:

```typescript
import { authenticator } from 'otplib';

async function generateTOTP(secret: string): Promise<string> {
  return authenticator.generate(secret);
}
```

## Best Practices

1. **Use dedicated test accounts** - Don't use personal accounts
2. **Keep credentials secure** - Never commit `.env` files
3. **Run tests sequentially** - Smoke tests share state
4. **Clean up after tests** - Stop agents, close conversations
5. **Use meaningful assertions** - Check for specific elements
6. **Add screenshots on failure** - Helps debug CI failures

## Contributing

When adding new tests:

1. Add new Page Objects for new pages/features
2. Follow existing naming conventions
3. Use appropriate test tags
4. Document any new environment variables
5. Update this README if needed
