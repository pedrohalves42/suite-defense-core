import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';

interface PipelineCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  details?: any;
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate admin user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is admin
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (!roles || roles.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    logger.info('[validate-build-pipeline] Starting pipeline validation', { user_id: user.id });

    const checks: PipelineCheck[] = [];

    // Check 1: GitHub Token
    const BUILD_GH_TOKEN = Deno.env.get('BUILD_GH_TOKEN');
    checks.push({
      name: 'github_token',
      status: BUILD_GH_TOKEN ? 'pass' : 'fail',
      message: BUILD_GH_TOKEN 
        ? 'GitHub token is configured' 
        : 'BUILD_GH_TOKEN secret is missing',
      details: BUILD_GH_TOKEN ? { length: BUILD_GH_TOKEN.length } : null
    });

    // Check 2: GitHub Repository
    const BUILD_GH_REPOSITORY = Deno.env.get('BUILD_GH_REPOSITORY');
    checks.push({
      name: 'github_repository',
      status: BUILD_GH_REPOSITORY ? 'pass' : 'fail',
      message: BUILD_GH_REPOSITORY 
        ? `Repository configured: ${BUILD_GH_REPOSITORY}` 
        : 'BUILD_GH_REPOSITORY secret is missing',
      details: { repository: BUILD_GH_REPOSITORY || null }
    });

    // Check 3: Supabase URL
    checks.push({
      name: 'supabase_url',
      status: supabaseUrl ? 'pass' : 'fail',
      message: supabaseUrl ? 'Supabase URL is configured' : 'SUPABASE_URL is missing',
      details: { url: supabaseUrl }
    });

    // Check 4: Storage Bucket
    try {
      const { data: bucket, error: bucketError } = await supabase.storage.getBucket('agent-installers');
      
      if (bucketError) {
        checks.push({
          name: 'storage_bucket',
          status: 'fail',
          message: `Storage bucket error: ${bucketError.message}`,
          details: { error: bucketError }
        });
      } else {
        checks.push({
          name: 'storage_bucket',
          status: 'pass',
          message: 'Storage bucket "agent-installers" is accessible',
          details: { 
            bucket_id: bucket.id,
            public: bucket.public 
          }
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      checks.push({
        name: 'storage_bucket',
        status: 'fail',
        message: `Storage bucket check failed: ${errorMessage}`,
        details: { error: errorMessage }
      });
    }

    // Check 5: GitHub Workflow Exists
    if (BUILD_GH_TOKEN && BUILD_GH_REPOSITORY) {
      try {
        const workflowsResponse = await fetch(
          `https://api.github.com/repos/${BUILD_GH_REPOSITORY}/actions/workflows`,
          {
            headers: {
              'Authorization': `Bearer ${BUILD_GH_TOKEN}`,
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'CyberShield-Pipeline-Validator'
            }
          }
        );

        if (workflowsResponse.ok) {
          const workflowsData = await workflowsResponse.json();
          const targetWorkflow = workflowsData.workflows?.find(
            (w: any) => w.name === 'Build Agent EXE' || w.path.includes('build-agent-exe')
          );

          if (targetWorkflow) {
            checks.push({
              name: 'workflow_exists',
              status: 'pass',
              message: `Workflow found: ${targetWorkflow.name}`,
              details: {
                workflow_id: targetWorkflow.id,
                path: targetWorkflow.path,
                state: targetWorkflow.state
              }
            });
          } else {
            checks.push({
              name: 'workflow_exists',
              status: 'fail',
              message: 'Build Agent EXE workflow not found',
              details: { 
                available_workflows: workflowsData.workflows?.map((w: any) => w.name) 
              }
            });
          }
        } else {
          const errorText = await workflowsResponse.text();
          checks.push({
            name: 'workflow_exists',
            status: 'fail',
            message: `GitHub API error: ${workflowsResponse.status} ${workflowsResponse.statusText}`,
            details: { 
              status: workflowsResponse.status,
              error: errorText 
            }
          });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        checks.push({
          name: 'workflow_exists',
          status: 'fail',
          message: `Failed to check GitHub workflows: ${errorMessage}`,
          details: { error: errorMessage }
        });
      }
    } else {
      checks.push({
        name: 'workflow_exists',
        status: 'warn',
        message: 'Cannot check workflow - GitHub credentials missing',
        details: null
      });
    }

    // Check 6: GitHub API Connectivity
    if (BUILD_GH_TOKEN && BUILD_GH_REPOSITORY) {
      try {
        const repoResponse = await fetch(
          `https://api.github.com/repos/${BUILD_GH_REPOSITORY}`,
          {
            headers: {
              'Authorization': `Bearer ${BUILD_GH_TOKEN}`,
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'CyberShield-Pipeline-Validator'
            }
          }
        );

        if (repoResponse.ok) {
          const repoData = await repoResponse.json();
          checks.push({
            name: 'github_api_connectivity',
            status: 'pass',
            message: 'GitHub API is accessible',
            details: {
              repository: repoData.full_name,
              default_branch: repoData.default_branch,
              private: repoData.private
            }
          });
        } else {
          checks.push({
            name: 'github_api_connectivity',
            status: 'fail',
            message: `GitHub API returned ${repoResponse.status}`,
            details: { status: repoResponse.status }
          });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        checks.push({
          name: 'github_api_connectivity',
          status: 'fail',
          message: `Cannot reach GitHub API: ${errorMessage}`,
          details: { error: errorMessage }
        });
      }
    } else {
      checks.push({
        name: 'github_api_connectivity',
        status: 'warn',
        message: 'Cannot test GitHub API - credentials missing',
        details: null
      });
    }

    // Check 7: Recent Build Records
    try {
      const { data: recentBuilds, error: buildsError } = await supabase
        .from('agent_builds')
        .select('id, agent_name, build_status, github_run_id, build_started_at, build_completed_at')
        .order('build_started_at', { ascending: false })
        .limit(5);

      if (buildsError) {
        checks.push({
          name: 'recent_builds',
          status: 'warn',
          message: `Cannot query recent builds: ${buildsError.message}`,
          details: { error: buildsError }
        });
      } else {
        const completedBuilds = recentBuilds?.filter(b => b.build_status === 'completed').length || 0;
        const failedBuilds = recentBuilds?.filter(b => b.build_status === 'failed').length || 0;
        
        checks.push({
          name: 'recent_builds',
          status: recentBuilds && recentBuilds.length > 0 ? 'pass' : 'warn',
          message: `Found ${recentBuilds?.length || 0} recent builds (${completedBuilds} completed, ${failedBuilds} failed)`,
          details: {
            total: recentBuilds?.length || 0,
            completed: completedBuilds,
            failed: failedBuilds,
            latest: recentBuilds?.[0] || null
          }
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      checks.push({
        name: 'recent_builds',
        status: 'warn',
        message: `Cannot check recent builds: ${errorMessage}`,
        details: { error: errorMessage }
      });
    }

    // Calculate overall status
    const failedChecks = checks.filter(c => c.status === 'fail').length;
    const warnChecks = checks.filter(c => c.status === 'warn').length;
    const passedChecks = checks.filter(c => c.status === 'pass').length;

    const overallStatus = failedChecks > 0 ? 'unhealthy' : warnChecks > 0 ? 'degraded' : 'healthy';

    const result = {
      overall_status: overallStatus,
      timestamp: new Date().toISOString(),
      summary: {
        total: checks.length,
        passed: passedChecks,
        warnings: warnChecks,
        failed: failedChecks
      },
      checks
    };

    logger.info('[validate-build-pipeline] Validation complete', {
      overall_status: overallStatus,
      passed: passedChecks,
      warnings: warnChecks,
      failed: failedChecks
    });

    return new Response(
      JSON.stringify(result, null, 2),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    );

  } catch (error) {
    logger.error('[validate-build-pipeline] Validation failed', error);
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    return new Response(
      JSON.stringify({
        error: 'Pipeline validation failed',
        message: errorMessage,
        details: errorStack
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    );
  }
});
