# Stock Sense AI - UI/UX Quick Reference Guide

## One-Sentence Summary
Stock Sense AI uses a **single vanilla JavaScript HTML file (1,356 lines) with inline CSS and a glassmorphic dark theme, served by Express with Socket.IO real-time updates** - no frontend framework, no build tools, all monolithic.

---

## Quick Facts

| Aspect | Details |
|--------|---------|
| **Framework** | Vanilla JavaScript (no React/Vue/Angular) |
| **HTML File** | `/web/public/index.html` - 1,356 lines |
| **Language** | JavaScript ES6+ (no TypeScript) |
| **Styling** | Inline CSS (575 lines in `<style>` tag) |
| **CSS Approach** | Pure CSS with class selectors (no preprocessor) |
| **Build Process** | None (served as-is) |
| **Package Manager** | npm/pnpm |
| **Server** | Express.js |
| **Real-time** | Socket.IO |
| **Charts** | Chart.js (CDN) |
| **Design Pattern** | Glassmorphism dark theme |
| **Responsive** | Yes (768px breakpoint) |
| **Component System** | None (CSS classes only) |
| **State Management** | Single TradingPlatform class |
| **Testing** | None |
| **Accessibility** | Not verified |

---

## File Locations

### Frontend
```
/home/kopacz/stock-sense-ai/
└── web/
    └── public/
        └── index.html (entire frontend - 1,356 lines)
```

### Backend Serving Frontend
```
/home/kopacz/stock-sense-ai/
└── src/
    └── web/
        └── server.ts (Express server)
```

### No Component Files
- NO `/web/components/`
- NO `/web/src/`
- NO separate CSS files
- NO separate JavaScript files
- Everything in one HTML file

---

## Current Pages/Tabs

1. **Monitoring** (default active)
   - Start/Stop controls
   - Status grid (6 metrics)
   - Market overview
   - Performance chart
   - Opportunities list

2. **Discovery**
   - High revenue discovery
   - Trending stocks
   - Sector selection
   - Results display

3. **Analysis**
   - Symbol input
   - Detailed analysis checkbox
   - Results display

4. **Market**
   - Market sentiment
   - Stats grid
   - Sector information

---

## Design System (Current)

### Color Palette
```css
Primary:    #3b82f6 (Blue)
Success:    #10b981 (Green)
Danger:     #ef4444 (Red)
Warning:    #f59e0b (Amber)
Background: #0f1419 (Dark Blue)
Cards:      rgba(30, 41, 59, 0.6)
Text:       #e2e8f0 (Light Gray)
```

### Visual Style
- Glassmorphism effect (backdrop blur)
- Gradient overlays
- Smooth transitions (0.3s cubic-bezier)
- Box shadows with opacity
- Hover animations
- Dark theme suitable for trading

### CSS Classes (As "Components")
```
Layout:     .header, .nav-tabs, .container, .grid
Content:    .card, .opportunity, .status-item
Buttons:    .btn, .btn-primary, .btn-success, etc
Forms:      .input, .select
Data:       .opportunities-list, .discovery-results
Status:     .connection-status, .loading, .running
```

---

## JavaScript Architecture

### Single Class: TradingPlatform
```javascript
class TradingPlatform {
  // Socket.IO event handlers
  setupSocketHandlers()
  
  // Tab navigation
  setupTabNavigation()
  
  // UI controls
  setupControls()
  
  // API calls
  startMonitoring()
  stopMonitoring()
  runDiscovery(type, sector)
  analyzeStock(symbol)
  refreshMarketSentiment()
  
  // DOM updates
  updateDashboard(data)
  updateMonitoringStatus(stats)
  updateMarketOverview(overview)
  updateOpportunities(opportunities)
  displayDiscoveryResults(results, type)
  updateConnectionStatus(connected)
  
  // Chart management
  initChart()
  updateChart(chartData)
}
```

---

## API Endpoints

### Express Routes
```
GET  /api/health
GET  /api/monitoring/status
POST /api/monitoring/start
POST /api/monitoring/stop
GET  /api/monitoring/opportunities
GET  /api/monitoring/chart-data
GET  /api/monitoring/results
POST /api/discover
GET  /api/market/overview
GET  /api/analyze/:symbol
```

### Socket.IO Events
```
Client → Server:  socket.emit('refresh')
Server → Client:  socket.emit('update', data)
Auto-update:      Every 30 seconds
```

---

## Key Metrics

| Metric | Value |
|--------|-------|
| HTML lines | 1,356 |
| CSS lines | 575 |
| JavaScript lines | 630 |
| CSS classes | 30+ |
| Tab sections | 4 |
| API endpoints | 10 |
| Mobile breakpoint | 768px |
| Update frequency | 30 seconds |

---

## What's Working Well

✅ Modern, professional UI design  
✅ Responsive layout  
✅ Real-time updates via Socket.IO  
✅ Interactive elements with animations  
✅ Glassmorphic dark theme  
✅ Color-coded opportunities (buy/sell)  
✅ Chart visualization  
✅ Connection status indicator  

---

## Key Limitations

❌ Single monolithic HTML file  
❌ No TypeScript support  
❌ No component reusability  
❌ All code inline (hard to maintain)  
❌ No state management framework  
❌ No automated testing  
❌ No component documentation  
❌ No accessibility compliance verified  
❌ Direct DOM manipulation (innerHTML)  
❌ Global scope pollution  

---

## Recommended Next Steps

### Short-term (Immediate)
1. Document current design tokens
2. Create CSS custom properties for colors
3. Extract inline JavaScript to separate file
4. Add basic accessibility attributes

