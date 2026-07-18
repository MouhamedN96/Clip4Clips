# ClipForge Troubleshooting Guide

Common issues and solutions for ClipForge VPS deployment.

---

## Container Issues

### Container Won't Start

**Symptoms:**
- `docker compose up -d` fails
- Container exits immediately after starting

**Diagnosis:**
```bash
# Check logs
docker compose logs clipforge-api

# Check container status
docker compose ps
```

**Solutions:**

1. **Missing .env file**
   ```bash
   cp config/.env.example config/.env
   nano config/.env  # Fill in values
   ```

2. **Port already in use**
   ```bash
   # Check what's using port 3000
   lsof -i :3000

   # Kill the process or change port in .env
   ```

3. **Database connection failed**
   ```bash
   # Check PostgreSQL is running
   docker compose ps postgres

   # Test connection
   docker compose exec postgres pg_isready

   # Check credentials
   grep POSTGRES config/.env
   ```

### Out of Memory

**Symptoms:**
- Container killed by OOM killer
- `docker stats` shows high memory usage

**Solutions:**
```bash
# Increase Docker memory limit
# Edit /etc/docker/daemon.json
{
  "default-ulimits": {
    "memlock": {
      "Name": "memlock",
      "Soft": -1,
      "Hard": -1
    }
  },
  "default-shm-size": "256M"
}

# Restart Docker
systemctl restart docker
```

---

## Database Issues

### PostgreSQL Connection Refused

**Symptoms:**
- `ECONNREFUSED` errors
- API returns 500 on database queries

**Solutions:**
```bash
# Check PostgreSQL container
docker compose ps postgres

# View logs
docker compose logs postgres

# Restart PostgreSQL
docker compose restart postgres

# Recreate database (WARNING: loses data)
docker compose down -v
docker compose up -d
```

### Database Migration Failed

**Symptoms:**
- Tables don't exist
- Queries fail with "relation does not exist"

**Solutions:**
```bash
# Run migrations manually
docker compose exec -T postgres psql -U clipforge -d clipforge -f /docker-entrypoint-initdb.d/init.sql

# Verify tables exist
docker compose exec -T postgres psql -U clipforge -d clipforge -c "\dt"
```

---

## Redis Issues

### Redis Connection Failed

**Symptoms:**
- Worker can't process jobs
- Queue operations fail

**Solutions:**
```bash
# Check Redis
docker compose ps redis

# Test connection
docker compose exec redis redis-cli -a $REDIS_PASSWORD ping

# Restart Redis
docker compose restart redis
```

### Queue Jobs Stuck

**Symptoms:**
- Jobs stay in queue
- Workers not processing

**Solutions:**
```bash
# Check queue length
docker exec clipforge-worker redis-cli -a $REDIS_PASSWORD llen clip_queue

# Check worker logs
docker compose logs -f clipforge-worker

# Restart workers
docker compose restart clipforge-worker
```

---

## Whop Integration Issues

### Webhook Not Received

**Symptoms:**
- New clients not being activated
- No entries in webhook logs

**Diagnosis:**
```bash
# Check if endpoint is accessible
curl -I https://your-domain.com/api/webhooks/whop

# Check webhook logs
docker compose logs clipforge-api | grep webhook
```

**Solutions:**

1. **Webhook URL not accessible**
   - Ensure DNS points to your VPS
   - Check firewall: `ufw status`
   - Check SSL certificate

2. **Signature verification failed**
   ```bash
   # Verify webhook secret matches
   grep WHOP_WEBHOOK_SECRET config/.env
   ```

3. **Whop dashboard configuration**
   - Go to Whop → Marketing → Webhooks
   - Verify URL: `https://your-domain.com/api/webhooks/whop`
   - Check all events are selected

### Payment Not Processing

**Symptoms:**
- Clients subscribed but not activated
- `payment_failed` events

**Solutions:**
1. Check Stripe/Whop dashboard for payment issues
2. Verify webhook secret is correct
3. Check `payment_failed` handler in logs

---

## last30days Issues

### Search Returns No Results

**Symptoms:**
- Intelligence queries return empty
- `items` array is empty

**Diagnosis:**
```bash
# Check last30days logs
docker compose logs last30days
```

**Solutions:**

1. **Missing API keys**
   ```bash
   # Verify keys are set
   grep BRAVE_SEARCH_KEY config/.env
   grep XQUIK_API_KEY config/.env

   # Add keys if missing
   ```

2. **Rate limiting**
   - Wait and retry
   - Check Brave Search quota

3. **Network issues**
   ```bash
   # Test connectivity
   docker exec clipforge-api ping api.search.brave.com
   ```

### Permission Denied on Data Directory

