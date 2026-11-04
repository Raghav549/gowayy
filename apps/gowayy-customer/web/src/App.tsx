import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, useLocation, useParams, Navigate } from 'react-router-dom';
const Splash = lazy(() => import('./components/Splash').then((m) => ({ default: m.Splash })));
import { Onboarding } from './components/Onboarding';
import { Layout } from './components/Layout';
import { RegisterFlow, LoginScreen, ForgotScreen } from './components/AuthScreens';
import { useUI } from './store/useUI';
import { useSession } from './store/useSession';
import { Home } from './screens/Home';
import { Explore } from './screens/Explore';
import { SearchPage } from './screens/SearchPage';
import { ProductDetail } from './screens/ProductDetail';
import { Cart } from './screens/Cart';
import { CheckoutFlow } from './screens/CheckoutFlow';
import { Checkout } from './screens/Checkout';
import { Categories } from './screens/Categories';
import { Account, Wishlist } from './screens/Account';
import { DestinationDetail } from './screens/DestinationDetail';
import { Cabs } from './screens/Cabs';
import { Hotels, PropertyDetail } from './screens/Hotels';
import { Food, Groceries } from './screens/LocalMarket';
import { Tourism } from './screens/Tourism';
import { Parcels } from './screens/Parcels';
import { Bookings, BookingDetail } from './screens/Bookings';
import { Orders, OrderDetail } from './screens/Orders';
import { JourneyDashboard } from './screens/JourneyDashboard';
import { Profile } from './screens/Profile';
import { Support } from './screens/Support';

function StoreRedirect() {
  const { id } = useParams();
  return <Navigate to={`/categories?store=${encodeURIComponent(id ?? '')}`} replace />;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }); }, [pathname]);
  return null;
}

export default function App() {
  const { splashDone, onboarded, setSplashDone, setOnboarded } = useUI();
  const loading = useSession((s) => s.loading);
  const location = useLocation();
  const isAuth = location.pathname.startsWith('/auth/');

  if (!splashDone) return <Suspense fallback={<div className="brand-splash" aria-hidden="true"><img src="/brand/g-symbol.svg" alt="" /></div>}><Splash onDone={() => setSplashDone(true)} /></Suspense>;
  if (!onboarded) return <Onboarding onFinish={() => setOnboarded(true)} />;
  if (isAuth) return (
    <Routes>
      <Route path="/auth/register" element={<RegisterFlow />} />
      <Route path="/auth/login" element={<LoginScreen />} />
      <Route path="/auth/forgot" element={<ForgotScreen />} />
      <Route path="*" element={<Navigate to="/auth/register" replace />} />
    </Routes>
  );
  if (loading) return <div className="auth-shell"><div className="card">Restoring your session…</div></div>;

  return (
    <Layout>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/explore" element={<Explore />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/products/:slug" element={<ProductDetail />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/checkout" element={<CheckoutFlow />} />
        <Route path="/checkout/booking" element={<Checkout />} />
        <Route path="/account" element={<Account />} />
        <Route path="/account/wishlist" element={<Wishlist />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/destinations/:slug" element={<DestinationDetail />} />
        <Route path="/cabs" element={<Cabs />} />
        <Route path="/hotels" element={<Hotels />} />
        <Route path="/hotels/:id" element={<PropertyDetail />} />
        <Route path="/food" element={<Food />} />
        <Route path="/food/:id" element={<StoreRedirect />} />
        <Route path="/groceries" element={<Groceries />} />
        <Route path="/groceries/:id" element={<StoreRedirect />} />
        <Route path="/tourism" element={<Tourism variant="tourism" />} />
        <Route path="/packages" element={<Tourism variant="package" />} />
        <Route path="/experiences" element={<Tourism variant="experience" />} />
        <Route path="/parcels" element={<Parcels />} />
        <Route path="/bookings" element={<Bookings />} />
        <Route path="/bookings/:id" element={<BookingDetail />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/orders/:id" element={<OrderDetail />} />
        <Route path="/journey/:id" element={<JourneyDashboard />} />
        <Route path="/support" element={<Support />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
