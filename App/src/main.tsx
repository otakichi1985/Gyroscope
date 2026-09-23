import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/index.css";
import "./styles/foundation.css";
import "./styles/timeline.css";
import "./styles/theme.css";
import "./styles/skins/floating.css";
import "./styles/skins/cardinality.css";
import "./styles/skins/ordinary.css";
import "./styles/skins/screen-transitions.css";
import "./styles/skins/motion.css";
import "./styles/skins/terminal.css";
import "./styles/reader.css";
import "./styles/motion-preferences.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
