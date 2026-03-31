import React from 'react';
import { FileText, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ExecutiveSummary } from './types';
import { getHighlightIcon, getStatusColor } from './helpers';

interface ExecutiveSummaryCardProps {
  summary: ExecutiveSummary;
}

export const ExecutiveSummaryCard: React.FC<ExecutiveSummaryCardProps> = ({ summary }) => (
  <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2 text-lg">
        <FileText className="h-5 w-5" />
        {summary.title || 'Resumo Executivo'}
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      <p className="text-sm">{summary.overallMessage}</p>

      {summary.highlights && summary.highlights.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {summary.highlights.map((highlight, idx) => (
            <div key={idx} className={`rounded-lg p-3 ${getStatusColor(highlight.status)}`}>
              <div className="flex items-center gap-2 mb-1">
                {getHighlightIcon(highlight.icon)}
                <span className="text-xs font-medium">{highlight.label}</span>
              </div>
              <p className="text-lg font-bold">{highlight.value}</p>
            </div>
          ))}
        </div>
      )}

      {summary.recommendations && summary.recommendations.length > 0 && (
        <div className="bg-muted/50 rounded-lg p-4">
          <h4 className="font-medium mb-2 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            Recomendações
          </h4>
          <ul className="space-y-1">
            {summary.recommendations.map((rec, idx) => (
              <li key={idx} className="text-sm flex items-start gap-2">
                <span className="text-muted-foreground">•</span>
                {rec}
              </li>
            ))}
          </ul>
        </div>
      )}
    </CardContent>
  </Card>
);
