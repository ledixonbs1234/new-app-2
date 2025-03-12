import { createRoot } from "react-dom/client";
import Popup from "./Popup";
import { store } from "./store";
import {Provider} from 'react-redux'

const App = () => {
  const container = document.createElement("div");

  document.body.appendChild(container);
  if (!container) {
    throw new Error("Can not find Container");
  }
  const root = createRoot(container);

  root.render(
      <Provider store={store}>
        <Popup />
      </Provider>
  );
};
export default App();
