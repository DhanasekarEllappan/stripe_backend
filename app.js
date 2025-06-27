const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
dotenv.config();

const stripe = require("stripe")(process.env.SECRECT_KEY); // Your existing secret key

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// ============================================================================
// PAYMENT INTENT METHODS
// ============================================================================

// 1. Create Payment Intent
app.post("/create-payment-intent", async (req, res) => {
  try {
    const {
      amount,
      currency = "usd",
      customer_email,
      paymentMethod,
    } = req.body;

    // Validate amount
    if (!amount || amount <= 0) {
      return res.status(400).json({
        error: "Amount is required and must be greater than 0",
      });
    }

    // Create Payment Intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: currency,
      //   automatic_payment_methods: {
      //     enabled: true,
      //   },
      payment_method_types: [paymentMethod],
      metadata: {
        customer_email: customer_email || "unknown",
        order_id: `order_${Date.now()}`, // You can add your order ID here
      },
    });

    res.json({
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
    });
  } catch (error) {
    console.error("Error creating payment intent:", error);
    res.status(500).json({
      error: "Failed to create payment intent",
      message: error.message,
    });
  }
});

// 2. Confirm Payment Status (Optional - for webhook or manual check)
app.post("/confirm-payment", async (req, res) => {
  try {
    const { payment_intent_id } = req.body;

    if (!payment_intent_id) {
      return res.status(400).json({
        error: "Payment Intent ID is required",
      });
    }

    // Retrieve payment intent to check status
    const paymentIntent = await stripe.paymentIntents.retrieve(
      payment_intent_id
    );

    res.json({
      status: paymentIntent.status,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      payment_method: paymentIntent.payment_method,
    });
  } catch (error) {
    console.error("Error confirming payment:", error);
    res.status(500).json({
      error: "Failed to confirm payment",
      message: error.message,
    });
  }
});

// ============================================================================
// SETUP INTENT METHODS (New Addition)
// ============================================================================

// 3. Create Setup Intent (Save Payment Method)
app.post("/create-setup-intent", async (req, res) => {
  try {
    const { customer_email, usage = "off_session" } = req.body;

    // Optional: Create or get existing customer
    let customer;
    if (customer_email) {
      const existingCustomers = await stripe.customers.list({
        email: customer_email,
        limit: 1,
      });
      console.log("Customer");
      console.log(existingCustomers);

      if (existingCustomers.data.length > 0) {
        customer = existingCustomers.data[0];
      } else {
        customer = await stripe.customers.create({
          email: customer_email,
        });
      }
    }

    // Create Setup Intent
    const setupIntent = await stripe.setupIntents.create({
      customer: customer ? customer.id : undefined,
      usage: usage, // 'off_session' for future payments, 'on_session' for immediate use
      payment_method_types: ["card"],
      metadata: {
        customer_email: customer_email || "unknown",
        created_at: new Date().toISOString(),
      },
    });

    res.json({
      client_secret: setupIntent.client_secret,
      setup_intent_id: setupIntent.id,
      customer_id: customer ? customer.id : null,
    });
  } catch (error) {
    console.error("Error creating setup intent:", error);
    res.status(500).json({
      error: "Failed to create setup intent",
      message: error.message,
    });
  }
});

// 4. Retrieve Setup Intent
app.post("/retrieve-setup-intent", async (req, res) => {
  try {
    const { setup_intent_id } = req.body;

    if (!setup_intent_id) {
      return res.status(400).json({
        error: "Setup Intent ID is required",
      });
    }

    const setupIntent = await stripe.setupIntents.retrieve(setup_intent_id);

    res.json({
      id: setupIntent.id,
      status: setupIntent.status,
      payment_method: setupIntent.payment_method,
      customer: setupIntent.customer,
      usage: setupIntent.usage,
      created: setupIntent.created,
      metadata: setupIntent.metadata,
    });
  } catch (error) {
    console.error("Error retrieving setup intent:", error);
    res.status(500).json({
      error: "Failed to retrieve setup intent",
      message: error.message,
    });
  }
});

