import { Link } from 'react-router-dom';
import { ConnectButton } from '@mysten/dapp-kit';
import { Button } from '@/components/ui/button';
import { ModeToggle } from './mode-toggle';

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 dark:bg-background/90 dark:supports-[backdrop-filter]:bg-background/80">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-8">
            <Link to="/" className="flex items-center space-x-2">
              <div className="h-8 w-8">
                <img 
                  src="/light_mode_logo.svg" 
                  alt="SuiLens Logo" 
                  className="h-full w-full object-contain dark:hidden" 
                />
                <img 
                  src="/dark_mode_logo.svg" 
                  alt="SuiLens Logo" 
                  className="h-full w-full object-contain hidden dark:block" 
                />
              </div>
              <span className="text-xl font-bold font-brand text-foreground">
                SuiLens
              </span>
            </Link>
            <nav className="flex space-x-4">
              <Link to="/home">
                <Button variant="ghost" className="font-sans">Home</Button>
              </Link>
              <Link to="/history">
                <Button variant="ghost" className="font-sans">History</Button>
              </Link>
              <Link to="/profile">
                <Button variant="ghost" className="font-sans">Profile</Button>
              </Link>
            </nav>
          </div>
          <div className="flex items-center space-x-4">
            <ModeToggle />
            <ConnectButton />
          </div>
        </div>
      </div>
    </header>
  );
}

