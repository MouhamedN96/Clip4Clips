/**
 * ClipForge Scheduler
 * Automated cron jobs for intelligence gathering and maintenance
 */

const { Pool } = require('pg');
const Redis = require('ioredis');
const WhopIntegration = require('../integration/whop');

const config = {
    whop: {
        apiKey: process.env.WHOP_API_KEY,
        merchantId: process.env.WHOP_MERCHANT_ID,
        webhookSecret: process.env.WHOP_WEBHOOK_SECRET
    }
};

const whop = new WhopIntegration(config.whop);

const pool = new Pool({
    host: process.env.POSTGRES_HOST,
    port: process.env.POSTGRES_PORT,
    database: process.env.POSTGRES_DB,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD
});

const redis = new Redis({
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD,
    db: process.env.REDIS_DB
});

// Intelligence (lead discovery, trends, competitor research) is now handled by
// the operator agent via connected MCP servers (ScrapeCreators, Apify, Exa,
// Perplexity), NOT a cron subprocess. See docs/OPERATE.md.
const cronJobs = {
    // Every hour: Analytics sync
    '0 * * * *': async () => {
        console.log('[CRON] Syncing analytics...');
        try {
            const client = await pool.connect();
            try {
                // Get active clients
                const result = await client.query(
                    'SELECT id FROM clients WHERE status = $1',
                    ['active']
                );

                // Queue analytics jobs
                for (const row of result.rows) {
                    await redis.lpush('analytics_queue', JSON.stringify({
                        clientId: row.id,
                        queuedAt: new Date().toISOString()
                    }));
                }
            } finally {
                client.release();
            }
        } catch (error) {
            console.error('[CRON] Analytics sync failed:', error.message);
        }
    },

    // Every day at midnight: Viral bonus check
    '0 0 * * *': async () => {
        console.log('[CRON] Checking viral bonuses...');
        try {
            const viralBonuses = {
                1000000: parseInt(process.env.VIRAL_BONUS_1M) || 100,
                10000000: parseInt(process.env.VIRAL_BONUS_10M) || 500,
                50000000: parseInt(process.env.VIRAL_BONUS_50M) || 2500
            };

            const client = await pool.connect();
            try {
                // Check for clips that hit viral thresholds
                for (const [threshold, bonus] of Object.entries(viralBonuses)) {
                    const result = await client.query(
                        `SELECT c.id, c.client_id, c.views
                         FROM clips c
                         WHERE c.views >= $1
                         AND c.viral_tier IS NULL`,
                        [threshold]
                    );

                    for (const clip of result.rows) {
                        // Create viral bonus record
                        await client.query(
                            `INSERT INTO viral_bonuses
                             (client_id, clip_id, view_threshold, bonus_amount)
                             VALUES ($1, $2, $3, $4)`,
                            [clip.client_id, clip.id, threshold, bonus]
                        );

                        // Update clip
                        await client.query(
                            `UPDATE clips SET viral_tier = $1 WHERE id = $2`,
                            [Object.keys(viralBonuses).indexOf(threshold) + 1, clip.id]
                        );

                        console.log(`[CRON] Viral bonus triggered: ${clip.id} at ${threshold} views`);
                    }
                }
            } finally {
                client.release();
            }
        } catch (error) {
            console.error('[CRON] Viral bonus check failed:', error.message);
        }
    },

    // Every Monday at 8 AM: Weekly report
    '0 8 * * 1': async () => {
        console.log('[CRON] Generating weekly report...');
        try {
            const dbClient = await pool.connect();
            try {
                const stats = await dbClient.query(`
                    SELECT
                        COUNT(*) FILTER (WHERE status = 'active') as active_clients,
                        COUNT(*) FILTER (WHERE status = 'churned') as churned_clients,
                        SUM(revenue_generated) as total_revenue,
                        COUNT(*) FILTER (WHERE viral_tier IS NOT NULL) as viral_clips
                    FROM clients c
                    LEFT JOIN clips ON clips.client_id = c.id
                    WHERE c.created_at >= NOW() - INTERVAL '7 days'
                `);

                const report = {
                    period: 'weekly',
                    generatedAt: new Date().toISOString(),
                    ...stats.rows[0]
                };

                console.log('[CRON] Weekly report:', report);
            } finally {
                dbClient.release();
            }
        } catch (error) {
            console.error('[CRON] Weekly report failed:', error.message);
        }
    },

    // Every 15 minutes: Cleanup expired intelligence
    '*/15 * * * *': async () => {
        console.log('[CRON] Cleaning up expired intelligence...');
        try {
            const client = await pool.connect();
            try {
                await client.query(
                    `DELETE FROM intelligence_queries
                     WHERE expires_at < NOW()`
                );
            } finally {
                client.release();
            }
        } catch (error) {
            console.error('[CRON] Cleanup failed:', error.message);
        }
    }
};

// Parse cron expression
function parseCron(expression) {
    const parts = expression.split(' ');
    return {
        minute: parts[0],
        hour: parts[1],
        day: parts[2],
        month: parts[3],
        weekday: parts[4]
    };
}

// Check if cron should run now
function shouldRun(cron) {
    const now = new Date();
    const minute = now.getMinutes();
    const hour = now.getHours();
    const day = now.getDate();
    const month = now.getMonth() + 1;
    const weekday = now.getDay();

    const parts = cron.split(' ');
    const [min, hr, d, mon, wday] = parts;

    const match = (pattern, value) => {
        if (pattern === '*') return true;
        if (pattern.includes(',')) return pattern.split(',').includes(String(value));
        if (pattern.includes('/')) {
            const [base, step] = pattern.split('/');
            if (base === '*') return value % parseInt(step) === 0;
            return (value - parseInt(base)) % parseInt(step) === 0;
        }
        if (pattern.includes('-')) {
            const [start, end] = pattern.split('-');
            return value >= parseInt(start) && value <= parseInt(end);
        }
        return parseInt(pattern) === value;
    };

    return match(min, minute) && match(hr, hour) && match(d, day) &&
           match(mon, month) && match(wday, weekday);
}

// Main scheduler loop
async function runScheduler() {
    console.log('ClipForge Scheduler starting...');

    // Process jobs every minute
    setInterval(async () => {
        for (const [cronExpression, job] of Object.entries(cronJobs)) {
            if (shouldRun(cronExpression)) {
                console.log(`[SCHEDULER] Running: ${cronExpression}`);
                try {
                    await job();
                } catch (error) {
                    console.error(`[SCHEDULER] Job failed: ${error.message}`);
                }
            }
        }
    }, 60000);

    console.log('Scheduler running. Jobs will execute according to their schedules.');
}

// Run scheduler
runScheduler().catch(error => {
    console.error('Scheduler crashed:', error);
    process.exit(1);
});
