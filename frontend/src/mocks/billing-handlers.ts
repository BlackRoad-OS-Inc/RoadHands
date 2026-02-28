import { delay, http, HttpResponse } from "msw";

// Mock data for credit balance
const MOCK_CREDITS = "100";

// Factory function to create billing handlers
function createBillingHandlers() {
  return [
    http.get("/api/billing/credits", async () => {
      await delay();
      return HttpResponse.json({ credits: MOCK_CREDITS });
    }),

    http.post("/api/billing/create-checkout-session", async () => {
      await delay();
      return HttpResponse.json({
        redirect_url: "https://stripe.com/some-checkout",
      });
    }),

    http.post("/api/billing/create-customer-setup-session", async () => {
      await delay();
      return HttpResponse.json({
        redirect_url: "https://stripe.com/some-customer-setup",
      });
    }),
  ];
}

// Export handler set for testing
export const STRIPE_BILLING_HANDLERS = createBillingHandlers();
