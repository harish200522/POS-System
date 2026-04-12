
  import { createRoot } from "react-dom/client";
  import { AuthProvider } from "./context/AuthContext";
  import App from "./app/App.tsx";
  import "./styles/index.css";

  createRoot(document.getElementById("root")!).render(
    <AuthProvider>
      <App />
    </AuthProvider>
  );