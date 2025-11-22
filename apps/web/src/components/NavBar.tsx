import { Link } from 'react-router-dom';

export default function NavBar() {
  return (
    <nav className="bg-gray-800 text-white p-4 shadow-lg">
      <div className="container mx-auto flex items-center justify-between">
        <Link to="/" className="text-xl font-bold hover:text-gray-300">
          Sui Package Visualizer
        </Link>
        <div className="flex gap-4">
          <Link
            to="/"
            className="hover:text-gray-300 transition-colors"
          >
            Home
          </Link>
          <Link
            to="/history"
            className="hover:text-gray-300 transition-colors"
          >
            History
          </Link>
        </div>
      </div>
    </nav>
  );
}

