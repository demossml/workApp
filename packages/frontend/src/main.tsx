import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./shared/ui/tokens.css";
import App from "./App.tsx";
import { QueryClientProvider } from "@tanstack/react-query";
import { UserProvider } from "./hooks/userProvider.tsx";
import { BrowserRouter } from "react-router-dom";
import { queryClient } from "@shared/api";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <UserProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </UserProvider>
    </QueryClientProvider>
  </StrictMode>
);
