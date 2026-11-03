import { House } from './house/House'
import Overlay from './Overlay'

// Tiny routing, no dependency: Pip's House window loads this page with the hash #/home (or #/home/<tab>).
function App(): React.JSX.Element {
  return /^#\/home(\/|$)/.test(location.hash) ? <House /> : <Overlay />
}

export default App
