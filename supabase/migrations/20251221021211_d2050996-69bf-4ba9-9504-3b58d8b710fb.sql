-- Add ON DELETE CASCADE to jobs parent_job_id foreign key
ALTER TABLE public.jobs 
DROP CONSTRAINT IF EXISTS jobs_parent_job_id_fkey;

ALTER TABLE public.jobs 
ADD CONSTRAINT jobs_parent_job_id_fkey 
  FOREIGN KEY (parent_job_id) 
  REFERENCES public.jobs(id) 
  ON DELETE CASCADE;