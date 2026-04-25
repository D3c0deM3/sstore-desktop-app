import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { installDesktopApiBridge } from "./desktop/localApiBridge";

installDesktopApiBridge();

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
