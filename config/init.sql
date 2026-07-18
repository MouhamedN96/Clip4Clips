-- ClipForge Database Schema

-- Clients table
CREATE TABLE IF NOT EXISTS clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    platform VARCHAR(50), -- twitch, youtube, tiktok, instagram
    platform_id VARCHAR(255),
    follower_count INTEGER DEFAULT 0,
    tier VARCHAR(50) DEFAULT 'starter', -- starter, growth, viral, enterprise
    revenue_model VARCHAR(50) DEFAULT 'rev_share', -- rev_share, flat_fee, white_label
    commission_rate INTEGER DEFAULT 50, -- percentage
    whop_customer_id VARCHAR(255),
    whop_subscription_id VARCHAR(255),
    stripe_customer_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status VARCHAR(50) DEFAULT 'active' -- active, paused, churned
);

-- Clips table
CREATE TABLE IF NOT EXISTS clips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES clients(id),
    source_url TEXT,
    source_platform VARCHAR(50),
    title VARCHAR(500),
    duration_seconds INTEGER,
    views INTEGER DEFAULT 0,
    likes INTEGER DEFAULT 0,
    shares INTEGER DEFAULT 0,
    revenue_generated DECIMAL(10, 2) DEFAULT 0,
    platforms_posted TEXT[], -- ['tiktok', 'youtube', 'instagram']
    status VARCHAR(50) DEFAULT 'pending', -- pending, approved, posted, viral
    viral_tier INTEGER, -- 1, 2, 3 for 1M, 10M, 50M
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    posted_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB
);

-- Outreach campaigns table
CREATE TABLE IF NOT EXISTS outreach_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_platform VARCHAR(50),
    target_query TEXT,
    messages_sent INTEGER DEFAULT 0,
    responses_received INTEGER DEFAULT 0,
    conversions INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Outreach messages table
CREATE TABLE IF NOT EXISTS outreach_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID REFERENCES outreach_campaigns(id),
    client_id UUID REFERENCES clients(id),
    target_handle VARCHAR(255),
    target_platform VARCHAR(50),
    message_content TEXT,
    message_sent_at TIMESTAMP WITH TIME ZONE,
    response_received BOOLEAN DEFAULT FALSE,
    response_content TEXT,
    converted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Analytics table
CREATE TABLE IF NOT EXISTS analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES clients(id),
    clip_id UUID REFERENCES clips(id),
    metric_type VARCHAR(100), -- views, likes, shares, revenue
    metric_value INTEGER,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Revenue table
CREATE TABLE IF NOT EXISTS revenue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES clients(id),
    clip_id UUID REFERENCES clips(id),
    gross_revenue DECIMAL(10, 2) NOT NULL,
    platform_fee DECIMAL(10, 2),
    agency_revenue DECIMAL(10, 2) NOT NULL,
    client_revenue DECIMAL(10, 2) NOT NULL,
    revenue_type VARCHAR(50), -- creator_rewards, ad_revenue, brand_deal
    platform VARCHAR(50),
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    paid_out BOOLEAN DEFAULT FALSE,
    paid_at TIMESTAMP WITH TIME ZONE
);

-- Affiliate tracking table
CREATE TABLE IF NOT EXISTS affiliates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    whop_affiliate_id VARCHAR(255),
    email VARCHAR(255),
    referred_client_id UUID REFERENCES clients(id),
    commission_rate INTEGER DEFAULT 30,
    total_earnings DECIMAL(10, 2) DEFAULT 0,
    pending_earnings DECIMAL(10, 2) DEFAULT 0,
    paid_earnings DECIMAL(10, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status VARCHAR(50) DEFAULT 'active'
);

-- last30days intelligence cache
CREATE TABLE IF NOT EXISTS intelligence_queries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query_text TEXT NOT NULL,
    query_type VARCHAR(50), -- search, discover, trends
    results JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE
);

-- Viral bonuses table
CREATE TABLE IF NOT EXISTS viral_bonuses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES clients(id),
    clip_id UUID REFERENCES clips(id),
    view_threshold INTEGER, -- 1000000, 10000000, 50000000
    bonus_amount DECIMAL(10, 2) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending', -- pending, approved, paid
    triggered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    paid_at TIMESTAMP WITH TIME ZONE
);

-- Outreach messages gain a review status (HITL gate before the farm sends).
-- ADD COLUMN IF NOT EXISTS keeps this safe on both fresh and existing databases.
-- Lifecycle: pending_review -> approved -> sent, or -> rejected / failed.
ALTER TABLE outreach_messages ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'draft';

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_outreach_messages_status ON outreach_messages(status);
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);
CREATE INDEX IF NOT EXISTS idx_clients_tier ON clients(tier);
CREATE INDEX IF NOT EXISTS idx_clips_client_id ON clips(client_id);
CREATE INDEX IF NOT EXISTS idx_clips_status ON clips(status);
CREATE INDEX IF NOT EXISTS idx_revenue_client_id ON revenue(client_id);
CREATE INDEX IF NOT EXISTS idx_revenue_recorded_at ON revenue(recorded_at);
CREATE INDEX IF NOT EXISTS idx_outreach_campaign_status ON outreach_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_intelligence_expires ON intelligence_queries(expires_at);
