import React from "react";
import ReactDOM from "react-dom/client";
import SidePanel from "./SidePanel";
import "./sidepanel.css";
import "../asserts/tailwind.css";

const root = document.createElement("div");
root.id = "sidepanel-root";
document.body.appendChild(root);

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <SidePanel />
  </React.StrictMode>
);
