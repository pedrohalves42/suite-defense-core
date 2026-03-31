import React from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export const LoadingState: React.FC = () => (
  <div className="min-h-screen bg-background flex items-center justify-center p-4">
    <Card className="w-full max-w-2xl">
      <CardHeader className="text-center">
        <Skeleton className="h-16 w-16 rounded-full mx-auto mb-4" />
        <Skeleton className="h-8 w-48 mx-auto mb-2" />
        <Skeleton className="h-4 w-64 mx-auto" />
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-12 w-full" />
      </CardContent>
    </Card>
  </div>
);
