# Stock Sense AI Frontend - Setup Guide

Complete setup instructions for the React + TypeScript frontend.

## Quick Start

```bash
# 1. Navigate to frontend directory
cd /home/kopacz/stock-sense-ai/web/frontend

# 2. Install dependencies
npm install

# 3. Start development server
npm run dev
```

The application will be available at http://localhost:3000

## Detailed Setup

### Step 1: Install Dependencies

The project requires the following dependencies:

**Core Dependencies:**
- react@^18.3.1
- react-dom@^18.3.1
- react-router-dom@^6.26.0

**State Management:**
- zustand@^4.5.0
- @tanstack/react-query@^5.51.0

**Real-time:**
- socket.io-client@^4.7.4

**UI & Styling:**
- tailwindcss@^3.4.4
- framer-motion@^11.5.0
- clsx@^2.1.1

**Charts:**
- chart.js@^4.4.0
- react-chartjs-2@^5.2.0
- chartjs-adapter-date-fns@^3.0.0

**Notifications:**
- react-hot-toast@^2.4.1

Install all dependencies:

```bash
npm install
```

### Step 2: Environment Configuration

The frontend proxies API requests to the backend. Make sure:

1. Backend server is running on port 3001
2. Vite dev server runs on port 3000
3. Socket.IO connections are proxied correctly

### Step 3: Start Development Server

```bash
npm run dev
```

This will:
- Start Vite development server on port 3000
- Enable Hot Module Replacement (HMR)
- Proxy API calls to http://localhost:3001
- Proxy Socket.IO connections

### Step 4: Verify Setup

1. Open http://localhost:3000 in your browser
2. You should see the Stock Sense AI dashboard
3. Check the connection status indicator (top-right)
4. Test tab navigation (Monitoring, Discovery, Analysis, Market)

## Project Structure Explained

```
web/frontend/
├── src/
│   ├── components/       # Reusable components
│   │   ├── ui/          # Base UI components
│   │   │   ├── Button.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Select.tsx
│   │   │   ├── Badge.tsx
│   │   │   ├── Tabs.tsx
│   │   │   ├── LoadingSpinner.tsx
│   │   │   ├── StatusIndicator.tsx
│   │   │   └── index.ts        # Export barrel
│   │   ├── charts/              # Chart components
│   │   │   └── PerformanceChart.tsx
│   │   ├── opportunities/       # Trading components
│   │   │   └── OpportunityCard.tsx
│   │   └── layout/              # Layout components
│   │       ├── Header.tsx
│   │       └── Layout.tsx
│   ├── pages/                   # Page components
│   │   ├── MonitoringPage.tsx
│   │   ├── DiscoveryPage.tsx
│   │   ├── AnalysisPage.tsx
│   │   └── MarketPage.tsx
│   ├── hooks/                   # Custom hooks
│   │   └── useSocket.ts
│   ├── stores/                  # Zustand stores
│   │   ├── useTradingStore.ts
│   │   └── useUIStore.ts
│   ├── services/                # API services
│   │   └── api.ts
│   ├── types/                   # TypeScript types
│   │   └── trading.ts
│   ├── utils/                   # Utilities
│   │   ├── cn.ts
│   │   └── formatters.ts
│   ├── styles/                  # Global styles
│   │   └── index.css
│   ├── App.tsx                  # Main app component
│   └── main.tsx                 # Entry point
├── public/                      # Static assets
├── index.html                   # HTML template
├── package.json                 # Dependencies
├── tsconfig.json               # TypeScript config
├── tsconfig.app.json           # App TS config
├── vite.config.ts              # Vite config
├── tailwind.config.ts          # Tailwind config
├── postcss.config.js           # PostCSS config
└── README.md                   # Documentation
```

## Development Workflow

### Making Changes

1. **Add New Component:**
   ```bash
   # Create component file
   touch src/components/ui/NewComponent.tsx

   # Export from barrel file
   # Edit src/components/ui/index.ts
   ```

2. **Add New Page:**
   ```bash
   # Create page file
   touch src/pages/NewPage.tsx

   # Add to App.tsx routing
   ```

3. **Add New API Endpoint:**
   ```typescript
   // Edit src/services/api.ts
   async newEndpoint(): Promise<ResponseType> {
     const response = await fetch(`${API_BASE}/new-endpoint`);
     return handleResponse(response);
   }
   ```

### Building for Production

```bash
# Create optimized production build
npm run build

# Output will be in dist/ directory
# Preview production build
npm run preview
```

### Running Linter

```bash
# Check for issues
npm run lint

# Auto-fix issues (if available)
npm run lint -- --fix
```

## TypeScript Configuration

The project uses strict TypeScript configuration:

