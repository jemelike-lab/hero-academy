import { Route, Routes } from 'react-router-dom';
import Home from './pages/Home';
import ClassTimePage from './features/class-time/ClassTimePage';
import PathPage from './pages/PathPage';
import PlacementPage from './pages/PlacementPage';
import DigitTowerPage from './features/digit-tower/DigitTowerPage';
import TapToStart from './components/TapToStart';
import WordTowerPage from './features/word-tower/WordTowerPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/class-time" element={<><ClassTimePage /><TapToStart title="Class Time with Ms. Humphrey" label="Start class" /></>} />
      <Route path="/game-day" element={<><DigitTowerPage /><TapToStart title="Game Day with Ms. Humphrey" label="Let’s climb" /></>} />
      <Route path="/word-tower" element={<><WordTowerPage /><TapToStart title="Word Tower with Ms. Humphrey" label="Start reading" /></>} />
      <Route path="/path" element={<PathPage />} />
      <Route path="/path/:subject" element={<PathPage />} />
      <Route path="/level-check/:subject" element={<PlacementPage />} />
      <Route path="*" element={<Home />} />
    </Routes>
  );
}
