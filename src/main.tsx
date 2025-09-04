// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./index.css";

import BookingPage from "./BookingPage";
import ProviderDashboardPage from "./pages/ProviderDashboardPage";
import SignUpPage from "./pages/SignUpPage";
import SignInPage from "./pages/SignInPage";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<BookingPage />} />
        <Route path="/sign-up" element={<SignUpPage />} />
        <Route path="/sign-in" element={<SignInPage />} />  
        <Route path="/dashboard" element={<ProviderDashboardPage />} />
        <Route path="/:subdomain" element={<BookingPage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
