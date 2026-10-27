import { Route, Routes } from 'react-router-dom';
import Home from './pages/Home';
import ClassTimePage from './features/class-time/ClassTimePage';
import PathPage from './pages/PathPage';
import PlacementPage from './pages/PlacementPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/class-time" element={<ClassTimePage />} />
      <Route path="/path" element={<PathPage />} />
      <Route path="/path/:subject" element={<PathPage />} />
      <Route path="/level-check/:subject" element={<PlacementPage />} />
      <Route path="*" element={<Home />} />
    </Routes>
  );
}
