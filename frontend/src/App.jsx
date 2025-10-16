import React from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import { LayoutDashboard, UserPlus, Cubes, Link, KeyRound } from 'lucide-react';
import Dashboard from './components/Dashboard.jsx';
import CreatorRegistration from './components/CreatorRegistration.jsx';
import BlockCreation from './components/BlockCreation.jsx';
import BlockChain from './components/BlockChain.jsx';
import DataDecryption from './components/DataDecryption.jsx';

const navLinkClasses = "flex items-center px-3 py-2 text-gray-700 rounded-md hover:bg-gray-200 transition-colors";
const activeLinkClasses = "bg-blue-100 text-blue-700 font-semibold";

const navItems = [
  { path: "/", label: "Dashboard", icon: <LayoutDashboard className="h-5 w-5 mr-3" /> },
  { path: "/register", label: "Registra Creator", icon: <UserPlus className="h-5 w-5 mr-3" /> },
  { path: "/create-block", label: "Crea Blocco", icon: <Cubes className="h-5 w-5 mr-3" /> },
  { path: "/blockchain", label: "Blockchain", icon: <Link className="h-5 w-5 mr-3" /> },
  { path: "/decrypt", label: "Decifra Dati", icon: <KeyRound className="h-5 w-5 mr-3" /> }
];

function App() {
  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar Navigation */}
      <nav className="w-64 bg-white border-r border-gray-200 p-4 flex flex-col">
        <div className="mb-8">
          <h1 className="text-xl font-bold text-gray-900">Blockchain DB</h1>
          <p className="text-xs text-gray-500">Secure Data System</p>
        </div>
        <div className="space-y-2">
          {navItems.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              end
              className={({ isActive }) => `${navLinkClasses} ${isActive ? activeLinkClasses : ''}`}
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="container mx-auto p-6">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/register" element={<CreatorRegistration />} />
            <Route path="/create-block" element={<BlockCreation />} />
            <Route path="/blockchain" element={<BlockChain />} />
            <Route path="/decrypt" element={<DataDecryption />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

export default App;