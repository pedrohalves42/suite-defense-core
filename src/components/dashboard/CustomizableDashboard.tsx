import { useState, useCallback, useMemo } from "react";
import { ResponsiveReactGridLayout, WidthProvider } from "react-grid-layout/legacy";
import type { Layout, LayoutItem, ResponsiveLayouts } from "react-grid-layout/legacy";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GripVertical, Lock, Unlock, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

const ResponsiveGridLayout = WidthProvider(ResponsiveReactGridLayout);

interface DashboardWidget {
  id: string;
  title: string;
  component: React.ReactNode;
  defaultSize: { w: number; h: number };
  minW?: number;
  minH?: number;
}

interface CustomizableDashboardProps {
  widgets: DashboardWidget[];
  storageKey?: string;
}

const DEFAULT_COLS = { lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 };

function getDefaultLayouts(widgets: DashboardWidget[]): ResponsiveLayouts {
  let x = 0;
  let y = 0;
  const lgLayout: LayoutItem[] = widgets.map((w) => {
    const layout: LayoutItem = {
      i: w.id,
      x: x % 12,
      y,
      w: w.defaultSize.w,
      h: w.defaultSize.h,
      minW: w.minW || 3,
      minH: w.minH || 2,
    };
    x += w.defaultSize.w;
    if (x >= 12) {
      x = 0;
      y += w.defaultSize.h;
    }
    return layout;
  });

  return { lg: lgLayout };
}

export function CustomizableDashboard({ widgets, storageKey = "dashboard-layout" }: CustomizableDashboardProps) {
  const defaultLayouts = useMemo(() => getDefaultLayouts(widgets), [widgets]);

  const [layouts, setLayouts] = useState<ResponsiveLayouts>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : defaultLayouts;
    } catch {
      return defaultLayouts;
    }
  });

  const [isLocked, setIsLocked] = useState(true);

  const handleLayoutChange = useCallback((_: Layout, allLayouts: ResponsiveLayouts) => {
    setLayouts(allLayouts);
    try {
      localStorage.setItem(storageKey, JSON.stringify(allLayouts));
    } catch { /* ignore quota errors */ }
  }, [storageKey]);

  const resetLayout = useCallback(() => {
    setLayouts(defaultLayouts);
    localStorage.removeItem(storageKey);
  }, [defaultLayouts, storageKey]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsLocked(!isLocked)}
          className="gap-1.5"
        >
          {isLocked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
          {isLocked ? "Editar Layout" : "Bloquear"}
        </Button>
        {!isLocked && (
          <Button variant="ghost" size="sm" onClick={resetLayout} className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" />
            Resetar
          </Button>
        )}
      </div>

      <ResponsiveGridLayout
        className="layout"
        layouts={layouts}
        cols={DEFAULT_COLS}
        rowHeight={80}
        isDraggable={!isLocked}
        isResizable={!isLocked}
        onLayoutChange={handleLayoutChange}
        draggableHandle=".drag-handle"
        compactType="vertical"
        margin={[12, 12] as [number, number]}
      >
        {widgets.map((widget) => (
          <div key={widget.id}>
            <Card className={cn(
              "h-full overflow-hidden transition-shadow",
              !isLocked && "ring-1 ring-dashed ring-primary/30 hover:ring-primary/60"
            )}>
              <CardHeader className="pb-2 flex flex-row items-center gap-2">
                {!isLocked && (
                  <GripVertical className="drag-handle h-4 w-4 text-muted-foreground cursor-grab active:cursor-grabbing shrink-0" />
                )}
                <CardTitle className="text-sm font-medium">{widget.title}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 h-[calc(100%-3rem)] overflow-auto">
                {widget.component}
              </CardContent>
            </Card>
          </div>
        ))}
      </ResponsiveGridLayout>
    </div>
  );
}