### Medium-term (1-2 months)
1. Migrate to React 18 + TypeScript
2. Setup Vite as build tool
3. Implement Tailwind CSS
4. Create reusable components
5. Add component tests

### Long-term (3+ months)
1. Implement state management (Zustand)
2. Add Storybook for component docs
3. Comprehensive accessibility audit
4. Performance optimization
5. E2E test coverage

---

## For Designers

### Current Design System
- Glassmorphic UI with blur effects
- Dark blue background gradient
- Blue/green primary colors
- 8px border radius on cards
- 12px gap between elements
- Multi-level shadows for depth
- Smooth 300ms transitions
- Inter font family

### Preserved in Modernization
- Color palette
- Glassmorphism aesthetic
- Layout structure
- Tab-based navigation
- Card-based organization

### Can Be Enhanced
- Typography system
- Spacing system
- Icon system
- Motion system
- Dark mode support
- Accessibility

---

## For Frontend Developers

### Current Stack
- HTML5 (semantic, but basic)
- CSS3 (no preprocessor, hardcoded values)
- Vanilla JavaScript (class-based)
- Socket.IO (CDN)
- Chart.js (CDN)

### Moving To (Recommended)
- React 18+ with TypeScript
- Vite (build tool)
- Tailwind CSS (styling)
- Zustand (state)
- React Query (API)
- Vitest + RTL (testing)

### Key Files to Touch
- `/web/public/index.html` (current frontend)
- `/src/web/server.ts` (backend server)
- `package.json` (dependencies)

---

## For Developers: Entry Points

### To Understand Current Code
1. Start: `/web/public/index.html` (view in browser first)
2. Learn: CSS section (lines 10-585)
3. Study: JavaScript class (lines 721-1354)
4. Trace: API calls and Socket.IO events

### To Add Features (Current Approach)
1. Add HTML in appropriate tab section
2. Add CSS class in style tag
3. Add JavaScript methods in TradingPlatform class
4. Hook up event listeners in setupControls()

### To Deploy Frontend Changes
1. Edit `/web/public/index.html`
2. No build step needed
3. Restart Express server
4. Changes live immediately

---

## Environment & Dependencies

### Key Packages (from package.json)
```json
{
  "express": "^4.18.2",
  "socket.io": "^4.7.4",
  "cors": "^2.8.5",
  "zod": "^3.22.4",
  "chalk": "^5.3.0",
  "commander": "^11.1.0"
}
```

### External Libraries (via CDN)
- Chart.js (charting)
- chartjs-adapter-date-fns (date formatting)
- Socket.IO client (real-time)

### Build/Dev Tools
- TypeScript (backend only)
- Biome (linting)
- Vitest (testing backend)
- TSX (development)

---

## Performance Considerations

### Current
- Single HTML file (~50KB)
- Inline JavaScript (no bundling)
- All scripts load synchronously
- No code splitting
- No lazy loading

### Opportunities
- Minify before deployment
- Implement code splitting
- Lazy load heavy components
- Service worker for offline
- Image optimization
- CSS optimization

---

## Security Notes

### Current Approach
- CORS enabled (open to all origins)
- No authentication visible on frontend
- Direct API calls from browser
- Socket.IO events unvalidated (backend validates)

### Recommendations
- Validate all user inputs
- Implement CSRF protection
- Add rate limiting
- Use secure WebSocket (WSS)
- Add request signing
- Implement authentication tokens

---

## Quick Debug Checklist

### If UI doesn't load
1. Check `/web/public/index.html` exists
2. Check Express server running on port 3000
3. Check browser console for errors
4. Check network tab for failed requests

### If updates not showing
1. Check Socket.IO connection (green indicator)
2. Check WebSocket in network tab
3. Check browser console for JavaScript errors
4. Verify API endpoints are working (`/api/health`)

### If styling looks wrong
1. Clear browser cache (Ctrl+F5)
2. Check CSS syntax in `<style>` tag
3. Verify class names match in HTML
4. Check responsive breakpoint (768px)

---

## File Size Summary

```
Component              Lines    Type
─────────────────────────────────────
HTML Structure         720      HTML
CSS Styling           575      CSS
JavaScript Logic      630      JS
External Libraries    3+       CDN
─────────────────────────────────────
Total Frontend        1,356    lines
```

---

## Next Documentation to Review

1. **UI_ARCHITECTURE_ANALYSIS.md** - Comprehensive technical analysis
2. **UI_MODERNIZATION_ROADMAP.md** - Detailed migration plan with diagrams
3. **Agent profiles** - React specialist and frontend developer specifications
4. **Backend docs** - API endpoint documentation

---

## Contact Points

### For Design Changes
Edit in `/web/public/index.html`:
- CSS: lines 10-585 in `<style>` tag
- HTML: lines 587-720 in `<body>` tag

### For Logic Changes
Edit in `/web/public/index.html`:
- JavaScript: lines 721-1354 in `<script>` tag

### For API/Server Changes
Edit `/src/web/server.ts`:
- Routes defined in `setupRoutes()`
- Socket handlers in `setupSocketHandlers()`

---

## Modernization Priority

### Phase 1 (Foundation)
- Setup build environment
- Create base components
- Setup TypeScript

### Phase 2 (Migration)
- Migrate page layouts
- Build UI components
- Implement state management

### Phase 3 (Quality)
- Write tests
- Add accessibility
- Optimize performance

### Phase 4 (Polish)
- Documentation
- Performance tuning
- CI/CD setup

