const { createClient } = require('@supabase/supabase-js');
const logger = require('../core/logger').createServiceLogger('SUPABASE');

class SupabaseService {
  constructor() {
    this.supabase = null;
    this.currentUser = null;
    this.initialized = false;
    this.cachedSession = null;
    
    this.initializeSupabase();
  }

  async initializeSupabase() {
    try {
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseAnonKey) {
        logger.warn('Supabase credentials not found in environment variables');
        return;
      }

      this.supabase = createClient(supabaseUrl, supabaseAnonKey);
      
      // Load current user session if exists
      const { data: { session } } = await this.supabase.auth.getSession();
      if (session) {
        this.currentUser = session.user;
        this.cachedSession = session;
        logger.info('User session restored', { userId: this.currentUser.id });
      }

      this.initialized = true;
      logger.info('Supabase service initialized successfully');
      
    } catch (error) {
      logger.error('Failed to initialize Supabase service', { error: error.message });
    }
  }

  // User Authentication
  async signInWithGoogle() {
    if (!this.supabase) {
      throw new Error('Supabase not initialized');
    }

    try {
      // Generate the OAuth URL
      const { data, error } = await this.supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          skipBrowserRedirect: true
        }
      });

      if (error) {
        throw error;
      }

      if (data.url) {
        // Ensure the URL is absolute
        const absoluteUrl = data.url.startsWith('http') ? data.url : `${process.env.SUPABASE_URL}/${data.url}`;
        logger.info('Google OAuth URL generated', { url: absoluteUrl });
        return { success: true, url: absoluteUrl };
      } else {
        throw new Error('No OAuth URL generated');
      }
      
    } catch (error) {
      logger.error('Failed to generate Google OAuth URL', { error: error.message });
      throw error;
    }
  }

  // Handle OAuth session from callback
  async handleOAuthCallback(accessToken, refreshToken) {
    if (!this.supabase) {
      throw new Error('Supabase not initialized');
    }

    try {
      const { data, error } = await this.supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      });

      if (error) {
        throw error;
      }

      this.currentUser = data.user;
      this.cachedSession = data.session;
      logger.info('OAuth session established', { userId: data.user.id });

      return { success: true, user: data.user, session: data.session };
      
    } catch (error) {
      logger.error('Failed to handle OAuth callback', { error: error.message });
      throw error;
    }
  }

  // Simplified Google Sign-In for Electron - just for demo/fallback
  async signInWithGoogleSimple() {
    // This is a fallback that creates a mock Google user for testing
    // In production, you'd want proper OAuth implementation
    try {
      const mockUser = {
        id: `google-${Date.now()}`,
        email: 'demo@google.com',
        user_metadata: {
          full_name: 'Demo User',
          avatar_url: null,
          provider_id: 'google'
        }
      };

      this.currentUser = mockUser;
      logger.info('Mock Google sign-in completed', { userId: mockUser.id });

      return { success: true, user: mockUser };
      
    } catch (error) {
      logger.error('Failed to sign in with Google (simple)', { error: error.message });
      throw error;
    }
  }

  // Keep these for backward compatibility, but we'll mainly use Google
  async signUp(email, password) {
    if (!this.supabase) {
      throw new Error('Supabase not initialized');
    }

    try {
      const { data, error } = await this.supabase.auth.signUp({
        email,
        password
      });

      if (error) {
        throw error;
      }

      if (data.user) {
        this.currentUser = data.user;
        logger.info('User signed up successfully', { userId: data.user.id });
      }

      return { success: true, user: data.user, session: data.session };
      
    } catch (error) {
      logger.error('Failed to sign up user', { error: error.message, email });
      throw error;
    }
  }

  async signIn(email, password) {
    if (!this.supabase) {
      throw new Error('Supabase not initialized');
    }

    try {
      const { data, error } = await this.supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        throw error;
      }

      this.currentUser = data.user;
      logger.info('User signed in successfully', { userId: data.user.id });

      return { success: true, user: data.user, session: data.session };
      
    } catch (error) {
      logger.error('Failed to sign in user', { error: error.message, email });
      throw error;
    }
  }

  async signOut() {
    if (!this.supabase) {
      throw new Error('Supabase not initialized');
    }

    try {
      const { error } = await this.supabase.auth.signOut();
      
      if (error) {
        throw error;
      }

      const userId = this.currentUser?.id;
      this.currentUser = null;
      
      logger.info('User signed out successfully', { userId });
      return { success: true };
      
    } catch (error) {
      logger.error('Failed to sign out user', { error: error.message });
      throw error;
    }
  }

  getCurrentUser() {
    return this.currentUser;
  }

  isAuthenticated() {
    return !!this.currentUser;
  }

  // Subscription Management
  async saveUserSubscription(stripeCustomerId, stripeSubscriptionId, status, priceId) {
    if (!this.supabase || !this.currentUser) {
      throw new Error('User not authenticated');
    }

    try {
      const { data, error } = await this.supabase
        .from('user_subscriptions')
        .upsert({
          user_id: this.currentUser.id,
          stripe_customer_id: stripeCustomerId,
          stripe_subscription_id: stripeSubscriptionId,
          status: status,
          price_id: priceId,
          updated_at: new Date().toISOString()
        })
        .select();

      if (error) {
        throw error;
      }

      logger.info('User subscription saved', {
        userId: this.currentUser.id,
        subscriptionId: stripeSubscriptionId,
        status
      });

      return data[0];
      
    } catch (error) {
      logger.error('Failed to save user subscription', { error: error.message });
      throw error;
    }
  }

  async getUserSubscription() {
    if (!this.supabase || !this.currentUser) {
      return null;
    }

    try {
      const { data, error } = await this.supabase
        .from('user_subscriptions')
        .select('*')
        .eq('user_id', this.currentUser.id)
        .eq('status', 'active')
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
        throw error;
      }

      return data;
      
    } catch (error) {
      logger.error('Failed to get user subscription', { error: error.message });
      return null;
    }
  }

  async updateSubscriptionStatus(stripeSubscriptionId, status) {
    if (!this.supabase) {
      throw new Error('Supabase not initialized');
    }

    try {
      const { data, error } = await this.supabase
        .from('user_subscriptions')
        .update({
          status: status,
          updated_at: new Date().toISOString()
        })
        .eq('stripe_subscription_id', stripeSubscriptionId)
        .select();

      if (error) {
        throw error;
      }

      logger.info('Subscription status updated', {
        subscriptionId: stripeSubscriptionId,
        status
      });

      return data[0];
      
    } catch (error) {
      logger.error('Failed to update subscription status', { error: error.message });
      throw error;
    }
  }

  // Usage tracking
  async trackImageProcessing() {
    if (!this.supabase || !this.currentUser) {
      return;
    }

    try {
      const { error } = await this.supabase
        .from('usage_tracking')
        .insert({
          user_id: this.currentUser.id,
          feature: 'image_processing',
          timestamp: new Date().toISOString()
        });

      if (error) {
        throw error;
      }

      logger.debug('Image processing usage tracked', { userId: this.currentUser.id });
      
    } catch (error) {
      logger.error('Failed to track image processing usage', { error: error.message });
    }
  }

  // Check if user has premium access
  async hasPremiumAccess() {
    const subscription = await this.getUserSubscription();
    return subscription && subscription.status === 'active';
  }

  // New auth contract methods for renderer integration
  
  /**
   * Get cached session for renderer hydration
   */
  getCachedSession() {
    if (!this.cachedSession) {
      return null;
    }

    // Return serialized session for renderer
    return {
      access_token: this.cachedSession.access_token,
      refresh_token: this.cachedSession.refresh_token,
      expires_in: this.cachedSession.expires_in,
      token_type: this.cachedSession.token_type || 'bearer',
      user: this.cachedSession.user,
      expires_at: this.cachedSession.expires_at,
    };
  }

  /**
   * Set session from external source (like OAuth callback)
   */
  async setSession(session) {
    if (!this.supabase) {
      throw new Error('Supabase not initialized');
    }

    try {
      const { data, error } = await this.supabase.auth.setSession(session);
      
      if (error) {
        throw error;
      }

      this.currentUser = data.user;
      this.cachedSession = data.session;
      
      logger.info('Session set successfully', { userId: data.user?.id });
      return { success: true, user: data.user, session: data.session };
      
    } catch (error) {
      logger.error('Failed to set session', { error: error.message });
      throw error;
    }
  }

  /**
   * Enhanced Google OAuth with better desktop integration
   */
  async signInWithGoogleOAuth() {
    if (!this.supabase) {
      throw new Error('Supabase not initialized');
    }

    try {
      // For desktop apps, we need to handle OAuth differently
      // This will be implemented with a proper OAuth flow in the main process
      const { data, error } = await this.supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          skipBrowserRedirect: true,
          redirectTo: 'jarvix://auth/callback',
        }
      });

      if (error) {
        throw error;
      }

      return { success: true, url: data.url };
      
    } catch (error) {
      logger.error('Failed to initiate Google OAuth', { error: error.message });
      throw error;
    }
  }

  /**
   * Register or update device record for current user
   */
  async ensureDeviceRegistered() {
    if (!this.supabase || !this.currentUser) {
      logger.warn('Cannot register device: not authenticated');
      return;
    }

    try {
      const platform = process.platform;
      const appVersion = process.env.npm_package_version || '1.0.0';
      
      // Upsert device record
      const { data, error } = await this.supabase
        .from('devices')
        .upsert({
          user_id: this.currentUser.id,
          platform,
          app_version: appVersion,
          last_seen_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,platform',
          ignoreDuplicates: false,
        })
        .select();

      if (error) {
        throw error;
      }

      logger.info('Device registered successfully', {
        userId: this.currentUser.id,
        platform,
        appVersion,
      });

      return data[0];
      
    } catch (error) {
      logger.error('Failed to register device', { error: error.message });
      throw error;
    }
  }

  /**
   * Audit authentication events
   */
  async auditAuthEvent(event) {
    if (!this.supabase || !this.currentUser) {
      logger.warn('Cannot audit event: not authenticated', { event });
      return;
    }

    try {
      const { error } = await this.supabase
        .from('sessions_audit')
        .insert({
          user_id: this.currentUser.id,
          event,
          user_agent: `Jarvix/${process.env.npm_package_version || '1.0.0'} (${process.platform})`,
          created_at: new Date().toISOString(),
        });

      if (error) {
        throw error;
      }

      logger.debug('Auth event audited', { userId: this.currentUser.id, event });
      
    } catch (error) {
      logger.error('Failed to audit auth event', { error: error.message, event });
    }
  }

  /**
   * Clear all cached auth state
   */
  clearSession() {
    this.currentUser = null;
    this.cachedSession = null;
    logger.info('Session cleared');
  }
}

// Export singleton instance
module.exports = new SupabaseService();