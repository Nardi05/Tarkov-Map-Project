import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import FillNotice from "./components/FillNotice";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <FillNotice />
  </StrictMode>,
);
