-- ADR-008: Access Governance - Username-based user creation
-- Add username column to profiles for username/password authentication

-- 1. Add username column (if not exists)
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;

-- 2. Create index for fast username lookups
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);

-- 3. Function to check if user must change password (reads from JWT metadata)
CREATE OR REPLACE FUNCTION public.must_change_password()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'user_metadata' ->> 'must_change_password')::boolean,
    false
  );
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.must_change_password() TO authenticated;