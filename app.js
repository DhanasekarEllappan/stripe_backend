const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv')
dotenv.config()
const stripe = require('stripe')(process.env.SECRECT_KEY); // Replace with your secret key

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// 1. Create Payment Intent
app.post('/create-payment-intent', async (req, res) => {
  try {
    const { amount, currency = 'usd', customer_email } = req.body;

    // Validate amount
    if (!amount || amount <= 0) {
      return res.status(400).json({ 
        error: 'Amount is required and must be greater than 0' 
      });
    }

    // Create Payment Intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: currency,
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        customer_email: customer_email || 'unknown',
        order_id: `order_${Date.now()}`, // You can add your order ID here
      },
    });

    res.json({
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
    });

  } catch (error) {
    console.error('Error creating payment intent:', error);
    res.status(500).json({ 
      error: 'Failed to create payment intent',
      message: error.message 
    });
  }
});

// 2. Confirm Payment Status (Optional - for webhook or manual check)
app.post('/confirm-payment', async (req, res) => {
  try {
    const { payment_intent_id } = req.body;

    if (!payment_intent_id) {
      return res.status(400).json({ 
        error: 'Payment Intent ID is required' 
      });
    }

    // Retrieve payment intent to check status
    const paymentIntent = await stripe.paymentIntents.retrieve(payment_intent_id);

    res.json({
      status: paymentIntent.status,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      payment_method: paymentIntent.payment_method,
    });

  } catch (error) {
    console.error('Error confirming payment:', error);
    res.status(500).json({ 
      error: 'Failed to confirm payment',
      message: error.message 
    });
  }
});

// 3. Webhook endpoint for Stripe events
app.post('/webhook', express.raw({type: 'application/json'}), (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = 'whsec_your_webhook_secret_here'; // Replace with your webhook secret

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.log(`Webhook signature verification failed.`, err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      console.log('Payment succeeded:', paymentIntent.id);
      
      // Here you can:
      // - Update your database
      // - Send confirmation email
      // - Fulfill the order
      // - Update inventory
      handlePaymentSuccess(paymentIntent);
      break;

    case 'payment_intent.payment_failed':
      const failedPayment = event.data.object;
      console.log('Payment failed:', failedPayment.id);
      handlePaymentFailure(failedPayment);
      break;

    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({received: true});
});

// 4. Get payment methods for a customer (if you want to save cards)
app.post('/get-payment-methods', async (req, res) => {
  try {
    const { customer_id } = req.body;

    if (!customer_id) {
      return res.status(400).json({ 
        error: 'Customer ID is required' 
      });
    }

    const paymentMethods = await stripe.paymentMethods.list({
      customer: customer_id,
      type: 'card',
    });

    res.json({
      payment_methods: paymentMethods.data,
    });

  } catch (error) {
    console.error('Error retrieving payment methods:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve payment methods',
      message: error.message 
    });
  }
});

// 5. Create customer (if you want to save customer data)
app.post('/create-customer', async (req, res) => {
  try {
    const { email, name, phone } = req.body;

    if (!email) {
      return res.status(400).json({ 
        error: 'Email is required' 
      });
    }

    const customer = await stripe.customers.create({
      email: email,
      name: name,
      phone: phone,
    });

    res.json({
      customer_id: customer.id,
      email: customer.email,
    });

  } catch (error) {
    console.error('Error creating customer:', error);
    res.status(500).json({ 
      error: 'Failed to create customer',
      message: error.message 
    });
  }
});

// Helper functions
async function handlePaymentSuccess(paymentIntent) {
  // Add your business logic here
  console.log('Processing successful payment:', {
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
  // Add your failure handling logic here
  console.log('Processing failed payment:', {
    id: paymentIntent.id,
    last_payment_error: paymentIntent.last_payment_error,
  });

  // Example: Send failure notification, update database, etc.
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Webhook endpoint: http://localhost:${PORT}/webhook`);
});

module.exports = app;