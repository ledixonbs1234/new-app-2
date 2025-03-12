import { createRoot } from "react-dom/client"
import "../asserts/tailwind.css"
import Tabs from "./tabs";

function init() {

    const container = document.createElement('div')
    document.body.appendChild(container)
    if(!container){
        throw new Error('Can not find Container')
    }

    const root = createRoot(container)
    console.log(container)
    root.render(<Tabs/>)
}
init()