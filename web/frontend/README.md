# Stock Sense AI - Frontend

A modern, beautiful, and performant React 18 + TypeScript frontend for the Stock Sense AI trading platform.

## Features

- **Modern Tech Stack**: React 18, TypeScript 5.5, Vite 5
- **Type-Safe**: 100% TypeScript with strict mode enabled
- **Real-time Updates**: Socket.IO integration for live trading data
- **Beautiful UI**: Glassmorphic dark theme with Tailwind CSS
- **State Management**: Zustand for global state
- **Data Fetching**: TanStack Query for server state
- **Animations**: Framer Motion for smooth transitions
- **Charts**: Chart.js for performance visualization
- **Notifications**: React Hot Toast for user feedback

## Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── ui/             # Base UI components (Button, Card, Input, etc.)
│   ├── charts/         # Chart components
│   ├── opportunities/  # Trading opportunity components
│   └── layout/         # Layout components (Header, etc.)
├── pages/              # Page components
│   ├── MonitoringPage.tsx
│   ├── DiscoveryPage.tsx
│   ├── AnalysisPage.tsx
│   └── MarketPage.tsx
├── hooks/              # Custom React hooks
│   └── useSocket.ts    # Socket.IO hook
├── stores/             # Zustand stores
│   ├── useTradingStore.ts
│   └── useUIStore.ts
├── services/           # API services
│   └── api.ts
├── types/              # TypeScript type definitions
│   └── trading.ts
├── utils/              # Utility functions
│   ├── cn.ts           # Class name utility
│   └── formatters.ts   # Formatting utilities
└── styles/             # Global styles
    └── index.css
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm or pnpm

### Installation

```bash
# Navigate to frontend directory
cd web/frontend

# Install dependencies
npm install
# or
pnpm install
```

### Development

```bash
# Start development server (runs on port 3000)
npm run dev

# The backend server should be running on port 3001
```

### Build

```bash
# Build for production
npm run build

# Preview production build
npm run preview
```

### Linting

```bash
# Run ESLint
npm run lint
```

## Configuration

### Vite Configuration

The Vite config includes:
- Path aliases (`@/*` maps to `src/*`)
- Proxy configuration for API and Socket.IO
- Code splitting for optimal bundle size
- Source maps for debugging

### TypeScript Configuration

TypeScript is configured with:
- Strict mode enabled
- All strict flags activated
- No implicit any
- Path mapping for clean imports

### Tailwind CSS

Custom theme includes:
- Glassmorphic dark theme colors
- Custom animations
- Custom shadows and effects
- Responsive design utilities

## Component Library

### UI Components

- **Button**: Multiple variants (primary, success, danger, warning)
- **Card**: Glassmorphic container with hover effects
- **Input**: Styled form input with error states
- **Select**: Styled dropdown
- **Badge**: Status indicators
- **Tabs**: Tab navigation component
- **StatusIndicator**: Metric display cards
- **LoadingSpinner**: Loading states

### Pages

- **MonitoringPage**: Real-time trading monitoring and controls
- **DiscoveryPage**: Stock discovery and screening
- **AnalysisPage**: Individual stock analysis
- **MarketPage**: Market sentiment overview

## State Management

### Trading Store (useTradingStore)

Manages:
- Monitoring statistics
- Market overview data
- Trading opportunities
- Chart data
- Connection status

### UI Store (useUIStore)

Manages:
- Active tab
- Sidebar state
- Theme preference

## API Integration

All API calls are handled through the `api` service with proper error handling and TypeScript types.

Endpoints:
- `POST /api/monitoring/start` - Start monitoring
- `POST /api/monitoring/stop` - Stop monitoring
- `POST /api/discover` - Discover opportunities
- `GET /api/analyze/:symbol` - Analyze stock
- `GET /api/market/overview` - Get market overview

## Real-time Updates

Socket.IO connection provides:
- Automatic reconnection
- Live dashboard updates
- Real-time opportunity notifications
- Connection status monitoring

## Keyboard Shortcuts

- `Ctrl/Cmd + 1` - Monitoring page
- `Ctrl/Cmd + 2` - Discovery page
- `Ctrl/Cmd + 3` - Analysis page
- `Ctrl/Cmd + 4` - Market page

## Performance Optimizations

- Code splitting by route
- Lazy loading for components
- Optimized bundle size (<500KB initial load)
- Memoized chart data
- Virtual scrolling for long lists
- Optimized re-renders with proper memoization

## Accessibility

- ARIA labels on interactive elements
- Keyboard navigation support
- Focus management
- Semantic HTML
- Screen reader friendly

## Browser Support

- Chrome/Edge (latest 2 versions)
- Firefox (latest 2 versions)
- Safari (latest 2 versions)

## TypeScript Quality

- Strict mode enabled
- No `any` types (enforced by ESLint)
- Proper interfaces for all data structures
- Generic types for reusable components
- Utility types where appropriate
- 100% type coverage

## Contributing

When adding new features:
1. Follow TypeScript strict mode
2. Use existing component patterns
3. Add proper type definitions
4. Include proper error handling
5. Test on multiple screen sizes
6. Ensure accessibility compliance

## License

MIT
