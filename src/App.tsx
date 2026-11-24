import { Route, Routes } from 'react-router-dom';
import Home from './pages/Home';
import ClassTimePage from './features/class-time/ClassTimePage';
import PathPage from './pages/PathPage';
import PlacementPage from './pages/PlacementPage';
import DigitTowerPage from './features/digit-tower/DigitTowerPage';
import TapToStart from './components/TapToStart';
import WordTowerPage from './features/word-tower/WordTowerPage';
import LetterLabPage from './features/letter-lab/LetterLabPage';
import CauldronPage from './features/cauldron/CauldronPage';
import StoryTimePage from './features/story-time/StoryTimePage';
import StoryLabPage from './features/story-lab/StoryLabPage';
import ParentWritingPage from './pages/ParentWritingPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/class-time" element={<><ClassTimePage /><TapToStart title="Class Time with Ms. Humphrey" label="Start class" /></>} />
      <Route path="/game-day" element={<><DigitTowerPage /><TapToStart title="Game Day with Ms. Humphrey" label="Let’s climb" /></>} />
      <Route path="/letter-lab" element={<><LetterLabPage /><TapToStart title="Letter Lab with Ms. Humphrey" label="Start writing" /></>} />
      <Route path="/story-lab" element={<><StoryLabPage /><TapToStart title="Story Lab with Ms. Humphrey" label="Let’s write" /></>} />
      <Route path="/story-time" element={<><StoryTimePage /><TapToStart title="Story Time with Ms. Humphrey" label="Start reading" /></>} />
      <Route path="/cauldron-cafe" element={<><CauldronPage /><TapToStart title="Cauldron Café with Ms. Humphrey" label="Start cooking" /></>} />
      <Route path="/word-tower" element={<><WordTowerPage /><TapToStart title="Word Tower with Ms. Humphrey" label="Start reading" /></>} />
      <Route path="/parent/writing" element={<ParentWritingPage />} />
      <Route path="/path" element={<PathPage />} />
      <Route path="/path/:subject" element={<PathPage />} />
      <Route path="/level-check/:subject" element={<PlacementPage />} />
      <Route path="*" element={<Home />} />
    </Routes>
  );
}
