import { useState, useEffect } from "react";
import { Shield, Activity, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5080";

interface Report {
  id: string;
  kind: string;
  createdUtc: string;
  file: string;
}

interface ApiStatus {
  ok: boolean;
  name: string;
  now: string;
}

const Index = () => {
  const [apiStatus, setApiStatus] = useState<"loading" | "online" | "offline">("loading");
  const [apiInfo, setApiInfo] = useState<ApiStatus | null>(null);
  const [agentName, setAgentName] = useState("AGENT-01");
  const [agentToken, setAgentToken] = useState("");
  const [reports, setReports] = useState<Report[]>([]);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [isCreatingJob, setIsCreatingJob] = useState<string | null>(null);

  useEffect(() => {
    checkApiStatus();
    const interval = setInterval(checkApiStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const checkApiStatus = async () => {
    try {
      const res = await fetch(`${API_URL}/`);
      const data = await res.json();
      setApiInfo(data);
      setApiStatus("online");
    } catch {
      setApiStatus("offline");
      setApiInfo(null);
    }
  };

  const enrollAgent = async () => {
    if (!agentName.trim()) {
      toast.error("Agent name is required");
      return;
    }

    setIsEnrolling(true);
    try {
      const res = await fetch(`${API_URL}/v1/agents/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: "dev",
          enrollmentKey: "DEV-KEY-123",
          agentName: agentName.trim(),
        }),
      });

      if (!res.ok) throw new Error("Enrollment failed");

      const data = await res.json();
      setAgentToken(data.agentToken);
      toast.success("Agent enrolled successfully");
    } catch (error) {
      toast.error("Failed to enroll agent");
    } finally {
      setIsEnrolling(false);
    }
  };

  const createJob = async (type: string, label: string) => {
    setIsCreatingJob(type);
    try {
      const res = await fetch(`${API_URL}/v1/admin/jobs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Secret": "DEV-ADMIN",
        },
        body: JSON.stringify({
          agentName: agentName.trim(),
          type,
          approved: true,
        }),
      });

      if (!res.ok) throw new Error("Job creation failed");

      toast.success(`Job created: ${label}`);
    } catch (error) {
      toast.error(`Failed to create job: ${label}`);
    } finally {
      setIsCreatingJob(null);
    }
  };

  const loadReports = async () => {
    if (!agentToken) {
      toast.error("Enroll an agent first to view reports");
      return;
    }

    try {
      const res = await fetch(`${API_URL}/v1/reports`, {
        headers: { "X-Agent-Token": agentToken },
      });

      if (!res.ok) throw new Error("Failed to load reports");

      const data = await res.json();
      setReports(data);
      toast.success(`Loaded ${data.length} reports`);
    } catch (error) {
      toast.error("Failed to load reports");
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-cyber rounded-xl border border-primary/20 shadow-glow-primary">
              <Shield className="h-8 w-8 text-primary animate-pulse-glow" />
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                CyberShield Panel
              </h1>
              <p className="text-sm text-muted-foreground">Security Operations Dashboard</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Activity className={`h-4 w-4 ${apiStatus === "online" ? "text-success animate-pulse" : "text-destructive"}`} />
            <Badge variant={apiStatus === "online" ? "default" : "destructive"} className="font-mono">
              {apiStatus === "loading" ? "Checking..." : apiStatus === "online" ? "API Online" : "API Offline"}
            </Badge>
          </div>
        </div>

        {/* Status Card */}
        {apiInfo && (
          <Card className="bg-gradient-card border-primary/20 animate-slide-in">
            <CardHeader>
              <CardTitle className="text-primary flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5" />
                System Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Service</p>
                  <p className="font-mono text-foreground">{apiInfo.name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Server Time</p>
                  <p className="font-mono text-foreground">{new Date(apiInfo.now).toLocaleTimeString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Endpoint</p>
                  <p className="font-mono text-foreground text-xs">{API_URL}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Agent Enrollment */}
        <Card className="bg-gradient-card border-primary/20 animate-slide-in">
          <CardHeader>
            <CardTitle className="text-foreground">Agent Enrollment</CardTitle>
            <CardDescription>Register a new security agent to the platform</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-3">
              <Input
                placeholder="Enter agent name (e.g., AGENT-01)"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                className="bg-secondary border-border text-foreground"
              />
              <Button onClick={enrollAgent} disabled={isEnrolling || apiStatus !== "online"}>
                {isEnrolling ? "Enrolling..." : "Enroll Agent"}
              </Button>
            </div>

            {agentToken && (
              <div className="space-y-2 p-4 bg-secondary/50 rounded-lg border border-accent/20">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  <p className="text-sm font-semibold text-success">Agent Token Generated</p>
                </div>
                <code className="block text-xs font-mono break-all text-muted-foreground bg-background/50 p-2 rounded">
                  {agentToken}
                </code>
                <p className="text-xs text-muted-foreground">
                  Configure this token in your agent's config file to establish connection.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Job Control */}
        <Card className="bg-gradient-card border-primary/20 animate-slide-in">
          <CardHeader>
            <CardTitle className="text-foreground">Security Operations</CardTitle>
            <CardDescription>Execute security scans and remediation tasks</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Button
                variant="outline"
                className="h-auto flex-col items-start p-4 bg-secondary/50 hover:bg-secondary border-border hover:border-primary/50 transition-all"
                onClick={() => createJob("local_checks", "Local Security Checks")}
                disabled={isCreatingJob !== null || apiStatus !== "online"}
              >
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <span className="font-semibold">Local Checks</span>
                </div>
                <span className="text-xs text-muted-foreground text-left">
                  Firewall, SMBv1, RDP NLA, Windows Update status
                </span>
              </Button>

              <Button
                variant="outline"
                className="h-auto flex-col items-start p-4 bg-secondary/50 hover:bg-secondary border-border hover:border-warning/50 transition-all"
                onClick={() => createJob("scan_nmap", "Network Scan (Nmap)")}
                disabled={isCreatingJob !== null || apiStatus !== "online"}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Activity className="h-4 w-4 text-warning" />
                  <span className="font-semibold">Nmap Scan</span>
                </div>
                <span className="text-xs text-muted-foreground text-left">
                  Network discovery and service detection
                </span>
              </Button>

              <Button
                variant="outline"
                className="h-auto flex-col items-start p-4 bg-secondary/50 hover:bg-secondary border-border hover:border-destructive/50 transition-all"
                onClick={() => createJob("remediate_standard", "Standard Remediation")}
                disabled={isCreatingJob !== null || apiStatus !== "online"}
              >
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <span className="font-semibold">Auto Remediate</span>
                </div>
                <span className="text-xs text-muted-foreground text-left">
                  Enable firewall, disable SMBv1, configure RDP NLA
                </span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Reports */}
        <Card className="bg-gradient-card border-primary/20 animate-slide-in">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-foreground">Security Reports</CardTitle>
              <CardDescription>View generated security reports and scan results</CardDescription>
            </div>
            <Button onClick={loadReports} variant="secondary" size="sm" disabled={!agentToken}>
              Refresh Reports
            </Button>
          </CardHeader>
          <CardContent>
            {!agentToken ? (
              <div className="text-center py-8 text-muted-foreground">
                <AlertTriangle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Enroll an agent to view reports</p>
              </div>
            ) : reports.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No reports available. Create and execute jobs to generate reports.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {reports.map((report) => (
                  <div
                    key={report.id}
                    className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg border border-border hover:border-primary/30 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-mono text-xs">
                          {report.kind}
                        </Badge>
                        <span className="text-sm font-mono text-foreground">{report.file}</span>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(report.createdUtc + "Z").toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Index;