**Symptoms:**
- Cannot write to last30days directory
- `EACCES` errors

**Solutions:**
```bash
# Fix permissions
chmod -R 755 /opt/clipforge/data/last30days
chown -R 1000:1000 /opt/clipforge/data/last30days
```

---

## Hermes Issues

### Phone Not Connecting

**Symptoms:**
- Phone doesn't appear in `hermes.getAllPhoneStatus()`
- Connection timeout errors

**Diagnosis:**
```bash
# Check relay server
curl -X POST https://your-vps:8766/health

# Check Hermes logs
docker compose logs | grep hermes
```

**Solutions:**

1. **Phone offline**
   - Check phone has internet
   - Restart Hermes Bridge app
   - Re-pair phone

2. **Relay server down**
   ```bash
   # Check relay container
   docker ps | grep hermes-relay

   # Restart relay
   docker restart hermes-relay
   ```

3. **Firewall blocking port 8766**
   ```bash
   ufw allow 8766/tcp
   ```

### Rate Limited by Platform

**Symptoms:**
- TikTok/Instagram blocks actions
- "Rate limit exceeded" errors

**Solutions:**
1. Wait for cooldown period (usually 24-48 hours)
2. Rotate to different phone/account
3. Check proxy is working
4. Reduce action frequency

### DM Not Sending

**Symptoms:**
- Hermes action completes but no message sent
- App opens but no DM

**Solutions:**
1. Verify account is logged in on phone
2. Check for pending bans/warnings
3. Try different phone/account
4. Increase delay between actions

---

## SSL/HTTPS Issues

### Certificate Not Working

**Symptoms:**
- Browser shows "Not Secure"
- `ERR_CERT_INVALID`

**Solutions:**
```bash
# Generate certificate
certbot --nginx -d your-domain.com

# Check certificate files
ls -la /etc/letsencrypt/live/your-domain.com/

# Copy to nginx directory
mkdir -p docker/ssl
cp /etc/letsencrypt/live/your-domain.com/fullchain.pem docker/ssl/cert.pem
cp /etc/letsencrypt/live/your-domain.com/privkey.pem docker/ssl/key.pem

# Restart nginx
docker compose restart nginx
```

### Mixed Content Errors

**Symptoms:**
- CSS/JS not loading
- Console shows "Mixed Content" warnings

**Solutions:**
- Ensure all internal links use HTTPS
- Update `config/.env`:
  ```
  DOMAIN=https://your-domain.com
  ```

---

## Performance Issues

### High CPU Usage

**Diagnosis:**
```bash
docker stats

# Check for runaway processes
top
```

**Solutions:**
1. **Reduce worker count**
   ```yaml
   # In docker-compose.yml
   deploy:
     replicas: 1  # Reduce from 2
   ```

2. **Optimize queries**
   - Add database indexes
   - Cache frequently accessed data

### Slow API Responses

**Symptoms:**
- API requests timeout
- High latency

**Solutions:**
1. Check database query performance
2. Enable Redis caching
3. Scale workers: `docker compose up -d --scale clipforge-worker=4`

---

## Log Locations

| Service | Log Command |
|---------|-------------|
| API | `docker compose logs -f clipforge-api` |
| Worker | `docker compose logs -f clipforge-worker` |
| Scheduler | `docker compose logs -f clipforge-scheduler` |
| PostgreSQL | `docker compose logs -f postgres` |
| Redis | `docker compose logs -f redis` |
| Nginx | `docker compose logs -f nginx` |
| Hermes | `docker compose logs -f hermes-relay` |

---

## Emergency Recovery

### Full System Reset

```bash
# Stop all services
docker compose down

# Backup data
cp -r data data.backup.$(date +%Y%m%d)
pg_dump -U clipforge clipforge > backup.sql

# Remove volumes
docker compose down -v

# Fresh start
docker compose up -d
```

### Restore from Backup

```bash
# Stop services
docker compose down

# Restore database
cat backup.sql | docker compose exec -T postgres psql -U clipforge -d clipforge

# Restore data
rm -rf data
cp -r data.backup.20260717 data

# Start services
docker compose up -d
```

---

## Getting Help

If issues persist:

1. Check logs: `docker compose logs > debug.log`
2. Check system resources: `docker stats`
3. Review documentation: `docs/`
4. GitHub Issues: https://github.com/your-org/clipforge-vps/issues

---

## Health Check Commands

```bash
# Quick health check
curl -sf http://localhost:3000/health && echo "API OK"
docker exec clipforge-postgres pg_isready && echo "Postgres OK"
docker exec clipforge-redis redis-cli -a $REDIS_PASSWORD ping && echo "Redis OK"

# Full diagnostic
./scripts/health-check.sh
```
