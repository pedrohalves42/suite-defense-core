import { LANDING_CONTENT } from "@/constants/landing-content";

export function FeaturesSection() {
  const { features } = LANDING_CONTENT;

  return (
    <section className="py-20 bg-muted/30 relative overflow-hidden">
      <div className="absolute top-10 left-10 w-96 h-96 bg-primary/10 rounded-full blur-3xl opacity-50" />
      <div className="absolute bottom-10 right-10 w-96 h-96 bg-accent/10 rounded-full blur-3xl opacity-50" />
      
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Features List */}
          <div className="space-y-6 animate-fade-in">
            <h2 className="text-3xl md:text-4xl font-bold">{features.title}</h2>
            <p className="text-xl text-muted-foreground">{features.subtitle}</p>

            <div className="grid gap-4">
              {features.items.map((item, index) => {
                const Icon = item.icon;
                return (
                  <div 
                    key={index}
                    className="group flex gap-4 p-4 rounded-xl bg-card/50 backdrop-blur-sm border border-border/50 hover:border-primary/50 transition-all hover:scale-105"
                  >
                    <div className="shrink-0 w-12 h-12 bg-gradient-to-br from-primary/20 to-accent/20 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Icon className="w-6 h-6 text-primary group-hover:rotate-12 transition-transform" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg mb-2">{item.title}</h3>
                      <p className="text-muted-foreground">{item.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Dashboard Preview */}
          <div className="relative animate-fade-in">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-accent/20 rounded-3xl blur-3xl opacity-50" />
            <div className="relative bg-gradient-to-br from-card/80 to-card/40 backdrop-blur-xl p-8 rounded-2xl border border-primary/20 shadow-glow-primary">
              <div className="space-y-4">
                {features.dashboard.stats.map((stat, index) => (
                  <div 
                    key={index}
                    className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border border-border/50 hover:border-primary/50 transition-all hover:scale-105"
                  >
                    <span className="font-medium">{stat.label}</span>
                    <span className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                      {stat.value}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between p-4 bg-green-500/10 rounded-lg border border-green-500/30 hover:border-green-500/50 transition-all hover:scale-105">
                  <span className="font-medium">{features.dashboard.status.label}</span>
                  <span className="text-lg font-bold text-green-500">
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
