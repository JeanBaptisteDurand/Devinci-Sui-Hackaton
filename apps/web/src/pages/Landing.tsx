import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Brain, Network, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';

const ROTATING_TEXTS = [
  "You could see the blockchain, now understand it.",
  "See Inside Every Package. Every module. Every type.",
  "SuiLens: AI-Powered Clarity for Sui Smart Contracts."
];

export function Landing() {
  const navigate = useNavigate();
  const [textIndex, setTextIndex] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setTextIndex((prev) => (prev + 1) % ROTATING_TEXTS.length);
        setFade(true);
      }, 500); // Wait for fade out before changing text
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Background effects */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />
      <div className="absolute h-full w-full bg-background [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black)]" />
      
      <div className="relative z-10 flex flex-col items-center max-w-5xl mx-auto text-center space-y-12">
        {/* Logo */}
        <div className="w-32 h-32 mb-8 animate-in fade-in zoom-in duration-1000">
          <img 
            src="/light_mode_logo.svg" 
            alt="SuiLens Logo" 
            className="w-full h-full object-contain dark:hidden" 
          />
          <img 
            src="/dark_mode_logo.svg" 
            alt="SuiLens Logo" 
            className="w-full h-full object-contain hidden dark:block" 
          />
        </div>

        {/* Main Rotating Text */}
        <div className="h-32 flex items-center justify-center">
          <h1 
            className={`text-4xl md:text-6xl font-bold font-brand bg-clip-text text-transparent bg-gradient-to-r from-foreground to-muted-foreground transition-opacity duration-500 ease-in-out ${
              fade ? 'opacity-100' : 'opacity-0'
            }`}
          >
            {ROTATING_TEXTS[textIndex]}
          </h1>
        </div>

        {/* Subtext */}
        <p className="text-xl text-muted-foreground font-sans max-w-2xl mx-auto animate-in slide-in-from-bottom-4 fade-in duration-1000 delay-300">
          Start exploring any package right now. Understand what happens in the blockchain.
        </p>

        {/* CTA Button */}
        <div className="animate-in slide-in-from-bottom-4 fade-in duration-1000 delay-500">
          <Button 
            size="lg" 
            onClick={() => navigate('/home')}
            className="text-lg px-8 py-6 rounded-full shadow-[0_0_15px_rgba(77,162,255,0.5)] hover:shadow-[0_0_25px_rgba(77,162,255,0.7)] transition-all duration-300 bg-primary text-primary-foreground hover:bg-primary/90 font-brand font-medium"
          >
            Start analyzing
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </div>

        {/* Features Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-16 w-full animate-in slide-in-from-bottom-8 fade-in duration-1000 delay-700">
          <div className="flex flex-col items-center space-y-4 p-6 rounded-2xl bg-card/50 border border-border backdrop-blur-sm hover:bg-card/80 transition-colors">
            <div className="p-3 rounded-full bg-primary/10 text-primary">
              <Search className="h-8 w-8" />
            </div>
            <h3 className="text-xl font-semibold font-brand">Deep Inspection</h3>
            <p className="text-sm text-muted-foreground font-sans">
              Analyze package structures, modules, and types with unprecedented depth.
            </p>
          </div>

          <div className="flex flex-col items-center space-y-4 p-6 rounded-2xl bg-card/50 border border-border backdrop-blur-sm hover:bg-card/80 transition-colors">
            <div className="p-3 rounded-full bg-primary/10 text-primary">
              <Network className="h-8 w-8" />
            </div>
            <h3 className="text-xl font-semibold font-brand">Visual Graph</h3>
            <p className="text-sm text-muted-foreground font-sans">
              Visualize complex relationships between objects and transactions interactively.
            </p>
          </div>

          <div className="flex flex-col items-center space-y-4 p-6 rounded-2xl bg-card/50 border border-border backdrop-blur-sm hover:bg-card/80 transition-colors">
            <div className="p-3 rounded-full bg-primary/10 text-primary">
              <Brain className="h-8 w-8" />
            </div>
            <h3 className="text-xl font-semibold font-brand">AI Insights</h3>
            <p className="text-sm text-muted-foreground font-sans">
              Get instant, AI-powered explanations for any part of the smart contract.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}