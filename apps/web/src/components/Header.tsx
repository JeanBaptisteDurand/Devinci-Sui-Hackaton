import { Link } from 'react-router-dom';
import { ConnectButton } from '@mysten/dapp-kit';
import { Button } from '@/components/ui/button';

export function Header() {
  return (
    <header className="border-b">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-8">
            <Link to="/" className="text-2xl font-bold text-primary">
              SuiLens
            </Link>
            <nav className="flex space-x-4">
              <Link to="/">
                <Button variant="ghost">Home</Button>
              </Link>
              <Link to="/history">
                <Button variant="ghost">History</Button>
              </Link>
              <Link to="/profile">
                <Button variant="ghost">Profile</Button>
              </Link>
            </nav>
          </div>
          <div>
            <ConnectButton />
          </div>
        </div>
      </div>
    </header>
  );
}

