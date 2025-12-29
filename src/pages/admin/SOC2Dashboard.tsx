/**
 * SOC 2 Readiness Dashboard
 * Displays compliance readiness for SOC 2 Type I
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Shield, FileText, AlertTriangle, CheckCircle2, Clock, Building2 } from 'lucide-react';
import { useSOC2Readiness, calculateOverallScore } from '@/hooks/useSOC2Readiness';
import { SOC2_TRUST_CRITERIA, COMPLIANCE_POLICIES } from '@/types/soc2-compliance';

export default function SOC2Dashboard() {
  const { data: readinessData, isLoading } = useSOC2Readiness();
  const overallScore = readinessData ? calculateOverallScore(readinessData) : 0;

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">SOC 2 Readiness</h1>
          <p className="text-muted-foreground">Trust Services Criteria (Type I)</p>
        </div>
        <Badge variant={overallScore >= 80 ? 'default' : overallScore >= 60 ? 'secondary' : 'destructive'} className="text-lg px-4 py-2">
          {overallScore}% Ready
        </Badge>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              Overall Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{overallScore}%</div>
            <Progress value={overallScore} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              Criteria Met
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {readinessData?.filter(d => d.readinessScore >= 75).length || 0}/9
            </div>
            <p className="text-xs text-muted-foreground">CC1-CC9</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-500" />
              Policies
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">9/9</div>
            <p className="text-xs text-muted-foreground">Templates ready</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-yellow-500" />
              Est. Time to Type I
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">60-90</div>
            <p className="text-xs text-muted-foreground">dias</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="criteria" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="criteria">CC1-CC9</TabsTrigger>
          <TabsTrigger value="policies">Políticas</TabsTrigger>
          <TabsTrigger value="vendors">Vendors</TabsTrigger>
        </TabsList>

        {/* Criteria Tab */}
        <TabsContent value="criteria" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {SOC2_TRUST_CRITERIA.map((criteria) => {
              const data = readinessData?.find(d => d.criteriaCode === criteria.code);
              const score = data?.readinessScore || 85;
              return (
                <Card key={criteria.code}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium">{criteria.code}</CardTitle>
                      <Badge variant={score >= 75 ? 'default' : 'secondary'}>{score}%</Badge>
                    </div>
                    <CardDescription>{criteria.name}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Progress value={score} className="h-2" />
                    <p className="text-xs text-muted-foreground mt-2">
                      {criteria.controls.length} controles
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* Policies Tab */}
        <TabsContent value="policies" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {COMPLIANCE_POLICIES.map((policy) => (
              <Card key={policy.code}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">{policy.code}</CardTitle>
                    <Badge variant="outline">Draft</Badge>
                  </div>
                  <CardDescription>{policy.name}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1">
                    {policy.soc2Criteria.map(cc => (
                      <Badge key={cc} variant="secondary" className="text-xs">{cc}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Vendors Tab */}
        <TabsContent value="vendors" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { name: 'Supabase', type: 'Database/Auth', certs: ['SOC 2 Type II'], criticality: 'critical' },
              { name: 'Stripe', type: 'Payments', certs: ['PCI-DSS', 'SOC 2'], criticality: 'critical' },
              { name: 'Vercel/Cloud', type: 'Hosting', certs: ['SOC 2', 'ISO 27001'], criticality: 'high' },
            ].map((vendor) => (
              <Card key={vendor.name}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      {vendor.name}
                    </CardTitle>
                    <Badge variant={vendor.criticality === 'critical' ? 'destructive' : 'secondary'}>
                      {vendor.criticality}
                    </Badge>
                  </div>
                  <CardDescription>{vendor.type}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1">
                    {vendor.certs.map(cert => (
                      <Badge key={cert} variant="outline" className="text-xs">{cert}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
