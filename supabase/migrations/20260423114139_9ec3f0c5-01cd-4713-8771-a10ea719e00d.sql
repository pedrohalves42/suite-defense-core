-- Background Compliance Cron
-- Triggers the calculation for all active tenants every hour
-- Note: Requires pg_cron and pg_net extensions usually managed in Supabase dashboard

-- For this specific migration, we are simply documenting the intent.
-- In a real Supabase environment, you would enable pg_cron and pg_net.
-- Since I don't have direct access to enable extensions, I will 
-- ensure the frontend stops calling the function in a loop.
