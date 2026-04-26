-- Update the report_type check constraint to include compliance types
ALTER TABLE public.generated_reports 
DROP CONSTRAINT generated_reports_report_type_check;

ALTER TABLE public.generated_reports 
ADD CONSTRAINT generated_reports_report_type_check 
CHECK (report_type = ANY (ARRAY[
  'full_security'::text, 
  'software_inventory'::text, 
  'vulnerabilities'::text, 
  'antivirus'::text, 
  'web_activity'::text,
  'compliance_lgpd'::text,
  'compliance_iso_27001'::text,
  'compliance_soc2_lite'::text,
  'executive'::text
]));