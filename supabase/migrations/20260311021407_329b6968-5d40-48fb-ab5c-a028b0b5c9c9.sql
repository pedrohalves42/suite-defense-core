
-- Cash flow transactions table
CREATE TABLE public.cash_flow_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  amount_cents BIGINT NOT NULL,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_recurring BOOLEAN DEFAULT false,
  recurrence_interval TEXT CHECK (recurrence_interval IN ('monthly', 'quarterly', 'yearly')),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.cash_flow_transactions ENABLE ROW LEVEL SECURITY;

-- Only super_admins can manage cash flow
CREATE POLICY "Super admins can manage cash flow"
ON public.cash_flow_transactions
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
)
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin')
);
