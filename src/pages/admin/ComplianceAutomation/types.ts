export interface FrameworkControl {
  id: string;
  framework: string;
  controlId: string;
  title: string;
  description: string;
  status: 'compliant' | 'partial' | 'non_compliant' | 'not_applicable';
  evidenceCount: number;
  lastChecked: Date;
  category: string;
}

export interface FrameworkDef {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

export interface ControlDef {
  id: string;
  title: string;
  category: string;
  desc: string;
}
