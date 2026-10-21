import { createRoot } from 'react-dom/client';
import { App } from './App';
import { attachTheme } from './theme';
import './styles.css';

attachTheme(document);
createRoot(document.getElementById('root')!).render(<App />);
