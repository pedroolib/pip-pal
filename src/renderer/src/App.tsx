import { House } from './house/House'
import { CornerPip } from './corner/CornerPip'
import Overlay from './Overlay'

// Tiny routing, no dependency: Pip's House window loads this page with the hash #/home (or #/home/<tab>),
// the corner Pip's window with #/corner.
function App(): React.JSX.Element {
  if (/^#\/home(\/|$)/.test(location.hash)) return <House />
  return location.hash === '#/corner' ? <CornerPip /> : <Overlay />
}

export default App