// 5. Create Payment with Saved Payment Method
app.post("/create-payment-with-saved-method", async (req, res) => {
  try {
    const {
      payment_method_id,
      amount,
      currency = "usd",
      customer_id,
    } = req.body;

    if (!payment_method_id || !amount) {
      return res.status(400).json({
        error: "Payment method ID and amount are required",
      });
    }

    // Create Payment Intent with saved payment method
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: currency,
      payment_method: payment_method_id,
      customer: customer_id,
      confirmation_method: "manual",
      confirm: true,
      return_url: "https://your-website.com/return", // Required for some payment methods
      metadata: {
        payment_type: "saved_method",
        created_at: new Date().toISOString(),
      },
    });

    res.json({
      payment_intent_id: paymentIntent.id,
      status: paymentIntent.status,
      amount: paymentIntent.amount,
      client_secret: paymentIntent.client_secret,
    });
  } catch (error) {
    console.error("Error creating payment with saved method:", error);
    res.status(500).json({
      error: "Failed to create payment with saved method",
      message: error.message,
    });
  }
});

// ============================================================================
// CUSTOMER & PAYMENT METHOD MANAGEMENT
// ============================================================================

// 6. Create customer (Your existing method)
app.post("/create-customer", async (req, res) => {
  try {
    const { email, phone } = req.body;

    // Check if customer exists
    const existingCustomers = await stripe.customers.list({
      email: email,
      limit: 1,
    });

    let customer;
    if (existingCustomers.data.length > 0) {
      customer = existingCustomers.data[0];
    } else {
      customer = await stripe.customers.create({
        email: email,
        phone: phone,
      });
    }

    res.json({
      customerId: customer.id,
      email: customer.email,
      message: "Customer ready",
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/get-ephemeral-key", async (req, res) => {
  try {
    const { customerId } = req.body;

    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: "2023-10-16" }
    );

    res.json({
      ephemeralKey: ephemeralKey.secret,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 7. Get payment methods for a customer (Your existing method)
app.post("/get-payment-methods", async (req, res) => {
  try {
    const { customer_id } = req.body;

    if (!customer_id) {
      return res.status(400).json({
        error: "Customer ID is required",
      });
    }

    const paymentMethods = await stripe.paymentMethods.list({
      customer: customer_id,
      type: "card",
    });

    res.json({
      payment_methods: paymentMethods.data,
    });
  } catch (error) {
    console.error("Error retrieving payment methods:", error);
    res.status(500).json({
      error: "Failed to retrieve payment methods",
      message: error.message,
    });
  }
});

// 8. List Customer Payment Methods (Enhanced version)
app.post("/list-payment-methods", async (req, res) => {
  try {
    const { customer_id } = req.body;

    if (!customer_id) {
      return res.status(400).json({
        error: "Customer ID is required",
      });
    }

    const paymentMethods = await stripe.paymentMethods.list({
      customer: customer_id,
      type: "card",
    });

    const formattedMethods = paymentMethods.data.map((pm) => ({
      id: pm.id,
      brand: pm.card.brand,
      last4: pm.card.last4,
      exp_month: pm.card.exp_month,
      exp_year: pm.card.exp_year,
      created: pm.created,
    }));

    res.json({
      payment_methods: formattedMethods,
      has_more: paymentMethods.has_more,
    });
  } catch (error) {
    console.error("Error listing payment methods:", error);
    res.status(500).json({
      error: "Failed to list payment methods",
      message: error.message,
    });
  }
});

// 9. Delete Saved Payment Method
app.post("/delete-payment-method", async (req, res) => {
  try {
    const { payment_method_id } = req.body;

    if (!payment_method_id) {
      return res.status(400).json({
        error: "Payment method ID is required",
      });
    }

    const paymentMethod = await stripe.paymentMethods.detach(payment_method_id);

    res.json({
      message: "Payment method deleted successfully",
      payment_method_id: paymentMethod.id,
    });
  } catch (error) {
    console.error("Error deleting payment method:", error);
    res.status(500).json({
      error: "Failed to delete payment method",
      message: error.message,
    });
  }
});

// ============================================================================
// SUBSCRIPTION METHODS (Bonus Addition)
// ============================================================================

// 10. Create Subscription
app.post("/create-subscription", async (req, res) => {
  try {
    const { customer_id, price_id, payment_method_id } = req.body;

    if (!customer_id || !price_id) {
      return res.status(400).json({
        error: "Customer ID and Price ID are required",
      });
    }

    // Attach payment method to customer if provided
    if (payment_method_id) {
      await stripe.paymentMethods.attach(payment_method_id, {
        customer: customer_id,
      });

      // Set as default payment method
      await stripe.customers.update(customer_id, {
        invoice_settings: {
          default_payment_method: payment_method_id,
        },
      });
    }

    // Create subscription
    const subscription = await stripe.subscriptions.create({
      customer: customer_id,
      items: [{ price: price_id }],
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      expand: ["latest_invoice.payment_intent"],
    });

    res.json({
      subscription_id: subscription.id,
      client_secret: subscription.latest_invoice.payment_intent.client_secret,
      status: subscription.status,
    });
  } catch (error) {
    console.error("Error creating subscription:", error);
    res.status(500).json({
      error: "Failed to create subscription",
      message: error.message,
    });
  }
});

// ============================================================================
// WEBHOOK HANDLERS (Enhanced)
// ============================================================================

// 11. Webhook endpoint for Stripe events (Your existing + enhanced)
app.post("/webhook", express.raw({ type: "application/json" }), (req, res) => {
  const sig = req.headers["stripe-signature"];
  const endpointSecret =
    process.env.WEBHOOK_SECRET || "whsec_your_webhook_secret_here";

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.log(`Webhook signature verification failed.`, err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    // Payment Intent Events
    case "payment_intent.succeeded":
      const paymentIntent = event.data.object;
      console.log("Payment succeeded:", paymentIntent.id);
      handlePaymentSuccess(paymentIntent);
      break;

    case "payment_intent.payment_failed":
      const failedPayment = event.data.object;
      console.log("Payment failed:", failedPayment.id);
      handlePaymentFailure(failedPayment);
      break;

    // Setup Intent Events
    case "setup_intent.succeeded":
      const setupIntent = event.data.object;
      console.log("Setup Intent succeeded:", setupIntent.id);
      console.log("Payment method saved:", setupIntent.payment_method);
      handleSetupIntentSuccess(setupIntent);
      break;

    case "setup_intent.setup_failed":
      const failedSetup = event.data.object;
      console.log("Setup Intent failed:", failedSetup.id);
      handleSetupIntentFailure(failedSetup);
      break;

    // Subscription Events
    case "invoice.payment_succeeded":
      const invoice = event.data.object;
      console.log("Invoice payment succeeded:", invoice.id);
      handleInvoicePaymentSuccess(invoice);
      break;

    case "invoice.payment_failed":
      const failedInvoice = event.data.object;
      console.log("Invoice payment failed:", failedInvoice.id);
      handleInvoicePaymentFailure(failedInvoice);
      break;

    case "customer.subscription.deleted":
      const deletedSubscription = event.data.object;
      console.log("Subscription cancelled:", deletedSubscription.id);
      handleSubscriptionCancellation(deletedSubscription);
      break;

    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({ received: true });
});

// ============================================================================
// HELPER FUNCTIONS (Your existing + new ones)
// ============================================================================

// Your existing helper functions
async function handlePaymentSuccess(paymentIntent) {
  console.log("Processing successful payment:", {
    id: paymentIntent.id,
    amount: paymentIntent.amount,
    customer_email: paymentIntent.metadata.customer_email,
    order_id: paymentIntent.metadata.order_id,
  });

  // Example: Update database, send email, etc.
  // await updateOrderStatus(paymentIntent.metadata.order_id, 'paid');
  // await sendConfirmationEmail(paymentIntent.metadata.customer_email);
}

async function handlePaymentFailure(paymentIntent) {
  console.log("Processing failed payment:", {
    id: paymentIntent.id,
    last_payment_error: paymentIntent.last_payment_error,
  });

  // Example: Send failure notification, update database, etc.
}

// New helper functions for Setup Intents
async function handleSetupIntentSuccess(setupIntent) {
  console.log("Processing successful setup intent:", {
    id: setupIntent.id,
    customer: setupIntent.customer,
    payment_method: setupIntent.payment_method,
    usage: setupIntent.usage,
  });

  // Add your business logic here
  // Example: Update database, send confirmation, etc.
}

async function handleSetupIntentFailure(setupIntent) {
  console.log("Processing failed setup intent:", {
    id: setupIntent.id,
    last_setup_error: setupIntent.last_setup_error,
  });

  // Add your failure handling logic here
}

// Subscription helper functions
async function handleInvoicePaymentSuccess(invoice) {
  console.log("Processing successful invoice payment:", {
    id: invoice.id,
    subscription: invoice.subscription,
    amount_paid: invoice.amount_paid,
  });
}

async function handleInvoicePaymentFailure(invoice) {
  console.log("Processing failed invoice payment:", {
    id: invoice.id,
    subscription: invoice.subscription,
    amount_due: invoice.amount_due,
  });
}

async function handleSubscriptionCancellation(subscription) {
  console.log("Processing subscription cancellation:", {
    id: subscription.id,
    customer: subscription.customer,
    ended_at: subscription.ended_at,
  });
}

// ============================================================================
// UTILITY ENDPOINTS
// ============================================================================

// Health check endpoint (Your existing)
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// 12. Get Stripe Configuration
app.get("/config", (req, res) => {
  res.json({
    publishable_key: process.env.PUBLISHABLE_KEY,
    success_url: process.env.SUCCESS_URL || "http://localhost:3000/success",
    cancel_url: process.env.CANCEL_URL || "http://localhost:3000/cancel",
  });
});

// 13. Create Product and Price (For subscriptions)
app.post("/create-product", async (req, res) => {
  try {
    const {
      name,
      description,
      price,
      currency = "usd",
      interval = "month",
    } = req.body;

    if (!name || !price) {
      return res.status(400).json({
        error: "Name and price are required",
      });
    }

    // Create product
    const product = await stripe.products.create({
      name: name,
      description: description,
    });

    // Create price
    const priceObject = await stripe.prices.create({
      unit_amount: Math.round(price * 100),
      currency: currency,
      recurring: { interval: interval },
      product: product.id,
    });

    res.json({
      product_id: product.id,
      price_id: priceObject.id,
      name: product.name,
      price: price,
      interval: interval,
    });
  } catch (error) {
    console.error("Error creating product:", error);
    res.status(500).json({
      error: "Failed to create product",
      message: error.message,
    });
  }
});

// Token and payments
app.post("/charge-token", async (req, res) => {
  const { tokenId, amount, currency, description } = req.body;

  try {
    const charge = await stripe.charges.create({
      amount, // e.g., 5000 = ₹50.00
      currency, // e.g., 'inr'
      source: tokenId,
      description: description || "Custom token payment",
    });

    res.json({ success: true, charge });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/attach-token-to-customer', async (req, res) => {
  const { customerId, tokenId } = req.body;

  try {
    const card = await stripe.customers.createSource(customerId, {
      source: tokenId,
    });

    res.json({
      success: true,
      card,
      message: 'Card added to customer successfully',
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/update-cvc-token", async (req, res) => {
  try {
    const { customerId, cardId, token } = req.body;
    const card = await stripe.customers.updateSource(customerId, cardId, {
      cvc_update_token: token,
    });
    res.json({
      success: true,
      card,
      message: "Card updated to customer successfully",
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
  
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Webhook endpoint: http://localhost:${PORT}/webhook`);
  console.log("=".repeat(50));
  console.log("Available Endpoints:");
  console.log("Payment Intents:");
  console.log("  POST /create-payment-intent");
  console.log("  POST /confirm-payment");
  console.log("Setup Intents:");
  console.log("  POST /create-setup-intent");
  console.log("  POST /retrieve-setup-intent");
  console.log("  POST /create-payment-with-saved-method");
  console.log("Customer Management:");
  console.log("  POST /create-customer");
  console.log("  POST /get-payment-methods");
  console.log("  POST /list-payment-methods");
  console.log("  POST /delete-payment-method");
  console.log("Subscriptions:");
  console.log("  POST /create-subscription");
  console.log("  POST /create-product");
  console.log("Utilities:");
  console.log("  GET  /health");
  console.log("  GET  /config");
  console.log("  POST /webhook");
  console.log("=".repeat(50));
});

module.exports = app;
