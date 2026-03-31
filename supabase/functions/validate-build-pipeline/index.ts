/**
 * validate-build-pipeline — Migrated to serveTenant
 */
import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';

interface PipelineCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  details?: unknown;
}

serveTenant(async (_req, ctx) => {
  const { supabase, userId } = ctx;

  // Check admin role
  const { data: roles } = await supabase.from('user_roles').select('role').eq('user_id', userId!).single();
  if (!roles || !['admin', 'super_admin'].includes(roles.role)) {
    return new Response(JSON.stringify({ error: 'Admin access required' }), { status: 403 });
  }

  logger.info('[validate-build-pipeline] Starting pipeline validation', { user_id: userId });

  const checks: PipelineCheck[] = [];
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

  // Check 1: GitHub Token
  const BUILD_GH_TOKEN = Deno.env.get('BUILD_GH_TOKEN');
  checks.push({ name: 'github_token', status: BUILD_GH_TOKEN ? 'pass' : 'fail', message: BUILD_GH_TOKEN ? 'GitHub token is configured' : 'BUILD_GH_TOKEN secret is missing' });

  // Check 2: GitHub Repository
  const BUILD_GH_REPOSITORY = Deno.env.get('BUILD_GH_REPOSITORY');
  checks.push({ name: 'github_repository', status: BUILD_GH_REPOSITORY ? 'pass' : 'fail', message: BUILD_GH_REPOSITORY ? `Repository configured: ${BUILD_GH_REPOSITORY}` : 'BUILD_GH_REPOSITORY secret is missing' });

  // Check 3: Supabase URL
  checks.push({ name: 'supabase_url', status: supabaseUrl ? 'pass' : 'fail', message: supabaseUrl ? 'Supabase URL is configured' : 'SUPABASE_URL is missing' });

  // Check 4: Storage Bucket
  try {
    const { data: bucket, error: bucketError } = await supabase.storage.getBucket('agent-installers');
    checks.push(bucketError
      ? { name: 'storage_bucket', status: 'fail', message: `Storage bucket error: ${bucketError.message}` }
      : { name: 'storage_bucket', status: 'pass', message: 'Storage bucket "agent-installers" is accessible', details: { bucket_id: bucket.id, public: bucket.public } });
  } catch (error) {
    checks.push({ name: 'storage_bucket', status: 'fail', message: `Storage bucket check failed: ${error instanceof Error ? error.message : String(error)}` });
  }

  // Check 5 & 6: GitHub Workflow & API
  if (BUILD_GH_TOKEN && BUILD_GH_REPOSITORY) {
    const ghHeaders = { 'Authorization': `Bearer ${BUILD_GH_TOKEN}`, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'CyberShield-Pipeline-Validator' };
    try {
      const workflowsResponse = await fetchWithTimeout(`https://api.github.com/repos/${BUILD_GH_REPOSITORY}/actions/workflows`, { headers: ghHeaders });
      if (workflowsResponse.ok) {
        const workflowsData = await workflowsResponse.json();
        const targetWorkflow = workflowsData.workflows?.find((w: Record<string, unknown>) => w.name === 'Build Agent EXE' || (w.path as string).includes('build-agent-exe'));
        checks.push(targetWorkflow
          ? { name: 'workflow_exists', status: 'pass', message: `Workflow found: ${targetWorkflow.name}`, details: { workflow_id: targetWorkflow.id, path: targetWorkflow.path, state: targetWorkflow.state } }
          : { name: 'workflow_exists', status: 'fail', message: 'Build Agent EXE workflow not found' });
      } else {
        await workflowsResponse.text();
        checks.push({ name: 'workflow_exists', status: 'fail', message: `GitHub API error: ${workflowsResponse.status}` });
      }

      const repoResponse = await fetchWithTimeout(`https://api.github.com/repos/${BUILD_GH_REPOSITORY}`, { headers: ghHeaders });
      if (repoResponse.ok) {
        const repoData = await repoResponse.json();
        checks.push({ name: 'github_api_connectivity', status: 'pass', message: 'GitHub API is accessible', details: { repository: repoData.full_name, default_branch: repoData.default_branch } });
      } else {
        await repoResponse.text();
        checks.push({ name: 'github_api_connectivity', status: 'fail', message: `GitHub API returned ${repoResponse.status}` });
      }
    } catch (error) {
      checks.push({ name: 'workflow_exists', status: 'fail', message: `Failed: ${error instanceof Error ? error.message : String(error)}` });
      checks.push({ name: 'github_api_connectivity', status: 'fail', message: `Cannot reach GitHub API` });
    }
  } else {
    checks.push({ name: 'workflow_exists', status: 'warn', message: 'Cannot check workflow - GitHub credentials missing' });
    checks.push({ name: 'github_api_connectivity', status: 'warn', message: 'Cannot test GitHub API - credentials missing' });
  }

  // Check 7: Recent Builds
  try {
    const { data: recentBuilds, error: buildsError } = await supabase
      .from('agent_builds').select('id, build_status, github_run_id, build_started_at, build_completed_at')
      .order('build_started_at', { ascending: false }).limit(5);

    if (buildsError) {
      checks.push({ name: 'recent_builds', status: 'warn', message: `Cannot query recent builds: ${buildsError.message}` });
    } else {
      const completed = recentBuilds?.filter(b => b.build_status === 'completed').length || 0;
      const failed = recentBuilds?.filter(b => b.build_status === 'failed').length || 0;
      checks.push({ name: 'recent_builds', status: recentBuilds && recentBuilds.length > 0 ? 'pass' : 'warn', message: `Found ${recentBuilds?.length || 0} recent builds (${completed} completed, ${failed} failed)` });
    }
  } catch (error) {
    checks.push({ name: 'recent_builds', status: 'warn', message: `Cannot check recent builds: ${error instanceof Error ? error.message : String(error)}` });
  }

  const failedChecks = checks.filter(c => c.status === 'fail').length;
  const warnChecks = checks.filter(c => c.status === 'warn').length;
  const passedChecks = checks.filter(c => c.status === 'pass').length;

  logger.info('[validate-build-pipeline] Validation complete', { passed: passedChecks, warnings: warnChecks, failed: failedChecks });

  return {
    overall_status: failedChecks > 0 ? 'unhealthy' : warnChecks > 0 ? 'degraded' : 'healthy',
    timestamp: new Date().toISOString(),
    summary: { total: checks.length, passed: passedChecks, warnings: warnChecks, failed: failedChecks },
    checks,
  };
});
