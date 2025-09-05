const Stripe = require('stripe');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const logger = require('../core/logger').createServiceLogger('SUBSCRIPTION');

class SubscriptionService {
  constructor() {
    this.stripe = null;
    this.dataDir = path.join(os.homedir(), '.JARVIX');
    this.subscriptionFile = path.join(this.dataDir, 'subscription.json');
    this.initialized = false;
    this.userSubscription = null;
    
    this.initializeService();
  }

  async initializeService() {
    try {
      // Initialize Stripe with secret key from environment
      const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
      if (stripeSecretKey) {
        this.stripe = new Stripe(stripeSecretKey);
        logger.info('Stripe service initialized successfully');
      } else {
        logger.warn('Stripe secret key not found in environment variables');
      }

      // Ensure data directory exists
      await fs.mkdir(this.dataDir, { recursive: true });
      
      // Load existing subscription data
      await this.loadSubscriptionData();
      
      this.initialized = true;
      logger.info('Subscription service initialized', {
        hasStripeKey: !!stripeSecretKey,
        subscriptionStatus: this.userSubscription?.status || 'none'
      });
      
    } catch (error) {
      logger.error('Failed to initialize subscription service', { error: error.message });
    }
  }

  async loadSubscriptionData() {
    try {
      const data = await fs.readFile(this.subscriptionFile, 'utf8');
      this.userSubscription = JSON.parse(data);
      
      // Validate subscription is still active
      if (this.userSubscription && this.stripe) {
        await this.validateSubscription();
      }
      
    } catch (error) {
      // File doesn't exist or is invalid - user has no subscription
      this.userSubscription = null;
      logger.debug('No existing subscription data found');
    }
  }

  async saveSubscriptionData() {
    try {
      await fs.writeFile(
        this.subscriptionFile, 
        JSON.stringify(this.userSubscription, null, 2),
        'utf8'
      );
      logger.debug('Subscription data saved successfully');
    } catch (error) {
      logger.error('Failed to save subscription data', { error: error.message });
    }
  }

  async validateSubscription() {
    if (!this.userSubscription?.subscriptionId || !this.stripe) {
      // Try to find active subscriptions if we don't have one stored locally
      return await this.searchForActiveSubscription();
    }

    try {
      const subscription = await this.stripe.subscriptions.retrieve(
        this.userSubscription.subscriptionId
      );
      
      const isActive = ['active', 'trialing'].includes(subscription.status);
      
      if (!isActive) {
        // Subscription is no longer active
        this.userSubscription = null;
        await this.saveSubscriptionData();
        logger.info('Subscription is no longer active, clearing local data');
        return false;
      }
      
      // Update local subscription data
      this.userSubscription = {
        ...this.userSubscription,
        status: subscription.status,
        currentPeriodEnd: subscription.current_period_end,
        lastValidated: Date.now()
      };
      
      await this.saveSubscriptionData();
      return true;
      
    } catch (error) {
      logger.error('Failed to validate subscription', { error: error.message });
      return false;
    }
  }

