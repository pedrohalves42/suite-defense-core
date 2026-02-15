import { LANDING_CONTENT } from "@/constants/landing-content";

export function FeaturesSection() {
  const { features } = LANDING_CONTENT;

  return (
    <section className="py-20 bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Features List */}
          <div className="space-y-6 animate-fade-in">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground">{features.title}</h2>
            <p className="text-lg text-muted-foreground">{features.subtitle}</p>

            <div className="grid gap-3">
              {features.items.map((item, index) => {
                const Icon = item.icon;
                return (
                  <div 
                    key={index}
                    className="flex gap-4 p-4 rounded-xl bg-card border border-border hover:border-accent/30 transition-colors"
                  >
                    <div className="shrink-0 w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center">
                      <Icon className="w-5 h-5 text-accent" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-base mb-1">{item.title}</h3>
                      <p className="text-sm text-muted-foreground">{item.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Dashboard Preview */}
          <div className="animate-fade-in">
            <div className="card-enterprise p-6 rounded-xl">
              <div className="space-y-3">
                {features.dashboard.stats.map((stat, index) => (
                  <div 
                    key={index}
                    className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border border-border"
                  >
                    <span className="font-medium text-sm">{stat.label}</span>
                    <span className="text-xl font-bold text-foreground">
                      {stat.value}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between p-4 bg-success/10 rounded-lg border border-success/20">
                  <span className="font-medium text-sm">{features.dashboard.status.label}</span>
                  <span className="text-base font-bold text-success">
                    {features.dashboard.status.value}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
