import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

// StrictMode는 effect를 두 번 실행해 학습 세션 행이 중복 생성되므로 쓰지 않는다
createRoot(document.getElementById('root')!).render(<App />);
