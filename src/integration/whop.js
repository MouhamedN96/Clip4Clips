/**
 * Whop API Integration Module
 * Handles payment processing, subscriptions, webhooks, and affiliate tracking
 */

const crypto = require('crypto');

class WhopIntegration {
    constructor(config) {
        this.apiKey = config.apiKey;
        this.merchantId = config.merchantId;
        this.webhookSecret = config.webhookSecret;
        this.apiUrl = config.apiUrl || 'https://api.whop.com';
        this.defaultCommission = config.defaultCommission || 30;
        this.referralCommission = config.referralCommission || 25;
    }

    /**
     * Verify webhook signature
     */
    verifyWebhookSignature(payload, signature) {
        const expectedSignature = crypto
            .createHmac('sha256', this.webhookSecret)
            .update(payload)
            .digest('hex');

        return crypto.timingSafeEqual(
            Buffer.from(signature),
            Buffer.from(expectedSignature)
        );
    }

    /**
     * Get subscription details
     */
    async getSubscription(subscriptionId) {
        const response = await this.request(
            `/api/v1/subscriptions/${subscriptionId}`
        );
        return response;
    }

    /**
     * Get customer details
     */
    async getCustomer(customerId) {
        const response = await this.request(
            `/api/v1/customers/${customerId}`
        );
        return response;
    }

    /**
     * List all active subscriptions
     */
    async listSubscriptions(options = {}) {
        const params = new URLSearchParams();
        if (options.status) params.append('status', options.status);
        if (options.limit) params.append('limit', options.limit);

        const response = await this.request(
            `/api/v1/subscriptions?${params.toString()}`
        );
        return response.subscriptions || [];
    }

    /**
     * Create checkout link for a whop
     */
    async createCheckoutLink(whopId, options = {}) {
        const payload = {
            whop_id: whopId,
            success_url: options.successUrl || `${this.apiUrl}/success`,
            cancel_url: options.cancelUrl || `${this.apiUrl}/cancel`,
            email: options.email,
            metadata: options.metadata || {}
        };

        if (options.affiliateCode) {
            payload.affiliate_code = options.affiliateCode;
        }

        const response = await this.request('/api/v1/checkouts', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        return response;
    }

    /**
     * Generate affiliate link for a whop
     */
    async createAffiliateLink(whopId, affiliateId) {
        const baseUrl = 'https://whop.com';
        return `${baseUrl}/checkout/${whopId}?affiliate=${affiliateId}`;
    }

    /**
     * Get affiliate statistics
     */
    async getAffiliateStats(affiliateId) {
        const response = await this.request(
            `/api/v1/affiliates/${affiliateId}/stats`
        );
        return {
            totalEarnings: response.total_earnings || 0,
            pendingEarnings: response.pending_earnings || 0,
            paidEarnings: response.paid_earnings || 0,
            totalReferrals: response.total_referrals || 0,
            conversionRate: response.conversion_rate || 0,
            earningsPerClick: response.epc || 0
        };
    }

    /**
     * Get affiliate referrals
     */
    async getAffiliateReferrals(affiliateId, options = {}) {
        const params = new URLSearchParams();
        if (options.status) params.append('status', options.status);
        if (options.limit) params.append('limit', options.limit);

        const response = await this.request(
            `/api/v1/affiliates/${affiliateId}/referrals?${params.toString()}`
        );
        return response.referrals || [];
    }

    /**
     * Set custom commission rate for a user
     */
    async setCustomCommission(whopId, userEmail, commission) {
        const response = await this.request(
            `/api/v1/whops/${whopId}/affiliates`,
            {
                method: 'POST',
                body: JSON.stringify({
                    email: userEmail,
                    commission_rate: commission,
                    reward_type: 'percent',
                    payment_type: 'recurring'
                })
            }
        );
        return response;
    }

    /**
     * Process webhook event
     */
    async processWebhookEvent(event) {
        const handlers = {
            'new_member': this.handleNewMember.bind(this),
            'cancelled_subscription': this.handleCancelledSubscription.bind(this),
            'updated_subscription': this.handleUpdatedSubscription.bind(this),
            'payment_failed': this.handlePaymentFailed.bind(this),
            'refunded': this.handleRefunded.bind(this)
        };

        const handler = handlers[event.event];
        if (handler) {
            return await handler(event.data);
        }

        console.log(`Unhandled webhook event: ${event.event}`);
        return { handled: false, event: event.event };
    }

    /**
     * Handle new member subscription
     */
    async handleNewMember(data) {
        console.log('New member:', data);

        return {
            action: 'activate_client',
            customerId: data.id,
            email: data.email,
            plan: data.plan || 'starter',
            subscriptionId: data.subscription_id,
            createdAt: data.created_at
        };
    }

    /**
     * Handle cancelled subscription
     */
    async handleCancelledSubscription(data) {
        console.log('Subscription cancelled:', data);

        return {
            action: 'deactivate_client',
            customerId: data.id,
            subscriptionId: data.subscription_id,
            cancelledAt: data.cancelled_at
        };
    }

    /**
     * Handle subscription update
     */
    async handleUpdatedSubscription(data) {
        console.log('Subscription updated:', data);

        return {
            action: 'update_tier',
            customerId: data.id,
            subscriptionId: data.subscription_id,
            newPlan: data.plan,
            updatedAt: data.updated_at
        };
    }

    /**
     * Handle payment failed
     */
    async handlePaymentFailed(data) {
        console.log('Payment failed:', data);

        return {
            action: 'notify_client',
            customerId: data.id,
            subscriptionId: data.subscription_id,
            failedAt: data.failed_at,
            notifyType: 'payment_failed'
        };
    }

    /**
     * Handle refund
     */
    async handleRefunded(data) {
        console.log('Refund processed:', data);

        return {
            action: 'suspend_service',
            customerId: data.id,
            subscriptionId: data.subscription_id,
            refundAmount: data.amount,
            refundedAt: data.refunded_at
        };
    }

    /**
     * Make API request
     */
    async request(endpoint, options = {}) {
        const url = `${this.apiUrl}${endpoint}`;

        const defaultOptions = {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        };

        const config = { ...defaultOptions, ...options };

        try {
            const response = await fetch(url, config);

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(
                    `Whop API error: ${response.status} ${response.statusText} - ${errorText}`
                );
            }

            return await response.json();
        } catch (error) {
            console.error(`Whop API request failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Calculate commission for affiliate
     */
    calculateCommission(grossAmount, commissionRate = this.defaultCommission) {
        return {
            gross: grossAmount,
            commission: grossAmount * (commissionRate / 100),
            net: grossAmount * (1 - commissionRate / 100),
            rate: commissionRate
        };
    }

    /**
     * Generate revenue report
     */
    async generateRevenueReport(dateRange) {
        const startDate = dateRange.start.toISOString();
        const endDate = dateRange.end.toISOString();

        // Get all transactions
        const subscriptions = await this.listSubscriptions({ status: 'active' });
        const transactions = await this.request(
            `/api/v1/transactions?start_date=${startDate}&end_date=${endDate}`
        );

        return {
            period: { start: startDate, end: endDate },
            totalRevenue: transactions.reduce((sum, t) => sum + t.amount, 0),
            totalTransactions: transactions.length,
            activeSubscriptions: subscriptions.length,
            newMembers: transactions.filter(t => t.type === 'new').length,
            churned: transactions.filter(t => t.type === 'cancellation').length
        };
    }
}

module.exports = WhopIntegration;
