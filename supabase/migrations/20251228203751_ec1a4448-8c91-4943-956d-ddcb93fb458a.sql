-- Add company data columns to tenants table
ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS company_name text,
ADD COLUMN IF NOT EXISTS cnpj text,
ADD COLUMN IF NOT EXISTS phone text,
ADD COLUMN IF NOT EXISTS contact_email text,
ADD COLUMN IF NOT EXISTS address text,
ADD COLUMN IF NOT EXISTS city text,
ADD COLUMN IF NOT EXISTS state text,
ADD COLUMN IF NOT EXISTS zip_code text,
ADD COLUMN IF NOT EXISTS setup_completed boolean DEFAULT false;

-- Update existing tenants to mark setup as not completed so they see the wizard
UPDATE public.tenants SET setup_completed = false WHERE setup_completed IS NULL;

-- Add comment explaining the setup_completed flag
COMMENT ON COLUMN public.tenants.setup_completed IS 'Flag indicating if the initial tenant configuration wizard has been completed';