**Enabled Strict Flags:**
- `strict: true`
- `noImplicitAny: true`
- `strictNullChecks: true`
- `strictFunctionTypes: true`
- `strictBindCallApply: true`
- `strictPropertyInitialization: true`
- `noImplicitThis: true`
- `alwaysStrict: true`
- `noUncheckedIndexedAccess: true`
- `noImplicitReturns: true`
- `noFallthroughCasesInSwitch: true`

**Path Mapping:**
```json
{
  "@/*": ["./src/*"]
}
```

Usage:
```typescript
import { Button } from '@/components/ui';
import { useTradingStore } from '@/stores/useTradingStore';
```

## Tailwind CSS Setup

### Custom Theme

The project uses a custom glassmorphic dark theme:

**Colors:**
- Dark backgrounds: `dark-bg`, `dark-bg-secondary`
- Surfaces: `dark-surface`, `dark-surface-hover`
- Borders: `dark-border`, `dark-border-hover`
- Primary: Blue gradient
- Success: Green gradient
- Danger: Red gradient
- Warning: Orange gradient

**Usage:**
```tsx
<div className="bg-dark-surface border border-dark-border rounded-xl">
  <button className="bg-primary-500 hover:bg-primary-600">
    Click me
  </button>
</div>
```

### Custom Utilities

**Scrollbars:**
```tsx
<div className="scrollbar-thin scrollbar-thumb-primary-500/40">
  {/* Scrollable content */}
</div>
```

**Animations:**
```tsx
<div className="animate-fade-in">
  {/* Fades in */}
</div>
```

## Socket.IO Integration

The application uses Socket.IO for real-time updates:

**Connection:**
```typescript
// Automatically handled by useSocket hook
// Just use the hook in your component
useSocket();
```

**Events:**
- `connect` - Connection established
- `disconnect` - Connection lost
- `update` - Dashboard data update
- `refresh` - Request data refresh

**Store Updates:**
```typescript
// Updates are automatically handled by useTradingStore
const { stats, overview, opportunities } = useTradingStore();
```

## State Management

### Zustand Stores

**Trading Store:**
```typescript
import { useTradingStore } from '@/stores/useTradingStore';

function MyComponent() {
  const { stats, opportunities, setStats } = useTradingStore();

  // Use state and actions
}
```

**UI Store:**
```typescript
import { useUIStore } from '@/stores/useUIStore';

function MyComponent() {
  const { activeTab, setActiveTab } = useUIStore();

  // Use state and actions
}
```

## Troubleshooting

### Common Issues

**1. Port 3000 already in use:**
```bash
# Find and kill process using port 3000
lsof -ti:3000 | xargs kill -9

# Or change port in vite.config.ts
```

**2. Backend connection fails:**
- Verify backend is running on port 3001
- Check proxy configuration in vite.config.ts
- Ensure no CORS issues

**3. TypeScript errors:**
```bash
# Clear TypeScript cache
rm -rf node_modules/.cache

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

**4. Build fails:**
```bash
# Check for TypeScript errors
npx tsc --noEmit

# Clean build directory
rm -rf dist
npm run build
```

### Performance Issues

**Slow dev server:**
- Clear node_modules and reinstall
- Check for circular dependencies
- Reduce bundle size by code splitting

**Large bundle size:**
- Check bundle analyzer
- Implement lazy loading
- Review dependencies

## Best Practices

### Component Development

1. **Always use TypeScript:**
   ```typescript
   // Good
   interface Props {
     title: string;
     onClick: () => void;
   }

   export function MyComponent({ title, onClick }: Props) {
     // ...
   }

   // Bad
   export function MyComponent({ title, onClick }: any) {
     // ...
   }
   ```

2. **Use proper prop types:**
   ```typescript
   // Good
   export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
     variant?: 'primary' | 'success';
     loading?: boolean;
   }

   // Bad
   export interface ButtonProps {
     [key: string]: any;
   }
   ```

3. **Implement error boundaries:**
   ```typescript
   try {
     await api.someCall();
   } catch (error) {
     toast.error('Operation failed');
   }
   ```

### Performance

1. **Memoize expensive computations:**
   ```typescript
   const data = useMemo(() => expensiveCalculation(), [deps]);
   ```

2. **Use React.memo for components:**
   ```typescript
   export const MyComponent = memo(function MyComponent(props: Props) {
     // ...
   });
   ```

3. **Lazy load routes:**
   ```typescript
   const AnalysisPage = lazy(() => import('./pages/AnalysisPage'));
   ```

## Further Reading

- [React Documentation](https://react.dev)
- [TypeScript Documentation](https://www.typescriptlang.org/docs)
- [Vite Documentation](https://vitejs.dev)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Zustand Documentation](https://zustand-demo.pmnd.rs)
- [TanStack Query Documentation](https://tanstack.com/query)

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review the main README.md
3. Check TypeScript compiler errors
4. Review browser console for errors
