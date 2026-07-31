import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Desmonta o que cada teste renderizou — sem isso, componentes vazam entre
// casos e as queries do Testing Library encontram elementos de testes antigos.
afterEach(() => {
  cleanup();
});
