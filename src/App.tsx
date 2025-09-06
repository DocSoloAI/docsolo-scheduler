// src/App.tsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import BookTheVisitLanding from "./pages/BookTheVisitLanding";
import Scheduler from "./pages/Scheduler";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Landing page at root */}
        <Route path="/" element={<BookTheVisitLanding />} />

        {/* Scheduler (what you had before, moved into its own page) */}
        <Route path="/scheduler" element={<Scheduler />} />
      </Routes>
    </BrowserRouter>
  );
}
