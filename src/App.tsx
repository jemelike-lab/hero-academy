import { Route, Routes } from 'react-router-dom';
import Home from './pages/Home';
import ClassTimePage from './features/class-time/ClassTimePage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/class-time" element={<ClassTimePage />} />
      <Route path="*" element={<Home />} />
    </Routes>
  );
}
