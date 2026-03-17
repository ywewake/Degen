// CryptoAlpha App
// Design: Terminal-Brutalism dark theme, mobile-first

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { PlanProvider } from "./contexts/PlanContext";
import Home from "./pages/Home";
function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <PlanProvider>
          <TooltipProvider>
            <Toaster
              theme="dark"
              position="top-center"
              toastOptions={{
                style: {
                  background: 'oklch(0.13 0.012 264)',
                  border: '1px solid oklch(0.22 0.01 264)',
                  color: 'oklch(0.92 0.008 264)',
                  fontFamily: "'Space Grotesk', system-ui, sans-serif",
                },
              }}
            />
            <Router />
          </TooltipProvider>
        </PlanProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
