import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Server, 
  TrendingUp 
} from "lucide-react";
import JobTestRunner from "@/components/admin/JobTestRunner";

export default function SystemHealth() {
  const { data: agentStats, isLoading: loadingAgents } = useQuery({
    queryKey: ["system-health-agents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agents")
        .select("id, status, last_heartbeat")
        .order("last_heartbeat", { ascending: false });
      
      if (error) throw error;
      
      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
      
      return {
        total: data.length,
        active: data.filter(a => a.status === 'active').length,
        pending: data.filter(a => a.status === 'pending').length,
        inactive: data.filter(a => a.status === 'inactive').length,
        healthy: data.filter(a => 
          a.last_heartbeat && new Date(a.last_heartbeat) > fiveMinutesAgo
        ).length,
      };
    },
    refetchInterval: 30000, // Refresh every 30s
  });

  const { data: jobStats, isLoading: loadingJobs } = useQuery({
    queryKey: ["system-health-jobs"],
    queryFn: async () => {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      
      const { data, error } = await supabase
        .from("jobs")
        .select("id, status, output")
        .gte("created_at", twentyFourHoursAgo);
      
      if (error) throw error;
      
      return {
        total: data.length,
        completed: data.filter(j => j.status === 'completed').length,
        failed: data.filter(j => j.status === 'failed').length,
        pending: data.filter(j => ['queued', 'pending'].includes(j.status)).length,
        v3: data.filter(j => j.output !== null).length,
      };
    },
    refetchInterval: 30000,
  });

  const { data: performanceMetrics, isLoading: loadingPerformance } = useQuery({
    queryKey: ["system-health-performance"],
    queryFn: async () => {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      
      const { data, error } = await supabase
        .from("performance_metrics")
        .select("function_name, duration_ms, status_code")
        .gte("created_at", twentyFourHoursAgo);
      
      if (error) throw error;
      
      const functionStats = data.reduce((acc, metric) => {
        if (!acc[metric.function_name]) {
          acc[metric.function_name] = {
            count: 0,
            totalDuration: 0,
            errorCount: 0,
          };
        }
        acc[metric.function_name].count++;
        acc[metric.function_name].totalDuration += metric.duration_ms;
        if (metric.status_code && metric.status_code >= 400) {
          acc[metric.function_name].errorCount++;
        }
        return acc;
      }, {} as Record<string, { count: number; totalDuration: number; errorCount: number }>);
      
      return Object.entries(functionStats)
        .map(([name, stats]) => ({
          name,
          avgDuration: Math.round(stats.totalDuration / stats.count),
          callCount: stats.count,
          errorCount: stats.errorCount,
        }))
        .filter(s => s.avgDuration > 1000) // Only show slow functions
        .sort((a, b) => b.avgDuration - a.avgDuration)
        .slice(0, 5);
    },
    refetchInterval: 60000,
  });

  const isLoading = loadingAgents || loadingJobs || loadingPerformance;

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <h1 className="text-3xl font-bold mb-6">System Health</h1>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-4 bg-muted rounded w-1/2" />
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-muted rounded w-3/4" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const healthScore = agentStats ? 
    Math.round((agentStats.healthy / agentStats.total) * 100) || 0 : 0;

  const jobSuccessRate = jobStats?.total ? 
    Math.round((jobStats.completed / jobStats.total) * 100) : 0;

  const v3AdoptionRate = jobStats?.total ? 
    Math.round((jobStats.v3 / jobStats.total) * 100) : 0;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">System Health</h1>
        <Badge variant={healthScore >= 80 ? "default" : healthScore >= 50 ? "secondary" : "destructive"}>
          {healthScore >= 80 ? "Healthy" : healthScore >= 50 ? "Degraded" : "Critical"}
        </Badge>
      </div>

      {healthScore < 80 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            System health is below optimal levels. Check agent connectivity and job execution rates.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Agent Health</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{healthScore}%</div>
            <p className="text-xs text-muted-foreground">
              {agentStats?.healthy} of {agentStats?.total} agents healthy
            </p>
            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                  Active
                </span>
                <span>{agentStats?.active}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3 text-yellow-500" />
                  Pending
                </span>
                <span>{agentStats?.pending}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="flex items-center gap-1">
                  <Activity className="h-3 w-3 text-gray-500" />
                  Inactive
                </span>
                <span>{agentStats?.inactive}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Jobs (24h)</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{jobStats?.total}</div>
            <p className="text-xs text-muted-foreground">
              {jobSuccessRate}% success rate
            </p>
            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                  Completed
                </span>
                <span>{jobStats?.completed}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 text-red-500" />
                  Failed
                </span>
                <span>{jobStats?.failed}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3 text-yellow-500" />
                  Pending
                </span>
                <span>{jobStats?.pending}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Jobs v3 Adoption</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{v3AdoptionRate}%</div>
            <p className="text-xs text-muted-foreground">
              {jobStats?.v3} of {jobStats?.total} jobs using v3
            </p>
            <div className="mt-4">
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all" 
                  style={{ width: `${v3AdoptionRate}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Job Test Runner */}
      <JobTestRunner />

      {performanceMetrics && performanceMetrics.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Slow Operations (Last 24h)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {performanceMetrics.map((metric) => (
                <div key={metric.name} className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="font-medium">{metric.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {metric.callCount} calls, {metric.errorCount} errors
                    </p>
                  </div>
                  <Badge variant={metric.avgDuration > 2000 ? "destructive" : "secondary"}>
                    {metric.avgDuration}ms avg
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
