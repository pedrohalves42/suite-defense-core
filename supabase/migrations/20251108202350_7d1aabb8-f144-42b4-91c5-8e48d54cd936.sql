-- Create sales_contacts table
CREATE TABLE public.sales_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT,
  phone TEXT,
  endpoints INTEGER,
  message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'closed'))
);

-- Enable Row Level Security
ALTER TABLE public.sales_contacts ENABLE ROW LEVEL SECURITY;

-- Allow anyone (including anonymous) to insert
CREATE POLICY "Anyone can submit contact form"
ON public.sales_contacts
FOR INSERT
WITH CHECK (true);

-- Admins can view using has_role function
CREATE POLICY "Admins can view contacts"
ON public.sales_contacts
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'));

-- Create indexes
CREATE INDEX idx_sales_contacts_created_at ON public.sales_contacts(created_at DESC);
CREATE INDEX idx_sales_contacts_status ON public.sales_contacts(status);