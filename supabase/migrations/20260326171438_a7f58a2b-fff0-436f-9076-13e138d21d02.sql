-- Helper functions for kv_cache table

-- Function to get cached value (returns NULL if expired)
CREATE OR REPLACE FUNCTION get_cached_value(p_key TEXT)
RETURNS JSONB AS $$
DECLARE
    cached_value JSONB;
BEGIN
    SELECT value INTO cached_value
    FROM kv_cache
    WHERE key = p_key AND expires_at > NOW();
    
    RETURN cached_value;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Function to set cached value with TTL
CREATE OR REPLACE FUNCTION set_cached_value(
    p_key TEXT,
    p_value JSONB,
    p_ttl_seconds INTEGER DEFAULT 300
) RETURNS VOID AS $$
BEGIN
    INSERT INTO kv_cache (key, value, expires_at)
    VALUES (p_key, p_value, NOW() + (p_ttl_seconds || ' seconds')::INTERVAL)
    ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value,
        expires_at = EXCLUDED.expires_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Function to cleanup expired cache entries
CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM kv_cache WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Function to invalidate cache by prefix
CREATE OR REPLACE FUNCTION invalidate_cache_prefix(p_prefix TEXT)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM kv_cache WHERE key LIKE (p_prefix || '%');
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Index for prefix searches (if not exists)
CREATE INDEX IF NOT EXISTS idx_kv_cache_key_prefix ON kv_cache(key text_pattern_ops);