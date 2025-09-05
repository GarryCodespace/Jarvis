const { shell } = require('electron');
const logger = require('../core/logger').createServiceLogger('PAYMENT');
const subscriptionService = require('./subscription.service');
const supabaseService = require('./supabase.service');

class PaymentService {
  constructor() {
    this.priceIds = {
      monthly: process.env.STRIPE_MONTHLY_PRICE_ID || 'price_monthly_default'
    };
  }

  async initiatePremiumUpgrade(plan = 'monthly') {
    try {
      const priceId = this.priceIds[plan];
      if (!priceId) {
        throw new Error(`Invalid plan: ${plan}`);
      }

      // Create checkout session
      const session = await subscriptionService.createCheckoutSession(
        priceId,
        'https://success.jarvix.app?session_id={CHECKOUT_SESSION_ID}', // Replace with your success URL
        'https://cancel.jarvix.app' // Replace with your cancel URL
      );

      logger.info('Premium upgrade initiated', {
        plan,
        sessionId: session.sessionId
      });

      // Open Stripe Checkout in user's default browser
      await shell.openExternal(session.url);

      return {
        success: true,
        sessionId: session.sessionId,
        message: `Opening ${plan} subscription checkout...`
      };

    } catch (error) {
      logger.error('Failed to initiate premium upgrade', {
        error: error.message,
        plan
      });

      return {
        success: false,
        error: error.message,
        message: 'Failed to open payment checkout. Please try again.'
      };
    }
  }

  async checkPremiumStatus() {
    try {
      // Check if user is authenticated
      if (!supabaseService.isAuthenticated()) {
        return {
          isPremium: false,
          status: 'not_authenticated',
          message: 'Please sign in to check your premium status'
        };
      }

      // Check premium access via Supabase
      const hasPremium = await supabaseService.hasPremiumAccess();
      
      if (hasPremium) {
        return {
          isPremium: true,
          status: 'active',
          message: 'Premium access is active!'
        };
      }

      // Fallback to Stripe direct check
      const subscriptionInfo = await subscriptionService.getSubscriptionInfo();
      
      logger.debug('Premium status checked', subscriptionInfo);
      
      return subscriptionInfo;
      
    } catch (error) {
      logger.error('Failed to check premium status', { error: error.message });
      
      return {
        isPremium: false,
        status: 'error',
        message: 'Unable to verify premium status'
      };
    }
  }

  async cancelSubscription() {
    try {
      const result = await subscriptionService.cancelSubscription();
      
      logger.info('Subscription cancellation requested');
      
      return result;
      
    } catch (error) {
      logger.error('Failed to cancel subscription', { error: error.message });
      
      return {
        success: false,
        message: 'Failed to cancel subscription. Please contact support.'
      };
    }
  }

  async getUpgradePrompt() {
    const status = await this.checkPremiumStatus();
    
    if (status.isPremium) {
      return null; // User is already premium
    }

    return {
      title: 'Premium Feature',
      message: 'Image processing is a premium feature. Upgrade to unlock advanced AI-powered image analysis.',
      features: [
        '🖼️ Advanced image analysis and interpretation',
        '📋 OCR text extraction from images',
        '🔍 Visual content understanding',
        '📱 Screenshot analysis and automation',
        '💾 Unlimited image processing'
      ],
      plans: {
        monthly: {
          name: 'Monthly Plan',
          price: '$9.99/month',
          priceId: this.priceIds.monthly
        }
      }
    };
  }

  async trackFeatureUsage(feature) {
    try {
      if (feature === 'image_processing') {
        await subscriptionService.trackImageProcessing();
      }
      
      logger.debug('Feature usage tracked', { feature });
      
    } catch (error) {
      logger.error('Failed to track feature usage', {
        error: error.message,
        feature
      });
    }
  }

  // Helper method to validate premium access for a specific feature
  async validatePremiumAccess(feature) {
    // // Check if user is authenticated first
    // if (!supabaseService.isAuthenticated()) {
    //   return {
    //     allowed: false,
    //     message: 'Please sign in to access premium features',
    //     requiresAuth: true
    //   };
    // }

    // const status = await this.checkPremiumStatus();
    
    // if (status.isPremium) {
    //   await this.trackFeatureUsage(feature);
    //   // Track usage in Supabase too
    //   if (feature === 'image_processing') {
    //     await supabaseService.trackImageProcessing();
    //   }
    //   return { allowed: true, message: null };
    // }

    // const upgradePrompt = await this.getUpgradePrompt();
    
    // return {
    //   allowed: false,
    //   message: upgradePrompt.message,
    //   upgradePrompt
    // };

    // Always allow access (payment/auth disabled)
    logger.info('Premium access granted (payment disabled)', { feature });
    return { allowed: true, message: null };
  }

  // Method to handle successful payment callback
  async handlePaymentSuccess(sessionId) {
    try {
      logger.info('Payment success callback received', { sessionId });
      
      // Refresh subscription status
      await subscriptionService.validateSubscription();
      
      const status = await this.checkPremiumStatus();
      
      if (status.isPremium) {
        return {
          success: true,
          message: 'Premium subscription activated successfully! Image processing is now unlocked.'
        };
      } else {
        return {
          success: false,
          message: 'Payment completed but premium access not yet active. Please try again in a few minutes.'
        };
      }
      
    } catch (error) {
      logger.error('Failed to handle payment success', {
        error: error.message,
        sessionId
      });
      
      return {
        success: false,
        message: 'Payment completed but there was an error activating premium access. Please contact support.'
      };
    }
  }

  // Method to provide user with subscription management options
  async getSubscriptionManagement() {
    const status = await this.checkPremiumStatus();
    
    if (!status.isPremium) {
      return {
        hasSubscription: false,
        message: 'No active subscription found.',
        upgradePrompt: await this.getUpgradePrompt()
      };
    }

    return {
      hasSubscription: true,
      status: status.status,
      currentPeriodEnd: status.currentPeriodEnd,
      message: status.message,
      actions: {
        cancel: 'Cancel subscription',
        // You could add more actions like update payment method
      }
    };
  }
}

// Export singleton instance
module.exports = new PaymentService();