  async createCheckoutSession(priceId, successUrl, cancelUrl) {
    if (!this.stripe) {
      throw new Error('Stripe not initialized. Please check STRIPE_SECRET_KEY environment variable.');
    }

    try {
      const session = await this.stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [{
          price: priceId,
          quantity: 1
        }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        client_reference_id: 'jarvix_user', // You might want to use actual user ID
        metadata: {
          product: 'jarvix_premium',
          feature: 'image_processing'
        }
      });

      logger.info('Checkout session created', {
        sessionId: session.id,
        priceId
      });

      return {
        sessionId: session.id,
        url: session.url
      };
      
    } catch (error) {
      logger.error('Failed to create checkout session', { error: error.message });
      throw error;
    }
  }

  async handleWebhook(rawBody, signature) {
    if (!this.stripe) {
      throw new Error('Stripe not initialized');
    }

    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!endpointSecret) {
      throw new Error('Stripe webhook secret not configured');
    }

    try {
      const event = this.stripe.webhooks.constructEvent(rawBody, signature, endpointSecret);

      switch (event.type) {
        case 'checkout.session.completed':
          await this.handleCheckoutCompleted(event.data.object);
          break;
        case 'invoice.payment_succeeded':
          await this.handlePaymentSucceeded(event.data.object);
          break;
        case 'customer.subscription.deleted':
        case 'customer.subscription.updated':
          await this.handleSubscriptionChanged(event.data.object);
          break;
        default:
          logger.debug('Unhandled webhook event', { type: event.type });
      }

      return { received: true };
      
    } catch (error) {
      logger.error('Webhook handling failed', { error: error.message });
      throw error;
    }
  }

  async handleCheckoutCompleted(session) {
    if (session.client_reference_id === 'jarvix_user') {
      try {
        const subscription = await this.stripe.subscriptions.retrieve(session.subscription);
        
        this.userSubscription = {
          subscriptionId: subscription.id,
          customerId: subscription.customer,
          status: subscription.status,
          currentPeriodEnd: subscription.current_period_end,
          priceId: subscription.items.data[0]?.price?.id,
          createdAt: Date.now(),
          lastValidated: Date.now()
        };
        
        await this.saveSubscriptionData();
        
        logger.info('Premium subscription activated', {
          subscriptionId: subscription.id,
          status: subscription.status
        });
        
      } catch (error) {
        logger.error('Failed to process checkout completion', { error: error.message });
      }
    }
  }

  async handlePaymentSucceeded(invoice) {
    // Update subscription status on successful payment
    if (this.userSubscription && invoice.subscription === this.userSubscription.subscriptionId) {
      await this.validateSubscription();
      logger.info('Subscription payment succeeded', {
        subscriptionId: invoice.subscription
      });
    }
  }

  async handleSubscriptionChanged(subscription) {
    if (this.userSubscription && subscription.id === this.userSubscription.subscriptionId) {
      if (subscription.status === 'canceled') {
        this.userSubscription = null;
        await this.saveSubscriptionData();
        logger.info('Subscription canceled and removed');
      } else {
        await this.validateSubscription();
        logger.info('Subscription status updated', { status: subscription.status });
      }
    }
  }

  async isPremiumUser() {
    if (!this.userSubscription) {
      return false;
    }

    // Check if subscription needs revalidation (once per hour)
    const lastValidated = this.userSubscription.lastValidated || 0;
    const oneHour = 60 * 60 * 1000;
    
    if (Date.now() - lastValidated > oneHour) {
      return await this.validateSubscription();
    }

    return ['active', 'trialing'].includes(this.userSubscription.status);
  }

  async getSubscriptionInfo() {
    if (!this.userSubscription) {
      return {
        isPremium: false,
        status: 'none',
        message: 'No active subscription'
      };
    }

    return {
      isPremium: await this.isPremiumUser(),
      status: this.userSubscription.status,
      subscriptionId: this.userSubscription.subscriptionId,
      currentPeriodEnd: this.userSubscription.currentPeriodEnd,
      message: this.getStatusMessage()
    };
  }

  getStatusMessage() {
    if (!this.userSubscription) {
      return 'Upgrade to Premium to unlock image processing capabilities';
    }

    switch (this.userSubscription.status) {
      case 'active':
        return 'Premium features unlocked';
      case 'trialing':
        return 'Premium trial active';
      case 'past_due':
        return 'Payment required to continue premium access';
      case 'canceled':
        return 'Subscription canceled';
      case 'unpaid':
        return 'Payment failed - please update payment method';
      default:
        return 'Premium status unknown';
    }
  }

  async cancelSubscription() {
    if (!this.userSubscription?.subscriptionId || !this.stripe) {
      throw new Error('No active subscription to cancel');
    }

    try {
      const subscription = await this.stripe.subscriptions.update(
        this.userSubscription.subscriptionId,
        { cancel_at_period_end: true }
      );

      this.userSubscription.status = subscription.status;
      this.userSubscription.cancelAtPeriodEnd = subscription.cancel_at_period_end;
      await this.saveSubscriptionData();

      logger.info('Subscription marked for cancellation', {
        subscriptionId: subscription.id,
        cancelAtPeriodEnd: subscription.cancel_at_period_end
      });

      return {
        success: true,
        message: 'Subscription will be canceled at the end of the current billing period'
      };
      
    } catch (error) {
      logger.error('Failed to cancel subscription', { error: error.message });
      throw error;
    }
  }

  // Search for active subscriptions (fallback when no local subscription data)
  async searchForActiveSubscription() {
    if (!this.stripe) {
      logger.warn('Stripe not initialized, cannot search for subscriptions');
      return false;
    }

    try {
      logger.info('Searching for active subscriptions...', {
        priceId: process.env.STRIPE_MONTHLY_PRICE_ID
      });

      // Search for active subscriptions - try multiple approaches
      let subscriptions = await this.stripe.subscriptions.list({
        status: 'active',
        limit: 100 // Increase limit to catch more subscriptions
      });

      logger.info('Found subscriptions', {
        total: subscriptions.data.length,
        subscriptions: subscriptions.data.map(sub => ({
          id: sub.id,
          status: sub.status,
          priceId: sub.items.data[0]?.price?.id
        }))
      });

      // Filter for our price ID
      const matchingSubscriptions = subscriptions.data.filter(sub => 
        sub.items.data.some(item => item.price.id === process.env.STRIPE_MONTHLY_PRICE_ID)
      );

      if (matchingSubscriptions.length > 0) {
        // Use the first matching subscription found
        const subscription = matchingSubscriptions[0];
        
        this.userSubscription = {
          subscriptionId: subscription.id,
          customerId: subscription.customer,
          status: subscription.status,
          currentPeriodEnd: subscription.current_period_end,
          priceId: subscription.items.data[0]?.price?.id,
          createdAt: Date.now(),
          lastValidated: Date.now()
        };
        
        await this.saveSubscriptionData();
        
        logger.info('Found and saved active subscription', {
          subscriptionId: subscription.id,
          status: subscription.status,
          priceId: subscription.items.data[0]?.price?.id
        });
        
        return true;
      }
      
      logger.warn('No matching active subscriptions found', {
        searchedPriceId: process.env.STRIPE_MONTHLY_PRICE_ID,
        totalFound: subscriptions.data.length
      });
      
      return false;
      
    } catch (error) {
      logger.error('Failed to search for active subscriptions', { error: error.message });
      return false;
    }
  }

  // Usage tracking for premium features
  async trackImageProcessing() {
    if (!this.userSubscription) {
      return;
    }

    try {
      // Track usage for potential usage-based billing or analytics
      const usageFile = path.join(this.dataDir, 'usage.json');
      let usage = {};
      
      try {
        const data = await fs.readFile(usageFile, 'utf8');
        usage = JSON.parse(data);
      } catch {
        // File doesn't exist yet
      }
      
      const today = new Date().toISOString().split('T')[0];
      usage[today] = (usage[today] || 0) + 1;
      
      // Keep only last 30 days of usage data
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      Object.keys(usage).forEach(date => {
        if (new Date(date) < thirtyDaysAgo) {
          delete usage[date];
        }
      });
      
      await fs.writeFile(usageFile, JSON.stringify(usage, null, 2));
      
    } catch (error) {
      logger.error('Failed to track image processing usage', { error: error.message });
    }
  }
}

// Export singleton instance
module.exports = new SubscriptionService();