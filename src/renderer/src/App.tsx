import Manual from './manual/Manual'
import Overlay from './Overlay'

// Tiny routing, no dependency: Pip's House window loads this page with the hash #/home.
function App(): React.JSX.Element {
  return location.hash === '#/home' ? <Manual /> : <Overlay />
}

export default App
